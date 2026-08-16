import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { getUserMetrics, evalBadges, resolveBadges, claimKeyOf, type BadgeDef } from '../utils/achievements';
import { getSettings } from '../utils/settings';

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
// Mensais: claimed = claim-key `id:YYYY-MM` (renova sozinho a cada mês calendário).
router.get('/', async (req: AuthedRequest, res, next) => {
  try {
    const userId = req.userId!;
    const [metrics, grants, user] = await Promise.all([
      getUserMetrics(userId),
      prisma.achievementGrant.findMany({ where: { userId }, select: { badgeId: true, createdAt: true } }),
      prisma.user.findUnique({ where: { id: userId }, select: { streakDays: true, achievementAlerts: true, credits: true } }),
    ]);
    const claimedSet = new Set(grants.map((g) => g.badgeId));
    const liveBadges = resolveBadges(getSettings().badges as BadgeDef[]);
    const badges = evalBadges(metrics, liveBadges).map((b) => {
      const key = claimKeyOf(b);
      const claimed = claimedSet.has(key);
      return { ...b, claimed, claimable: b.earned && !claimed };
    });

    // Aviso in-app de conquista desbloqueada (1x por claim-key — mensais avisam 1x por mês).
    if (user?.achievementAlerts) {
      const claimable = badges.filter((b) => b.claimable);
      if (claimable.length) {
        const notified = await prisma.notification.findMany({ where: { userId, type: 'achievement' }, select: { data: true } });
        const done = new Set(notified.map((n) => (n.data as any)?.badgeId).filter(Boolean));
        for (const b of claimable) {
          const key = claimKeyOf(b);
          if (!done.has(key)) {
            await prisma.notification.create({ data: { userId, type: 'achievement', title: `🎉 Conquista: ${b.title}`, body: `${b.desc} — resgate seu crédito!`, data: { badgeId: key } } }).catch(() => {});
          }
        }
      }
    }

    const monthLabel = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    res.json({
      badges,
      streak: metrics.streak,
      creditsClaimed: grants.length,
      creditsAvailable: liveBadges.length,
      balance: user?.credits ?? 0,
      achievementAlerts: user?.achievementAlerts ?? true,
      monthLabel,
    });
  } catch (e) { next(e); }
});

// POST /claim — resgata o crédito de badges earned+!claimed (mensais: do mês corrente).
// body { badgeId? } → vazio = todas.
router.post('/claim', async (req: AuthedRequest, res, next) => {
  try {
    const userId = req.userId!;
    const wantId = req.body?.badgeId ? String(req.body.badgeId) : null;
    const metrics = await getUserMetrics(userId);
    const liveBadges = resolveBadges(getSettings().badges as BadgeDef[]);
    const state = evalBadges(metrics, liveBadges);
    const existing = await prisma.achievementGrant.findMany({ where: { userId }, select: { badgeId: true } });
    const claimedSet = new Set(existing.map((g) => g.badgeId));
    const targets = state.filter((b) => {
      const key = claimKeyOf(b);
      return b.earned && !claimedSet.has(key) && (!wantId || b.id === wantId);
    });

    const granted: string[] = [];
    for (const b of targets) {
      const key = claimKeyOf(b);
      try {
        await prisma.$transaction([
          prisma.achievementGrant.create({ data: { userId, badgeId: key } }),
          prisma.user.update({ where: { id: userId }, data: { credits: { increment: b.reward } } }),
          prisma.creditTransaction.create({ data: { userId, delta: b.reward, kind: 'achievement', label: `Conquista: ${b.title}`, refId: key } }),
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
