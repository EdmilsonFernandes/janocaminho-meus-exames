// TELECONSULTA IN-APP (F2 LiveKit, 19/10/26) — endpoint de JOIN: valida quem entra
// (paciente owner OU médico com share ativo), exige consent Art.15 do PACIENTE e devolve
// access token LiveKit de curta duração (2h). Token NUNCA é persistido: cliente chama
// join a cada (re)entrada → token expirado se resolve sozinho com um novo join.
//
// Auth DUAL local (`requireJoinIdentity`): o middleware/auth.ts original REJEITA token
// de médico (isolamento de área), e doctor.routes.ts é de outro dono — então espelhamos
// aqui, sem tocar em middleware/auth.ts (contrato fase2-arquitetura §1a):
//   - JWT type:'doctor' → valida doctor no DB → req.doctorId (role 'doctor')
//   - senão → espelha requireAuth (bloqueado/tokenVersion) → req.userId (role 'patient')
import { Router, type Response, type NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { prisma } from '../prisma';
import { userPatientIds, type AuthedRequest } from '../middleware/auth';
import { audit } from '../utils/audit';
import { getTeleconsultaConfig } from '../utils/settings';
import { computeJointMs, loadPresenceEvents, resolveAutoOutcome, type PresenceEvent } from '../utils/teleconsultaLifecycle';
import { hasLiveKitConfig, buildJoinToken, createLiveKitRoom } from '../utils/livekit';
import { sendPushToUser } from '../utils/push';
// F3 (20/10/26): gravação/transcrição premium + pós-chamada (contrato f3-arquitetura §3a-3d).
import { decryptPII } from '../utils/crypto';
import { hasStt, SttError } from '../utils/stt';
import { acceptAudioFile } from '../middleware/uploadAudio';
import { audioPathFor, finalizeTranscription, abortTranscription } from '../jobs/transcriptionQueue';

const router = Router();

/** Request do join: paciente (userId) OU médico (doctorId), + papel + display name. */
interface JoinRequest extends AuthedRequest {
  doctorId?: string;
  joinRole?: 'patient' | 'doctor';
  joinName?: string;
}

/** TTL do access token: 2h cobre atraso de médico + consulta longa, e fica MUITO abaixo
 *  do intervalo mínimo de recorrência (diário=24h) → token da ocorrência N nunca alcança N+1. */
const JOIN_TOKEN_TTL_SEC = 7200;

/** Auth dupla do join (ver comentário do módulo). Erros 401 espelham os do requireAuth. */
async function requireJoinIdentity(req: JoinRequest, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) { res.status(401).json({ error: 'Não autenticado' }); return; }
  const token = header.slice(7);
  let payload: any;
  try { payload = jwt.verify(token, config.jwtSecret); } catch { res.status(401).json({ error: 'Token inválido ou expirado' }); return; }

  if (payload?.type === 'doctor') {
    // Médico: valida existência (token de doctor deletado não entra).
    const doc = await prisma.doctor.findUnique({
      where: { id: payload.doctorId },
      select: { id: true, name: true, crm: true, crmUf: true },
    });
    if (!doc) { res.status(401).json({ error: 'Token médico inválido.' }); return; }
    req.doctorId = doc.id;
    req.joinRole = 'doctor';
    req.joinName = `Dr. ${doc.name}${doc.crm ? ` (${doc.crm}${doc.crmUf ? `/${doc.crmUf}` : ''})` : ''}`;
    next();
    return;
  }

  // Paciente: mesmo espelho do requireAuth (user existe · não bloqueado · tokenVersion).
  const user = await prisma.user.findUnique({
    where: { id: payload?.userId },
    select: { id: true, name: true, blocked: true, tokenVersion: true },
  });
  if (!user) { res.status(401).json({ error: 'Usuário inválido' }); return; }
  if (user.blocked) { res.status(401).json({ error: 'Sua sessão expirou. Faça login novamente.' }); return; }
  if (payload.ver != null && user.tokenVersion !== payload.ver) {
    res.status(401).json({ error: 'Sua sessão expirou. Faça login novamente.' }); return;
  }
  req.userId = user.id;
  req.joinRole = 'patient';
  req.joinName = user.name;
  next();
}

/** JOIN — GET /api/teleconsulta/:id/join
 *  200 {serverUrl, token, room} · 401 auth · 404 reminder · 403 share/owner/consent ·
 *  501 sem LiveKit (client cai no linkUrl externo = Meet/manual). */
router.get('/:id/join', requireJoinIdentity, async (req: JoinRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const role = req.joinRole!;
    // Select EXPLÍCITO + fallback drift-safe (P2-reviewer): provider/roomName são colunas
    // novas — se o banco legado ainda não as tem (migration não aplicada), caímos no select
    // sem elas e seguimos pro 501 graceful em vez de 500 (padrão subscriptions, TASK_RULES).
    // Lifecycle (24/10): consultPriceCents/paidAt/teleStatus — mesmo padrão; ausentes no
    // legado = sem preço (gate de pagamento degrada) e teleStatus null.
    const baseSelect = { id: true, type: true, patientId: true, createdByDoctorId: true, consentAt: true, linkUrl: true, title: true, dueDate: true };
    const reminder: any = await prisma.reminder.findUnique({ where: { id }, select: { ...baseSelect, provider: true, roomName: true, endedAt: true, consultPriceCents: true, paidAt: true, teleStatus: true } })
      .catch((e: any) => /column .* does not exist/i.test(String(e?.message))
        ? prisma.reminder.findUnique({ where: { id }, select: baseSelect })
        : Promise.reject(e));
    if (!reminder || reminder.type !== 'teleconsulta') {
      res.status(404).json({ error: 'Teleconsulta não encontrada' });
      return;
    }

    // Ownership — médico: share ATIVO com o paciente (cópia local de 3 linhas do
    // requireShare de doctor.routes.ts, que é de outro dono).
    if (role === 'doctor') {
      const share = await prisma.doctorShare.findFirst({
        where: { doctorId: req.doctorId!, patientId: reminder.patientId, active: true },
        select: { id: true },
      });
      if (!share) { res.status(403).json({ error: 'Sem permissão.' }); return; }
    } else {
      const ids = await userPatientIds(req.userId!);
      if (!ids.includes(reminder.patientId)) { res.status(403).json({ error: 'Sem permissão.' }); return; }
    }

    // Drift-safe: colunas provider/roomName são novas (migration aditiva do backend1) —
    // leitura tolerante enquanto o banco legado não as tem (legado = null = 501 + linkUrl).
    const provider = (reminder as { provider?: string | null }).provider ?? null;
    const roomName = (reminder as { roomName?: string | null }).roomName ?? null;
    const endedAt = (reminder as { endedAt?: Date | null }).endedAt ?? null;

    // ENCERRADA (22/10/26): consulta com endedAt≠null é HISTÓRICO — join bloqueado p/
    // sempre (fim da re-entrada infinita: "entrou 15x e ela nunca encerrava").
    if (endedAt) {
      res.status(403).json({
        code: 'TELECONSULTA_ENDED',
        error: 'Esta consulta já foi encerrada.',
        endedAt: new Date(endedAt).toISOString(),
      });
      return;
    }

    // ── GATES DO JOIN (24/10/26, spec gaps §1-§2). valem p/ OS DOIS papéis e p/ qualquer
    //    provedor (link Meet também é o produto — não se entrega sala/link de graça).
    // (a) JANELA DE ENTRADA: liberado só a partir de dueDate − entryWindowMin (relógio
    //     do SERVER — client nunca decide). Antes → 403 TOO_EARLY com opensAt p/ o
    //     countdown. Sem dueDate futura não há espera: vencida = aberta.
    const { entryWindowMin } = getTeleconsultaConfig();
    const dueMs = new Date(reminder.dueDate).getTime();
    const opensAtMs = dueMs - entryWindowMin * 60_000;
    if (Date.now() < opensAtMs) {
      res.status(403).json({
        code: 'TOO_EARLY',
        error: `A sala abre ${entryWindowMin} minutos antes do horário da consulta.`,
        opensAt: new Date(opensAtMs).toISOString(),
        dueDate: new Date(dueMs).toISOString(),
      });
      return;
    }
    // (b) PAGAMENTO (spec §2): consultPriceCents>0 sem paidAt (webhook do PIX ainda não
    //     confirmou) → 402 p/ OS DOIS papéis: a consulta particular é o produto CONJUNTO,
    //     sem pagamento ninguém recebe sala/token (o médico vê o estado no portal).
    //     Drift-safe: legado sem as colunas = priceCents undefined → sem gate.
    const priceCents = (reminder as { consultPriceCents?: number | null }).consultPriceCents ?? 0;
    const paidAt = (reminder as { paidAt?: Date | null }).paidAt ?? null;
    if (priceCents > 0 && !paidAt) {
      res.status(402).json({
        code: 'PAYMENT_REQUIRED',
        error: 'Pagamento da consulta pendente — conclua o PIX antes de entrar.',
        priceCents,
        reminderId: reminder.id,
      });
      return;
    }

    // Sem LiveKit (env ausente OU reminder meet/manual) → 501: o client abre o linkUrl.
    const configured = hasLiveKitConfig();
    if (provider !== 'livekit' || !configured) {
      res.status(501).json({
        error: 'Teleconsulta por vídeo no app indisponível para esta consulta. Use o link externo.',
        code: 'LIVEKIT_UNAVAILABLE',
        configured,
        linkUrl: reminder.linkUrl,
      });
      return;
    }

    // Consent Art.15/CFM 2.314/22 — ônus do PACIENTE (titular dos dados sensíveis, LGPD
    // art. 11); o médico é profissional do ato, não fonte de consentimento (não exige).
    if (role === 'patient' && !reminder.consentAt) {
      res.status(403).json({ error: 'Autorize a telemedicina (Art. 15, Res. CFM 2.314/2022) antes de entrar.', code: 'CONSENT_REQUIRED' });
      return;
    }

    const room = roomName ?? `teleconsulta-${reminder.id}`;
    // P1-reviewer — sala renascida COM limites: após emptyTimeout a sala é destruída e a
    // re-entrada auto-criaria com defaults do projeto (maxParticipants ilimitado). Recriar
    // no join devolve maxParticipants:2/emptyTimeout a cada ocorrência (createRoom idempotente).
    // Sala renascida COM limites (P1-reviewer) — mas FORA do caminho crítico:
    // await = +500ms de latência Brasil→LiveKit Cloud. O client conecta via
    // WebSocket que recria a sala se preciso; o maxParticipants ébeltiche.
    void createLiveKitRoom(room).catch(() => { /* LiveKit auto-cria no connect */ });
    const token = await buildJoinToken({
      identity: role === 'doctor' ? `doctor:${req.doctorId}` : `patient:${req.userId}`,
      name: req.joinName ?? 'Participante',
      room,
      ttlSec: JOIN_TOKEN_TTL_SEC,
      metadata: { reminderId: reminder.id, role },
    });
    // AWAIT deliberado: a família "void audit" foi extinta em 19/10 por flakes de CI
    // (void não espera o handler → DB fecha antes do insert). Nenhum audit de rota void.
    await audit('TELECONSULTA_JOIN', req, {
      actorType: role === 'doctor' ? 'DOCTOR' : 'USER',
      actorId: role === 'doctor' ? req.doctorId : req.userId,
      targetType: 'REMINDER',
      targetId: reminder.id,
      after: { role, reminderId: reminder.id, room },
    });
    // ── TRANSIÇÃO DE ESTADO (spec §1, 24/10): um participante sozinho NÃO inicia o
    // atendimento. 1º join do PACIENTE carimba patientJoinedAt (materializado — o join
    // do médico fica no auditLog); quando AMBOS os papéis têm JOIN registrado →
    // teleStatus='in_progress' (auditado 1x como TELECONSULTA_START). updateMany
    // CONDICIONAL = race-safe: 2 joins simultâneos disputam, exatamente 1 vence
    // (o perdedor atualiza 0 rows). Banco legado sem as colunas → no-op (presença
    // continua existindo no auditLog; /end degrada pro outcome por presença).
    let teleStatus = (reminder as { teleStatus?: string | null }).teleStatus ?? null;
    try {
      if (role === 'patient') {
        await prisma.reminder.updateMany({ where: { id: reminder.id, patientJoinedAt: null }, data: { patientJoinedAt: new Date() } });
      }
      const joinLogs = await prisma.auditLog.findMany({
        where: { action: 'TELECONSULTA_JOIN', targetId: reminder.id },
        select: { after: true },
      });
      const roles = new Set(joinLogs.map((l: any) => l.after?.role).filter(Boolean));
      if (roles.has('patient') && roles.has('doctor')) {
        const upd = await prisma.reminder.updateMany({
          where: { id: reminder.id, endedAt: null, OR: [{ teleStatus: null }, { teleStatus: 'scheduled' }] },
          data: { teleStatus: 'in_progress' },
        });
        if (upd.count === 1) {
          teleStatus = 'in_progress';
          await audit('TELECONSULTA_START', req, {
            actorType: role === 'doctor' ? 'DOCTOR' : 'USER',
            actorId: role === 'doctor' ? req.doctorId : req.userId,
            targetType: 'REMINDER',
            targetId: reminder.id,
            after: { reminderId: reminder.id, teleStatus: 'in_progress', byRole: role },
          });
        } else {
          teleStatus = 'in_progress'; // race perdida: a transição já aconteceu
        }
      }
    } catch { /* drift: colunas do lifecycle ausentes → transição degrada p/ audit-only */ }
    // stt: capability p/ o client esconder o checkbox de gravação quando o server
    // não transcreve (reviewer-L — ausência é a mensagem, sem promessa falsa).
    // WhatsApp-style: médico entrou → push pro paciente "está te chamando"
    if (role === 'doctor') {
      const docName = req.joinName?.replace(/^Dr\.\s*/, '') || 'seu médico';
      void sendPushToUser(reminder.ownerId, `📞 ${docName} está te chamando`, 'Toque para atender a teleconsulta agora.', { type: 'teleconsulta', reminderId: reminder.id }).catch(() => {});
    }
    res.json({ serverUrl: process.env.LIVEKIT_URL, token, room, stt: hasStt(), endedAt: null, teleStatus });
  } catch (e) {
    next(e);
  }
});

/** FEEDBACK pós-chamada — POST /api/teleconsulta/:id/feedback {rating 1-5, note?}.
 *  1-toque "como foi a chamada" (dono 19/10). Ambos os papéis; sem consent (pós-ato).
 *  Persistência = audit (sem schema novo; F3 pode promover a coluna/relatório). */
router.post('/:id/feedback', requireJoinIdentity, async (req: JoinRequest, res, next) => {
  try {
    const rating = Number(req.body?.rating);
    const note = String(req.body?.note ?? '').slice(0, 300) || null;
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      res.status(400).json({ error: 'Avaliação inválida (1 a 5).' });
      return;
    }
    const r = await loadAccessibleTeleconsulta(req, res); if (!r) return;
    // Dono 21/10: feedback = a consulta ACONTECEU → marca done (o card para de
    // mostrar "Entrar na consulta" e vira "Ver consulta realizada").
    // Dono 22/10: feedback também ENCERRA (endedAt) — avaliar é o fim do ato; sem
    // isto a consulta continuava re-entrável p/ sempre.
    // Lifecycle (24/10): encerra com OUTCOME RESOLVIDO (1-toque não pode falhar por
    // regra): critério de completed atendido → 'completed'; senão honesto pela
    // presença (no_show/technical). Nunca 400 no feedback.
    const events = await loadPresenceEvents(r.id);
    const jointMs = computeJointMs(events, Date.now());
    const patientJoined = patientEverJoined(r, events);
    const minJointMs = getTeleconsultaConfig().minJointSeconds * 1000;
    const outcome = patientJoined && jointMs >= minJointMs ? 'completed' : resolveAutoOutcome(patientJoined);
    await endTeleconsulta(r, { outcome, jointMs }).catch(() => { /* feedback não falha por lifecycle */ });
    await audit('TELECONSULTA_FEEDBACK', req, {
      actorType: req.joinRole === 'doctor' ? 'DOCTOR' : 'USER',
      actorId: req.joinRole === 'doctor' ? req.doctorId : req.userId,
      targetType: 'REMINDER',
      targetId: r.id,
      after: { rating, note, role: req.joinRole },
    });
    res.status(201).json({ ok: true });
  } catch (e) {
    next(e);
  }
});

/** END — POST /api/teleconsulta/:id/end {outcome?: 'completed'|'no_show'|'technical'}
 *  (22/10/26 + lifecycle 24/10). ENCERRA a consulta: qualquer das partes (paciente
 *  owner OU médico com share); a partir daqui o /join responde 403 TELECONSULTA_ENDED
 *  p/ sempre e o card vira histórico (summary/transcript seguem acessíveis).
 *  OUTCOME HONESTO (spec §1-§2): 'completed' exige paciente presente E tempo conjunto
 *  (jointMs dos eventos auditados) ≥ minJointSeconds — sem isso → 400 pedindo outcome
 *  explícito (suggestion: no_show se o paciente nunca entrou; technical caso contrário).
 *  Sem outcome + critério atendido → 'completed' automático.
 *  Idempotente: re-end devolve o MESMO estado (endedAt + teleStatus + jointMs). */
router.post('/:id/end', requireJoinIdentity, async (req: JoinRequest, res, next) => {
  try {
    const r = await loadAccessibleTeleconsulta(req, res); if (!r) return;
    const alreadyEnded = !!r.endedAt;

    // Presença conjunta até AGORA (spec §2): eventos auditados JOIN/LEAVE; o intervalo
    // ainda aberto fecha no endedAt gravado a seguir (diferença de ms é irrelevante).
    const events = await loadPresenceEvents(r.id);
    const jointMs = computeJointMs(events, Date.now());
    const { minJointSeconds } = getTeleconsultaConfig();
    const minJointMs = minJointSeconds * 1000;
    const patientJoined = patientEverJoined(r, events);
    const criteriaMet = patientJoined && jointMs >= minJointMs;
    const suggestion: 'no_show' | 'technical' = patientJoined ? 'technical' : 'no_show';
    const reason = patientJoined ? 'min_time_not_met' : 'patient_not_joined';

    // Idempotência vem ANTES da validação: encerrada é encerrada (re-end não reabre
    // a discussão de outcome — o do 1º vencedor é o que fica, auditado abaixo).
    let outcome: 'completed' | 'no_show' | 'technical' = 'no_show';
    if (!alreadyEnded) {
      const rawOutcome = req.body?.outcome;
      if (rawOutcome !== undefined && !['completed', 'no_show', 'technical'].includes(rawOutcome)) {
        res.status(400).json({ error: "Outcome inválido — use 'completed', 'no_show' ou 'technical'." });
        return;
      }
      if (rawOutcome === 'completed' && !criteriaMet) {
        res.status(400).json({
          code: 'OUTCOME_INVALID',
          error: patientJoined
            ? `Tempo conjunto insuficiente (${Math.floor(jointMs / 1000)}s < ${minJointSeconds}s). Encerre como 'technical' ou aguarde o atendimento.`
            : "O paciente não entrou nesta consulta — encerre como 'no_show'.",
          suggestion,
          reason,
          jointMsSec: Math.floor(jointMs / 1000),
        });
        return;
      }
      if (rawOutcome == null && !criteriaMet) {
        res.status(400).json({
          code: 'OUTCOME_REQUIRED',
          error: patientJoined
            ? `Tempo conjunto abaixo do mínimo (${Math.floor(jointMs / 1000)}s < ${minJointSeconds}s). Informe o outcome: 'technical'.`
            : "O paciente não entrou nesta consulta. Informe o outcome: 'no_show'.",
          suggestion,
          reason,
          jointMsSec: Math.floor(jointMs / 1000),
        });
        return;
      }
      outcome = (rawOutcome as any) ?? 'completed';
    }

    const { endedAt, persisted, teleStatus, jointMs: storedJointMs } = await endTeleconsulta(r, { outcome, jointMs });
    await audit('TELECONSULTA_END', req, {
      actorType: req.joinRole === 'doctor' ? 'DOCTOR' : 'USER',
      actorId: req.joinRole === 'doctor' ? req.doctorId : req.userId,
      targetType: 'REMINDER',
      targetId: r.id,
      after: {
        endedAt: endedAt?.toISOString() ?? null,
        role: req.joinRole,
        alreadyEnded,
        outcome: teleStatus,
        jointMsSec: Math.floor(storedJointMs / 1000),
      },
    });
    // WhatsApp-style: médico encerrou → paciente sabe na hora (não fica "chamando" no
    // vazio). Paciente encerrou → médico vê no portal (sem infra de push p/ doctor).
    if (persisted && req.joinRole === 'doctor') {
      void sendPushToUser(r.ownerId, 'Consulta encerrada', 'O médico encerrou a teleconsulta. Toque para ver o resumo.', { type: 'teleconsulta', reminderId: r.id }).catch(() => {});
    }
    res.json({
      ok: true,
      endedAt: endedAt ? endedAt.toISOString() : null,
      alreadyEnded: alreadyEnded || !persisted,
      teleStatus,
      jointMs: storedJointMs,
    });
  } catch (e) {
    next(e);
  }
});

/** LEAVE — POST /api/teleconsulta/:id/leave (24/10/26). Client reporta a desconexão
 *  (fecha o intervalo de presença daquele papel). Evento é AUDIT-ONLY: o jointMs é
 *  calculado no /end a partir dos eventos; sem este report (client antigo, kill do
 *  app, queda de rede sem callback) o join aberto conta até o encerramento — TETO,
 *  não prova (degradação v1 sem webhook LiveKit; ver utils/teleconsultaLifecycle).
 *  Best-effort: não muda estado da consulta (sair ≠ concluir — spec §1). */
router.post('/:id/leave', requireJoinIdentity, async (req: JoinRequest, res, next) => {
  try {
    const r = await loadAccessibleTeleconsulta(req, res); if (!r) return;
    await audit('TELECONSULTA_LEAVE', req, {
      actorType: req.joinRole === 'doctor' ? 'DOCTOR' : 'USER',
      actorId: req.joinRole === 'doctor' ? req.doctorId : req.userId,
      targetType: 'REMINDER',
      targetId: r.id,
      after: { role: req.joinRole, reminderId: r.id },
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

/** NUDGE — POST /api/teleconsulta/:id/nudge (22/10/26). No-show do paciente: médico
 *  sozinho na sala há 5 min → reenvia o push "está esperando você" pro owner.
 *  Só médico (é ele quem espera); consulta encerrada → 403 TELECONSULTA_ENDED
 *  (nada de push zombie). Throttle 60s pelo auditLog protege a cota de push. */
router.post('/:id/nudge', requireJoinIdentity, async (req: JoinRequest, res, next) => {
  try {
    if (req.joinRole !== 'doctor') { res.status(403).json({ error: 'Apenas o médico pode reenviar o convite.' }); return; }
    const r = await loadAccessibleTeleconsulta(req, res); if (!r) return;
    if (r.endedAt) { res.status(403).json({ code: 'TELECONSULTA_ENDED', error: 'Esta consulta já foi encerrada.' }); return; }
    const last = await prisma.auditLog.findFirst({
      where: { action: 'TELECONSULTA_NUDGE', targetId: r.id },
      orderBy: { createdAt: 'desc' },
    });
    if (last && Date.now() - new Date(last.createdAt).getTime() < 60_000) {
      res.status(429).json({ error: 'Convite reenviado há menos de 1 minuto. Aguarde.' });
      return;
    }
    const doc = await prisma.doctor.findUnique({ where: { id: req.doctorId! }, select: { name: true } });
    const docName = doc?.name || 'seu médico';
    let delivered = true;
    try {
      await sendPushToUser(r.ownerId, `📞 ${docName} está esperando você`, 'Sua teleconsulta já começou — toque para entrar agora.', { type: 'teleconsulta', reminderId: r.id });
    } catch { delivered = false; }
    await audit('TELECONSULTA_NUDGE', req, {
      actorType: 'DOCTOR',
      actorId: req.doctorId,
      targetType: 'REMINDER',
      targetId: r.id,
      after: { reminderId: r.id, delivered },
    });
    res.json({ ok: true, delivered });
  } catch (e) {
    next(e);
  }
});

// ════════════════════════════════════════════════════════════════════════════════
// F3 TELECONSULTA PREMIUM (20/10/26) — gravação, transcrição cifrada e pós-chamada.
// Contrato: docs/research/2026-10-20-f3-arquitetura.md §3a-3d. LGPD: áudio efêmero em
// disco até o STT; o permanente é o transcript CIFRADO (encryptPII, igual CPF — D1).
// ════════════════════════════════════════════════════════════════════════════════

interface TeleconsultaRef {
  id: string;
  patientId: string;
  ownerId: string;
  recordConsentAt: Date | null;
  endedAt: Date | null;
  /** true = coluna endedAt ainda não existe no banco (legado pré-migration). */
  endedAtColMissing: boolean;
  /** Estado do lifecycle (24/10): null = legado/scheduled. */
  teleStatus: string | null;
  patientJoinedAt: Date | null;
  jointMs: number;
  /** true = colunas teleStatus/patientJoinedAt/jointMs ausentes no banco (legado). */
  lifecycleColMissing: boolean;
}

/** Carrega a teleconsulta + checa acesso DUAL (paciente owner OU médico com share ativo —
 *  cópia do join). Responde (404/403) e devolve undefined quando NÃO deve seguir.
 *  Leitura drift-safe igual join: colunas novas (F3 + endedAt) + fallback "column does not exist". */
async function loadAccessibleTeleconsulta(req: JoinRequest, res: Response): Promise<TeleconsultaRef | undefined> {
  const id = String(req.params.id);
  const baseSelect = { id: true, type: true, patientId: true, ownerId: true };
  const row: any = await prisma.reminder.findUnique({ where: { id }, select: { ...baseSelect, recordConsentAt: true, endedAt: true, teleStatus: true, patientJoinedAt: true, jointMs: true } })
    .catch((e: any) => /column .* does not exist/i.test(String(e?.message))
      ? prisma.reminder.findUnique({ where: { id }, select: baseSelect })
      : Promise.reject(e));
  if (!row || row.type !== 'teleconsulta') { res.status(404).json({ error: 'Teleconsulta não encontrada' }); return; }

  if (req.joinRole === 'doctor') {
    const share = await prisma.doctorShare.findFirst({
      where: { doctorId: req.doctorId!, patientId: row.patientId, active: true },
      select: { id: true },
    });
    if (!share) { res.status(403).json({ error: 'Sem permissão.' }); return; }
  } else {
    const ids = await userPatientIds(req.userId!);
    if (!ids.includes(row.patientId)) { res.status(403).json({ error: 'Sem permissão.' }); return; }
  }
  return {
    id: row.id,
    patientId: row.patientId,
    ownerId: row.ownerId,
    recordConsentAt: row.recordConsentAt ?? null,
    endedAt: row.endedAt ?? null,
    endedAtColMissing: !('endedAt' in row),
    teleStatus: row.teleStatus ?? null,
    patientJoinedAt: row.patientJoinedAt ?? null,
    jointMs: row.jointMs ?? 0,
    lifecycleColMissing: !('teleStatus' in row),
  };
}

/** Encerra a teleconsulta (stamp endedAt + done + teleStatus + jointMs) de forma
 *  IDEMPOTENTE e race-safe: updateMany condicional (`endedAt: null`) nunca sobrescreve
 *  um encerramento anterior — o 2º end devolve o estado JÁ existente (inclusive o
 *  OUTCOME do vencedor). Drift: sem endedAt → só done; sem as colunas do lifecycle →
 *  grava endedAt/done e deixa teleStatus/jointMs de fora (outcome segue no audit). */
async function endTeleconsulta(r: TeleconsultaRef, opts: { outcome: 'completed' | 'no_show' | 'technical'; jointMs: number }): Promise<{ endedAt: Date | null; persisted: boolean; teleStatus: string | null; jointMs: number }> {
  if (r.endedAtColMissing) {
    await prisma.reminder.update({ where: { id: r.id }, data: { done: true } });
    return { endedAt: r.endedAt, persisted: false, teleStatus: r.teleStatus, jointMs: r.jointMs };
  }
  if (r.endedAt) return { endedAt: new Date(r.endedAt), persisted: false, teleStatus: r.teleStatus, jointMs: r.jointMs }; // idempotente
  const now = new Date();
  const data: any = { endedAt: now, done: true };
  if (!r.lifecycleColMissing) { data.teleStatus = opts.outcome; data.jointMs = opts.jointMs; }
  const updated = await prisma.reminder.updateMany({
    where: { id: r.id, endedAt: null },
    data,
  });
  if (updated.count === 0) {
    // Race: outro request encerrou entre o load e o update — devolve o estado vencedor.
    const winner: any = await prisma.reminder.findUnique({ where: { id: r.id }, select: { endedAt: true, teleStatus: true, jointMs: true } })
      .catch(() => null);
    return {
      endedAt: winner?.endedAt ? new Date(winner.endedAt) : now,
      persisted: false,
      teleStatus: winner?.teleStatus ?? r.teleStatus,
      jointMs: winner?.jointMs ?? r.jointMs,
    };
  }
  return { endedAt: now, persisted: true, teleStatus: opts.outcome, jointMs: opts.jointMs };
}

/** Critério de 'completed' (spec §2): AMBOS presentes + tempo conjunto ≥ mínimo.
 *  Presença do paciente: patientJoinedAt materializado, com fallback pro auditLog
 *  (consulta entrada antes do deploy do lifecycle não tem o carimbo — o evento auditado
 *  é a fonte original da presença). */
function patientEverJoined(r: TeleconsultaRef, events: PresenceEvent[]): boolean {
  if (r.patientJoinedAt) return true;
  return events.some((e) => e.action === 'TELECONSULTA_JOIN' && e.role === 'patient');
}

/** 3a — PUT/PATCH /api/teleconsulta/:id/record-consent (os dois verbos: cliente pode
 *  chamar qualquer um). Consentimento mútuo de gravação+transcrição por IA.
 *  Idempotente: mantém o 1º timestamp (re-envio não renova). */
async function setRecordConsent(req: JoinRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const r = await loadAccessibleTeleconsulta(req, res); if (!r) return;
    if (!r.recordConsentAt) {
      const now = new Date();
      await prisma.reminder.update({ where: { id: r.id }, data: { recordConsentAt: now } });
      await audit('TELECONSULTA_RECORD_CONSENT', req, {
        actorType: req.joinRole === 'doctor' ? 'DOCTOR' : 'USER',
        actorId: req.joinRole === 'doctor' ? req.doctorId : req.userId,
        targetType: 'REMINDER',
        targetId: r.id,
        after: { reminderId: r.id, recordConsentAt: now.toISOString(), role: req.joinRole },
      });
      res.json({ recordConsentAt: now.toISOString() });
      return;
    }
    res.json({ recordConsentAt: new Date(r.recordConsentAt).toISOString() });
  } catch (e) {
    next(e);
  }
}
router.put('/:id/record-consent', requireJoinIdentity, setRecordConsent);
router.patch('/:id/record-consent', requireJoinIdentity, setRecordConsent);

/** QuickNote (23/10): nota clínica do médico desta consulta — fim da era
 *  localStorage "só neste aparelho" (P2-reviewer 19/10). Sobrescreve (última
 *  versão vale); visível apenas pro médico no /summary (paciente não lê). */
router.put('/:id/doctor-note', requireJoinIdentity, async (req: JoinRequest, res, next) => {
  try {
    if (req.joinRole !== 'doctor') { res.status(403).json({ error: 'A anotação clínica é do médico.' }); return; }
    const r = await loadAccessibleTeleconsulta(req, res); if (!r) return;
    const note = String(req.body?.note ?? '').slice(0, 4000);
    await prisma.reminder.update({ where: { id: r.id }, data: { doctorNote: note || null } });
    void audit('TELECONSULTA_DOCTOR_NOTE', req, {
      actorType: 'DOCTOR', actorId: req.doctorId, targetType: 'REMINDER', targetId: r.id,
      after: { reminderId: r.id, chars: note.length },
    });
    res.json({ ok: true, doctorNote: note || null });
  } catch (e) {
    next(e);
  }
});

/** 3b — POST /api/teleconsulta/:id/recording (multipart field "file").
 *  Médico ou paciente autenticado envia o áudio da chamada gravada.
 *  Fluxo: consent mútuo registrado -> áudio no disco -> dispara STT imediato + fallback na fila. */
router.post('/:id/recording', requireJoinIdentity, async (req: JoinRequest, res, next) => {
  try {
    const r = await loadAccessibleTeleconsulta(req, res); if (!r) return;
    if (!r.recordConsentAt) {
      res.status(403).json({ error: 'O consentimento de gravação e transcrição precisa ser registrado antes.', code: 'RECORD_CONSENT_REQUIRED' });
      return;
    }
    // Sem STT configurado o upload é INÚTIL — o job nunca transcreveria (áudio efêmero
    // preso no disco). 503 ANTES de decodificar o multipart (não gasta banda de upload)
    // com código estável p/ o client nem oferecer o fluxo de gravação.
    if (!hasStt()) {
      res.status(503).json({ error: 'Transcrição não configurada neste servidor.', code: 'STT_DISABLED' });
      return;
    }
    const file = await acceptAudioFile(req);
    if (!file) { res.status(400).json({ error: 'Envie o áudio no campo "file" (audio/webm).' }); return; }
    const buf: Buffer = file.buffer;

    const { promises: fsp } = await import('fs');
    await fsp.mkdir(config.teleconsultaDir, { recursive: true });
    await fsp.writeFile(audioPathFor(r.id), buf);
    await prisma.reminder.update({
      where: { id: r.id },
      // retryCount=0: re-upload de áudio que esgotou tentativas começa a contagem de novo.
      data: { recordingAt: new Date(), transcriptEnc: null, transcriptIv: null, transcriptAt: null, retryCount: 0 },
    });

    // Transcrição 100% via job (tick 15s pós-boot + 2min intervalal) — SEM inline
    // void: chamada dupla (rota + job) quebrava teste e o retryCount.

    res.status(202).json({ pending: true });
  } catch (e) {
    next(e);
  }
});

/** 3c — GET /api/teleconsulta/:id/transcript (auth dual). Drift-safe: banco sem as
 *  colunas F3 ainda → null em vez de 500. Transcript sai DECRYPTADO só aqui. */
router.get('/:id/transcript', requireJoinIdentity, async (req: JoinRequest, res, next) => {
  try {
    const r = await loadAccessibleTeleconsulta(req, res); if (!r) return;
    const row: any = await prisma.reminder.findUnique({
      where: { id: r.id },
      select: { transcriptEnc: true, transcriptIv: true, transcriptAt: true },
    }).catch((e: any) => /column .* does not exist/i.test(String(e?.message)) ? null : Promise.reject(e));
    const text = row ? decryptPII(row.transcriptEnc, row.transcriptIv) : null;
    res.json({
      text,
      transcriptAt: row?.transcriptAt ? new Date(row.transcriptAt).toISOString() : null,
      disclaimer: 'Transcrição gerada por IA — revise com o médico.',
    });
  } catch (e) {
    next(e);
  }
});

/** 3d — GET /api/teleconsulta/:id/summary (auth dual) — a "área pós-chamada" do dono:
 *  transcrição (só a data), pedidos de exame da chamada (ExamRequest), feedback 1-toque
 *  (F2, auditLog) e duração aproximada (1º→último join no auditLog). */
router.get('/:id/summary', requireJoinIdentity, async (req: JoinRequest, res, next) => {
  try {
    const r = await loadAccessibleTeleconsulta(req, res); if (!r) return;
    const row: any = await prisma.reminder.findUnique({
      where: { id: r.id },
      select: { transcriptAt: true, endedAt: true, consentAt: true, recordConsentAt: true, doctorNote: true },
    }).catch((e: any) => /column .* does not exist/i.test(String(e?.message)) ? null : Promise.reject(e));
    // ExamRequest = model be1 (mesmo lote); `as any` tolera client não regenerado + catch → [].
    const examRequests = await (prisma as any).examRequest.findMany({
      where: { reminderId: r.id },
      orderBy: { createdAt: 'asc' },
    }).catch(() => []);
    const [feedbackLog, joinLogs, patient, doctor] = await Promise.all([
      prisma.auditLog.findFirst({ where: { action: 'TELECONSULTA_FEEDBACK', targetId: r.id }, orderBy: { createdAt: 'desc' } }),
      prisma.auditLog.findMany({ where: { action: 'TELECONSULTA_JOIN', targetId: r.id }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
      r.patientId ? prisma.patient.findUnique({
        where: { id: r.patientId },
        // fix 23/10: selects com coluna inexistente (Patient.name — só há fullName)
        // faziam o PrismaClientValidationError cair no .catch → patient SEMPRE null
        // (header sem nome do paciente p/ o médico; brief clínico sem patientId).
        select: { id: true, fullName: true, photoUrl: true },
      }).catch(() => null) : null,
      (r as any).createdByDoctorId ? prisma.doctor.findUnique({
        where: { id: (r as any).createdByDoctorId },
        // fix 23/10: idem — Doctor não tem crmState/avatarUrl (é crmUf/photoUrl)
        // → doctor sempre null → header do PACIENTE nunca mostrou nome/CRM do médico.
        // phone (23/10): fallback "ligar por telefone" quando a chamada cai.
        select: { name: true, crm: true, crmUf: true, specialty: true, photoUrl: true, phone: true },
      }).catch(() => null) : null,
    ]);
    const fb: any = feedbackLog?.after ?? null;
    // Duração REAL (22/10/26): 1º join → endedAt (encerrada) OU 1º→último join (aberta
    // com re-entradas). durationSec é o contrato novo; durationHint (texto) fica p/
    // retrocompat do client F2 que já o renderiza.
    const endedAtIso = row?.endedAt ? new Date(row.endedAt).toISOString() : null;
    let durationSec: number | null = null;
    const firstJoinMs = joinLogs.length ? new Date(joinLogs[0].createdAt).getTime() : null;
    if (firstJoinMs != null) {
      const endMs = row?.endedAt
        ? new Date(row.endedAt).getTime()
        : joinLogs.length >= 2 ? new Date(joinLogs[joinLogs.length - 1].createdAt).getTime() : null;
      if (endMs != null && endMs > firstJoinMs) durationSec = Math.round((endMs - firstJoinMs) / 1000);
    }
    const durationHint = durationSec != null ? `aprox. ${Math.max(1, Math.round(durationSec / 60))} min` : null;
    // WhatsApp-style: médico já entrou na sala? (join role=doctor nos últimos 5 min
    // sem disconnect) → pré-join do paciente vira tela de "chamada recebida"
    const doctorInRoom = joinLogs.some((l: any) => l.after?.role === 'doctor' && Date.now() - new Date(l.createdAt).getTime() < 5 * 60_000);
    res.json({
      doctorInRoom,
      endedAt: endedAtIso,
      // fix 23/10: sem consentAt/recordConsentAt no summary, o client de quem JÁ
      // consentiu (deep link) reexibia a tela de consent Art.15 e perdia o estado
      // do opt-in de gravação.
      consentAt: row?.consentAt ? new Date(row.consentAt).toISOString() : null,
      recordConsentAt: row?.recordConsentAt ? new Date(row.recordConsentAt).toISOString() : null,
      // QuickNote: privado do médico — o paciente não lê a anotação clínica.
      doctorNote: req.joinRole === 'doctor' ? (row?.doctorNote ?? null) : undefined,
      durationSec,
      transcript: row?.transcriptAt ? { at: new Date(row.transcriptAt).toISOString() } : null,
      examRequests,
      feedback: fb && fb.rating != null ? { rating: fb.rating, note: fb.note ?? null, role: fb.role ?? null } : null,
      durationHint,
      stt: hasStt(), // reviewer-L: client esconde checkbox de gravação quando false
      patient: patient ? { id: patient.id, name: patient.fullName, photoUrl: patient.photoUrl } : null,
      doctor: doctor ? {
        name: doctor.name,
        crm: doctor.crm ? `${doctor.crm}${doctor.crmUf ? `/${doctor.crmUf}` : ''}` : undefined,
        specialty: doctor.specialty || undefined,
        photoUrl: doctor.photoUrl || undefined,
        phone: doctor.phone || undefined,
      } : null,
    });
  } catch (e) {
    next(e);
  }
});

export default router;
