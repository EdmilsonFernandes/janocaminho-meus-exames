import { Router } from 'express';
import jwt from 'jsonwebtoken';
import path from 'path';
import { prisma } from '../prisma';
import { hashPassword, comparePassword } from '../auth/jwt';
import { config } from '../config';
import { upload } from '../middleware/upload';
import { saveDoctorPhoto, resolvePatientPhoto } from '../utils/storage';

const router = Router();

// === AUTH MÉDICO (separada do paciente) ===
const signDoctorToken = (doctorId: string) => jwt.sign({ doctorId, type: 'doctor' }, config.jwtSecret, { expiresIn: '7d' });
const verifyDoctorToken = (token: string): any => { try { const p: any = jwt.verify(token, config.jwtSecret); return p.type === 'doctor' ? p : null; } catch { return null; } };

const requireDoctor = async (req: any, res: any, next: any) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) { res.status(401).json({ error: 'Token obrigatório.' }); return; }
  const payload = verifyDoctorToken(auth.slice(7));
  if (!payload?.doctorId) { res.status(401).json({ error: 'Token médico inválido.' }); return; }
  req.doctorId = payload.doctorId;
  next();
};

// CADASTRO do médico
router.post('/register', async (req, res, next) => {
  try {
    const { name, crm, specialty, email, password } = req.body ?? {};
    if (!name || !crm || !email || !password || String(password).length < 6) {
      res.status(400).json({ error: 'Nome, CRM, e-mail e senha (mín. 6) obrigatórios.' }); return;
    }
    const existing = await prisma.doctor.findFirst({ where: { OR: [{ email: String(email).toLowerCase() }, { crm }] } });
    if (existing) {
      if (existing.passwordHash === 'pending-invite') {
        // CLAIM: paciente pré-cadastrou → médico completa com dados reais + senha
        const claimed = await prisma.doctor.update({
          where: { id: existing.id },
          data: { name, specialty: specialty || existing.specialty, email: String(email).toLowerCase(), passwordHash: await hashPassword(String(password)) },
        });
        res.status(201).json({ token: signDoctorToken(claimed.id), doctor: { id: claimed.id, name: claimed.name, crm: claimed.crm, specialty: claimed.specialty, email: claimed.email } });
        return;
      }
      res.status(409).json({ error: 'CRM ou e-mail ja cadastrado. Faca login.' }); return;
    }
    const doctor = await prisma.doctor.create({ data: { name, crm, specialty, email: String(email).toLowerCase(), passwordHash: await hashPassword(String(password)) } });
    res.status(201).json({ token: signDoctorToken(doctor.id), doctor: { id: doctor.id, name, crm, specialty, email } });
  } catch (e) { next(e); }
});

// LOGIN do médico — aceita E-MAIL ou CRM (o que ele lembrar mais fácil)
router.post('/login', async (req, res, next) => {
  try {
    const id = String(req.body?.email ?? req.body?.login ?? '').trim();
    const doctor = await prisma.doctor.findFirst({ where: { OR: [{ email: id.toLowerCase() }, { crm: id }] } });
    if (!doctor || doctor.passwordHash === 'pending-invite' || !(await comparePassword(String(req.body?.password ?? ''), doctor.passwordHash))) {
      res.status(401).json({ error: 'Credenciais inválidas.' }); return;
    }
    res.json({ token: signDoctorToken(doctor.id), doctor: { id: doctor.id, name: doctor.name, crm: doctor.crm, specialty: doctor.specialty, email: doctor.email, photoUrl: doctor.photoUrl } });
  } catch (e) { next(e); }
});

// PERFIL do médico
router.get('/me', requireDoctor, async (req: any, res) => {
  const doctor = await prisma.doctor.findUnique({ where: { id: req.doctorId }, select: { id: true, name: true, crm: true, specialty: true, email: true, photoUrl: true } });
  if (!doctor) { res.status(404).json({ error: 'Médico não encontrado.' }); return; }
  res.json({ doctor });
});

// ATUALIZAR PERFIL do médico (nome, especialidade, e-mail). CRM não é editável (identidade profissional).
router.put('/me', requireDoctor, async (req: any, res, next) => {
  try {
    const { name, specialty, email } = req.body ?? {};
    const data: any = {};
    if (name != null && String(name).trim()) data.name = String(name).trim();
    if (specialty != null) data.specialty = String(specialty).trim() || null;
    if (email != null) {
      const e = String(email).toLowerCase().trim();
      const dup = await prisma.doctor.findFirst({ where: { email: e, NOT: { id: req.doctorId } } });
      if (dup) { res.status(409).json({ error: 'E-mail já usado por outro médico.' }); return; }
      data.email = e;
    }
    const updated = await prisma.doctor.update({ where: { id: req.doctorId }, data, select: { id: true, name: true, crm: true, specialty: true, email: true, photoUrl: true } });
    res.json({ doctor: updated });
  } catch (e) { next(e); }
});

// UPLOAD de foto do médico — S3 (prod) ou disco (dev). Espelho da rota do paciente.
router.post('/me/photo', requireDoctor, upload.single('photo'), async (req: any, res, next) => {
  try {
    if (!req.file) { res.status(400).json({ error: 'Foto não enviada' }); return; }
    const contentType = req.file.mimetype || 'image/jpeg';
    const ref = await saveDoctorPhoto(req.doctorId, req.file.buffer, contentType);
    await prisma.doctor.update({ where: { id: req.doctorId }, data: { photoUrl: ref } });
    res.json({ photoUrl: `/api/doctor/photo/${req.doctorId}` });
  } catch (e) { next(e); }
});

// SERVE a foto do médico (público — sem auth, pra funcionar em <img src>)
router.get('/photo/:id', async (req, res) => {
  try {
    const doctor = await prisma.doctor.findUnique({ where: { id: String(req.params.id) }, select: { photoUrl: true } });
    if (!doctor?.photoUrl) { res.status(404).send('sem foto'); return; }
    const r = await resolvePatientPhoto(doctor.photoUrl);
    if (r.kind === 'url') return res.redirect(r.url);
    return res.sendFile(path.resolve(r.file));
  } catch { res.status(404).send('sem foto'); }
});

// === DADOS SCOPED (médico vê SÓ o que o paciente autorizou) ===

// LISTA de pacientes que compartilharam
router.get('/patients', requireDoctor, async (req: any, res, next) => {
  try {
    const shares = await prisma.doctorShare.findMany({
      where: { doctorId: req.doctorId, active: true },
      include: { patient: { select: { id: true, fullName: true, relationship: true, dateOfBirth: true, photoUrl: true, clinicalProfile: true, owner: { select: { name: true } } } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ items: shares.map((s) => ({ shareId: s.id, scopes: s.scopes, convenio: s.convenio, createdAt: s.createdAt, patient: s.patient })), total: shares.length });
  } catch (e) { next(e); }
});

// EXAMES do paciente (só se scope 'exams')
router.get('/patients/:patientId/exams', requireDoctor, async (req: any, res, next) => {
  try {
    const share = await prisma.doctorShare.findFirst({ where: { doctorId: req.doctorId, patientId: req.params.patientId, active: true } });
    if (!share?.scopes.includes('exams')) { res.status(403).json({ error: 'Sem permissão para ver exames deste paciente.' }); return; }
    const exams = await prisma.exam.findMany({
      where: { patientId: req.params.patientId, status: 'EXTRACTED' },
      select: { id: true, title: true, kind: true, performedAt: true, sourceLab: true, _count: { select: { items: true } }, items: { where: { isAbnormal: true }, select: { name: true, valueText: true, flag: true } } },
      orderBy: { performedAt: 'desc' }, take: 20,
    });
    res.json({ items: exams });
  } catch (e) { next(e); }
});

// EVOLUÇÃO do paciente (só se scope 'evolution')
router.get('/patients/:patientId/evolution', requireDoctor, async (req: any, res, next) => {
  try {
    const share = await prisma.doctorShare.findFirst({ where: { doctorId: req.doctorId, patientId: req.params.patientId, active: true } });
    if (!share?.scopes.includes('evolution')) { res.status(403).json({ error: 'Sem permissão.' }); return; }
    const items = await prisma.examItem.findMany({
      where: { exam: { patientId: req.params.patientId, status: 'EXTRACTED' }, valueNumeric: { not: null } },
      select: { name: true, nameCanonical: true, valueNumeric: true, unit: true, flag: true, isAbnormal: true, refLow: true, refHigh: true, exam: { select: { performedAt: true } } },
      orderBy: { exam: { performedAt: 'desc' } }, take: 100,
    });
    res.json({ items });
  } catch (e) { next(e); }
});

export default router;
