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
import { encryptedCpfData, parseCpf } from '../utils/cpf';
import { lookupCfm } from '../utils/cfm';
import { DOCTOR_ACCESS_SELECT, doctorAccessDenial } from '../utils/doctorAccess';
import { createUaiidVerification, UaiidError } from '../utils/uaiid';
import { NON_FINAL_ATTEMPT } from '../kyc/decide';
import { syncVerification } from '../kyc/sync';
import { kycMessage, kycCaptureIssue } from '../kyc/messages';
import { notifyKycAdmin } from '../kyc/notify';
import { getDoctorKycConfig } from '../utils/settings';
import { createLogger } from '../utils/logger';

const router = Router();
const log = createLogger('kyc-verification');

interface KycRequest extends AuthedRequest { doctorId?: string }

const RETURN_URL = () => process.env.UAIID_RETURN_URL || 'https://drexame.janocaminho.com.br/#/doctor?kyc=1';
const OPEN_STATUSES = [...NON_FINAL_ATTEMPT, 'manual_review'];
const STARTABLE = ['pending', 'in_progress', 'rejected', 'legacy'];
/** Teto de sessões KYC abertas por médico em 24 h (revisão final I5): cada sessão criada é COBRADA pelo UaiID. */
const MAX_ATTEMPTS_PER_DAY = 5;
const ATTEMPT_WINDOW_MS = 24 * 3_600_000;

/**
 * Teto GLOBAL diário de sessões UaiID (2ª rodada da revisão final, Important #4) — a proteção de verdade do dinheiro: o teto
 * por médico e os limiters por IP não impedem N contas descartáveis (cada uma com CPF sintético válido) de abrirem N sessões
 * COBRADAS. Conta TODAS as tentativas criadas nas últimas 24 h; no teto, POST /verification responde 503 KYC_UNAVAILABLE
 * (o portal já trata como "indisponível") e o dono recebe 1 e-mail a cada 6 h. Env `KYC_DAILY_SESSION_CAP` (padrão 100),
 * lida a cada pedido (subir o teto não exige restart do código, só do env).
 */
const DAILY_SESSION_CAP_DEFAULT = 100;
const dailySessionCap = (): number => {
  const n = Math.floor(Number(process.env.KYC_DAILY_SESSION_CAP));
  return n > 0 ? n : DAILY_SESSION_CAP_DEFAULT;
};
const DAILY_CAP_ALERT_EVERY_MS = 6 * 60 * 60 * 1000;
let lastDailyCapAlertAt = 0;
export function resetKycDailyCapAlertForTests(): void { lastDailyCapAlertAt = 0; }
function alertDailyCapReached(cap: number, used: number): void {
  const nowMs = Date.now();
  if (nowMs - lastDailyCapAlertAt < DAILY_CAP_ALERT_EVERY_MS) return;
  lastDailyCapAlertAt = nowMs;
  void notifyKycAdmin('Dr. Exame — limite diário de verificações atingido', [
    `Nas últimas 24 h foram abertas ${used} sessões de verificação no UaiID (limite diário: ${cap}).`,
    'Novos pedidos de verificação respondem "indisponível" até o volume baixar da janela de 24 h, ou até você subir KYC_DAILY_SESSION_CAP no .env.prod.',
    'Se você não esperava esse volume, confira os cadastros recentes na fila: pode ser abuso (contas descartáveis abrindo sessões cobradas).',
  ]);
}
// `decision` só decide se a tentativa foi SEGURADA (final no UaiID, decisão ainda não gravada); nunca sai na resposta.
const ATTEMPT_SELECT = { providerId: true, status: true, reasonCode: true, expiresAt: true, lastSyncedAt: true, decision: true } as const;
/** Documentos já enviados ao UaiID (a captura acabou; falta o resultado/revisão): nova sessão aqui órfã o resultado. */
const IN_FLIGHT_ATTEMPT = ['processing', 'manual_review'];
/** O snapshot do nome/situação do CFM (declarado ao UaiID) só é reaproveitado até esta idade; depois refaz o lookup. */
const CFM_SNAPSHOT_MAX_AGE_MS = 30 * 86_400_000;
/** Reconciliação on-demand do GET: só se parada há mais que isto — e, se falhou, não repete antes disto (M3). */
const ON_DEMAND_RETRY_MS = 60_000;

/**
 * M3 (revisão final): com o UaiID fora do ar o `lastSyncedAt` nunca avança, e o portal consulta GET /verification a cada
 * ~5 s — cada consulta virava uma chamada BLOQUEANTE de até 8 s ao UaiID. providerId → quando o on-demand FALHOU; não se
 * repete o on-demand desse providerId por 60 s. Em memória do processo (perder no restart = 1 chamada a mais, sem dano).
 */
const onDemandFailedAt = new Map<string, number>();
export function resetKycOnDemandBackoffForTests(): void { onDemandFailedAt.clear(); }
function rememberOnDemandFailure(providerId: string, nowMs: number): void {
  onDemandFailedAt.set(providerId, nowMs);
  if (onDemandFailedAt.size > 500) { // poda: marcas vencidas já não seguram nada
    for (const [id, at] of onDemandFailedAt) if (nowMs - at >= ON_DEMAND_RETRY_MS) onDemandFailedAt.delete(id);
  }
}

/**
 * O UaiID recusar CRIAR sessão por motivo de CONTA (401 chave, 402 empresa suspensa / limite de gasto / trial
 * esgotado, 403) derruba o cadastro de TODO médico novo — e o médico só vê "indisponível", então ninguém fica
 * sabendo (a fumaça real já bateu num 402 tenant_suspended). Avisa o dono por e-mail, no máximo 1x a cada 6 h
 * por processo (o log já guarda o status). Nunca lança.
 */
const ALERT_EVERY_MS = 6 * 60 * 60 * 1000;
let lastUaiidAlertAt = 0;
export function resetUaiidAlertThrottleForTests(): void { lastUaiidAlertAt = 0; }
function alertUaiidRefusal(status: number | undefined): void {
  if (status !== 401 && status !== 402 && status !== 403) return;
  const now = Date.now();
  if (now - lastUaiidAlertAt < ALERT_EVERY_MS) return;
  lastUaiidAlertAt = now;
  void notifyKycAdmin('Dr. Exame — o UaiID recusou criar verificações', [
    `O UaiID respondeu HTTP ${status} ao criar a sessão de verificação de um médico.`,
    status === 402
      ? 'A empresa no UaiID está suspensa, sem saldo/limite de gasto ou com o trial esgotado.'
      : 'Confira a UAIID_API_KEY no .env.prod e o status da conta no painel do UaiID.',
    'Enquanto isso, médicos novos veem "verificação indisponível" e não conseguem se cadastrar.',
  ]);
}

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
      select: { id: true, name: true, crm: true, crmUf: true, cpfEncrypted: true, cpfIv: true, cpfHash: true, identityLockedAt: true, verificationStatus: true },
    });
    if (!doc) { res.status(401).json({ code: 'DOCTOR_NOT_FOUND', error: 'Médico não encontrado.' }); return; }
    if (doc.verificationStatus === 'approved') { res.status(409).json({ code: 'ALREADY_APPROVED', error: 'Sua identidade já foi verificada.' }); return; }
    if (!STARTABLE.includes(doc.verificationStatus)) { res.status(409).json({ code: 'IN_REVIEW', status: doc.verificationStatus, error: 'Sua verificação está em análise.' }); return; }
    // M7 + m4: a última tentativa já enviou os documentos (processing), está na revisão do UaiID (manual_review) ou está
    // SEGURADA (status final no UaiID — approved/rejected — mas ainda sem decisão gravada: identidade OK esperando o nome do
    // documento) -> 409 IN_REVIEW. Abrir outra sessão agora órfã o resultado em andamento (o webhook dele cairia em
    // "latest !== attempt") e queima o orçamento de tentativas (o UaiID não reaproveita uma sessão que já saiu da captura).
    const last = await prisma.doctorVerification.findFirst({
      where: { doctorId: doc.id }, orderBy: { createdAt: 'desc' },
      select: { status: true, decision: true, decidedBy: true, createdAt: true, cfmName: true, cfmSituation: true },
    });
    const held = !!last && last.decision === null && ['approved', 'rejected'].includes(last.status);
    // m3 (lado POST): `legacy` é STARTABLE, mas legado cuja última tentativa já espera o DONO (needs_admin/uaiid_review sem
    // decisão humana) não abre outra: poupa sessão cobrada e não deixa linhas antigas presas na fila.
    const awaitingOwner = doc.verificationStatus === 'legacy' && !!last && last.decidedBy == null && ['needs_admin', 'uaiid_review'].includes(last.decision ?? '');
    if (last && (IN_FLIGHT_ATTEMPT.includes(last.status) || held || awaitingOwner)) { res.status(409).json({ code: 'IN_REVIEW', status: doc.verificationStatus, error: 'Sua verificação está em análise.' }); return; }
    // Teto por médico (I5): ≥5 sessões nas últimas 24 h -> 429 no mesmo formato que o portal já trata. retryAfterHours =
    // quando a MAIS ANTIGA da janela sai (mínimo 1). Roda antes de qualquer I/O externo (CFM/UaiID) e da captura do CPF.
    const recent = await prisma.doctorVerification.findMany({
      where: { doctorId: doc.id, createdAt: { gte: new Date(now.getTime() - ATTEMPT_WINDOW_MS) } },
      orderBy: { createdAt: 'asc' }, take: MAX_ATTEMPTS_PER_DAY, select: { createdAt: true },
    });
    if (recent.length >= MAX_ATTEMPTS_PER_DAY) {
      const retryAfterHours = Math.max(1, Math.ceil((recent[0].createdAt.getTime() + ATTEMPT_WINDOW_MS - now.getTime()) / 3_600_000));
      res.status(429).json({ code: 'KYC_ATTEMPT_LIMIT', retryAfterHours, error: 'Limite de tentativas atingido. Tente mais tarde.' });
      return;
    }
    // Teto GLOBAL diário (todas as contas): ver dailySessionCap. Antes da captura do CPF e de qualquer I/O externo.
    const cap = dailySessionCap();
    const sessionsToday = await prisma.doctorVerification.count({ where: { createdAt: { gte: new Date(now.getTime() - ATTEMPT_WINDOW_MS) } } });
    if (sessionsToday >= cap) {
      log.warn('teto diário de sessões UaiID atingido', { used: sessionsToday, cap });
      alertDailyCapReached(cap, sessionsToday);
      res.status(503).json({ code: 'KYC_UNAVAILABLE', error: 'Verificação indisponível no momento. Tente novamente mais tarde.' });
      return;
    }
    let cpf = decryptPII(doc.cpfEncrypted, doc.cpfIv);
    // Conta do convite (/api/public/doctor-invite/:token/register) nasce SEM CPF e nenhuma outra rota o grava depois: o
    // médico informa aqui, uma vez (revisão final I6a). Quem já tem CPF (cadastro normal) ignora body.cpf — a identidade
    // não troca por esta rota. O CPF só viaja criptografado (nunca em log, resposta ou tabela de KYC).
    let cpfCaptured = false;
    if (!cpf && !doc.cpfHash && !doc.cpfEncrypted) {
      const sent = req.body?.cpf == null ? '' : String(req.body.cpf).trim();
      if (sent) {
        const cpfData = encryptedCpfData(sent);
        if (!cpfData) { res.status(400).json({ code: 'CPF_INVALID', error: 'CPF inválido.' }); return; }
        const inUse = { code: 'CPF_IN_USE', error: 'Este CPF já está cadastrado em outra conta. Fale com o suporte.' };
        if (await prisma.doctor.findFirst({ where: { cpfHash: cpfData.cpfHash, NOT: { id: doc.id } }, select: { id: true } })) { res.status(409).json(inUse); return; }
        let stored = false;
        try {
          // Identidade TRAVADA na captura, com o e-mail verificado ou não (B2-3): o CPF fica amarrado a uma sessão UaiID
          // COBRADA, e o médico do convite nunca verifica o e-mail — sem a trava ele aprovava o KYC e depois renomeava a
          // conta ("Dra. <colega conhecida>") ou trocava o e-mail via PUT /me. Travada, PUT /me não muda nome nem e-mail.
          // m1: só grava se o médico AINDA não tem CPF — duas requisições concorrentes com CPFs diferentes não se sobrescrevem.
          stored = (await prisma.doctor.updateMany({ where: { id: doc.id, cpfHash: null, cpfEncrypted: null }, data: { ...cpfData, identityLockedAt: doc.identityLockedAt ?? now } })).count > 0;
        } catch (e) {
          if ((e as { code?: string })?.code === 'P2002') { res.status(409).json(inUse); return; } // corrida: outro médico gravou o mesmo CPF
          throw e;
        }
        if (stored) {
          cpf = parseCpf(sent);
          cpfCaptured = true;
        } else {
          // Outra requisição gravou primeiro: NÃO sobrescreve — segue com o CPF que ficou (a identidade não troca por aqui).
          const fresh = await prisma.doctor.findUnique({ where: { id: doc.id }, select: { cpfEncrypted: true, cpfIv: true } });
          cpf = decryptPII(fresh?.cpfEncrypted ?? null, fresh?.cpfIv ?? null);
        }
      }
    }
    if (!cpf) { res.status(400).json({ code: 'CPF_REQUIRED', error: 'Cadastre seu CPF no perfil antes de verificar a identidade.' }); return; }

    // Nome do CFM declarado ao UaiID (o crosscheck dele compara com o documento). Reusa o snapshot
    // da tentativa anterior p/ não gastar a cota do consultaCRM (100/mês) — M8: só se for recente (≤30 dias); um retry
    // meses depois herdaria o "Ativo"/nome antigo (CRM cassado, nome retificado) em vez do CFM de hoje.
    const attempts = await prisma.doctorVerification.count({ where: { doctorId: doc.id } });
    const snapshotFresh = !!last?.cfmName && now.getTime() - last.createdAt.getTime() <= CFM_SNAPSHOT_MAX_AGE_MS;
    let cfmName = snapshotFresh ? last!.cfmName : null;
    let cfmSituation = snapshotFresh ? last!.cfmSituation : null;
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
    void audit('DOCTOR_KYC_STARTED', req, { actorType: 'DOCTOR', actorId: doc.id, targetType: 'DOCTOR', targetId: doc.id, after: { providerId: created.verificationId, reused: created.reused, cpfCaptured } });
    res.status(201).json({ verifyUrl: created.verifyUrl, expiresAt: created.expiresAt, status: doc.verificationStatus === 'legacy' ? 'legacy' : 'in_progress' });
  } catch (e) {
    if (e instanceof UaiidError) {
      if (e.code === 'KYC_ATTEMPT_LIMIT') {
        res.status(429).json({ code: 'KYC_ATTEMPT_LIMIT', retryAfterHours: e.retryAfterHours ?? null, error: 'Limite de tentativas atingido. Tente mais tarde.' });
        return;
      }
      // só o status HTTP (sem CPF/segredo): chave errada em prod aparece como 401/403 aqui, não como "fora do ar" mudo
      log.warn('UaiID indisponível ao criar a sessão', { status: (e as any)?.status ?? null });
      alertUaiidRefusal(e.status);
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
    // Reconcilia na hora: tentativa ABERTA no UaiID, ou SEGURADA (final no UaiID — approved/rejected — mas sem decisão
    // gravada: identidade OK esperando o nome do documento; sem isto ela só sairia pelo job de 10 min). Sempre sujeita
    // à regra de "parada há >60 s" e, se o UaiID estiver fora, ao backoff de 60 s por providerId (M3).
    const needsSync = (a: NonNullable<typeof attempt>) =>
      OPEN_STATUSES.includes(a.status) || (a.decision === null && ['approved', 'rejected'].includes(a.status));
    if (attempt && needsSync(attempt) && (!attempt.lastSyncedAt || now.getTime() - attempt.lastSyncedAt.getTime() > ON_DEMAND_RETRY_MS)) {
      const failedAt = onDemandFailedAt.get(attempt.providerId);
      if (failedAt === undefined || now.getTime() - failedAt >= ON_DEMAND_RETRY_MS) {
        const synced = await syncVerification(attempt.providerId, 'on_demand', { now });
        if (synced.ok) onDemandFailedAt.delete(attempt.providerId);
        else rememberOnDemandFailure(attempt.providerId, now.getTime()); // UaiID fora: não repete o on-demand por 60 s
        attempt = await latest();
      }
    }
    const doc = await prisma.doctor.findUnique({ where: { id: req.doctorId! }, select: { verificationStatus: true } });
    const status = doc?.verificationStatus ?? 'pending';
    const graceMs = getDoctorKycConfig().legacyGraceUntilMs;
    res.json({
      status,
      // prazo dos médicos antigos (só quem ainda é legado precisa ver; 0 = sem prazo)
      legacyGraceUntilMs: status === 'legacy' && graceMs > 0 ? graceMs : null,
      attempt: attempt
        ? {
            status: attempt.status,
            reasonCode: attempt.reasonCode,
            message: kycMessage(attempt.reasonCode),
            // a tela só mostra as dicas de foto/selfie quando o motivo é de captura (mesma regra do e-mail)
            captureIssue: kycCaptureIssue(attempt.reasonCode),
            expiresAt: attempt.expiresAt,
          }
        : null,
    });
  } catch (e) { next(e); }
});

export default router;
