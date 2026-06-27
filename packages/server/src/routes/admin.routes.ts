import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { getSettings, saveSettings, type SettingCategory } from '../utils/settings';
import { deleteExamFile } from '../utils/storage';
import { listBlockedDomains, addBlockedDomain, removeBlockedDomain, syncBlockedDomains } from '../utils/blockedDomains';
import { sendPush, PUSH_TOPIC } from '../utils/push';

const router = Router();
router.use(requireAuth);

// Middleware: só admin (role = ADMIN)
const requireAdmin = async (req: AuthedRequest, res: any, next: any) => {
  const u = await prisma.user.findUnique({ where: { id: req.userId! }, select: { role: true } });
  if (!u || u.role !== 'ADMIN') { res.status(403).json({ error: 'Acesso restrito a administradores.' }); return; }
  next();
};
router.use(requireAdmin);

// LISTAR usuários (busca ?q= + paginação ?page=&limit= server-side; sem params mantém o total)
router.get('/users', async (req, res, next) => {
  try {
    const q = String(req.query.q ?? '').trim();
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20)));
    const where: any = q ? { OR: [{ email: { contains: q, mode: 'insensitive' } }, { name: { contains: q, mode: 'insensitive' } }] } : {};
    const [users, total, examCount, subCount, approvedRevenue] = await Promise.all([
      prisma.user.findMany({ where, select: { id: true, email: true, name: true, role: true, credits: true, planExpiresAt: true, createdAt: true }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      prisma.user.count({ where }),
      prisma.exam.count(),
      prisma.subscription.count(),
      prisma.subscription.aggregate({ where: { status: 'APPROVED' }, _sum: { amount: true } }),
    ]);
    res.json({ users, total, page, limit, hasMore: page * limit < total, stats: { users: total, exams: examCount, subscriptions: subCount, revenue: approvedRevenue._sum.amount ?? 0 } });
  } catch (e) { next(e); }
});

// LISTAR pagamentos (filtros ?status=&type=&q= + paginação ?page=; sem params = compatível)
router.get('/payments', async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const take = 20;
    const status = String(req.query.status ?? '').trim();
    const type = String(req.query.type ?? '').trim(); // 'mensal' | 'creditos'
    const q = String(req.query.q ?? '').trim();
    const where: any = {};
    if (status) where.status = status;
    if (type === 'mensal') where.periodDays = { gt: 0 };
    else if (type === 'creditos') where.periodDays = 0;
    if (q) where.user = { OR: [{ email: { contains: q, mode: 'insensitive' } }, { name: { contains: q, mode: 'insensitive' } }] };
    const [subs, total] = await Promise.all([
      prisma.subscription.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * take, take, include: { user: { select: { email: true, name: true } } } }),
      prisma.subscription.count({ where }),
    ]);
    res.json({ payments: subs, total, page, hasMore: page * take < total });
  } catch (e) { next(e); }
});

// CONFIG — leitura (tudo do banco: creditCosts/uploadRules/grants/shares)
router.get('/config', (_req, res) => {
  const s = getSettings();
  res.json({ ...s, plans: { monthly: { price: 19.90, credits: s.grants.monthly } } });
});

// CONFIG — atualizar (PERSISTE no banco via saveSettings). body: { category, ...valores }
// category ∈ creditCosts | uploadRules | grants | shares
router.patch('/config/costs', async (req, res, next) => {
  try {
    const category = String(req.body?.category);
    const patch: Record<string, number> = {};
    for (const [k, v] of Object.entries(req.body ?? {})) {
      if (k === 'category') continue;
      const n = Number(v);
      if (!isNaN(n)) patch[k] = n;
    }
    if (!['creditCosts', 'uploadRules', 'grants', 'shares'].includes(category) || Object.keys(patch).length === 0) {
      res.status(400).json({ error: 'Envie { category, ...valores }. category ∈ creditCosts|uploadRules|grants|shares.' }); return;
    }
    const s = await saveSettings(category as SettingCategory, patch);
    console.log('[admin] config atualizada (persistida no banco):', category, patch);
    res.json({ ...s, plans: { monthly: { price: 19.90, credits: s.grants.monthly } } });
  } catch (e) { next(e); }
});

// MÉTRICAS/FUNIL (analytics) — signups → free → pago, receita (MRR/total), churn/retensão no
// vencimento e cohort por mês de signup. Pra o admin decidir com dado (ajustar preço/grants/custo).
router.get('/metrics', async (_req, res, next) => {
  try {
    const now = new Date();
    // --- FUNIL ---
    const [signups, verified, premiumActive] = await Promise.all([
      prisma.user.count({ where: { role: 'OWNER' } }),
      prisma.user.count({ where: { role: 'OWNER', emailVerified: true } }),
      prisma.user.count({ where: { role: 'OWNER', planExpiresAt: { gt: now } } }),
    ]);
    const freeActive = Math.max(0, verified - premiumActive);
    // --- RECEITA ---
    const agg = await prisma.subscription.aggregate({ where: { status: 'APPROVED' }, _sum: { amount: true } });
    const [monthlyPayments, creditPurchases] = await Promise.all([
      prisma.subscription.count({ where: { status: 'APPROVED', periodDays: { gt: 0 } } }),
      prisma.subscription.count({ where: { status: 'APPROVED', periodDays: 0 } }),
    ]);
    // --- CHURN/RETENÇÃO (no vencimento) ---
    const everRows = await prisma.subscription.findMany({ where: { status: 'APPROVED', periodDays: { gt: 0 } }, select: { userId: true }, distinct: ['userId'] });
    const everPremium = everRows.length;
    const stillActive = await prisma.user.count({ where: { role: 'OWNER', planExpiresAt: { gt: now }, subscriptions: { some: { status: 'APPROVED', periodDays: { gt: 0 } } } } });
    const churned = Math.max(0, everPremium - stillActive);
    const renewalRows = await prisma.$queryRaw<{ cnt: bigint }[]>`SELECT COUNT(*)::int AS cnt FROM (SELECT "userId" FROM subscriptions WHERE status='APPROVED' AND "periodDays" > 0 GROUP BY "userId" HAVING COUNT(*) >= 2) t`;
    const renewals = Number(renewalRows[0]?.cnt ?? 0);
    // --- COHORT (signup mês → conversão) ---
    const cohort = await prisma.$queryRaw<{ month: string; signups: bigint; converted: bigint }[]>`
      SELECT TO_CHAR(DATE_TRUNC('month', u."createdAt"), 'YYYY-MM') AS month,
             COUNT(DISTINCT u.id) AS signups,
             COUNT(DISTINCT s."userId") AS converted
      FROM users u
      LEFT JOIN subscriptions s ON s."userId" = u.id AND s.status = 'APPROVED' AND s."periodDays" > 0
      WHERE u."role" = 'OWNER'
      GROUP BY 1 ORDER BY 1 DESC LIMIT 12`;
    // --- RECEITA por mês (pagamento aprovado) ---
    const revenueByMonth = await prisma.$queryRaw<{ month: string; amount: bigint }[]>`
      SELECT TO_CHAR(DATE_TRUNC('month', "updatedAt"), 'YYYY-MM') AS month, SUM("amount")::bigint AS amount
      FROM subscriptions WHERE status = 'APPROVED' GROUP BY 1 ORDER BY 1 DESC LIMIT 12`;
    res.json({
      funnel: { signups, verified, freeActive, premiumActive, conversionPct: verified ? Math.round((premiumActive / verified) * 1000) / 10 : 0 },
      revenue: { mrr: Math.round(premiumActive * 19.9 * 100) / 100, total: Math.round((agg._sum.amount ?? 0) * 100) / 100, monthlyPayments, creditPurchases },
      churn: { everPremium, stillActive, churned, renewals, retentionPct: everPremium ? Math.round((stillActive / everPremium) * 1000) / 10 : 0 },
      cohort: cohort.map((r) => ({ month: r.month, signups: Number(r.signups), converted: Number(r.converted) })).filter((r) => r.month),
      revenueByMonth: revenueByMonth.map((r) => ({ month: r.month, amount: Number(r.amount) })).filter((r) => r.month),
    });
  } catch (e) { next(e); }
});

// AJUSTAR créditos
router.patch('/users/:id/credits', async (req: AuthedRequest, res, next) => {
  try {
    const credits = Number(req.body?.credits);
    if (isNaN(credits)) { res.status(400).json({ error: 'credits deve ser número' }); return; }
    const u = await prisma.user.update({ where: { id: String(req.params.id) }, data: { credits }, select: { id: true, email: true, credits: true } });
    res.json(u);
  } catch (e) { next(e); }
});

// AJUSTAR plano (premium/null)
router.patch('/users/:id/plan', async (req: AuthedRequest, res, next) => {
  try {
    const planExpiresAt = req.body?.planExpiresAt ? new Date(req.body.planExpiresAt) : null;
    const u = await prisma.user.update({ where: { id: String(req.params.id) }, data: { planExpiresAt }, select: { id: true, email: true, planExpiresAt: true } });
    res.json(u);
  } catch (e) { next(e); }
});

// DELETAR usuário — lista o que vai ser apagado antes
router.get('/users/:id/impact', async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const patientIds = (await prisma.patient.findMany({ where: { ownerId: id }, select: { id: true } })).map(p => p.id);
    const [patients, exams, analyses] = await Promise.all([
      prisma.patient.count({ where: { ownerId: id } }),
      prisma.exam.count({ where: { patientId: { in: patientIds } } }),
      prisma.aiAnalysis.count({ where: { patientId: { in: patientIds } } }),
    ]);
    res.json({ patients, exams, analyses });
  } catch (e) { next(e); }
});

// DELETAR usuário
router.delete('/users/:id', async (req, res, next) => {
  try {
    const id = String(req.params.id);
    // deleta arquivos dos exames antes do cascade
    const exams = await prisma.exam.findMany({ where: { patient: { ownerId: id } }, select: { filePath: true } });
    for (const e of exams) { try { await deleteExamFile(e.filePath); } catch { /* */ } }
    await prisma.user.delete({ where: { id } }); // cascade: Patient→Exam→Items/Analyses
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// === DOMÍNIOS DE E-MAIL BLOQUEADOS (descartáveis/temporários — anti-farm de créditos) ===
// Lista configurável (banco). Sync puxa de uma lista pública comunitária e faz merge.
router.get('/blocked-domains', (_req, res) => {
  res.json({ domains: listBlockedDomains() });
});
router.post('/blocked-domains', async (req, res, next) => {
  try {
    const domain = String(req.body?.domain ?? '').trim();
    if (!domain) { res.status(400).json({ error: 'Informe o domínio (ex.: mailinator.com).' }); return; }
    await addBlockedDomain(domain);
    res.json({ ok: true, domains: listBlockedDomains() });
  } catch (e) { next(e); }
});
router.delete('/blocked-domains/:domain', async (req, res, next) => {
  try {
    await removeBlockedDomain(String(req.params.domain));
    res.json({ ok: true, domains: listBlockedDomains() });
  } catch (e) { next(e); }
});
router.post('/blocked-domains/sync', async (_req, res) => {
  try {
    const r = await syncBlockedDomains();
    res.json({ ok: true, ...r });
  } catch (e: any) { res.status(502).json({ error: e?.message || 'Falha ao sincronizar com a lista pública.' }); }
});

// PUSH GLOBAL — broadcast de engajamento pra TODOS os dispositivos com token cadastrado.
// Body: { title, body, route? }. Só dispara o push (NÃO cria Notification por usuário —
// broadcast leve e genérico; o engajamento personalizado fica no job healthNudges).
// Firebase Admin precisa estar configurado (service account) — senão conta os tokens mas não entrega.
router.post('/push/global', async (req: AuthedRequest, res, next) => {
  try {
    const title = String(req.body?.title ?? '').trim();
    const body = String(req.body?.body ?? '').trim();
    const route = req.body?.route ? String(req.body.route) : undefined;
    if (!title || !body) { res.status(400).json({ error: 'title e body são obrigatórios' }); return; }
    const tokens = await prisma.deviceToken.findMany({ select: { token: true } });
    const list = tokens.map((t) => t.token);
    await sendPush(list, title, body, { type: 'global', ...(route ? { route } : {}) });
    console.log(`[admin] push global enviado por ${req.userId}: "${title}" → ${list.length} dispositivo(s)`);
    res.json({ ok: true, sent: list.length, topic: PUSH_TOPIC });
  } catch (e) { next(e); }
});

export default router;
