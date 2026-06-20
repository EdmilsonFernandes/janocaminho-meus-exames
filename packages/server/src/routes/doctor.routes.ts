import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../prisma';
import { hashPassword, comparePassword } from '../auth/jwt';
import { config } from '../config';

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
    if (existing) { res.status(409).json({ error: 'CRM ou e-mail já cadastrado.' }); return; }
    const doctor = await prisma.doctor.create({ data: { name, crm, specialty, email: String(email).toLowerCase(), passwordHash: await hashPassword(String(password)) } });
    res.status(201).json({ token: signDoctorToken(doctor.id), doctor: { id: doctor.id, name, crm, specialty, email } });
  } catch (e) { next(e); }
});

// LOGIN do médico
router.post('/login', async (req, res, next) => {
  try {
    const doctor = await prisma.doctor.findUnique({ where: { email: String(req.body?.email ?? '').toLowerCase() } });
    if (!doctor || !(await comparePassword(String(req.body?.password ?? ''), doctor.passwordHash))) {
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
