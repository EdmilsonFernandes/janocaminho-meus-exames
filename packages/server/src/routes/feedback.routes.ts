import { Router, type Request, type Response, type NextFunction } from 'express';
import { prisma } from '../prisma';
import { requireAuth, userPatientIds, type AuthedRequest } from '../middleware/auth';
import { requireAdmin } from './admin.routes';
import { requireDoctorOnboarding } from './doctor.routes';
import { audit } from '../utils/audit';
import { getSettings } from '../utils/settings';
import {
  SURVEYS, getSurvey, validateAnswers, sanitizeComment, sanitizeContext, deriveCategory,
  computeInviteEligibility, optionLabel, CATEGORY_LABELS, OUTCOME_LABELS,
  type SurveyDefinition, type FeedbackSettings,
} from '../feedback/surveys';

/**
 * OPINIÕES DOS USUÁRIOS (02/11/26)
 *
 *  /api/feedback         (paciente)  GET /survey · GET /eligibility · POST /invited · POST /dismiss · POST /
 *  /api/doctor/feedback  (médico)    mesmos endpoints (subjectType='doctor', pesquisa doctor-core)
 *  /api/admin/feedback   (admin)     lista+resumo · detalhe · PATCH triagem · agrupamentos por melhoria
 *
 * Idempotência: clientKey único (gerado no client ao abrir) → retry após falha devolve a
 * mesma resposta. Versão: só aceita a versão ATUAL da pesquisa (409 survey_outdated →
 * o app recarrega a definição). Nada clínico entra no contexto (whitelist).
 */

type SubjectType = 'user' | 'doctor';
const SUBJECT_TYPES: SubjectType[] = ['user', 'doctor'];
const STATUSES = ['new', 'reviewing', 'planned', 'resolved'] as const;
const CATEGORIES = Object.keys(CATEGORY_LABELS);

const feedbackSettings = (): FeedbackSettings => {
  const s: any = (getSettings() as any).feedback ?? {};
  return {
    enabled: s.enabled === true || Number(s.enabled) === 1,
    minAccountAgeDays: Number(s.minAccountAgeDays) >= 0 ? Number(s.minAccountAgeDays) : 2,
    inviteIntervalDays: Number(s.inviteIntervalDays) >= 0 ? Number(s.inviteIntervalDays) : 30,
    maxDismissals: Number(s.maxDismissals) > 0 ? Number(s.maxDismissals) : 3,
  };
};

interface SubjectCtx { type: SubjectType; id: string; audience: 'patient' | 'doctor' }

function surveyFor(ctx: SubjectCtx, key: unknown): SurveyDefinition | null {
  const def = getSurvey(key);
  return def && def.audience === ctx.audience ? def : null;
}

const defaultKey = (ctx: SubjectCtx) => (ctx.audience === 'patient' ? 'patient-core' : 'doctor-core');

async function subjectCreatedAt(ctx: SubjectCtx): Promise<Date> {
  if (ctx.type === 'user') {
    const u = await prisma.user.findUnique({ where: { id: ctx.id }, select: { createdAt: true } });
    return u?.createdAt ?? new Date();
  }
  const d = await prisma.doctor.findUnique({ where: { id: ctx.id }, select: { createdAt: true } });
  return d?.createdAt ?? new Date();
}

function makeHandlers(getCtx: (req: any) => SubjectCtx) {
  const survey = (req: Request, res: Response) => {
    const ctx = getCtx(req);
    const def = surveyFor(ctx, req.query.key ?? defaultKey(ctx));
    if (!def) { res.status(404).json({ error: 'Pesquisa não encontrada.' }); return; }
    res.json({ survey: def });
  };

  /** Elegibilidade do CONVITE contextual. Nunca lança pro cliente: erro → não elegível. */
  const eligibility = async (req: Request, res: Response) => {
    const ctx = getCtx(req);
    try {
      const def = surveyFor(ctx, req.query.key ?? defaultKey(ctx));
      if (!def) { res.json({ eligible: false, reason: 'unknown_survey' }); return; }
      const [state, createdAt] = await Promise.all([
        prisma.feedbackPromptState.findUnique({ where: { subjectType_subjectId_surveyKey: { subjectType: ctx.type, subjectId: ctx.id, surveyKey: def.key } } }),
        subjectCreatedAt(ctx),
      ]);
      const r = computeInviteEligibility({ settings: feedbackSettings(), accountCreatedAt: createdAt, state, currentVersion: def.version });
      // hasExams = "já enviou algum exame" (só p/ a COPY do convite; não é dado clínico).
      let hasExams: boolean | undefined;
      if (ctx.type === 'user') {
        const pids = await userPatientIds(ctx.id);
        hasExams = pids.length ? !!(await prisma.exam.findFirst({ where: { patientId: { in: pids } }, select: { id: true } })) : false;
      }
      res.json({ ...r, surveyKey: def.key, surveyVersion: def.version, hasExams });
    } catch (e) {
      console.error('[feedback] eligibility falhou (não convida):', (e as Error).message);
      res.json({ eligible: false, reason: 'error' });
    }
  };

  const upsertState = async (ctx: SubjectCtx, surveyKey: string, update: Record<string, unknown>, create: Record<string, unknown> = update) => prisma.feedbackPromptState.upsert({
    where: { subjectType_subjectId_surveyKey: { subjectType: ctx.type, subjectId: ctx.id, surveyKey } },
    update: update as any,
    create: { subjectType: ctx.type, subjectId: ctx.id, surveyKey, ...create } as any,
  });

  const invited = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ctx = getCtx(req);
      const def = surveyFor(ctx, req.body?.surveyKey ?? defaultKey(ctx));
      if (!def) { res.status(404).json({ error: 'Pesquisa não encontrada.' }); return; }
      await upsertState(ctx, def.key, { lastInvitedAt: new Date() });
      res.json({ ok: true });
    } catch (e) { next(e); }
  };

  const dismiss = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ctx = getCtx(req);
      const def = surveyFor(ctx, req.body?.surveyKey ?? defaultKey(ctx));
      if (!def) { res.status(404).json({ error: 'Pesquisa não encontrada.' }); return; }
      const now = new Date();
      const st = await upsertState(ctx, def.key, { lastDismissedAt: now, dismissCount: { increment: 1 } }, { lastDismissedAt: now, dismissCount: 1 });
      res.json({ ok: true, dismissCount: st.dismissCount });
    } catch (e) { next(e); }
  };

  const submit = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ctx = getCtx(req);
      const def = surveyFor(ctx, req.body?.surveyKey ?? defaultKey(ctx));
      if (!def) { res.status(404).json({ error: 'Pesquisa não encontrada.' }); return; }
      const version = Number(req.body?.surveyVersion);
      if (version !== def.version) { res.status(409).json({ code: 'survey_outdated', error: 'Esta pesquisa foi atualizada. Vamos recarregar as perguntas.' }); return; }
      const clientKey = String(req.body?.clientKey ?? '').trim();
      if (clientKey.length < 8 || clientKey.length > 80 || !/^[A-Za-z0-9\-_:.]+$/.test(clientKey)) { res.status(400).json({ error: 'clientKey inválido.' }); return; }
      const va = validateAnswers(def, req.body?.answers);
      if (!va.ok) { res.status(400).json({ error: va.error }); return; }
      const comment = sanitizeComment(req.body?.comment, def.comment.max);
      const context = sanitizeContext(req.body?.context);
      const category = deriveCategory(va.answers);
      // Retry após falha de rede: a MESMA resposta (clientKey) já gravada → devolve sem duplicar
      // (checado antes do create p/ não gerar erro P2002 no log do Prisma).
      const prior = await prisma.feedbackResponse.findUnique({ where: { clientKey }, select: { id: true, subjectId: true } });
      if (prior) {
        if (prior.subjectId === ctx.id) { res.json({ id: prior.id, duplicate: true, thanks: def.thanks }); return; }
        res.status(409).json({ error: 'clientKey já utilizado.' }); return;
      }
      try {
        const created = await prisma.feedbackResponse.create({
          data: {
            subjectType: ctx.type, subjectId: ctx.id, surveyKey: def.key, surveyVersion: def.version,
            answers: va.answers as any, outcome: va.answers.outcome, category, comment, context: context as any,
            clientKey,
          },
          select: { id: true },
        });
        await upsertState(ctx, def.key, { lastAnsweredAt: new Date(), lastAnsweredVersion: def.version });
        res.status(201).json({ id: created.id, thanks: def.thanks });
      } catch (e: any) {
        if (e?.code === 'P2002') {
          // Retry após falha de rede: a MESMA resposta (clientKey) já está gravada → não duplica.
          const existing = await prisma.feedbackResponse.findUnique({ where: { clientKey }, select: { id: true, subjectId: true } });
          if (existing && existing.subjectId === ctx.id) { res.json({ id: existing.id, duplicate: true, thanks: def.thanks }); return; }
          res.status(409).json({ error: 'clientKey já utilizado.' }); return;
        }
        throw e;
      }
    } catch (e) { next(e); }
  };

  return { survey, eligibility, invited, dismiss, submit };
}

// ───────────────────────── PACIENTE (/api/feedback) ─────────────────────────
const router = Router();
router.use(requireAuth);
const patient = makeHandlers((req: AuthedRequest) => ({ type: 'user', id: req.userId!, audience: 'patient' }));
router.get('/survey', patient.survey);
router.get('/eligibility', patient.eligibility);
router.post('/invited', patient.invited);
router.post('/dismiss', patient.dismiss);
router.post('/', patient.submit);

// ───────────────────────── MÉDICO (/api/doctor/feedback) ─────────────────────────
export const doctorRouter = Router();
const doctor = makeHandlers((req: any) => ({ type: 'doctor', id: String(req.doctorId), audience: 'doctor' }));
doctorRouter.get('/feedback/survey', requireDoctorOnboarding, doctor.survey);
doctorRouter.get('/feedback/eligibility', requireDoctorOnboarding, doctor.eligibility);
doctorRouter.post('/feedback/invited', requireDoctorOnboarding, doctor.invited);
doctorRouter.post('/feedback/dismiss', requireDoctorOnboarding, doctor.dismiss);
doctorRouter.post('/feedback', requireDoctorOnboarding, doctor.submit);

// ───────────────────────── ADMIN (/api/admin/feedback) ─────────────────────────
export const adminRouter = Router();
adminRouter.use(requireAuth);
adminRouter.use(requireAdmin);

interface SubjectInfo { name: string; email: string; kind: SubjectType; extra?: string; isTest?: boolean }

async function subjectsFor(rows: { subjectType: string; subjectId: string }[]): Promise<Map<string, SubjectInfo>> {
  const userIds = Array.from(new Set(rows.filter((r) => r.subjectType === 'user').map((r) => r.subjectId)));
  const doctorIds = Array.from(new Set(rows.filter((r) => r.subjectType === 'doctor').map((r) => r.subjectId)));
  const [users, doctors] = await Promise.all([
    userIds.length ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true, isTest: true } }) : [],
    doctorIds.length ? prisma.doctor.findMany({ where: { id: { in: doctorIds } }, select: { id: true, name: true, email: true, specialty: true } }) : [],
  ]);
  const map = new Map<string, SubjectInfo>();
  for (const u of users) map.set(`user:${u.id}`, { name: u.name, email: u.email, kind: 'user', isTest: u.isTest });
  for (const d of doctors) map.set(`doctor:${d.id}`, { name: d.name, email: d.email, kind: 'doctor', extra: d.specialty ?? undefined });
  return map;
}

const serializeResponse = (r: any, subject?: SubjectInfo) => {
  const def = getSurvey(r.surveyKey);
  const a: any = r.answers ?? {};
  return {
    id: r.id,
    subjectType: r.subjectType,
    subjectId: r.subjectId,
    subject: subject ? { name: subject.name, email: subject.email, extra: subject.extra ?? null, isTest: !!subject.isTest } : null,
    surveyKey: r.surveyKey,
    surveyVersion: r.surveyVersion,
    outcome: r.outcome,
    outcomeLabel: OUTCOME_LABELS[r.outcome as keyof typeof OUTCOME_LABELS] ?? r.outcome,
    detail: Array.isArray(a.detail) ? a.detail.map((id: string) => ({ id, label: optionLabel(def, 'detail', id) })) : [],
    improvement: a.improvement ? { id: a.improvement, label: optionLabel(def, 'improvement', a.improvement) } : null,
    category: r.category,
    categoryLabel: CATEGORY_LABELS[r.category as keyof typeof CATEGORY_LABELS] ?? r.category,
    comment: r.comment,
    context: r.context,
    status: r.status,
    tags: r.tags,
    improvementKey: r.improvementKey,
    adminNotes: r.adminNotes,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
};

function parseFilters(q: any) {
  const where: any = {};
  const from = q.from ? new Date(String(q.from)) : null;
  const to = q.to ? new Date(String(q.to)) : null;
  if (from && !Number.isNaN(from.getTime())) where.createdAt = { ...(where.createdAt ?? {}), gte: from };
  if (to && !Number.isNaN(to.getTime())) where.createdAt = { ...(where.createdAt ?? {}), lte: to };
  if (q.subjectType && SUBJECT_TYPES.includes(q.subjectType)) where.subjectType = q.subjectType;
  if (q.category && CATEGORIES.includes(String(q.category))) where.category = String(q.category);
  if (q.status && (STATUSES as readonly string[]).includes(String(q.status))) where.status = String(q.status);
  if (q.outcome && ['done', 'partial', 'not', 'exploring'].includes(String(q.outcome))) where.outcome = String(q.outcome);
  if (q.improvementKey) where.improvementKey = String(q.improvementKey).slice(0, 60);
  if (q.trigger) where.context = { path: ['trigger'], equals: String(q.trigger).slice(0, 40) };
  if (q.detail) where.answers = { path: ['detail'], array_contains: [String(q.detail).slice(0, 40)] };
  if (q.q) {
    const term = String(q.q).trim().slice(0, 80);
    if (term) where.OR = [{ comment: { contains: term, mode: 'insensitive' } }, { adminNotes: { contains: term, mode: 'insensitive' } }, { tags: { has: term } }];
  }
  return where;
}

/** Lista + RESUMO sobre o conjunto filtrado (denominadores visíveis: respostas, participantes,
 *  base elegível) — poucas respostas nunca viram "conclusão geral" sem o n ao lado. */
adminRouter.get('/feedback', async (req, res, next) => {
  try {
    const where = parseFilters(req.query);
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
    const [total, rows, all, usersBase, doctorsBase] = await Promise.all([
      prisma.feedbackResponse.count({ where }),
      prisma.feedbackResponse.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      prisma.feedbackResponse.findMany({ where, select: { subjectType: true, subjectId: true, surveyKey: true, outcome: true, category: true, status: true, answers: true, createdAt: true, comment: true }, take: 5000, orderBy: { createdAt: 'desc' } }),
      prisma.user.count({ where: { isTest: false, emailVerified: true, role: 'OWNER' } }),
      prisma.doctor.count({ where: { emailVerified: true } }),
    ]);
    const subjects = await subjectsFor(rows);

    const count = (key: (r: any) => string | null | undefined) => {
      const m = new Map<string, number>();
      for (const r of all) { const k = key(r); if (k) m.set(k, (m.get(k) ?? 0) + 1); }
      return m;
    };
    const byOutcome = Object.fromEntries(count((r) => r.outcome));
    const byCategory = Object.fromEntries(count((r) => r.category));
    const byStatus = Object.fromEntries(count((r) => r.status));
    const detailCounts = new Map<string, { label: string; count: number; negative: number }>();
    const improvementCounts = new Map<string, { label: string; count: number }>();
    for (const r of all) {
      const def = getSurvey(r.surveyKey);
      const a: any = r.answers ?? {};
      const negative = r.outcome === 'partial' || r.outcome === 'not';
      for (const id of Array.isArray(a.detail) ? a.detail : []) {
        const k = `${r.surveyKey}:${id}`;
        const cur = detailCounts.get(k) ?? { label: optionLabel(def, 'detail', id), count: 0, negative: 0 };
        cur.count++; if (negative) cur.negative++;
        detailCounts.set(k, cur);
      }
      if (a.improvement) {
        const k = `${r.surveyKey}:${a.improvement}`;
        const cur = improvementCounts.get(k) ?? { label: optionLabel(def, 'improvement', a.improvement), count: 0 };
        cur.count++;
        improvementCounts.set(k, cur);
      }
    }
    const participants = new Set(all.map((r) => `${r.subjectType}:${r.subjectId}`)).size;
    // Série semanal (últimas 12 semanas) — evolução das respostas e do % "conseguiu".
    const weekly = new Map<string, { total: number; done: number }>();
    for (const r of all) {
      const d = new Date(r.createdAt); const day = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - day);
      const wk = d.toISOString().slice(0, 10);
      const cur = weekly.get(wk) ?? { total: 0, done: 0 };
      cur.total++; if (r.outcome === 'done') cur.done++;
      weekly.set(wk, cur);
    }
    res.json({
      items: rows.map((r) => serializeResponse(r, subjects.get(`${r.subjectType}:${r.subjectId}`))),
      total, page, limit,
      summary: {
        responses: all.length,
        participants,
        withComment: all.filter((r) => !!r.comment).length,
        eligibleBase: { users: usersBase, doctors: doctorsBase },
        byOutcome, byCategory, byStatus,
        topDifficulties: Array.from(detailCounts.entries()).map(([key, v]) => ({ key, id: key.split(':')[1], ...v })).sort((a, b) => b.negative - a.negative || b.count - a.count).slice(0, 8),
        topDetail: Array.from(detailCounts.entries()).map(([key, v]) => ({ key, id: key.split(':')[1], ...v })).sort((a, b) => b.count - a.count).slice(0, 8),
        topImprovements: Array.from(improvementCounts.entries()).map(([key, v]) => ({ key, id: key.split(':')[1], ...v })).sort((a, b) => b.count - a.count).slice(0, 8),
        weekly: Array.from(weekly.entries()).sort(([a], [b]) => a.localeCompare(b)).slice(-12).map(([week, v]) => ({ week, ...v })),
      },
      labels: { categories: CATEGORY_LABELS, outcomes: OUTCOME_LABELS, statuses: { new: 'Nova', reviewing: 'Em análise', planned: 'Planejada', resolved: 'Resolvida' } },
      surveys: SURVEYS,
    });
  } catch (e) { next(e); }
});

/** Agrupamento por melhoria (improvementKey): relatos vinculados, status e último relato. */
adminRouter.get('/feedback/improvements', async (_req, res, next) => {
  try {
    const rows = await prisma.feedbackResponse.findMany({ where: { improvementKey: { not: null } }, select: { improvementKey: true, status: true, createdAt: true, category: true }, orderBy: { createdAt: 'desc' } });
    const groups = new Map<string, { key: string; count: number; byStatus: Record<string, number>; categories: Record<string, number>; lastAt: Date; firstAt: Date }>();
    for (const r of rows) {
      const k = r.improvementKey!;
      const g = groups.get(k) ?? { key: k, count: 0, byStatus: {}, categories: {}, lastAt: r.createdAt, firstAt: r.createdAt };
      g.count++;
      g.byStatus[r.status] = (g.byStatus[r.status] ?? 0) + 1;
      g.categories[r.category] = (g.categories[r.category] ?? 0) + 1;
      if (r.createdAt > g.lastAt) g.lastAt = r.createdAt;
      if (r.createdAt < g.firstAt) g.firstAt = r.createdAt;
      groups.set(k, g);
    }
    res.json({ improvements: Array.from(groups.values()).sort((a, b) => b.count - a.count) });
  } catch (e) { next(e); }
});

adminRouter.get('/feedback/:id', async (req, res, next) => {
  try {
    const r = await prisma.feedbackResponse.findUnique({ where: { id: String(req.params.id) } });
    if (!r) { res.status(404).json({ error: 'Opinião não encontrada.' }); return; }
    const subjects = await subjectsFor([r]);
    const others = await prisma.feedbackResponse.count({ where: { subjectType: r.subjectType, subjectId: r.subjectId, id: { not: r.id } } });
    res.json({ ...serializeResponse(r, subjects.get(`${r.subjectType}:${r.subjectId}`)), otherResponsesFromSubject: others });
  } catch (e) { next(e); }
});

/** Triagem: status, tags, melhoria associada, notas internas. Relato original intacto. */
adminRouter.patch('/feedback/:id', async (req: AuthedRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const before = await prisma.feedbackResponse.findUnique({ where: { id }, select: { status: true, tags: true, improvementKey: true, adminNotes: true, category: true } });
    if (!before) { res.status(404).json({ error: 'Opinião não encontrada.' }); return; }
    const data: Record<string, unknown> = {};
    if (req.body?.status !== undefined) {
      const s = String(req.body.status);
      if (!(STATUSES as readonly string[]).includes(s)) { res.status(400).json({ error: 'Status inválido (new | reviewing | planned | resolved).' }); return; }
      data.status = s;
    }
    if (req.body?.category !== undefined) {
      const c = String(req.body.category);
      if (!CATEGORIES.includes(c)) { res.status(400).json({ error: 'Categoria inválida.' }); return; }
      data.category = c;
    }
    if (req.body?.tags !== undefined) {
      if (!Array.isArray(req.body.tags)) { res.status(400).json({ error: 'tags deve ser uma lista.' }); return; }
      const tags = Array.from(new Set(req.body.tags.map((t: unknown) => String(t).trim().toLowerCase().slice(0, 30)).filter(Boolean))).slice(0, 12);
      data.tags = tags;
    }
    if (req.body?.improvementKey !== undefined) {
      const k = String(req.body.improvementKey ?? '').trim().toLowerCase().replace(/[^a-z0-9\-_ ]/g, '').replace(/\s+/g, '-').slice(0, 60);
      data.improvementKey = k || null;
    }
    if (req.body?.adminNotes !== undefined) data.adminNotes = sanitizeComment(req.body.adminNotes, 2000);
    if (Object.keys(data).length === 0) { res.status(400).json({ error: 'Nada para atualizar.' }); return; }
    const updated = await prisma.feedbackResponse.update({ where: { id }, data: data as any });
    await audit('FEEDBACK_TRIAGED', req, { targetType: 'FEEDBACK', targetId: id, before, after: data });
    const subjects = await subjectsFor([updated]);
    res.json(serializeResponse(updated, subjects.get(`${updated.subjectType}:${updated.subjectId}`)));
  } catch (e) { next(e); }
});

export default router;
