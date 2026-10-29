// KYC do médico (spec docs/design/2026-10-28-verificacao-medico-spec.md §3). Montado em /api/doctor
// (sem overlap com doctor.routes.ts). Auth LOCAL (padrão D8) + política única com allowUnverified:
// o médico ainda não verificado precisa conseguir se verificar.
import { Router, type Response, type NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { prisma } from '../prisma';
import { type AuthedRequest } from '../middleware/auth';
import { audit } from '../utils/audit';
import { decryptPII } from '../utils/crypto';
import { lookupCfm } from '../utils/cfm';
import { DOCTOR_ACCESS_SELECT, doctorAccessDenial } from '../utils/doctorAccess';
import { createUaiidVerification, UaiidError } from '../utils/uaiid';
import { NON_FINAL_ATTEMPT } from '../kyc/decide';
import { syncVerification } from '../kyc/sync';
import { kycMessage } from '../kyc/messages';
import { createLogger } from '../utils/logger';

const router = Router();
const log = createLogger('kyc-verification');

interface KycRequest extends AuthedRequest { doctorId?: string }

const RETURN_URL = () => process.env.UAIID_RETURN_URL || 'https://drexame.janocaminho.com.br/#/doctor?kyc=1';
const OPEN_STATUSES = [...NON_FINAL_ATTEMPT, 'manual_review'];
const STARTABLE = ['pending', 'in_progress', 'rejected', 'legacy'];
const ATTEMPT_SELECT = { providerId: true, status: true, reasonCode: true, expiresAt: true, lastSyncedAt: true } as const;

async function requireKycDoctor(req: KycRequest, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) { res.status(401).json({ code: 'AUTH_REQUIRED', error: 'Token obrigatório.' }); return; }
  let payload: any;
  try { payload = jwt.verify(header.slice(7), config.jwtSecret); } catch { res.status(401).json({ code: 'INVALID_TOKEN', error: 'Token médico inválido.' }); return; }
  if (payload?.type !== 'doctor' || !payload?.doctorId) { res.status(401).json({ code: 'INVALID_TOKEN', error: 'Token médico inválido.' }); return; }
  const doc = await prisma.doctor.findUnique({ where: { id: payload.doctorId }, select: DOCTOR_ACCESS_SELECT });
  if (!doc) { res.status(401).json({ code: 'DOCTOR_NOT_FOUND', error: 'Médico não encontrado.' }); return; }
  const denial = doctorAccessDenial(doc, { allowUnverified: true });
  if (denial) { res.status(denial.status).json(denial.body); return; }
  req.doctorId = doc.id;
  next();
}

router.post('/verification', requireKycDoctor, async (req: KycRequest, res, next) => {
  try {
    const now = new Date();
    const doc = await prisma.doctor.findUnique({
      where: { id: req.doctorId! },
      select: { id: true, name: true, crm: true, crmUf: true, cpfEncrypted: true, cpfIv: true, verificationStatus: true },
    });
    if (!doc) { res.status(401).json({ code: 'DOCTOR_NOT_FOUND', error: 'Médico não encontrado.' }); return; }
    if (doc.verificationStatus === 'approved') { res.status(409).json({ code: 'ALREADY_APPROVED', error: 'Sua identidade já foi verificada.' }); return; }
    if (!STARTABLE.includes(doc.verificationStatus)) { res.status(409).json({ code: 'IN_REVIEW', status: doc.verificationStatus, error: 'Sua verificação está em análise.' }); return; }
    const cpf = decryptPII(doc.cpfEncrypted, doc.cpfIv);
    if (!cpf) { res.status(400).json({ code: 'CPF_REQUIRED', error: 'Cadastre seu CPF no perfil antes de verificar a identidade.' }); return; }

    // Nome do CFM declarado ao UaiID (o crosscheck dele compara com o documento). Reusa o snapshot
    // da tentativa anterior p/ não gastar a cota do consultaCRM (100/mês).
    const last = await prisma.doctorVerification.findFirst({ where: { doctorId: doc.id }, orderBy: { createdAt: 'desc' }, select: { cfmName: true, cfmSituation: true } });
    const attempts = await prisma.doctorVerification.count({ where: { doctorId: doc.id } });
    let cfmName = last?.cfmName ?? null;
    let cfmSituation = last?.cfmSituation ?? null;
    // crmUf pode estar nulo em cadastro antigo/de teste ("12345-SP" sem UF separada) → UF do sufixo da chave.
    const uf = doc.crmUf ?? doc.crm.match(/-([A-Za-z]{2})$/)?.[1]?.toUpperCase() ?? null;
    if (!cfmName && uf) {
      const cfm = await lookupCfm(doc.crm, uf).catch(() => null);
      cfmName = cfm?.name ?? null;
      cfmSituation = cfm?.situation ?? null;
    }

    const created = await createUaiidVerification({
      cpf,
      fullName: cfmName ?? doc.name,
      externalReference: doc.id,
      returnUrl: RETURN_URL(),
      idempotencyKey: `drexame-${doc.id}-${attempts + 1}-${Math.floor(now.getTime() / 60_000)}`,
    });
    await prisma.doctorVerification.upsert({
      where: { providerId: created.verificationId },
      create: { doctorId: doc.id, crm: doc.crm, providerId: created.verificationId, status: 'created', cfmName, cfmSituation, expiresAt: created.expiresAt, lastSyncedAt: now, syncSource: 'on_demand' },
      update: { expiresAt: created.expiresAt },
    });
    if (doc.verificationStatus === 'pending' || doc.verificationStatus === 'rejected') {
      await prisma.doctor.update({ where: { id: doc.id }, data: { verificationStatus: 'in_progress' } });
    }
    void audit('DOCTOR_KYC_STARTED', req, { actorType: 'DOCTOR', actorId: doc.id, targetType: 'DOCTOR', targetId: doc.id, after: { providerId: created.verificationId, reused: created.reused } });
    res.status(201).json({ verifyUrl: created.verifyUrl, expiresAt: created.expiresAt, status: doc.verificationStatus === 'legacy' ? 'legacy' : 'in_progress' });
  } catch (e) {
    if (e instanceof UaiidError) {
      if (e.code === 'KYC_ATTEMPT_LIMIT') {
        res.status(429).json({ code: 'KYC_ATTEMPT_LIMIT', retryAfterHours: e.retryAfterHours ?? null, error: 'Limite de tentativas atingido. Tente mais tarde.' });
        return;
      }
      // só o status HTTP (sem CPF/segredo): chave errada em prod aparece como 401/403 aqui, não como "fora do ar" mudo
      log.warn('UaiID indisponível ao criar a sessão', { status: (e as any)?.status ?? null });
      res.status(503).json({ code: 'KYC_UNAVAILABLE', error: 'Verificação indisponível no momento. Tente em alguns minutos.' });
      return;
    }
    next(e);
  }
});

router.get('/verification', requireKycDoctor, async (req: KycRequest, res, next) => {
  try {
    const now = new Date();
    const latest = () => prisma.doctorVerification.findFirst({ where: { doctorId: req.doctorId! }, orderBy: { createdAt: 'desc' }, select: ATTEMPT_SELECT });
    let attempt = await latest();
    if (attempt && OPEN_STATUSES.includes(attempt.status) && (!attempt.lastSyncedAt || now.getTime() - attempt.lastSyncedAt.getTime() > 60_000)) {
      await syncVerification(attempt.providerId, 'on_demand', { now });
      attempt = await latest();
    }
    const doc = await prisma.doctor.findUnique({ where: { id: req.doctorId! }, select: { verificationStatus: true } });
    res.json({
      status: doc?.verificationStatus ?? 'pending',
      attempt: attempt
        ? { status: attempt.status, reasonCode: attempt.reasonCode, message: kycMessage(attempt.reasonCode), expiresAt: attempt.expiresAt }
        : null,
    });
  } catch (e) { next(e); }
});

export default router;
