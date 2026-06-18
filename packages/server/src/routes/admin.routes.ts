import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { CREDIT_COSTS } from '../utils/credits';

const router = Router();
router.use(requireAuth);

// Middleware: só admin (role = ADMIN)
const requireAdmin = async (req: AuthedRequest, res: any, next: any) => {
  const u = await prisma.user.findUnique({ where: { id: req.userId! }, select: { role: true } });
  if (!u || u.role !== 'ADMIN') { res.status(403).json({ error: 'Acesso restrito a administradores.' }); return; }
  next();
};
router.use(requireAdmin);

// LISTAR usuários
router.get('/users', async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, email: true, name: true, role: true, credits: true, planExpiresAt: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    const examCount = await prisma.exam.count();
    const subCount = await prisma.subscription.count();
    const approvedRevenue = await prisma.subscription.aggregate({ where: { status: 'APPROVED' }, _sum: { amount: true } });
    res.json({ users, stats: { users: users.length, exams: examCount, subscriptions: subCount, revenue: approvedRevenue._sum.amount ?? 0 } });
  } catch (e) { next(e); }
});

// LISTAR pagamentos (com MP details)
router.get('/payments', async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const take = 20;
    const [subs, total] = await Promise.all([
      prisma.subscription.findMany({
        orderBy: { createdAt: 'desc' }, skip: (page - 1) * take, take,
        include: { user: { select: { email: true, name: true } } },
      }),
      prisma.subscription.count(),
    ]);
    res.json({ payments: subs, total, page, hasMore: page * take < total });
  } catch (e) { next(e); }
});

// CONFIG — custos atuais (leitura + escrita)
router.get('/config', (_req, res) => {
  res.json({ creditCosts: CREDIT_COSTS, plans: { monthly: { price: 19.90, credits: 1500 } } });
});

// CONFIG — atualizar custos (edita o objeto em memória; redeploy pra persistir)
const editableCosts = { ...CREDIT_COSTS };
router.patch('/config/costs', async (req, res) => {
  const { chat, summary, consolidated, extraction } = req.body ?? {};
  if (chat != null) { editableCosts.chat = Number(chat); CREDIT_COSTS.chat = Number(chat); }
  if (summary != null) { editableCosts.summary = Number(summary); CREDIT_COSTS.summary = Number(summary); }
  if (consolidated != null) { editableCosts.consolidated = Number(consolidated); CREDIT_COSTS.consolidated = Number(consolidated); }
  if (extraction != null) { editableCosts.extraction = Number(extraction); CREDIT_COSTS.extraction = Number(extraction); }
  console.log('[admin] custos atualizados:', CREDIT_COSTS);
  res.json({ creditCosts: CREDIT_COSTS });
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

// DELETAR usuário
router.delete('/users/:id', async (req, res, next) => {
  try {
    await prisma.user.delete({ where: { id: String(req.params.id) } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
