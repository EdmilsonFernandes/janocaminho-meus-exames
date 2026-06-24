import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { getUserMetrics, evalBadges, BADGES } from '../utils/achievements';

const router = Router();
router.use(requireAuth);

const dayStr = (d = new Date()) => d.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)

/**
 * Conquistas com recompensa em CRÉDITO (gamificação). Anti-farm: tudo server-side.
 * - earned: computado do banco (exams/score/streak).
 * - streak: atualizado só aqui (heartbeat no abre-app) — cliente não farma.
 * - resgate: 1 crédito por badge, 1x só (AchievementGrant @@unique).
 */

// POST /heartbeat — conta o dia no streak (idempotente no dia). Chamado no mount do Dashboard.
router.post('/heartbeat', async (req: AuthedRequest, res, next) => {
  try {
    const today = dayStr();
    const u = await prisma.user.findUnique({ where: { id: req.userId! }, select: { lastActiveDay: true, streakDays: true } });
    if (!u) { res.status(404).json({ error: 'Usuário não encontrado' }); return; }
    if (u.lastActiveDay === today) { res.json({ streak: u.streakDays, advanced: false }); return; }
    const yesterday = dayStr(new Date(Date.now() - 86400000));
    const streak = u.lastActiveDay === yesterday ? u.streakDays + 1 : 1;
    await prisma.user.update({ where: { id: req.userId! }, data: { lastActiveDay: today, streakDays: streak } });
    res.json({ streak, advanced: true });
  } catch (e) { next(e); }
});

// GET / — badges com estado (earned/progress/claimed/claimable) + streak + saldo + total resgatado.
router.get('/', async (req: AuthedRequest, res, next) => {
  try {
    const userId = req.userId!;
    const [metrics, grants, user] = await Promise.all([
      getUserMetrics(userId),
      prisma.achievementGrant.findMany({ where: { userId }, select: { badgeId: true, createdAt: true } }),
      prisma.user.findUnique({ where: { id: userId }, select: { streakDays: true, achievementAlerts: true, credits: true } }),
    ]);
    const claimedSet = new Set(grants.map((g) => g.badgeId));
    const badges = evalBadges(metrics).map((b) => ({
      ...b,
      claimed: claimedSet.has(b.id),
      claimable: b.earned && !claimedSet.has(b.id),
    }));

    // Aviso in-app de conquista desbloqueada (1x por badge, se o usuário aceita avisos).
    if (user?.achievementAlerts) {
      const claimable = badges.filter((b) => b.claimable);
      if (claimable.length) {
        const notified = await prisma.notification.findMany({ where: { userId, type: 'achievement' }, select: { data: true } });
        const done = new Set(notified.map((n) => (n.data as any)?.badgeId).filter(Boolean));
        for (const b of claimable) {
          if (!done.has(b.id)) {
            await prisma.notification.create({ data: { userId, type: 'achievement', title: `🎉 Conquista: ${b.title}`, body: `${b.desc} — resgate seu crédito!`, data: { badgeId: b.id } } }).catch(() => {});
          }
        }
      }
    }

    res.json({
      badges,
      streak: metrics.streak,
      creditsClaimed: grants.length,
      creditsAvailable: BADGES.length,
      balance: user?.credits ?? 0,
      achievementAlerts: user?.achievementAlerts ?? true,
    });
  } catch (e) { next(e); }
});

// POST /claim — resgata 1 crédito por badge earned+!claimed. body { badgeId? } → vazio = todas.
router.post('/claim', async (req: AuthedRequest, res, next) => {
  try {
    const userId = req.userId!;
    const wantId = req.body?.badgeId ? String(req.body.badgeId) : null;
    const metrics = await getUserMetrics(userId);
    const state = evalBadges(metrics);
    const existing = await prisma.achievementGrant.findMany({ where: { userId }, select: { badgeId: true } });
    const claimedSet = new Set(existing.map((g) => g.badgeId));
    const targets = state.filter((b) => b.earned && !claimedSet.has(b.id) && (!wantId || b.id === wantId));

    const granted: string[] = [];
    for (const b of targets) {
      try {
        await prisma.$transaction([
          prisma.achievementGrant.create({ data: { userId, badgeId: b.id } }),
          prisma.user.update({ where: { id: userId }, data: { credits: { increment: b.reward } } }),
          prisma.creditTransaction.create({ data: { userId, delta: b.reward, kind: 'achievement', label: `Conquista: ${b.title}`, refId: b.id } }),
        ]);
        granted.push(b.id);
      } catch (e: any) {
        if (e?.code !== 'P2002') throw e; // P2002 = já resgatado entre GET e POST → ignora
      }
    }
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { credits: true } });
    res.json({ granted, count: granted.length, newBalance: u?.credits ?? 0 });
  } catch (e) { next(e); }
});

export default router;
