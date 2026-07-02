import { Router } from 'express';
import crypto from 'crypto';
import { prisma } from '../prisma';
import { config, hasMercadoPago } from '../config';
import { requireAuth, AuthedRequest, userPatientIds } from '../middleware/auth';
import { CREDIT_COSTS, UPLOAD_RULES } from '../utils/credits';
import { getSettings } from '../utils/settings';

const router = Router();

// Só MENSAL (sem anual — não compromete 12 meses no ar / evita processo).
const PLANS = {
  monthly: { id: 'monthly', label: 'Mensal', price: 19.9, periodDays: 30 },
};

// Pacotes de CRÉDITOS (a moeda da IA — pay-per-use). Proposta propositamente MENOS
// atrativa que o mensal (250 créditos/R$19,90 + Premium) → empurra pra assinatura recorrente.
const CREDIT_PACKS = [
  { id: 'p50', credits: 50, price: 9.9, label: 'Início', popular: false },
  { id: 'p140', credits: 140, price: 24.9, label: 'Popular', popular: true },
  { id: 'p320', credits: 320, price: 49.9, label: 'Bônus', popular: false },
];
const packById = (id: string) => CREDIT_PACKS.find((p) => p.id === id);

/** notification_url só vale se for HTTPS público — localhost/HTTP faz o MP rejeitar
 *  ("notification_url attribute must be url valid"). Em dev (localhost) devolve undefined. */
const publicNotifyUrl = (): string | undefined => {
  const u = config.mpNotificationUrl;
  return u && /^https:\/\/(?!localhost|127\.0\.0\.1)(?!.*\.local\b)/i.test(u) ? u : undefined;
};

router.get('/plans', (_req, res) => {
  res.json({
    plans: Object.values(PLANS),
    creditPacks: CREDIT_PACKS,
    freeExamLimit: config.freeExamLimit,
    mercadoPagoEnabled: hasMercadoPago(),
    creditCosts: CREDIT_COSTS, // pra o front sincronizar (admin pode ter mudado)
    uploadRules: UPLOAD_RULES, // regras de cobrança de upload (admin pode editar em runtime)
    shares: getSettings().shares, // custo por escopo ao compartilhar c/ médico (pré-visualização no app)
  });
});

// Status: plano + créditos + consumo aproximado de IA (tokens)
router.get('/status', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId! }, select: { planExpiresAt: true, credits: true } });
    const active = !!user?.planExpiresAt && user.planExpiresAt > new Date();
    const pids = await userPatientIds(req.userId!);
    const examsCount = await prisma.exam.count({ where: { patientId: { in: pids } } });
    const analyses = await prisma.aiAnalysis.findMany({
      where: { patientId: { in: pids } },
      select: { tokenUsage: true },
    });
    const tokensUsed = analyses.reduce((s, a) => {
      const u: any = a.tokenUsage;
      return s + (Number(u?.input_tokens ?? 0) + Number(u?.output_tokens ?? 0));
    }, 0);
    res.json({ active, planExpiresAt: user?.planExpiresAt ?? null, examsCount, freeExamLimit: config.freeExamLimit, credits: user?.credits ?? 0, tokensUsed });
  } catch (e) { next(e); }
});

// EXTRATO de créditos (paginado 50/página, sempre do mais recente): débitos IA + créditos de compra
router.get('/credits/history', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const perPage = 50;
    const [items, total] = await Promise.all([
      prisma.creditTransaction.findMany({
        where: { userId: req.userId! },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * perPage, take: perPage,
        select: { id: true, delta: true, kind: true, label: true, refId: true, createdAt: true },
      }),
      prisma.creditTransaction.count({ where: { userId: req.userId! } }),
    ]);
    res.json({ items, total, page, perPage, hasMore: page * perPage < total });
  } catch (e) { next(e); }
});

// Checkout do PLANO MENSAL (Checkout Pro — redirect)
router.post('/checkout', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    if (!hasMercadoPago()) { res.status(503).json({ error: 'Pagamentos não configurados (MP_ACCESS_TOKEN).' }); return; }
    const plan = PLANS.monthly; // só mensal
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
        items: [{ id: plan.id, title: `Meus Exames — Premium ${plan.label}`, quantity: 1, unit_price: plan.price, currency_id: 'BRL' }],
        payer: { email: user.email, name: user.name },
        back_urls: { success: `${back}?status=success`, failure: `${back}?status=failure`, pending: `${back}?status=pending` },
        auto_return: 'approved',
        external_reference: sub.id, // mensal: external_reference = sub.id (sem "|")
        statement_descriptor: 'MEUS EXAMES',
        notification_url: publicNotifyUrl(),
      }),
    });
    if (!prefResp.ok) {
      console.error('[billing] MP preferência falhou:', prefResp.status, await prefResp.text());
      res.status(502).json({ error: 'Falha ao criar cobrança no Mercado Pago.' });
      return;
    }
    const pref: any = await prefResp.json();
    await prisma.subscription.update({ where: { id: sub.id }, data: { mpPreferenceId: pref.id ?? null } });
    res.json({ init_point: pref.init_point ?? pref.sandbox_init_point, subscriptionId: sub.id });
  } catch (e) { next(e); }
});

// Comprar CRÉDITOS — PIX (QR inline) OU Cartão/Débito (Checkout Pro redirect, MP).
router.post('/buy-credits', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    if (!hasMercadoPago()) { res.status(503).json({ error: 'Pagamentos não configurados.' }); return; }
    const pack = packById(String(req.body?.pack ?? ''));
    if (!pack) { res.status(400).json({ error: 'Pacote inválido' }); return; }
    const method = String(req.body?.method ?? 'pix').toLowerCase(); // pix | card | debit
    const user = await prisma.user.findUnique({ where: { id: req.userId! } });
    if (!user) { res.status(404).json({ error: 'Usuário não encontrado' }); return; }

    // registro p/ idempotência no webhook (periodDays=0 marca "pacote de créditos")
    const sub = await prisma.subscription.create({
      data: { userId: user.id, amount: pack.price, periodDays: 0, status: 'PENDING' },
    });
    const externalReference = `${sub.id}|${pack.credits}`; // webhook diferencia pacote de mensal pelo "|"
    const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 min
    const base = (process.env.WEB_BASE_PATH ?? '').replace(/\/$/, '');
    const origin = process.env.WEB_ORIGIN || '';

    if (method !== 'pix') {
      // CARTÃO / DÉBITO — Checkout Pro (página segura do MP; usuário paga lá e volta).
      // O webhook (external_reference subId|credits) credita os créditos na aprovação.
      const prefResp = await fetch(`${config.mpApiBaseUrl}/checkout/preferences`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.mpAccessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{ id: pack.id, title: `Meus Exames — ${pack.credits} créditos`, quantity: 1, unit_price: pack.price, currency_id: 'BRL' }],
          payer: { email: user.email, name: user.name },
          external_reference: externalReference,
          back_urls: {
            success: `${origin}${base}/planos?status=success`,
            failure: `${origin}${base}/planos?status=failure`,
            pending: `${origin}${base}/planos?status=pending`,
          },
          auto_return: 'approved',
          notification_url: publicNotifyUrl(),
          statement_descriptor: 'MEUS EXAMES',
        }),
      });
      if (!prefResp.ok) {
        console.error('[billing] MP Checkout Pro falhou:', prefResp.status, await prefResp.text());
        await prisma.subscription.update({ where: { id: sub.id }, data: { status: 'FAILED' } });
        res.status(502).json({ error: 'Falha ao abrir o pagamento no Mercado Pago.' });
        return;
      }
      const pref: any = await prefResp.json();
      res.json({ init_point: pref.init_point ?? pref.sandbox_init_point, credits: pack.credits, price: pack.price });
      return;
    }

    // PIX — QR Code inline (copia-cola + countdown)
    const r = await fetch(`${config.mpApiBaseUrl}/v1/payments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.mpAccessToken}`, 'Content-Type': 'application/json', 'X-Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify({
        transaction_amount: pack.price,
        description: `Meus Exames — ${pack.credits} créditos`,
        payment_method_id: 'pix',
        payer: { email: user.email, first_name: (user.name || 'Cliente').split(' ')[0] },
        external_reference: externalReference,
        date_of_expiration: expires.toISOString(),
        notification_url: publicNotifyUrl(),
        statement_descriptor: 'MEUS EXAMES',
      }),
    });
    if (!r.ok) {
      console.error('[billing] MP PIX falhou:', r.status, await r.text());
      await prisma.subscription.update({ where: { id: sub.id }, data: { status: 'FAILED' } });
      res.status(502).json({ error: 'Falha ao gerar PIX no Mercado Pago.' });
      return;
    }
    const pay: any = await r.json();
    const td = pay?.point_of_interaction?.transaction_data;
    console.log('[buy-credits] MP payment:', pay.id, '| status:', pay.status, '| tem QR:', !!td?.qr_code_base64, '| tem td:', !!td, '| msg:', pay.message || pay.error);
    await prisma.subscription.update({ where: { id: sub.id }, data: { mpPaymentId: String(pay.id) } });
    // MP devolve qr_code_base64 em base64 PURO — prefixa p/ virar data URI e renderizar no <img>
    const rawB64 = td?.qr_code_base64 ?? '';
    const qrImg = rawB64 ? (rawB64.startsWith('data:') ? rawB64 : `data:image/png;base64,${rawB64}`) : '';
    res.json({
      paymentId: String(pay.id),
      qrCode: td?.qr_code ?? '',
      qrBase64: qrImg,
      expiresAt: expires.toISOString(),
      credits: pack.credits,
      price: pack.price,
    });
  } catch (e) { next(e); }
});

// Status de um pagamento PIX (polling do frontend enquanto mostra o QR)
router.get('/payment-status/:id', requireAuth, async (req, res, next) => {
  try {
    if (!hasMercadoPago()) { res.status(503).json({ error: 'MP não configurado' }); return; }
    const r = await fetch(`${config.mpApiBaseUrl}/v1/payments/${req.params.id}`, { headers: { Authorization: `Bearer ${config.mpAccessToken}` } });
    if (!r.ok) { res.status(502).json({ error: 'falha' }); return; }
    const pay: any = await r.json();
    res.json({ status: pay.status, approved: pay.status === 'approved' });
  } catch (e) { next(e); }
});

// Webhook do Mercado Pago (PÚBLICO) — aprova mensal OU credita pacote (idempotente pelo status do sub)
router.post('/webhook', async (req, res) => {
  try {
    const { type, action, data } = req.body ?? {};
    const isPayment = type === 'payment' || String(action || '').startsWith('payment');
    if (isPayment && data?.id && hasMercadoPago()) {
      const paymentId = data.id;
      const r = await fetch(`${config.mpApiBaseUrl}/v1/payments/${paymentId}`, { headers: { Authorization: `Bearer ${config.mpAccessToken}` } });
      if (r.ok) {
        const pay: any = await r.json();
        if (pay.status === 'approved' && pay.external_reference) {
          // DR. EXAME PRO (médico premium) — external_reference: doctor_sub_<doctorId>
          if (String(pay.external_reference).startsWith('doctor_sub_')) {
            const doctorId = String(pay.external_reference).replace('doctor_sub_', '');
            const expires = new Date(Date.now() + 30 * 86400000);
            await prisma.doctor.update({ where: { id: doctorId }, data: { plan: 'premium', planExpiresAt: expires } }).catch(() => {});
            console.log(`[billing] Dr. Exame Pro ativado — doctor ${doctorId}, +30d`);
            res.status(200).json({ ok: true }); return;
          }
          const [subId, creditsStr] = String(pay.external_reference).split('|');
          const sub = await prisma.subscription.findUnique({ where: { id: subId } });
          if (sub && sub.status !== 'APPROVED') {
            if (creditsStr) {
              // PACOTE DE CRÉDITOS
              const credits = Number(creditsStr);
              if (credits > 0) {
                await prisma.$transaction([
                  prisma.subscription.update({ where: { id: sub.id }, data: { status: 'APPROVED', mpPaymentId: String(paymentId) } }),
                  prisma.user.update({ where: { id: sub.userId }, data: { credits: { increment: credits } } }),
                  prisma.creditTransaction.create({ data: { userId: sub.userId, delta: credits, kind: 'purchase', label: `Compra de créditos (+${credits})`, refId: sub.id } }),
                ]);
                console.log(`[billing] créditos +${credits} p/ user ${sub.userId} (sub ${sub.id})`);
              }
            } else if (sub.periodDays > 0) {
              // PLANO MENSAL — ativa + concede pacote mensal de créditos (parametrizado em app_settings)
              const expires = new Date(Date.now() + sub.periodDays * 86400000);
              const monthlyCredits = getSettings().grants.monthly;
              await prisma.$transaction([
                prisma.subscription.update({ where: { id: sub.id }, data: { status: 'APPROVED', mpPaymentId: String(paymentId) } }),
                prisma.user.update({ where: { id: sub.userId }, data: { planExpiresAt: expires, credits: { increment: monthlyCredits } } }),
                prisma.creditTransaction.create({ data: { userId: sub.userId, delta: monthlyCredits, kind: 'plan_monthly', label: 'Plano Premium (mensal)', refId: sub.id } }),
              ]);
              console.log(`[billing] mensal aprovado — user ${sub.userId} +${monthlyCredits} créditos, ativo até ${expires.toISOString()}`);
            }
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
