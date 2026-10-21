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
    const baseSelect = { id: true, type: true, patientId: true, createdByDoctorId: true, consentAt: true, linkUrl: true, title: true, dueDate: true };
    const reminder: any = await prisma.reminder.findUnique({ where: { id }, select: { ...baseSelect, provider: true, roomName: true } })
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
    // stt: capability p/ o client esconder o checkbox de gravação quando o server
    // não transcreve (reviewer-L — ausência é a mensagem, sem promessa falsa).
    // WhatsApp-style: médico entrou → push pro paciente "está te chamando"
    if (role === 'doctor') {
      const docName = req.joinName?.replace(/^Dr\.\s*/, '') || 'seu médico';
      void sendPushToUser(reminder.ownerId, `📞 ${docName} está te chamando`, 'Toque para atender a teleconsulta agora.', { type: 'teleconsulta', reminderId: reminder.id }).catch(() => {});
    }
    res.json({ serverUrl: process.env.LIVEKIT_URL, token, room, stt: hasStt() });
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
    const exists = await prisma.reminder.findFirst({ where: { id: String(req.params.id), type: 'teleconsulta' }, select: { id: true } });
    if (!exists) { res.status(404).json({ error: 'Teleconsulta não encontrada' }); return; }
    // Dono 21/10: feedback = a consulta ACONTECEU → marca done (o card para de
    // mostrar "Entrar na consulta" e vira "Ver consulta realizada").
    await prisma.reminder.update({ where: { id: exists.id }, data: { done: true } }).catch(() => {});
    await audit('TELECONSULTA_FEEDBACK', req, {
      actorType: req.joinRole === 'doctor' ? 'DOCTOR' : 'USER',
      actorId: req.joinRole === 'doctor' ? req.doctorId : req.userId,
      targetType: 'REMINDER',
      targetId: exists.id,
      after: { rating, note, role: req.joinRole },
    });
    res.status(201).json({ ok: true });
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
}

/** Carrega a teleconsulta + checa acesso DUAL (paciente owner OU médico com share ativo —
 *  cópia do join). Responde (404/403) e devolve undefined quando NÃO deve seguir.
 *  Leitura drift-safe igual join: coluna F3 nova + fallback "column does not exist". */
async function loadAccessibleTeleconsulta(req: JoinRequest, res: Response): Promise<TeleconsultaRef | undefined> {
  const id = String(req.params.id);
  const baseSelect = { id: true, type: true, patientId: true, ownerId: true };
  const row: any = await prisma.reminder.findUnique({ where: { id }, select: { ...baseSelect, recordConsentAt: true } })
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
  return { id: row.id, patientId: row.patientId, ownerId: row.ownerId, recordConsentAt: row.recordConsentAt ?? null };
}

/** 3a — PUT/PATCH /api/teleconsulta/:id/record-consent (os dois verbos: cliente pode
 *  chamar qualquer um). PACIENTE titular autoriza gravação+transcrição (D3 — checkbox
 *  default OFF do pré-join). Idempotente: mantém o 1º timestamp (re-envio não renova). */
async function setRecordConsent(req: JoinRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (req.joinRole !== 'patient') { res.status(403).json({ error: 'A autorização de gravação é dada pelo paciente.' }); return; }
    const r = await loadAccessibleTeleconsulta(req, res); if (!r) return;
    if (!r.recordConsentAt) {
      const now = new Date();
      await prisma.reminder.update({ where: { id: r.id }, data: { recordConsentAt: now } });
      await audit('TELECONSULTA_RECORD_CONSENT', req, {
        actorType: 'USER', actorId: req.userId, targetType: 'REMINDER', targetId: r.id,
        after: { reminderId: r.id, recordConsentAt: now.toISOString() },
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

/** 3b — POST /api/teleconsulta/:id/recording (multipart field "file"). Só o MÉDICO (quem
 *  grava no client); paciente → 403. Fluxo: consent do paciente → áudio no disco → STT.
 *  Sem GROQ key ou STT falho → 202 {pending:true} (job transcriptionQueue finaliza). */
router.post('/:id/recording', requireJoinIdentity, async (req: JoinRequest, res, next) => {
  try {
    if (req.joinRole !== 'doctor') { res.status(403).json({ error: 'Apenas o médico envia a gravação da chamada.' }); return; }
    const r = await loadAccessibleTeleconsulta(req, res); if (!r) return;
    if (!r.recordConsentAt) {
      res.status(403).json({ error: 'O paciente precisa autorizar a gravação e a transcrição antes da chamada.', code: 'RECORD_CONSENT_REQUIRED' });
      return;
    }
    // Multipart SÓ depois das checagens (não decodifica 80MB de upload recusado).
    // reviewer-D: multipart SEM campo 'file' → multer resolve sem erro e sem arquivo;
    // sem este 400 a rota devolvia nada (hang). Wrapper só responde 400/413 de ERRO.
    const file = await acceptAudioFile(req);
    if (!file) { res.status(400).json({ error: 'Envie o áudio no campo "file" (audio/webm).' }); return; }
    const buf: Buffer = file.buffer;

    // Áudio no disco ANTES do marcador pendente (D4): row `recordingAt≠null` sempre tem
    // arquivo — crash entre write e update vira órfão que o job varre, nunca o inverso.
    // Re-upload sobrescreve o arquivo e reseta o transcript anterior (refaz — §3b).
    const { promises: fsp } = await import('fs');
    await fsp.mkdir(config.teleconsultaDir, { recursive: true });
    await fsp.writeFile(audioPathFor(r.id), buf);
    await prisma.reminder.update({
      where: { id: r.id },
      data: { recordingAt: new Date(), transcriptEnc: null, transcriptIv: null, transcriptAt: null },
    });

    // reviewer-G: SEMPRE async — STT inline (até 240s) estoura o proxy_read_timeout 60s
    // do nginx (504 pro client). O job transcriptionQueue finaliza (tick 2min) e o
    // client acompanha via GET /summary (poll da área pós-chamada).
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
      select: { transcriptAt: true },
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
        select: { id: true, name: true, photoUrl: true },
      }).catch(() => null) : null,
      (r as any).createdByDoctorId ? prisma.doctor.findUnique({
        where: { id: (r as any).createdByDoctorId },
        select: { name: true, crm: true, crmState: true, specialty: true, avatarUrl: true },
      }).catch(() => null) : null,
    ]);
    const fb: any = feedbackLog?.after ?? null;
    let durationHint: string | null = null;
    if (joinLogs.length >= 2) {
      const mins = Math.max(1, Math.round(
        (new Date(joinLogs[joinLogs.length - 1].createdAt).getTime() - new Date(joinLogs[0].createdAt).getTime()) / 60_000,
      ));
      durationHint = `aprox. ${mins} min`;
    }
    // WhatsApp-style: médico já entrou na sala? (join role=doctor nos últimos 5 min
    // sem disconnect) → pré-join do paciente vira tela de "chamada recebida"
    const doctorInRoom = joinLogs.some((l: any) => l.after?.role === 'doctor' && Date.now() - new Date(l.createdAt).getTime() < 5 * 60_000);
    res.json({
      doctorInRoom,
      transcript: row?.transcriptAt ? { at: new Date(row.transcriptAt).toISOString() } : null,
      examRequests,
      feedback: fb && fb.rating != null ? { rating: fb.rating, note: fb.note ?? null, role: fb.role ?? null } : null,
      durationHint,
      stt: hasStt(), // reviewer-L: client esconde checkbox de gravação quando false
      patient: patient ? { id: patient.id, name: patient.name, photoUrl: patient.photoUrl } : null,
      doctor: doctor ? {
        name: doctor.name,
        crm: doctor.crm ? `${doctor.crm}${doctor.crmState ? `/${doctor.crmState}` : ''}` : undefined,
        specialty: doctor.specialty || undefined,
        photoUrl: doctor.avatarUrl || undefined,
      } : null,
    });
  } catch (e) {
    next(e);
  }
});

export default router;
