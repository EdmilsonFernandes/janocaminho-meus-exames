import { Router } from 'express';
import jwt from 'jsonwebtoken';
import path from 'path';
import fs from 'fs';
import { prisma } from '../prisma';
import { hashPassword, comparePassword } from '../auth/jwt';
import { config } from '../config';
import { upload } from '../middleware/upload';
import { saveDoctorPhoto, resolvePatientPhoto, resolveExamFile } from '../utils/storage';
import { evaluateMfaOnLogin, verifyChallenge, getStatus as mfaStatus, startSetup as mfaStart, confirmSetup as mfaConfirm, disableMfa as mfaDisable } from '../utils/mfa';

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
    // MFA: se ativado, cria desafio
    const mfa = await evaluateMfaOnLogin('DOCTOR', doctor.id, { doctorId: doctor.id }, doctor.email);
    if (mfa) { res.json(mfa); return; }
    res.json({ token: signDoctorToken(doctor.id), doctor: { id: doctor.id, name: doctor.name, crm: doctor.crm, specialty: doctor.specialty, email: doctor.email, photoUrl: doctor.photoUrl } });
  } catch (e) { next(e); }
});

// MFA do médico — verifica desafio (2ª etapa do login)
router.post('/mfa/verify', async (req, res) => {
  try {
    const result = await verifyChallenge(String(req.body?.challengeToken ?? ''), String(req.body?.code ?? ''));
    const doctorId = result.sessionPayload.doctorId;
    const d = await prisma.doctor.findUnique({ where: { id: doctorId }, select: { id: true, name: true, crm: true, specialty: true, email: true, photoUrl: true } });
    res.json({ token: signDoctorToken(doctorId), doctor: d });
  } catch (e: any) { res.status(e.status || 500).json({ error: e.message || 'Erro no MFA' }); }
});

router.get('/mfa/status', requireDoctor, async (req: any, res) => { res.json(await mfaStatus('DOCTOR', req.doctorId)); });
router.post('/mfa/setup/start', requireDoctor, async (req: any, res) => { try { res.json(await mfaStart('DOCTOR', req.doctorId)); } catch (e: any) { res.status(e.status || 500).json({ error: e.message || 'Erro' }); } });
router.post('/mfa/setup/confirm', requireDoctor, async (req: any, res) => { try { res.json(await mfaConfirm('DOCTOR', req.doctorId, String(req.body?.code ?? ''))); } catch (e: any) { res.status(e.status || 500).json({ error: e.message || 'Erro' }); } });
router.post('/mfa/disable', requireDoctor, async (req: any, res) => { try { res.json(await mfaDisable('DOCTOR', req.doctorId, String(req.body?.code ?? ''))); } catch (e: any) { res.status(e.status || 500).json({ error: e.message || 'Erro' }); } });

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

// TROCAR SENHA do médico
router.put('/me/password', requireDoctor, async (req: any, res, next) => {
  try {
    const cur = String(req.body?.currentPassword ?? '');
    const next0 = String(req.body?.newPassword ?? '');
    if (next0.length < 6) { res.status(400).json({ error: 'Nova senha mín. 6 caracteres.' }); return; }
    const doctor = await prisma.doctor.findUnique({ where: { id: req.doctorId }, select: { passwordHash: true } });
    if (!doctor || !(await comparePassword(cur, doctor.passwordHash))) { res.status(401).json({ error: 'Senha atual incorreta.' }); return; }
    await prisma.doctor.update({ where: { id: req.doctorId }, data: { passwordHash: await hashPassword(next0) } });
    res.json({ ok: true });
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
      include: { patient: { select: { id: true, fullName: true, relationship: true, dateOfBirth: true, photoUrl: true, gender: true, clinicalProfile: true, owner: { select: { id: true, name: true } } } } },
      orderBy: { createdAt: 'desc' },
    });
    const pids = shares.map((s) => s.patient.id);
    // Agregados em lote (1 query cada) — idade calculada do dateOfBirth
    const [weights, examStats, abnormal] = await Promise.all([
      prisma.measurement.findMany({ where: { patientId: { in: pids }, type: 'WEIGHT' }, orderBy: { measuredAt: 'desc' }, select: { patientId: true, value: true, measuredAt: true } }),
      prisma.exam.groupBy({ by: ['patientId'], where: { patientId: { in: pids }, status: 'EXTRACTED' }, _count: { _all: true }, _max: { performedAt: true } }),
      prisma.examItem.findMany({ where: { isAbnormal: true, exam: { patientId: { in: pids }, status: 'EXTRACTED' } }, select: { exam: { select: { patientId: true } } } }),
    ]);
    const weightByPid = new Map<string, any>();
    for (const w of weights) if (!weightByPid.has(w.patientId)) weightByPid.set(w.patientId, w); // ordenado desc → 1º = mais recente
    const statByPid = new Map(examStats.map((e) => [e.patientId, e]));
    const alertPids = new Set(abnormal.map((a) => a.exam.patientId));

    res.json({
      items: shares.map((s) => {
        const st = statByPid.get(s.patient.id);
        return {
          shareId: s.id, scopes: s.scopes, convenio: s.convenio, createdAt: s.createdAt,
          patient: s.patient,
          code: '#' + s.patient.id.slice(-4).toUpperCase(),
          ownerId: s.patient.owner?.id ?? null,
          ownerName: s.patient.owner?.name ?? '',
          relationship: s.patient.relationship ?? null,
          age: s.patient.dateOfBirth ? calcAge(s.patient.dateOfBirth) : null,
          sex: s.patient.gender ?? null,
          latestWeight: weightByPid.get(s.patient.id) ?? null,
          examsCount: st?._count?._all ?? 0,
          lastExamAt: st?._max?.performedAt ?? null,
          hasAlerts: alertPids.has(s.patient.id),
        };
      }),
      total: shares.length,
    });
  } catch (e) { next(e); }
});

// Idade (anos) a partir da data de nascimento
function calcAge(dob: Date | string): number {
  const d = new Date(dob); const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

// EXAMES do paciente (só se scope 'exams')
router.get('/patients/:patientId/exams', requireDoctor, async (req: any, res, next) => {
  try {
    const share = await prisma.doctorShare.findFirst({ where: { doctorId: req.doctorId, patientId: req.params.patientId, active: true } });
    if (!share?.scopes.includes('exams')) { res.status(403).json({ error: 'Sem permissão para ver exames deste paciente.' }); return; }
    const exams = await prisma.exam.findMany({
      where: { patientId: req.params.patientId, status: 'EXTRACTED' },
      select: { id: true, title: true, kind: true, performedAt: true, sourceLab: true, rawExtraction: true, _count: { select: { items: true } }, items: { where: { isAbnormal: true }, select: { name: true, valueText: true, flag: true, unit: true, refText: true, refLow: true, refHigh: true } } },
      orderBy: { performedAt: 'desc' }, take: 20,
    });
    res.json({ items: exams.map((e) => ({ id: e.id, title: e.title, kind: e.kind, performedAt: e.performedAt, sourceLab: e.sourceLab, requestingDoctor: (e.rawExtraction as any)?.requestingDoctor ?? null, _count: e._count, items: e.items })) });
  } catch (e) { next(e); }
});

// DETALHE de um exame (TODOS os itens) — só se scope 'exams'. Igual à página do paciente.
router.get('/patients/:patientId/exams/:examId', requireDoctor, async (req: any, res, next) => {
  try {
    const share = await prisma.doctorShare.findFirst({ where: { doctorId: req.doctorId, patientId: req.params.patientId, active: true } });
    if (!share?.scopes.includes('exams')) { res.status(403).json({ error: 'Sem permissão.' }); return; }
    const exam = await prisma.exam.findFirst({
      where: { id: req.params.examId, patientId: req.params.patientId, status: 'EXTRACTED' },
      select: { id: true, title: true, kind: true, performedAt: true, sourceLab: true, filePath: true, items: { orderBy: { name: 'asc' }, select: { id: true, name: true, valueText: true, valueNumeric: true, unit: true, flag: true, isAbnormal: true, refLow: true, refHigh: true, refText: true } } },
    });
    if (!exam) { res.status(404).json({ error: 'Exame não encontrado.' }); return; }
    res.json({ exam });
  } catch (e) { next(e); }
});

// PDF ORIGINAL do exame (acesso direto à fonte — validação legal do médico).
// Aceita token via header Authorization OU via query ?token= (pra abrir no navegador do celular).
router.get('/patients/:patientId/exams/:examId/file', async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const queryToken = typeof req.query.token === 'string' ? req.query.token : '';
    const tok = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : queryToken;
    const payload = tok ? verifyDoctorToken(tok) : null;
    const doctorId = payload?.doctorId;
    if (!doctorId) { res.status(401).json({ error: 'Sem permissão.' }); return; }
    const share = await prisma.doctorShare.findFirst({ where: { doctorId, patientId: req.params.patientId, active: true } });
    if (!share?.scopes.includes('exams')) { res.status(403).json({ error: 'Sem permissão.' }); return; }
    const exam = await prisma.exam.findFirst({ where: { id: req.params.examId, patientId: req.params.patientId }, select: { filePath: true } });
    if (!exam?.filePath) { res.status(404).json({ error: 'Arquivo não encontrado.' }); return; }
    const r = await resolveExamFile(exam.filePath);
    if (r.kind === 'url') res.redirect(302, r.url as string);
    else { res.setHeader('Content-Type', 'application/pdf'); fs.createReadStream(r.file as string).pipe(res); }
  } catch (e) { next(e); }
});

// EVOLUÇÃO do paciente (só se scope 'evolution')
router.get('/patients/:patientId/evolution', requireDoctor, async (req: any, res, next) => {
  try {
    const share = await prisma.doctorShare.findFirst({ where: { doctorId: req.doctorId, patientId: req.params.patientId, active: true } });
    if (!share?.scopes.includes('evolution')) { res.status(403).json({ error: 'Sem permissão.' }); return; }
    const raw = await prisma.examItem.findMany({
      where: { exam: { patientId: req.params.patientId, status: 'EXTRACTED' }, valueNumeric: { not: null } },
      select: { name: true, nameCanonical: true, valueNumeric: true, unit: true, flag: true, isAbnormal: true, refLow: true, refHigh: true, exam: { select: { performedAt: true } } },
      orderBy: { exam: { performedAt: 'desc' } }, take: 300,
    });
    // Dedup por (analito + data + valor) — exames duplicados viram 1 ponto só no gráfico
    const seen = new Set<string>();
    const items = raw.filter((r) => {
      const day = r.exam?.performedAt ? new Date(r.exam.performedAt).toDateString() : 's/d';
      const k = `${r.nameCanonical}|${day}|${r.valueNumeric}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    res.json({ items });
  } catch (e) { next(e); }
});

// RESUMOS DE IA do paciente (só se scope 'summary') — análises SUMMARY já geradas
router.get('/patients/:patientId/summaries', requireDoctor, async (req: any, res, next) => {
  try {
    const share = await prisma.doctorShare.findFirst({ where: { doctorId: req.doctorId, patientId: req.params.patientId, active: true } });
    if (!share?.scopes.includes('summary')) { res.status(403).json({ error: 'Sem permissão.' }); return; }
    const items = await prisma.aiAnalysis.findMany({
      where: { patientId: req.params.patientId, type: 'SUMMARY' },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, contentMd: true, createdAt: true, exam: { select: { title: true, performedAt: true } } },
    });
    res.json({ items });
  } catch (e) { next(e); }
});

// === ANOTAÇÕES CLÍNICAS (histórico de atendimento) — disponível p/ qualquer paciente compartilhado ===
const requireShare = async (doctorId: string, patientId: string) => {
  const share = await prisma.doctorShare.findFirst({ where: { doctorId, patientId, active: true } });
  return !!share;
};

// LISTAR anotações do paciente
router.get('/patients/:patientId/notes', requireDoctor, async (req: any, res, next) => {
  try {
    if (!(await requireShare(req.doctorId, req.params.patientId))) { res.status(403).json({ error: 'Sem permissão.' }); return; }
    const items = await prisma.doctorNote.findMany({
      where: { doctorId: req.doctorId, patientId: req.params.patientId },
      orderBy: { createdAt: 'desc' }, take: 100,
      select: { id: true, content: true, createdAt: true, updatedAt: true },
    });
    res.json({ items });
  } catch (e) { next(e); }
});

// CRIAR anotação
router.post('/patients/:patientId/notes', requireDoctor, async (req: any, res, next) => {
  try {
    if (!(await requireShare(req.doctorId, req.params.patientId))) { res.status(403).json({ error: 'Sem permissão.' }); return; }
    const content = String(req.body?.content ?? '').trim();
    if (!content) { res.status(400).json({ error: 'Conteúdo obrigatório.' }); return; }
    const note = await prisma.doctorNote.create({ data: { doctorId: req.doctorId, patientId: req.params.patientId, content } });
    res.status(201).json({ note });
  } catch (e) { next(e); }
});

// EDITAR anotação
router.patch('/notes/:id', requireDoctor, async (req: any, res, next) => {
  try {
    const content = String(req.body?.content ?? '').trim();
    const note = await prisma.doctorNote.findFirst({ where: { id: String(req.params.id), doctorId: req.doctorId } });
    if (!note) { res.status(404).json({ error: 'Anotação não encontrada.' }); return; }
    if (!content) { res.status(400).json({ error: 'Conteúdo obrigatório.' }); return; }
    const updated = await prisma.doctorNote.update({ where: { id: note.id }, data: { content } });
    res.json({ note: updated });
  } catch (e) { next(e); }
});

// EXCLUIR anotação
router.delete('/notes/:id', requireDoctor, async (req: any, res, next) => {
  try {
    const note = await prisma.doctorNote.findFirst({ where: { id: String(req.params.id), doctorId: req.doctorId } });
    if (!note) { res.status(404).json({ error: 'Anotação não encontrada.' }); return; }
    await prisma.doctorNote.delete({ where: { id: note.id } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
