import { auditLog } from '../middleware/auditLog';
import { validate, schemas } from '../middleware/validate';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import path from 'path';
import fs from 'fs';
import { prisma } from '../prisma';
import { hashPassword, comparePassword } from '../auth/jwt';
import { issueOtp, verifyOtp } from '../auth/otp';
import { sendEmail } from '../utils/mailer';
import { otpEmail } from '../utils/emailTemplate';
import { config } from '../config';
import { upload } from '../middleware/upload';
import { saveDoctorPhoto, resolvePatientPhoto, resolveExamFile } from '../utils/storage';
import { evaluateMfaOnLogin, verifyChallenge, getStatus as mfaStatus, startSetup as mfaStart, confirmSetup as mfaConfirm, disableMfa as mfaDisable } from '../utils/mfa';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { lookupCfm } from '../utils/cfm';
import { buildCurrentHealthSummary, priorityOfItem, PRIORITY_RANK } from '../analysis/health-state';
import { latestRiskAssessment, buildRiskAssessment } from '../analysis/risk-service';
import { generateActionPlan } from '../analysis/risk-action-plan';
import { generateConsolidatedSummary } from '../analysis/health-summary';
import { generateSoap } from '../analysis/doctor-soap';
import { suggestCid10 } from '../analysis/cid10';

// Especialidades base (espelha o front-end). O dropdown real = base ∪ especialidades que já existem no banco.
const BASE_SPECIALTIES = [
  'Clinico Geral', 'Cardiologista', 'Endocrinologista', 'Gastroenterologista',
  'Ginecologista', 'Hematologista', 'Neurologista', 'Ortopedista', 'Pneumologista',
  'Psiquiatra', 'Reumatologista', 'Urologista', 'Dermatologista', 'Oftalmologista',
  'Otorrinolaringologista', 'Pediatra', 'Geriatra', 'Oncologista', 'Nefrologista',
  'Infectologista', 'Hepatologista', 'Cirurgiao Geral', 'Angiologista', 'Nutrologista',
  'Medico do Trabalho', 'Medico de Familia', 'Outro',
];

// Normaliza a chave do CRM. Com UF explícita → "base-UF" (remove sufixo "-XX" se já vier anexado,
// p/ não virar "12345-SP-SP"). Sem UF → mantém EXATAMENTE como digitado (compatível c/ dados legados
// como "B-SP", "999-SP" — a chave @unique continua batendo).
export function normalizeCrmKey(crm?: string, uf?: string): { crm: string; uf: string | null } | null {
  const raw = String(crm ?? '').trim();
  if (!raw) return null;
  const ufClean = String(uf ?? '').trim().match(/^[A-Za-z]{2}$/)?.[0]?.toUpperCase() || null;
  if (!ufClean) return { crm: raw, uf: null };
  const base = raw.replace(/[-/\s]\s*[A-Za-z]{2}\s*$/, '').trim() || raw;
  return { crm: `${base}-${ufClean}`, uf: ufClean };
}

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

// Dr. Exame Pro (premium) — free tier: 5 features premium/mês. Depois: paywall (402).
const FREE_TIER_LIMIT = 5;
const checkPremiumFeature = async (req: any, res: any, next: any): Promise<void> => {
  try {
    const doc = await prisma.doctor.findUnique({ where: { id: req.doctorId }, select: { plan: true, planExpiresAt: true, freeUsageMonth: true, freeUsageCount: true } });
    if (!doc) { res.status(401).json({ error: 'auth' }); return; }
    if (doc.plan === 'premium' && doc.planExpiresAt && doc.planExpiresAt > new Date()) return next();
    const month = new Date().toISOString().slice(0, 7);
    if (doc.freeUsageMonth !== month) { await prisma.doctor.update({ where: { id: req.doctorId }, data: { freeUsageMonth: month, freeUsageCount: 1 } }); return next(); }
    if (doc.freeUsageCount < FREE_TIER_LIMIT) { await prisma.doctor.update({ where: { id: req.doctorId }, data: { freeUsageCount: { increment: 1 } } }); return next(); }
    res.status(402).json({ error: 'premium_required', message: 'Você usou suas 5 pré-consultas grátis deste mês. Assine o Dr. Exame Pro para uso ilimitado.' });
  } catch (e) { next(e); }
};

// Plano do médico (status premium/free + uso do mês)
router.get('/me/plan', requireDoctor, async (req: any, res) => {
  const doc = await prisma.doctor.findUnique({ where: { id: req.doctorId }, select: { plan: true, planExpiresAt: true, freeUsageMonth: true, freeUsageCount: true } });
  const month = new Date().toISOString().slice(0, 7);
  const isPremium = doc?.plan === 'premium' && doc?.planExpiresAt && doc.planExpiresAt > new Date();
  const freeUsed = doc?.freeUsageMonth === month ? (doc?.freeUsageCount ?? 0) : 0;
  res.json({ isPremium: !!isPremium, plan: doc?.plan ?? 'free', planExpiresAt: doc?.planExpiresAt, freeUsed, freeLimit: FREE_TIER_LIMIT });
});

// Checkout MP (R$29,90/mês)
router.post('/subscription/checkout', requireDoctor, async (req: any, res) => {
  try {
    const preference = {
      items: [{ title: 'Dr. Exame Pro — Mensal', unit_price: 29.90, quantity: 1, currency_id: 'BRL' }],
      back_urls: { success: `${config.webOrigin}${config.webBasePath}/doctor?paid=1`, failure: `${config.webOrigin}${config.webBasePath}/doctor`, pending: `${config.webOrigin}${config.webBasePath}/doctor` },
      auto_return: 'approved' as const, external_reference: `doctor_sub_${req.doctorId}`,
      notification_url: `${config.webOrigin}${config.webBasePath}/api/billing/webhook`,
    };
    const r = await fetch('https://api.mercadopago.com/checkout/preferences', { method: 'POST', headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(preference) });
    const data: any = await r.json();
    if (data.init_point) res.json({ url: data.init_point });
    else res.status(500).json({ error: 'Falha ao criar checkout.', detail: data.message });
  } catch { res.status(500).json({ error: 'Falha ao criar checkout.' }); }
});

// === BUSCA de médico por CRM+UF (auth PACIENTE) ===
// Ordem: conta real reclamada (mais fidedigno) → CFM → cadastro pendente local → manual.
router.get('/lookup', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const crm = String(req.query.crm ?? '').replace(/\D/g, '');
    const uf = String(req.query.uf ?? '').trim().toUpperCase();
    if (!crm || uf.length !== 2) { res.status(400).json({ error: 'CRM e UF (2 letras) obrigatórios.' }); return; }
    const crmKey = `${crm}-${uf}`;

    // 1) conta real (médico registrou/claimou) — dados mais fidedignos
    const doc = await prisma.doctor.findUnique({ where: { crm: crmKey } });
    const docDto = (d: any) => ({ name: d.name, specialty: d.specialty, crm: d.crm, uf: d.crmUf || uf, email: d.email?.includes('@invite.com') ? null : d.email });
    if (doc && doc.passwordHash !== 'pending-invite') { res.json({ source: 'base', doctor: docDto(doc) }); return; }

    // 2) fallback CFM (fonte oficial) — persiste pra virar diretório + alimentar dropdown de especialidade
    const cfm = await lookupCfm(crm, uf);
    if (cfm) {
      await prisma.doctor.upsert({
        where: { crm: crmKey },
        update: { name: cfm.name, specialty: cfm.specialty || undefined, crmUf: uf },
        create: { name: cfm.name, crm: crmKey, crmUf: uf, specialty: cfm.specialty, email: `pending-${crmKey}@invite.com`.toLowerCase(), passwordHash: 'pending-invite' },
      }).catch(() => null);
      res.json({ source: 'cfm', doctor: { name: cfm.name, specialty: cfm.specialty, crm: cfm.crm, uf: cfm.uf, situation: cfm.situation } });
      return;
    }

    // 3) cadastro pendente local (paciente já tinha digitado antes) — melhor que manual
    if (doc && doc.name) { res.json({ source: 'base', doctor: docDto(doc) }); return; }

    // 4) manual
    res.json({ source: 'manual', doctor: null });
  } catch (e) { next(e); }
});

// Especialidades p/ o dropdown: base ∪ distintas que já existem no banco (auto-alimentação).
router.get('/specialties', requireAuth, async (_req, res, next) => {
  try {
    const rows = await prisma.doctor.findMany({ where: { NOT: { specialty: null } }, select: { specialty: true }, distinct: ['specialty'] });
    const fromDb = rows.map((r) => r.specialty!).filter(Boolean);
    const merged = Array.from(new Set([...BASE_SPECIALTIES, ...fromDb])).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    res.json({ specialties: merged });
  } catch (e) { next(e); }
});

// BUSCA pública de médico por CRM (consultaCRM) — auto-preenchimento no CADASTRO do médico.
// Público (o médico ainda não tem conta) + rate-limited em app.ts. Só consultaCRM (dados públicos do conselho),
// não expõe dados internos. Retorna {found, name, specialty, crm, uf, situation} ou {found:false}.
router.get('/crm', async (req, res, next) => {
  try {
    const crm = String(req.query.crm ?? '').replace(/\D/g, '');
    const uf = String(req.query.uf ?? '').trim().toUpperCase();
    if (!crm || uf.length !== 2) { res.status(400).json({ error: 'CRM e UF (2 letras) obrigatórios.' }); return; }
    const cfm = await lookupCfm(crm, uf);
    if (!cfm) { res.json({ found: false }); return; }
    res.json({ found: true, name: cfm.name, specialty: cfm.specialty, crm: cfm.crm, uf: cfm.uf, situation: cfm.situation });
  } catch (e) { next(e); }
});

// CADASTRO do médico
router.post('/register', validate(schemas.doctorRegister), async (req, res, next) => {
  try {
    const { name, crm, crmUf, specialty, email, password } = req.body ?? {};
    if (!name || !crm || !email || !password || String(password).length < 6) {
      res.status(400).json({ error: 'Nome, CRM, e-mail e senha (mín. 6) obrigatórios.' }); return;
    }
    // Normaliza pra chave canônica "numero-UF" — COERENTE com o compartilhamento do paciente.
    // Assim o médico reclaima o Doctor pendente criado no share (herda os compartilhamentos),
    // independente de digitar "116739", "116739-SP" ou "116739" + UF.
    const norm = normalizeCrmKey(crm, crmUf) ?? normalizeCrmKey(crm);
    const crmKey = norm?.crm ?? String(crm).trim();
    const uf = norm?.uf ?? null;
    const mail = String(email).toLowerCase().trim();
    const existing = await prisma.doctor.findFirst({ where: { OR: [{ email: mail }, { crm: crmKey }] } });
    if (existing) {
      if (existing.passwordHash === 'pending-invite') {
        // CLAIM: paciente pré-cadastrou → médico completa dados + senha (mesmo id → herda shares).
        // Mas NÃO loga ainda: valida o e-mail (OTP), igual o paciente.
        await prisma.doctor.update({
          where: { id: existing.id },
          data: { name, specialty: specialty || existing.specialty, email: mail, passwordHash: await hashPassword(String(password)), crmUf: uf ?? existing.crmUf, emailVerified: false },
        });
      } else {
        res.status(409).json({ error: 'CRM ou e-mail já cadastrado. Faça login.' }); return;
      }
    } else {
      // NOVO cadastro — fica INATIVO até verificar o e-mail (evita e-mail falso + CRM alheio acessar dados).
      await prisma.doctor.create({ data: { name, crm: crmKey, crmUf: uf, specialty, email: mail, passwordHash: await hashPassword(String(password)), emailVerified: false } });
    }
    // Envia código de verificação pro e-mail — NÃO emite token antes de confirmar.
    const code = issueOtp(mail);
    sendEmail({ to: mail, subject: 'Ative sua conta — Portal do Médico (Meus Exames)', html: otpEmail(String(name), code) })
      .catch((e: any) => console.error('[doctor/register] falha SMTP verificação:', e?.message));
    res.status(201).json({ needsVerification: true, email: mail });
  } catch (e) { next(e); }
});

// VERIFICAR E-MAIL do médico (ativa a conta após o cadastro) — código por e-mail (OTP), igual o paciente.
router.post('/verify-email', async (req, res) => {
  try {
    const mail = String(req.body?.email ?? '').toLowerCase().trim();
    const code = String(req.body?.code ?? '');
    const doctor = await prisma.doctor.findFirst({ where: { email: mail } });
    if (!doctor || doctor.passwordHash === 'pending-invite') { res.status(404).json({ error: 'Conta não encontrada. Cadastre-se novamente.' }); return; }
    if (!verifyOtp(mail, code)) { res.status(401).json({ error: 'Código inválido ou expirado.' }); return; }
    const verified = await prisma.doctor.update({ where: { id: doctor.id }, data: { emailVerified: true } });
    const mfa = await evaluateMfaOnLogin('DOCTOR', doctor.id, { doctorId: doctor.id }, doctor.email);
    if (mfa) { res.json(mfa); return; }
    res.json({ token: signDoctorToken(verified.id), doctor: { id: verified.id, name: verified.name, crm: verified.crm, specialty: verified.specialty, email: verified.email, photoUrl: verified.photoUrl } });
  } catch (e: any) { res.status(500).json({ error: e.message || 'Erro na verificação.' }); }
});

// LOGIN do médico — aceita E-MAIL ou CRM (o que ele lembrar mais fácil)
router.post('/login', async (req, res, next) => {
  try {
    const id = String(req.body?.email ?? req.body?.login ?? '').trim();
    // Aceita e-mail OU CRM. CRM casa no formato exato ("116739-SP") ou só dígitos ("116739" → acha "116739-SP").
    const digits = id.replace(/\D/g, '');
    const orClauses: any[] = [{ email: id.toLowerCase() }, { crm: id }];
    if (digits && !id.includes('@') && !id.includes('-')) orClauses.push({ crm: { startsWith: digits + '-' } });
    const doctor = await prisma.doctor.findFirst({ where: { OR: orClauses } });
    if (!doctor || doctor.passwordHash === 'pending-invite' || !(await comparePassword(String(req.body?.password ?? ''), doctor.passwordHash))) {
      res.status(401).json({ error: 'Credenciais inválidas.' }); return;
    }
    if (!doctor.emailVerified) { res.status(403).json({ error: 'Verifique seu e-mail para ativar a conta.', needsVerification: true, email: doctor.email }); return; }
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
      prisma.examItem.findMany({ where: { isAbnormal: true, exam: { patientId: { in: pids }, status: 'EXTRACTED' } }, select: { valueNumeric: true, refLow: true, refHigh: true, flag: true, exam: { select: { patientId: true } } } }),
    ]);
    const weightByPid = new Map<string, any>();
    for (const w of weights) if (!weightByPid.has(w.patientId)) weightByPid.set(w.patientId, w); // ordenado desc → 1º = mais recente
    const statByPid = new Map(examStats.map((e) => [e.patientId, e]));
    const alertPids = new Set(abnormal.map((a) => a.exam.patientId));
    // Fila de prioridade: pior prioridade (magnitude) de cada paciente → ordena a lista do médico.
    const PRIORITY_FROM_RANK = ['normal', 'leve', 'moderada', 'importante'] as const;
    const maxPriorityByPid = new Map<string, number>();
    for (const a of abnormal) {
      const rank = PRIORITY_RANK[priorityOfItem(a)];
      const pid = a.exam.patientId;
      if (rank > (maxPriorityByPid.get(pid) ?? -1)) maxPriorityByPid.set(pid, rank);
    }

    const items = shares
      .map((s) => ({ s, rank: maxPriorityByPid.get(s.patient.id) ?? 0 }))
      .sort((a, b) => b.rank - a.rank)
      .map(({ s, rank }) => {
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
          maxPriority: rank > 0 ? PRIORITY_FROM_RANK[rank] : null,
        };
      });

    res.json({ items, total: shares.length });
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
    void auditLog(req, 'doctor_viewed_exams', String(req.params.patientId));
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
    void auditLog(req, 'doctor_viewed_summaries', String(req.params.patientId));
  try {
    const share = await prisma.doctorShare.findFirst({ where: { doctorId: req.doctorId, patientId: req.params.patientId, active: true } });
    if (!share?.scopes.includes('summary')) { res.status(403).json({ error: 'Sem permissão.' }); return; }
    const items = await prisma.aiAnalysis.findMany({
      where: { patientId: req.params.patientId, type: 'SUMMARY', examId: null }, // só consolidado (ignora por-exame)
      orderBy: { createdAt: 'desc' },
      take: 1, // só o + recente (antes take 10 → confundia o médico com vários)
      select: { id: true, contentMd: true, structured: true, createdAt: true, userMessage: true },
    });
    res.json({ items });
  } catch (e) { next(e); }
});

// SNAPSHOT DE SAÚDE (Layer 2) — visão de 1 min do médico: estado atual + prioridade + "o que mudou".
// Consome a MESMA camada M1 do app do paciente (acaba a desconexão paciente×médico). Scope 'alerts'.
router.get('/patients/:patientId/health-summary', requireDoctor, async (req: any, res, next) => {
    void auditLog(req, 'doctor_viewed_health_summary', String(req.params.patientId));
  try {
    const share = await prisma.doctorShare.findFirst({ where: { doctorId: req.doctorId, patientId: req.params.patientId, active: true } });
    if (!share?.scopes.includes('alerts')) { res.status(403).json({ error: 'Sem permissão para ver o estado deste paciente.' }); return; }
    res.json(await buildCurrentHealthSummary(String(req.params.patientId)));
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

// === RISCO + PLANO DE AÇÃO + MUDANÇAS (FASE C) + resumo clínico doctor (B3) ===
// Todas GRÁTIS pro médico (engajamento — não chamam chargeCredits). Reusa a camada de risco do app.

// LEITURA DE RISCO do paciente (C1) — reusa latestRiskAssessment (ou computa se não há).
router.get('/patients/:patientId/risk', requireDoctor, async (req: any, res, next) => {
  try {
    if (!(await requireShare(req.doctorId, req.params.patientId))) { res.status(403).json({ error: 'Sem permissão.' }); return; }
    void auditLog(req, 'doctor_viewed_risk', String(req.params.patientId));
    const latest = await latestRiskAssessment(String(req.params.patientId));
    if (latest) { res.json(latest); return; }
    const { result, trend, prior } = await buildRiskAssessment(String(req.params.patientId));
    res.json({ id: null, createdAt: null, result, trend, prior });
  } catch (e) { next(e); }
});

// HISTÓRICO DE RISCO (C3) — "Mudanças desde a última visita": série de leituras + condição ao longo do tempo.
router.get('/patients/:patientId/risk/history', requireDoctor, async (req: any, res, next) => {
  try {
    if (!(await requireShare(req.doctorId, req.params.patientId))) { res.status(403).json({ error: 'Sem permissão.' }); return; }
    const history = await prisma.riskAssessment.findMany({
      where: { patientId: req.params.patientId },
      orderBy: { createdAt: 'desc' }, take: 12,
      select: { id: true, conditionKey: true, conditionLabel: true, riskLevel: true, createdAt: true },
    });
    res.json({ history });
  } catch (e) { next(e); }
});

// PLANO DE AÇÃO CLÍNICO (C2) — versão MÉDICO (audience='doctor', tom técnico), GRÁTIS.
router.post('/patients/:patientId/action-plan', requireDoctor, checkPremiumFeature, async (req: any, res, next) => {
  try {
    if (!(await requireShare(req.doctorId, req.params.patientId))) { res.status(403).json({ error: 'Sem permissão.' }); return; }
    void auditLog(req, 'doctor_generated_action_plan', String(req.params.patientId));
    const { contentMd, basedOn } = await generateActionPlan(String(req.params.patientId), 'doctor');
    res.json({ contentMd, basedOn });
  } catch (e: any) {
    if (e?.status === 409) { res.status(409).json({ error: 'no_risk_assessment', message: e.message }); return; }
    if (!res.headersSent) res.status(500).json({ error: 'Não foi possível gerar o plano agora.' });
  }
});

// RESUMO CLÍNICO (B3) — gera versão MÉDICO (audience='doctor', tom técnico), GRÁTIS.
// Marca com userMessage='audience:doctor' pra diferenciar do resumo leigo do paciente (mesma tabela).
router.post('/patients/:patientId/summary/generate', requireDoctor, async (req: any, res, next) => {
  try {
    const share = await prisma.doctorShare.findFirst({ where: { doctorId: req.doctorId, patientId: req.params.patientId, active: true } });
    if (!share?.scopes.includes('summary')) { res.status(403).json({ error: 'Sem permissão.' }); return; }
    void auditLog(req, 'doctor_generated_summary', String(req.params.patientId));
    const { summary, contentMd, modelUsed, usage } = await generateConsolidatedSummary(String(req.params.patientId), 'doctor');
    const existing = await prisma.aiAnalysis.findFirst({ where: { patientId: req.params.patientId, type: 'SUMMARY', examId: null, userMessage: 'audience:doctor' }, orderBy: { createdAt: 'desc' } });
    const analysis = existing
      ? await prisma.aiAnalysis.update({ where: { id: existing.id }, data: { contentMd, structured: summary as any, modelUsed, tokenUsage: usage as any, createdAt: new Date() }, select: { id: true, createdAt: true } })
      : await prisma.aiAnalysis.create({ data: { patientId: req.params.patientId, type: 'SUMMARY', examId: null, userMessage: 'audience:doctor', contentMd, structured: summary as any, modelUsed, tokenUsage: usage as any }, select: { id: true, createdAt: true } });
    res.status(201).json({ id: analysis.id, createdAt: analysis.createdAt, contentMd });
  } catch (e: any) { if (!res.headersSent) res.status(500).json({ error: 'Não foi possível gerar o resumo agora.' }); }
});

// PRÉ-CONSULTA (brief automático de 1 página) — top mudanças + risco + investigar + perguntas. Grátis, determinístico.
router.get('/patients/:patientId/pre-visit', requireDoctor, checkPremiumFeature, async (req: any, res, next) => {
  try {
    if (!(await requireShare(req.doctorId, req.params.patientId))) { res.status(403).json({ error: 'Sem permissão.' }); return; }
    void auditLog(req, 'doctor_pre_visit', String(req.params.patientId));
    const pid = String(req.params.patientId);
    const [snapshot, risk, chatTurns, lastNote] = await Promise.all([
      buildCurrentHealthSummary(pid),
      latestRiskAssessment(pid),
      prisma.aiAnalysis.findMany({ where: { patientId: pid, type: 'CHAT' }, orderBy: { createdAt: 'desc' }, take: 5, select: { userMessage: true } }),
      prisma.doctorNote.findFirst({ where: { doctorId: req.doctorId, patientId: pid }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
    ]);
    // Top 3: worsening primeiro (piorou), depois topAttention por prioridade
    const candidates = [
      ...snapshot.worsening.map((m: any) => ({ name: m.name, delta: m.deltaPct, direction: m.trend, priority: m.priority })),
      ...snapshot.topAttention.filter((m: any) => m.trend !== 'piorou').map((m: any) => ({ name: m.name, delta: m.deltaPct, direction: m.trend, priority: m.priority })),
    ].sort((a: any, b: any) => (PRIORITY_RANK[b.priority as keyof typeof PRIORITY_RANK] ?? 0) - (PRIORITY_RANK[a.priority as keyof typeof PRIORITY_RANK] ?? 0) || Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0));
    res.json({
      topIssues: candidates.slice(0, 3),
      risk: risk?.result ? { conditionLabel: risk.result.predictedCondition, riskLevel: risk.result.riskLevel, trend: risk.trend } : null,
      investigate: snapshot.stale.slice(0, 5).map((m: any) => ({ name: m.name, lastMeasured: m.latest.performedAt })),
      patientQuestions: chatTurns.map((t: any) => t.userMessage).filter(Boolean),
      lastVisit: lastNote?.createdAt ?? null,
      score: snapshot.score,
      markers: snapshot.markers,
    });
  } catch (e) { next(e); }
});

// SOAP RASCUNHO (IA preenche, médico edita) — grátis pro médico.
router.post('/patients/:patientId/soap', requireDoctor, checkPremiumFeature, async (req: any, res, next) => {
  try {
    if (!(await requireShare(req.doctorId, req.params.patientId))) { res.status(403).json({ error: 'Sem permissão.' }); return; }
    void auditLog(req, 'doctor_generated_soap', String(req.params.patientId));
    const { contentMd, modelUsed } = await generateSoap(String(req.params.patientId));
    res.status(201).json({ contentMd, modelUsed });
  } catch (e: any) {
    if (e?.status === 400) { res.status(400).json({ error: 'Sem exames extraídos pra gerar SOAP.' }); return; }
    if (!res.headersSent) res.status(500).json({ error: 'Não foi possível gerar o SOAP agora.' });
  }
});

// EXPORT PES — resumo clínico estruturado com CID-10 sugerido (prontuário eletrônico).
router.get('/patients/:patientId/export-pes', requireDoctor, async (req: any, res, next) => {
  try {
    if (!(await requireShare(req.doctorId, req.params.patientId))) { res.status(403).json({ error: 'Sem permissão.' }); return; }
    const pid = String(req.params.patientId);
    const [snapshot, risk, patient, lastNote] = await Promise.all([
      buildCurrentHealthSummary(pid),
      latestRiskAssessment(pid),
      prisma.patient.findUnique({ where: { id: pid }, select: { fullName: true, dateOfBirth: true, gender: true, clinicalProfile: true } }),
      prisma.doctorNote.findFirst({ where: { doctorId: req.doctorId, patientId: pid }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
    ]);
    const conditions = risk?.result?.conditions ?? (risk?.result?.predictedConditionKey && risk.result.predictedConditionKey !== 'none' ? [risk.result.predictedConditionKey] : []);
    const cid10 = suggestCid10(conditions as string[]);
    const abnormal = snapshot.topAttention.slice(0, 10).map((m: any) => `${m.name}: ${m.latest.valueText ?? m.latest.valueNumeric} ${m.unit ?? ''} (ref ${m.refText ?? `${m.refLow ?? '?'}-${m.refHigh ?? '?'}`})`).join('; ');
    const age = patient?.dateOfBirth ? Math.floor((Date.now() - new Date(patient.dateOfBirth).getTime()) / (365.25 * 86400000)) : null;
    // Texto estruturado pronto pra copiar no PES
    const text = [
      `PACIENTE: ${patient?.fullName ?? '—'}`,
      `${age ? age + ' anos' : ''} ${patient?.gender === 'female' ? 'Feminino' : patient?.gender === 'male' ? 'Masculino' : ''}`.trim(),
      ``,
      `CID-10 SUGERIDO (confirmar):`,
      ...cid10.map((c) => `  ${c.code} — ${c.label}`),
      ``,
      `MOTIVO DA CONSULTA: Avaliação de exames laboratoriais.`,
      ``,
      `ACHADOS RELEVANTES:`,
      `  ${abnormal || 'Sem alterações relevantes.'}`,
      ``,
      `RISCO: ${risk?.result?.predictedCondition ?? 'Sem leitura de risco.'} (${risk?.result?.riskLevel ?? '—'})`,
      ``,
      `PERFIL CLÍNICO: ${patient?.clinicalProfile ?? 'Não informado.'}`,
      ``,
      `Score de saúde: ${snapshot.score ?? '—'}/100 em ${snapshot.markers} marcador(es).`,
      lastNote ? `Última visita: ${new Date(lastNote.createdAt).toLocaleDateString('pt-BR')}` : '',
      ``,
      `Gerado pelo app Dr. Exame — conteúdo educativo, não substitui avaliação médica.`,
    ].filter(Boolean).join('\n');
    res.json({ cid10, text, patient: { name: patient?.fullName, age, gender: patient?.gender }, risk: { condition: risk?.result?.predictedCondition, level: risk?.result?.riskLevel }, score: snapshot.score });
  } catch (e) { next(e); }
});

export default router;
