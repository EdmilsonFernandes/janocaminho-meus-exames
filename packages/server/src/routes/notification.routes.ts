import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth, AuthedRequest } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

// LIST (recentes primeiro) + contagem de não lidas
router.get('/', async (req: AuthedRequest, res, next) => {
  try {
    const [items, unread] = await Promise.all([
      prisma.notification.findMany({ where: { userId: req.userId! }, orderBy: { createdAt: 'desc' }, take: 50 }),
      prisma.notification.count({ where: { userId: req.userId!, read: false } }),
    ]);
    res.json({ items, unread });
  } catch (e) { next(e); }
});

// MARCAR TODAS como lidas
router.patch('/read-all', async (req: AuthedRequest, res, next) => {
  try {
    await prisma.notification.updateMany({ where: { userId: req.userId!, read: false }, data: { read: true } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
