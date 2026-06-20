import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { subscribeToTopic, PUSH_TOPIC } from '../utils/push';

const router = Router();
router.use(requireAuth);

// Registra/atualiza o token FCM do dispositivo deste usuário (mobile envia ao abrir o app)
router.post('/token', async (req: AuthedRequest, res, next) => {
  try {
    const token = String(req.body?.token ?? '');
    const platform = req.body?.platform ? String(req.body.platform) : null;
    if (!token) { res.status(400).json({ error: 'token obrigatório' }); return; }
    const dt = await prisma.deviceToken.upsert({
      where: { token },
      update: { userId: req.userId!, platform, updatedAt: new Date() },
      create: { token, userId: req.userId!, platform },
    });
    // Inscreve no tópico de nudges (best-effort — só ativa com Firebase Admin configurado)
    void subscribeToTopic([token], PUSH_TOPIC);
    res.json({ ok: true, id: dt.id });
  } catch (e) { next(e); }
});

export default router;
