// F3 TELEMEDICINA PREMIUM (20/10/26) — "o dr. pediu 1 exame" com 1 toque no app.
// Contrato: docs/research/2026-10-20-f3-arquitetura.md §3e/3f/3g.
//
// Rotas (router montado em /api — SEM overlap com teleconsulta.routes.ts, D8):
//   POST  /api/teleconsulta/:id/exam-request  — médico cria pedido DENTRO da chamada
//   POST  /api/exam-requests                  — gêmea fora de chamada (patientId no body)
//   PATCH /api/exam-requests/:id              — paciente responde (authorize|deny|schedule)
//   GET   /api/exam-requests                  — role-aware: doctor vê os dele, paciente os seus
//
// Auth: `requireDoctorIdentity`/`requireAnyIdentity` são LOCAIS (~padrão requireJoinIdentity
// do teleconsulta.routes.ts) — middleware/auth.ts e doctor.routes.ts são de outros donos e
// o auth.ts original REJEITA token de médico (isolamento de área).
import { Router, type Response, type NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { prisma } from '../prisma';
import { requireAuth, userPatientIds, type AuthedRequest } from '../middleware/auth';
import { audit } from '../utils/audit';
import { sendPushToUser } from '../utils/push';

const router = Router();

/** Request com identidade de médico (JWT type:'doctor') e/ou paciente (userId). */
interface ExamRequestRequest extends AuthedRequest {
  doctorId?: string;
  apiRole?: 'doctor' | 'patient';
}

/** Auth de MÉDICO local (contrato §3e: ~15 linhas, padrão requireJoinIdentity — NÃO
 *  importar de doctor.routes.ts/teleconsulta.routes.ts). Valida existência do médico
 *  no DB (token de médico deletado não passa). */
async function requireDoctorIdentity(req: ExamRequestRequest, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) { res.status(401).json({ error: 'Não autenticado' }); return; }
  let payload: any;
  try { payload = jwt.verify(header.slice(7), config.jwtSecret); } catch { res.status(401).json({ error: 'Token inválido ou expirado' }); return; }
  if (payload?.type !== 'doctor' || !payload?.doctorId) { res.status(401).json({ error: 'Token médico inválido.' }); return; }
  const doc = await prisma.doctor.findUnique({ where: { id: payload.doctorId }, select: { id: true } });
  if (!doc) { res.status(401).json({ error: 'Token médico inválido.' }); return; }
  req.doctorId = doc.id;
  req.apiRole = 'doctor';
  next();
}

/** Auth DUAL role-aware (GET §3g): médico (doctorId) OU paciente (userId). Espelha o
 *  requireAuth (bloqueado/tokenVersion) sem tocar no middleware original. */
async function requireAnyIdentity(req: ExamRequestRequest, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) { res.status(401).json({ error: 'Não autenticado' }); return; }
  let payload: any;
  try { payload = jwt.verify(header.slice(7), config.jwtSecret); } catch { res.status(401).json({ error: 'Token inválido ou expirado' }); return; }
  if (payload?.type === 'doctor') {
    const doc = await prisma.doctor.findUnique({ where: { id: payload.doctorId }, select: { id: true } });
    if (!doc) { res.status(401).json({ error: 'Token médico inválido.' }); return; }
    req.doctorId = doc.id;
    req.apiRole = 'doctor';
    next();
    return;
  }
  const user = await prisma.user.findUnique({ where: { id: payload?.userId }, select: { id: true, blocked: true, tokenVersion: true } });
  if (!user) { res.status(401).json({ error: 'Usuário inválido' }); return; }
  if (user.blocked) { res.status(401).json({ error: 'Sua sessão expirou. Faça login novamente.' }); return; }
  if (payload.ver != null && user.tokenVersion !== payload.ver) { res.status(401).json({ error: 'Sua sessão expirou. Faça login novamente.' }); return; }
  req.userId = user.id;
  req.apiRole = 'patient';
  next();
}

/** Normaliza/valida o corpo comum do pedido do médico. Retorna null (res já respondido). */
async function parseExamRequestBody(body: any, patientId: string, res: Response): Promise<{
  title: string; note: string | null; existingExamId: string | null; patientId: string;
} | null> {
  const title = String(body?.title ?? '').trim();
  if (!title) { res.status(400).json({ error: 'Título obrigatório.' }); return null; }
  if (title.length > 120) { res.status(400).json({ error: 'Título deve ter no máximo 120 caracteres.' }); return null; }
  const note = body?.note != null ? String(body.note).trim().slice(0, 500) || null : null;
  const existingExamId = body?.existingExamId != null ? String(body.existingExamId) : null;
  // existingExamId: exame EXTRAÍDO do PRÓPRIO paciente (o médico pede autorização p/ ver).
  if (existingExamId) {
    const exam = await prisma.exam.findFirst({
      where: { id: existingExamId, patientId, status: 'EXTRACTED' },
      select: { id: true },
    });
    if (!exam) { res.status(404).json({ error: 'Exame não encontrado ou não pertence a este paciente.' }); return null; }
  }
  return { title, note, existingExamId, patientId };
}

/** Cria o pedido pending + notifica o paciente (in-app 'info' + push) + audit (AWAIT —
 *  família void-audit extinta 19/10: DB fecha antes do insert se não esperar). */
async function createExamRequest(opts: {
  doctorId: string; patientId: string; reminderId: string | null;
  title: string; note: string | null; existingExamId: string | null;
  req: ExamRequestRequest; res: Response;
}): Promise<void> {
  const { doctorId, patientId, reminderId, title, note, existingExamId, req, res } = opts;
  const patient = await prisma.patient.findUnique({ where: { id: patientId }, select: { ownerId: true } });
  if (!patient?.ownerId) { res.status(404).json({ error: 'Paciente sem conta vinculada.' }); return; }
  const er = await prisma.examRequest.create({
    data: { doctorId, patientId, reminderId, title, note, existingExamId },
  });
  // sendPushToUser salva a Notification in-app (type 'info' via data.type) E dispara FCM.
  // AWAIT: a notificação precisa existir quando o request retorna (contrato §3e).
  await sendPushToUser(patient.ownerId, 'Pedido do médico', title, {
    type: 'info', examRequestId: er.id, ...(reminderId ? { reminderId } : {}),
  }).catch(() => { /* push best-effort — o pedido já foi criado */ });
  await audit('EXAM_REQUEST_CREATE', req, {
    actorType: 'DOCTOR', actorId: doctorId,
    targetType: 'EXAM_REQUEST', targetId: er.id,
    after: { patientId, reminderId, title, existingExamId },
  });
  res.status(201).json({ examRequest: er });
}

/** POST /api/teleconsulta/:id/exam-request (§3e) — médico cria o pedido DENTRO da chamada. */
router.post('/teleconsulta/:id/exam-request', requireDoctorIdentity, async (req: ExamRequestRequest, res, next) => {
  try {
    const reminderId = String(req.params.id);
    // Drift-safe igual join: provider/roomName não importam aqui; type/patientId sim.
    const reminder = await prisma.reminder.findFirst({
      where: { id: reminderId, type: 'teleconsulta' },
      select: { id: true, patientId: true },
    });
    if (!reminder) { res.status(404).json({ error: 'Teleconsulta não encontrada' }); return; }
    // Share ATIVO com o paciente (cópia local do guard do join — doctor.routes é de outro dono).
    const share = await prisma.doctorShare.findFirst({
      where: { doctorId: req.doctorId!, patientId: reminder.patientId, active: true },
      select: { id: true },
    });
    if (!share) { res.status(403).json({ error: 'Sem permissão.' }); return; }
    const parsed = await parseExamRequestBody(req.body, reminder.patientId, res);
    if (!parsed) return;
    await createExamRequest({
      doctorId: req.doctorId!, patientId: reminder.patientId, reminderId: reminder.id,
      title: parsed.title, note: parsed.note, existingExamId: parsed.existingExamId,
      req, res,
    });
  } catch (e) {
    next(e);
  }
});

/** POST /api/exam-requests (§3e gêmea) — pedido FORA de chamada (patientId no body). */
router.post('/exam-requests', requireDoctorIdentity, async (req: ExamRequestRequest, res, next) => {
  try {
    const patientId = String(req.body?.patientId ?? '');
    if (!patientId) { res.status(400).json({ error: 'patientId obrigatório.' }); return; }
    const share = await prisma.doctorShare.findFirst({
      where: { doctorId: req.doctorId!, patientId, active: true },
      select: { id: true },
    });
    if (!share) { res.status(403).json({ error: 'Sem permissão.' }); return; }
    const parsed = await parseExamRequestBody(req.body, patientId, res);
    if (!parsed) return;
    await createExamRequest({
      doctorId: req.doctorId!, patientId, reminderId: null,
      title: parsed.title, note: parsed.note, existingExamId: parsed.existingExamId,
      req, res,
    });
  } catch (e) {
    next(e);
  }
});

/** PATCH /api/exam-requests/:id (§3f) — PACIENTE responde (authorize|deny|schedule).
 *  requireAuth do middleware original (token de médico é rejeitado — resposta é do titular). */
router.patch('/exam-requests/:id', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const er = await prisma.examRequest.findUnique({ where: { id: String(req.params.id) } });
    if (!er) { res.status(404).json({ error: 'Pedido não encontrado.' }); return; }
    // Owner: pedido de um dos pacientes do usuário (titular OU dependente).
    const ids = await userPatientIds(req.userId!);
    if (!ids.includes(er.patientId)) { res.status(403).json({ error: 'Sem permissão.' }); return; }
    if (er.status !== 'pending') { res.status(409).json({ error: 'Pedido já respondido.' }); return; }

    const action = String(req.body?.action ?? '');
    if (!['authorize', 'deny', 'schedule'].includes(action)) {
      res.status(400).json({ error: "Ação inválida (use 'authorize', 'deny' ou 'schedule')." });
      return;
    }
    const respondedAt = new Date();

    if (action === 'deny') {
      const updated = await prisma.examRequest.update({
        where: { id: er.id }, data: { status: 'denied', respondedAt },
      });
      await audit('EXAM_REQUEST_RESPOND', req, {
        actorType: 'USER', actorId: req.userId,
        targetType: 'EXAM_REQUEST', targetId: er.id, after: { action, status: 'denied' },
      });
      res.json({ examRequest: updated });
      return;
    }

    if (action === 'authorize') {
      // Exame autorizado: o do corpo (o paciente pode escolher outro) OU o pedido pelo médico.
      const examId = req.body?.existingExamId != null ? String(req.body.existingExamId) : er.existingExamId;
      if (!examId) { res.status(400).json({ error: 'Informe qual exame autoriza (existingExamId).' }); return; }
      const exam = await prisma.exam.findFirst({
        where: { id: examId, patientId: er.patientId, status: 'EXTRACTED' },
        select: { id: true },
      });
      if (!exam) { res.status(404).json({ error: 'Exame não encontrado ou não pertence a este paciente.' }); return; }
      // Share do médico PRECISA seguir ativo (paciente pode ter revogado após o pedido).
      const share = await prisma.doctorShare.findFirst({
        where: { doctorId: er.doctorId, patientId: er.patientId, active: true },
        select: { id: true, examIds: true },
      });
      if (!share) { res.status(409).json({ error: 'Compartilhamento com o médico não está mais ativo.', code: 'SHARE_INACTIVE' }); return; }
      // D6: examIds VAZIO = TODOS → push de id RESTRINGIRIA o acesso. Só estende recorte não-vazio.
      if (share.examIds.length > 0 && !share.examIds.includes(examId)) {
        await prisma.doctorShare.update({
          where: { id: share.id }, data: { examIds: { push: examId } },
        });
      }
      const updated = await prisma.examRequest.update({
        where: { id: er.id }, data: { status: 'authorized', respondedAt },
      });
      await audit('EXAM_REQUEST_RESPOND', req, {
        actorType: 'USER', actorId: req.userId,
        targetType: 'EXAM_REQUEST', targetId: er.id, after: { action, status: 'authorized', examId },
      });
      res.json({ examRequest: updated });
      return;
    }

    // schedule: pedido vira lembrete de EXAME na agenda do paciente (médico que pediu = createdByDoctorId).
    let dueDate: Date;
    if (req.body?.dueDate != null && String(req.body.dueDate).trim() !== '') {
      dueDate = new Date(String(req.body.dueDate));
      if (Number.isNaN(dueDate.getTime())) { res.status(400).json({ error: 'Data inválida.' }); return; }
      if (dueDate.getTime() <= Date.now()) { res.status(400).json({ error: 'Escolha uma data futura.' }); return; }
    } else {
      // Default da casa (contrato §3f): daqui 30 dias às 09:00.
      dueDate = new Date(Date.now() + 30 * 24 * 3600_000);
      dueDate.setHours(9, 0, 0, 0);
    }
    const patient = await prisma.patient.findUnique({ where: { id: er.patientId }, select: { ownerId: true } });
    if (!patient?.ownerId) { res.status(404).json({ error: 'Paciente sem conta vinculada.' }); return; }
    await prisma.reminder.create({
      data: {
        ownerId: patient.ownerId, patientId: er.patientId,
        title: `Exame: ${er.title}`, type: 'exame', dueDate,
        createdByDoctorId: er.doctorId,
      },
    });
    const updated = await prisma.examRequest.update({
      where: { id: er.id }, data: { status: 'scheduled', respondedAt },
    });
    await audit('EXAM_REQUEST_RESPOND', req, {
      actorType: 'USER', actorId: req.userId,
        targetType: 'EXAM_REQUEST', targetId: er.id, after: { action, status: 'scheduled', dueDate: dueDate.toISOString() },
    });
    res.json({ examRequest: updated });
  } catch (e) {
    next(e);
  }
});

/** GET /api/exam-requests (§3g) — role-aware. Médico: pedidos que ELE criou (opcional
 *  ?patientId filtra). Paciente: pedidos dos SEUS pacientes (pendentes + histórico). */
router.get('/exam-requests', requireAnyIdentity, async (req: ExamRequestRequest, res, next) => {
  try {
    // reviewer-K: 'Agendado p/ dd/mm' precisa da dueDate do LEMBRETA criado no schedule —
    // enrich por reminderId (campo nullable, desvinculado quando a teleconsulta é deletada).
    const withDueDates = async (items: any[]) => {
      const rids = items.filter((i) => i.reminderId).map((i) => i.reminderId as string);
      if (!rids.length) return items;
      const rems = await prisma.reminder.findMany({ where: { id: { in: rids } }, select: { id: true, dueDate: true } }).catch(() => [] as any[]);
      const dueByR = new Map(rems.map((r: any) => [r.id, r.dueDate]));
      return items.map((i) => ({ ...i, dueDate: i.reminderId ? dueByR.get(i.reminderId) ?? null : null }));
    };
    if (req.apiRole === 'doctor') {
      const patientId = req.query.patientId != null ? String(req.query.patientId) : null;
      // reviewer-E: DESC — ASC+take devolvia os 200 MAIS ANTIGOS (pendentes novos
      // invisíveis p/ quem passou de 200 pedidos).
      const items = await prisma.examRequest.findMany({
        where: { doctorId: req.doctorId!, ...(patientId ? { patientId } : {}) },
        orderBy: { createdAt: 'desc' },
        take: 200,
      });
      res.json({ items: await withDueDates(items) });
      return;
    }
    const ids = await userPatientIds(req.userId!);
    const items = ids.length
      ? await prisma.examRequest.findMany({ where: { patientId: { in: ids } }, orderBy: { createdAt: 'desc' }, take: 200 })
      : [];
    res.json({ items: await withDueDates(items) });
  } catch (e) {
    next(e);
  }
});

export default router;
