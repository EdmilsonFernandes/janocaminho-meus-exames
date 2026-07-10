import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth, AuthedRequest, userPatientIds } from '../middleware/auth';
import { parseListParams, setListHeaders } from '../utils/list';
import { upload } from '../middleware/upload';
import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { savePatientPhoto, patientSlug, deleteExamFile } from '../utils/storage';
import { logCredit } from '../utils/credits';
import { buildCurrentHealthSummary } from '../analysis/health-state';
import { encryptedCpfData, maskStoredCpf } from '../utils/cpf';

const router = Router();
router.use(requireAuth);

function serializePatient<T extends Record<string, any>>(patient: T | null): any {
  if (!patient) return patient;
  const { cpfEncrypted, cpfIv, cpfHash, cpfLast4, ...rest } = patient;
  return {
    ...rest,
    cpfMasked: maskStoredCpf({ cpfLast4: patient.cpfLast4, cpfEncrypted, cpfIv }),
    hasCpf: !!(cpfHash || cpfEncrypted),
    identityLocked: !!patient.identityLockedAt,
  };
}

// CRIAR paciente/dependente
router.post('/', async (req: AuthedRequest, res, next) => {
  try {
    const { fullName, relationship, dateOfBirth, clinicalProfile, heightCm, ethnicity, cpf } = req.body ?? {};
    if (!fullName || !String(fullName).trim()) {
      res.status(400).json({ error: 'Informe o nome.' });
      return;
    }
    const cpfData = encryptedCpfData(cpf);
    if (!cpfData) { res.status(400).json({ error: 'CPF inválido.' }); return; }
    const existingCpf = await prisma.patient.findUnique({ where: { cpfHash: cpfData.cpfHash }, select: { id: true } });
    if (existingCpf) { res.status(409).json({ error: 'CPF já cadastrado em outro paciente.' }); return; }
    // LIMITE DE DEPENDENTES: titular + 3 grátis. Além disso, 50 créditos por extra.
    const FREE_LIMIT = 4; // titular + 3
    const EXTRA_COST = 50;
    const count = await prisma.patient.count({ where: { ownerId: req.userId! } });
    if (count >= FREE_LIMIT) {
      const user = await prisma.user.findUnique({ where: { id: req.userId! }, select: { credits: true, planExpiresAt: true } });
      const active = !!user?.planExpiresAt && user.planExpiresAt > new Date();
      if (!active && (!user || user.credits < EXTRA_COST)) {
        res.status(402).json({ error: 'dependent_limit', message: `Você atingiu o limite de ${FREE_LIMIT - 1} dependentes grátis. Compre 50 créditos pra adicionar mais.` });
        return;
      }
      // debita 50 créditos (ou passa se premium)
      if (!active) {
        await prisma.user.update({ where: { id: req.userId! }, data: { credits: { decrement: EXTRA_COST } } });
        await logCredit(req.userId!, -EXTRA_COST, 'patient_extra', 'Dependente adicional');
      }
    }
    const p = await prisma.patient.create({
      data: {
        ownerId: req.userId!,
        fullName: String(fullName),
        relationship: relationship ? String(relationship) : null,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
        clinicalProfile: clinicalProfile ? String(clinicalProfile) : null,
        heightCm: heightCm != null && heightCm !== '' && Number.isFinite(Number(heightCm)) ? Math.round(Number(heightCm)) : null,
        ethnicity: ethnicity ? String(ethnicity) : null,
        ...cpfData,
        identityLockedAt: new Date(),
      },
    });
    res.status(201).json(serializePatient(p));
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
    res.json(rows.map(serializePatient));
  } catch (e) {
    next(e);
  }
});

// SCORE DE SAÚDE (0-100) — do exame laboratorial mais recente com referência
// Cache em memória do score: só recalcula quando muda o último exame (id + qtd de itens).
// Sem schema/migration; resetado no restart (recomputado na próxima chamada — ok).
const scoreCache = new Map<string, { sig: string; data: any }>();

router.get('/:id/health-score', async (req: AuthedRequest, res, next) => {
  try {
    const pids = await userPatientIds(req.userId!);
    const id = String(req.params.id);
    if (!pids.includes(id)) { res.status(403).json({ error: 'Paciente não pertence ao usuário' }); return; }
    // PROBE leve: só id/título/data/qtd do último exame (sem carregar todos os itens)
    const latest = await prisma.exam.findFirst({
      where: { patientId: id, status: 'EXTRACTED' },
      orderBy: { performedAt: 'desc' },
      select: { id: true, title: true, performedAt: true, _count: { select: { items: true } } },
    });
    if (!latest) { res.json({ score: null, message: 'Envie um exame para calcular seu score.' }); return; }
    const sig = `${latest.id}:${latest._count.items}`;
    const hit = scoreCache.get(id);
    if (hit && hit.sig === sig) { res.json(hit.data); return; } // cache válido → não recalcula
    // MISS: carrega os itens e calcula (só acontece quando entra exame novo / muda o último)
    const exam = await prisma.exam.findUnique({ where: { id: latest.id }, include: { items: true } });
    const withRef = (exam?.items ?? []).filter((i) => i.refLow != null || i.refHigh != null);
    const abnormal = withRef.filter((i) => i.isAbnormal).length;
    const score = withRef.length ? Math.round((100 * (withRef.length - abnormal)) / withRef.length) : null;
    const data = { score, total: withRef.length, abnormal, examTitle: latest.title, performedAt: latest.performedAt };
    scoreCache.set(id, { sig, data });
    res.json(data);
  } catch (e) { next(e); }
});

// SNAPSHOT DE SAÚDE (Layer 2) — estado atual + tendência + "o que mudou" por marcador.
// Base do dashboard do paciente, da visão de 1-min do médico e do contexto estrutural da IA.
// Leitura pura sobre ExamItem (zero migration). Priorização temporal = dado, não prompt.
router.get('/:id/health-summary', async (req: AuthedRequest, res, next) => {
  try {
    const pids = await userPatientIds(req.userId!);
    const id = String(req.params.id);
    if (!pids.includes(id)) { res.status(403).json({ error: 'Paciente não pertence ao usuário' }); return; }
    res.json(await buildCurrentHealthSummary(id));
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

// COMPARATIVO familiar por analito (último valor de cada membro; só analitos em 2+ pessoas)
router.get('/family-compare', async (req: AuthedRequest, res, next) => {
  try {
    const patients = await prisma.patient.findMany({ where: { ownerId: req.userId }, select: { id: true, fullName: true } });
    const byAnalyte = new Map<string, any>();
    for (const p of patients) {
      const exam = await prisma.exam.findFirst({ where: { patientId: p.id, status: 'EXTRACTED' }, orderBy: { performedAt: 'desc' }, include: { items: true } });
      if (!exam) continue;
      for (const it of exam.items) {
        const e = byAnalyte.get(it.nameCanonical) ?? { unit: it.unit, members: [] as any[] };
        e.members.push({ name: p.fullName, value: it.valueText ?? String(it.valueNumeric ?? ''), flag: it.flag, date: exam.performedAt });
        byAnalyte.set(it.nameCanonical, e);
      }
    }
    const rows = [...byAnalyte.entries()].filter(([, v]) => v.members.length >= 2).map(([analyte, v]) => ({ analyte, unit: v.unit, members: v.members }));
    rows.sort((a, b) => b.members.length - a.members.length);
    res.json({ rows });
  } catch (e) { next(e); }
});

// GET ONE
router.get('/:id', async (req: AuthedRequest, res, next) => {
  try {
    const id = String(req.params.id);
    // IDOR fix: só o DONO lê o paciente (nome, perfil clínico, telefone, foto, DoB).
    // Antes era findUnique direto → qualquer user logado lia qualquer paciente (vazamento de PII/LGPD).
    const pids = await userPatientIds(req.userId!);
    if (!pids.includes(id)) { res.status(403).json({ error: 'Paciente não pertence ao usuário' }); return; }
    const p = await prisma.patient.findUnique({ where: { id } });
    if (!p) {
      res.status(404).json({ error: 'Paciente não encontrado' });
      return;
    }
    res.json(serializePatient(p));
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
    const existing = await prisma.patient.findUnique({ where: { id }, select: { fullName: true, cpfHash: true, identityLockedAt: true } });
    if (!existing) { res.status(404).json({ error: 'Paciente não encontrado' }); return; }
    const { fullName, relationship, dateOfBirth, clinicalProfile, phone, photoUrl, gender, heightCm, ethnicity, cpf } = req.body ?? {};
    const data: any = {};
    if (fullName != null) {
      const nextName = String(fullName).trim();
      if (existing.identityLockedAt && nextName !== existing.fullName) {
        res.status(409).json({ error: 'Nome bloqueado após verificação de CPF e e-mail. Solicite correção ao suporte.' });
        return;
      }
      data.fullName = nextName;
    }
    if (cpf !== undefined) {
      const cpfData = encryptedCpfData(cpf);
      if (!cpfData) { res.status(400).json({ error: 'CPF inválido.' }); return; }
      if (existing.cpfHash && existing.cpfHash !== cpfData.cpfHash) {
        res.status(409).json({ error: 'CPF bloqueado após cadastro. Solicite correção ao suporte.' });
        return;
      }
      if (!existing.cpfHash) {
        const dup = await prisma.patient.findFirst({ where: { cpfHash: cpfData.cpfHash, NOT: { id } }, select: { id: true } });
        if (dup) { res.status(409).json({ error: 'CPF já cadastrado em outro paciente.' }); return; }
        Object.assign(data, cpfData, { identityLockedAt: existing.identityLockedAt ?? new Date() });
      }
    }
    if (gender !== undefined) data.gender = gender ? String(gender) : null;
    if (heightCm !== undefined) data.heightCm = heightCm != null && heightCm !== '' && Number.isFinite(Number(heightCm)) ? Math.round(Number(heightCm)) : null;
    if (ethnicity !== undefined) data.ethnicity = ethnicity ? String(ethnicity) : null;
    if (relationship !== undefined) data.relationship = relationship ? String(relationship) : null;
    if (dateOfBirth !== undefined) data.dateOfBirth = dateOfBirth ? new Date(dateOfBirth) : null;
    if (clinicalProfile != null) data.clinicalProfile = String(clinicalProfile);
    if (phone !== undefined) data.phone = phone ? String(phone) : null;
    if (photoUrl !== undefined) data.photoUrl = photoUrl ? String(photoUrl) : null;
    const updated = await prisma.patient.update({ where: { id }, data });
    res.json(serializePatient(updated));
  } catch (e) {
    next(e);
  }
});

// DELETE paciente (dependente) + cascata de exames/análises
router.delete('/:id', async (req: AuthedRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const pids = await userPatientIds(req.userId!);
    if (!pids.includes(id)) {
      res.status(403).json({ error: 'Paciente não pertence ao usuário' });
      return;
    }
    // não deleta o TITULAR (precisa de pelo menos 1)
    const patient = await prisma.patient.findUnique({ where: { id }, select: { relationship: true, ownerId: true } });
    if (patient?.relationship === 'Titular') {
      const count = await prisma.patient.count({ where: { ownerId: patient.ownerId } });
      if (count <= 1) { res.status(400).json({ error: 'Não é possível excluir o perfil titular.' }); return; }
    }
    // deleta arquivos dos exames (PDFs/fotos no S3/disco)
    const exams = await prisma.exam.findMany({ where: { patientId: id }, select: { filePath: true } });
    for (const e of exams) { try { await deleteExamFile(e.filePath); } catch { /* */ } }
    // cascade: Patient → Exam → ExamItem/AiAnalysis, etc (onDelete: Cascade no schema)
    await prisma.patient.delete({ where: { id } });
    res.json({ ok: true, id });
  } catch (e) {
    next(e);
  }
});

export default router;
