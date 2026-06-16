import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth, AuthedRequest, userPatientIds } from '../middleware/auth';
import { parseListParams, setListHeaders } from '../utils/list';
import { upload } from '../middleware/upload';
import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { savePatientPhoto, patientSlug } from '../utils/storage';

const router = Router();
router.use(requireAuth);

// CRIAR paciente/dependente
router.post('/', async (req: AuthedRequest, res, next) => {
  try {
    const { fullName, relationship, dateOfBirth, clinicalProfile } = req.body ?? {};
    if (!fullName || !String(fullName).trim()) {
      res.status(400).json({ error: 'Informe o nome.' });
      return;
    }
    const p = await prisma.patient.create({
      data: {
        ownerId: req.userId!,
        fullName: String(fullName),
        relationship: relationship ? String(relationship) : null,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
        clinicalProfile: clinicalProfile ? String(clinicalProfile) : null,
      },
    });
    res.status(201).json(p);
  } catch (e) { next(e); }
});

router.get('/', async (req: AuthedRequest, res, next) => {
  try {
    const { start, take } = parseListParams(req);
    const where = { ownerId: req.userId };
    const [total, rows] = await prisma.$transaction([
      prisma.patient.count({ where }),
      prisma.patient.findMany({ where, skip: start, take, orderBy: { createdAt: 'asc' } }),
    ]);
    setListHeaders(res, start, start + take, total);
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

// SCORE DE SAÚDE (0-100) — do exame laboratorial mais recente com referência
router.get('/:id/health-score', async (req: AuthedRequest, res, next) => {
  try {
    const pids = await userPatientIds(req.userId!);
    const id = String(req.params.id);
    if (!pids.includes(id)) { res.status(403).json({ error: 'Paciente não pertence ao usuário' }); return; }
    const exam = await prisma.exam.findFirst({
      where: { patientId: id, status: 'EXTRACTED' },
      orderBy: { performedAt: 'desc' },
      include: { items: true },
    });
    if (!exam) { res.json({ score: null, message: 'Envie um exame para calcular seu score.' }); return; }
    const withRef = exam.items.filter((i) => i.refLow != null || i.refHigh != null);
    const abnormal = withRef.filter((i) => i.isAbnormal).length;
    const score = withRef.length ? Math.round((100 * (withRef.length - abnormal)) / withRef.length) : null;
    res.json({
      score,
      total: withRef.length,
      abnormal,
      examTitle: exam.title,
      performedAt: exam.performedAt,
    });
  } catch (e) { next(e); }
});

// VISÃO DA FAMÍLIA: score + alterações de cada dependente + alertas cruzados (>=2 com mesmo analito alterado)
router.get('/family-overview', async (req: AuthedRequest, res, next) => {
  try {
    const patients = await prisma.patient.findMany({
      where: { ownerId: req.userId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, fullName: true, relationship: true, photoUrl: true },
    });
    const result: any[] = [];
    const abnormalByAnalyte = new Map<string, string[]>();
    for (const p of patients) {
      const exam = await prisma.exam.findFirst({
        where: { patientId: p.id, status: 'EXTRACTED' },
        orderBy: { performedAt: 'desc' },
        include: { items: true },
      });
      let score: number | null = null;
      let abnormalCount = 0;
      const topAbnormal: any[] = [];
      if (exam) {
        const withRef = exam.items.filter((i) => i.refLow != null || i.refHigh != null);
        const abn = withRef.filter((i) => i.isAbnormal);
        score = withRef.length ? Math.round((100 * (withRef.length - abn.length)) / withRef.length) : null;
        abnormalCount = abn.length;
        for (const i of abn.slice(0, 6)) {
          topAbnormal.push({ name: i.name, value: i.valueText, flag: i.flag });
          const arr = abnormalByAnalyte.get(i.nameCanonical) ?? [];
          arr.push(p.fullName);
          abnormalByAnalyte.set(i.nameCanonical, arr);
        }
      }
      result.push({ ...p, score, abnormalCount, topAbnormal, examTitle: exam?.title ?? null, performedAt: exam?.performedAt ?? null });
    }
    const crossAlerts = [...abnormalByAnalyte.entries()]
      .filter(([, names]) => new Set(names).size >= 2)
      .map(([analyte, names]) => ({ analyte, patients: [...new Set(names)] }));
    res.json({ patients: result, crossAlerts });
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const p = await prisma.patient.findUnique({ where: { id: req.params.id } });
    if (!p) {
      res.status(404).json({ error: 'Paciente não encontrado' });
      return;
    }
    res.json(p);
  } catch (e) {
    next(e);
  }
});

// UPLOAD de foto do paciente — S3 (prod) ou disco (dev)
router.post('/:id/photo', upload.single('photo'), async (req: AuthedRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const pids = await userPatientIds(req.userId!);
    if (!pids.includes(id)) { res.status(403).json({ error: 'Sem permissão' }); return; }
    if (!req.file) { res.status(400).json({ error: 'Foto não enviada' }); return; }
    const patient = await prisma.patient.findUnique({ where: { id }, select: { fullName: true } });
    const slug = patientSlug(patient?.fullName ?? 'paciente', id);
    const contentType = req.file.mimetype || 'image/jpeg';
    const ref = await savePatientPhoto(id, slug, req.file.buffer, contentType);
    await prisma.patient.update({ where: { id }, data: { photoUrl: ref } }); // guarda o REF (chave S3 ou caminho disco)
    res.json({ photoUrl: `/api/patients/${id}/photo` }); // URL pública estável pro <img>
  } catch (e) { next(e); }
});

// SERVE a foto do paciente (público — sem auth, pra funcionar em <img src>)
router.get('/:id/photo', async (req, res) => {
  try {
    const id = String(req.params.id);
    const dir = path.resolve(config.photosDir);
    if (!fs.existsSync(dir)) { res.status(404).send('sem foto'); return; }
    const files = fs.readdirSync(dir).filter(f => f.startsWith(`patient-${id}.`));
    if (!files.length) { res.status(404).send('sem foto'); return; }
    res.sendFile(path.join(dir, files[0]));
  } catch { res.status(404).send('sem foto'); }
});

// Atualiza perfil clínico (condições/medicações que alimentam a IA) e dados básicos
router.put('/:id', async (req: AuthedRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const pids = await userPatientIds(req.userId!);
    if (!pids.includes(id)) {
      res.status(403).json({ error: 'Paciente não pertence ao usuário' });
      return;
    }
    const { fullName, relationship, dateOfBirth, clinicalProfile, phone, photoUrl } = req.body ?? {};
    const data: any = {};
    if (fullName != null) data.fullName = String(fullName);
    if (relationship !== undefined) data.relationship = relationship ? String(relationship) : null;
    if (dateOfBirth !== undefined) data.dateOfBirth = dateOfBirth ? new Date(dateOfBirth) : null;
    if (clinicalProfile != null) data.clinicalProfile = String(clinicalProfile);
    if (phone !== undefined) data.phone = phone ? String(phone) : null;
    if (photoUrl !== undefined) data.photoUrl = photoUrl ? String(photoUrl) : null;
    const updated = await prisma.patient.update({ where: { id }, data });
    res.json(updated);
  } catch (e) {
    next(e);
  }
});

export default router;
