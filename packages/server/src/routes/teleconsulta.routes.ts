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
    const baseSelect = { id: true, type: true, patientId: true, consentAt: true, linkUrl: true, title: true, dueDate: true };
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
    await createLiveKitRoom(room);
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
    res.json({ serverUrl: process.env.LIVEKIT_URL, token, room });
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

export default router;
