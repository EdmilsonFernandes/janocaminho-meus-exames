import { Router } from 'express';
import crypto from 'crypto';
import { prisma } from '../prisma';
import { config, hasMercadoPago } from '../config';
import { requireAuth, AuthedRequest, userPatientIds } from '../middleware/auth';

const router = Router();

// Planos (público)
const PLANS = {
  monthly: { id: 'monthly', label: 'Mensal', price: 19.9, periodDays: 30 },
  annual: { id: 'annual', label: 'Anual', price: 149.0, periodDays: 365 },
};

router.get('/plans', (_req, res) => {
  res.json({
    plans: Object.values(PLANS),
    freeExamLimit: config.freeExamLimit,
    mercadoPagoEnabled: hasMercadoPago(),
  });
});

// Status do plano do usuário logado
router.get('/status', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId! }, select: { planExpiresAt: true } });
    const active = !!user?.planExpiresAt && user.planExpiresAt > new Date();
    const pids = await userPatientIds(req.userId!);
    const examsCount = await prisma.exam.count({ where: { patientId: { in: pids } } });
    res.json({ active, planExpiresAt: user?.planExpiresAt ?? null, examsCount, freeExamLimit: config.freeExamLimit });
  } catch (e) { next(e); }
});

// Criar checkout no Mercado Pago
router.post('/checkout', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    if (!hasMercadoPago()) { res.status(503).json({ error: 'Pagamentos não configurados (MP_ACCESS_TOKEN).' }); return; }
    const planId = (req.body?.plan === 'annual' ? 'annual' : 'monthly') as keyof typeof PLANS;
    const plan = PLANS[planId];
    const user = await prisma.user.findUnique({ where: { id: req.userId! } });
    if (!user) { res.status(404).json({ error: 'Usuário não encontrado' }); return; }

    const sub = await prisma.subscription.create({
      data: { userId: user.id, amount: plan.price, periodDays: plan.periodDays, status: 'PENDING' },
    });

    const back = `${config.webOrigin}${config.webBasePath}/planos`;
    const prefResp = await fetch(`${config.mpApiBaseUrl}/checkout/preferences`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.mpAccessToken}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({
        items: [{ id: plan.id, title: `Meus Exames — Plano ${plan.label}`, quantity: 1, unit_price: plan.price, currency_id: 'BRL' }],
        payer: { email: user.email, name: user.name },
        back_urls: { success: `${back}?status=success`, failure: `${back}?status=failure`, pending: `${back}?status=pending` },
        auto_return: 'approved',
        external_reference: sub.id,
        statement_descriptor: 'MEUS EXAMES',
        notification_url: config.mpNotificationUrl || undefined,
      }),
    });
    if (!prefResp.ok) {
      const errText = await prefResp.text();
      console.error('[billing] MP preferência falhou:', prefResp.status, errText);
      res.status(502).json({ error: 'Falha ao criar cobrança no Mercado Pago.' });
      return;
    }
    const pref: any = await prefResp.json();
    await prisma.subscription.update({ where: { id: sub.id }, data: { mpPreferenceId: pref.id ?? null } });
    res.json({ init_point: pref.init_point ?? pref.sandbox_init_point, subscriptionId: sub.id });
  } catch (e) { next(e); }
});

// Webhook do Mercado Pago (PÚBLICO — sem auth)
router.post('/webhook', async (req, res) => {
  try {
    const { type, action, data } = req.body ?? {};
    const isPayment = type === 'payment' || String(action || '').startsWith('payment');
    if (isPayment && data?.id && hasMercadoPago()) {
      const paymentId = data.id;
      const r = await fetch(`${config.mpApiBaseUrl}/v1/payments/${paymentId}`, {
        headers: { Authorization: `Bearer ${config.mpAccessToken}` },
      });
      if (r.ok) {
        const pay: any = await r.json();
        if (pay.status === 'approved' && pay.external_reference) {
          const sub = await prisma.subscription.findUnique({ where: { id: String(pay.external_reference) } });
          if (sub && sub.status !== 'APPROVED') {
            const expires = new Date(Date.now() + sub.periodDays * 86400000);
            await prisma.$transaction([
              prisma.subscription.update({ where: { id: sub.id }, data: { status: 'APPROVED', mpPaymentId: String(paymentId) } }),
              prisma.user.update({ where: { id: sub.userId }, data: { planExpiresAt: expires } }),
            ]);
            console.log(`[billing] assinatura ${sub.id} aprovada — usuário ativo até ${expires.toISOString()}`);
          }
        }
      }
    }
  } catch (e) {
    console.error('[billing] webhook erro:', (e as Error).message);
  }
  res.status(200).json({ ok: true }); // sempre 200 pro MP
});

export default router;
