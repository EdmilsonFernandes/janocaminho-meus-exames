import { Router } from 'express';
import crypto from 'crypto';
import { prisma } from '../prisma';
import { config, hasMercadoPago } from '../config';
import { requireAuth, AuthedRequest, userPatientIds } from '../middleware/auth';
import { CREDIT_COSTS, UPLOAD_RULES } from '../utils/credits';
import { getSettings, loadSettings, getMonthlyPlan, getEffectivePlanPrice, getCreditPacks, getPremiumPerks } from '../utils/settings';
import { createSubscriptionCompat, findSubscriptionByIdCompat, getSubscriptionColumnSupport, updateSubscriptionCompat, updateSubscriptionCompatWithDb } from '../utils/subscriptionCompat';

const router = Router();

// Estratégia de pricing vive em app_settings (Admin edita live, sem deploy — auditoria
// 2026-08-23 eliminou os 7 hardcodes de 19,90). Só MENSAL (sem anual: não compromete 12
// meses no ar). Pack = mesma moeda/saldo; mudar pack NÃO invalida créditos já comprados.
const packById = (id: string) => getCreditPacks().find((p) => p.id === id);

/** notification_url só vale se for HTTPS público — localhost/HTTP faz o MP rejeitar
 *  ("notification_url attribute must be url valid"). Em dev (localhost) devolve undefined. */
const publicNotifyUrl = (): string | undefined => {
  const u = config.mpNotificationUrl;
  return u && /^https:\/\/(?!localhost|127\.0\.0\.1)(?!.*\.local\b)/i.test(u) ? u : undefined;
};

router.get('/plans', (_req, res) => {
  const plan = getMonthlyPlan();
  const eff = getEffectivePlanPrice();
  const f = (getSettings() as any).founder;
  res.json({
    plans: [{ id: 'monthly', ...plan, credits: getSettings().grants.monthly, effectivePrice: eff.price, founder: eff.founder }],
    creditPacks: getCreditPacks(),
    freeExamLimit: config.freeExamLimit,
    mercadoPagoEnabled: hasMercadoPago(),
    creditCosts: CREDIT_COSTS, // pra o front sincronizar (admin pode ter mudado)
    uploadRules: UPLOAD_RULES, // regras de cobrança de upload (admin pode editar em runtime)
    shares: getSettings().shares, // custo por escopo ao compartilhar c/ médico (pré-visualização no app)
    // Perks do plano (o que o premium libera além dos créditos) — landing/plans honestos.
    premiumPerks: getPremiumPerks(),
    // Fundador público (contagem p/ "restam X vagas"); se desligado, founder: false.
    founder: eff.founder ? { price: Number(f.price), remaining: Number(f.limit) - Number(f.used) } : null,
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

// Checkout do PLANO MENSAL (Checkout Pro — redirect). Preço = settings (fundador, se ativo).
// O valor cobrado fica GRAVADO no Subscription.amount — o webhook não depende do preço da vez.
router.post('/checkout', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    if (!hasMercadoPago()) { res.status(503).json({ error: 'Pagamentos não configurados (MP_ACCESS_TOKEN).' }); return; }
    const plan = getMonthlyPlan();
    const eff = getEffectivePlanPrice(); // fundador (promo) ou cheio
    const user = await prisma.user.findUnique({ where: { id: req.userId! } });
    if (!user) { res.status(404).json({ error: 'Usuário não encontrado' }); return; }

    const sub = await createSubscriptionCompat({ userId: user.id, amount: eff.price, periodDays: plan.periodDays, status: 'PENDING' });

    const back = `${config.webOrigin}${config.webBasePath}/planos`;
    const monthlyCredits = getSettings().grants.monthly;
    const prefResp = await fetch(`${config.mpApiBaseUrl}/checkout/preferences`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.mpAccessToken}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({
        items: [{ id: plan.label === 'Mensal' ? 'monthly' : 'monthly', title: `Dr. Exame Premium — Plano ${plan.label} (${monthlyCredits} créditos IA${eff.founder ? ' · Plano Fundador' : ''})`, quantity: 1, unit_price: eff.price, currency_id: 'BRL' }],
        payer: { email: user.email, name: user.name },
        back_urls: { success: `${back}?status=success`, failure: `${back}?status=failure`, pending: `${back}?status=pending` },
        auto_return: 'approved',
        external_reference: sub.id, // mensal: external_reference = sub.id (sem "|")
        statement_descriptor: 'DR EXAME',
        notification_url: publicNotifyUrl(),
      }),
    });
    if (!prefResp.ok) {
      console.error('[billing] MP preferência falhou:', prefResp.status, await prefResp.text());
      res.status(502).json({ error: 'Falha ao criar cobrança no Mercado Pago.' });
      return;
    }
    const pref: any = await prefResp.json();
    await updateSubscriptionCompat(sub.id, { mpPreferenceId: pref.id ?? null });
    res.json({ init_point: pref.init_point ?? pref.sandbox_init_point, subscriptionId: sub.id });
  } catch (e) { next(e); }
});

// Comprar CRÉDITOS — PIX (QR inline) OU Cartão/Débito (Checkout Pro redirect, MP).
// IDEMPOTENTE p/ PIX (padrão gateway): se já existe PIX PENDING não-expirado,
// devolve o MESMO QR/timer — nunca cria ordem órfã duplicada.
router.post('/buy-credits', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    if (!hasMercadoPago()) { res.status(503).json({ error: 'Pagamentos não configurados.' }); return; }
    const subscriptionColumns = await getSubscriptionColumnSupport();
    const pack = packById(String(req.body?.pack ?? ''));
    if (!pack) { res.status(400).json({ error: 'Pacote inválido' }); return; }
    const method = String(req.body?.method ?? 'pix').toLowerCase(); // pix | card | debit
    const user = await prisma.user.findUnique({ where: { id: req.userId! } });
    if (!user) { res.status(404).json({ error: 'Usuário não encontrado' }); return; }

    // ===== ANTI-DUPLICAÇÃO (PIX): retorna o PIX existente se ainda vale =====
    if (method === 'pix' && subscriptionColumns.hasPixResume) {
      const existing = await prisma.subscription.findFirst({
        where: { userId: user.id, status: 'PENDING', periodDays: 0, pixExpiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' },
      });
      if (existing?.pixQrCode && existing?.pixQrBase64 && existing?.pixExpiresAt) {
        // Mesmo PIX, mesmo QR, mesmo timer — SEM criar nova ordem no MP.
        res.json({
          paymentId: existing.mpPaymentId ?? '',
          qrCode: existing.pixQrCode,
          qrBase64: existing.pixQrBase64,
          expiresAt: existing.pixExpiresAt.toISOString(),
          credits: existing.pixCredits ?? pack.credits,
          price: existing.amount,
          resumed: true, // frontend sabe que é retomado (não novo)
        });
        return;
      }
      // PIX anterior expirou? Cancela pra não acumular órfãos.
      if (existing) {
        await prisma.subscription.update({ where: { id: existing.id }, data: { status: 'CANCELLED' } });
      }
      // Limpa TODOS os PENDING órfãos do usuário (expirados sem webhook).
      await prisma.subscription.updateMany({
        where: { userId: user.id, status: 'PENDING', periodDays: 0, pixExpiresAt: { lt: new Date() } },
        data: { status: 'CANCELLED' },
      });
    }

    // AUTO-CLEANUP cartão/débito: PENDING sem webhook há >30 min = abandonado → CANCELLED.
    // (mesma lógica do PIX, mas com janela maior — o checkout Pro demora mais pra processar)
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
    await prisma.subscription.updateMany({
      where: { userId: user.id, status: 'PENDING', createdAt: { lt: thirtyMinAgo } },
      data: { status: 'CANCELLED' },
    }).catch(() => {}); // não bloqueia o fluxo se o cleanup falhar

    // registro p/ idempotência no webhook (periodDays=0 marca "pacote de créditos")
    const sub = await createSubscriptionCompat({ userId: user.id, amount: pack.price, periodDays: 0, status: 'PENDING' });
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
          items: [{ id: pack.id, title: `Dr. Exame — ${pack.credits} créditos de IA`, quantity: 1, unit_price: pack.price, currency_id: 'BRL' }],
          payer: { email: user.email, name: user.name },
          external_reference: externalReference,
          back_urls: {
            success: `${origin}${base}/planos?status=success`,
            failure: `${origin}${base}/planos?status=failure`,
            pending: `${origin}${base}/planos?status=pending`,
          },
          auto_return: 'approved',
          notification_url: publicNotifyUrl(),
          statement_descriptor: 'DR EXAME',
        }),
      });
      if (!prefResp.ok) {
        console.error('[billing] MP Checkout Pro falhou:', prefResp.status, await prefResp.text());
        await updateSubscriptionCompat(sub.id, { status: 'FAILED' });
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
        description: `Dr. Exame — ${pack.credits} créditos de IA para análise de exames`,
        payment_method_id: 'pix',
        payer: { email: user.email, first_name: (user.name || 'Cliente').split(' ')[0] },
        external_reference: externalReference,
        date_of_expiration: expires.toISOString(),
        notification_url: publicNotifyUrl(),
        statement_descriptor: 'DR EXAME',
      }),
    });
    if (!r.ok) {
      console.error('[billing] MP PIX falhou:', r.status, await r.text());
      await updateSubscriptionCompat(sub.id, { status: 'FAILED' });
      res.status(502).json({ error: 'Falha ao gerar PIX no Mercado Pago.' });
      return;
    }
    const pay: any = await r.json();
    const td = pay?.point_of_interaction?.transaction_data;
    console.log('[buy-credits] MP payment:', pay.id, '| status:', pay.status, '| tem QR:', !!td?.qr_code_base64, '| tem td:', !!td, '| msg:', pay.message || pay.error);
    // MP devolve qr_code_base64 em base64 PURO — prefixa p/ virar data URI e renderizar no <img>
    const rawB64 = td?.qr_code_base64 ?? '';
    const qrImg = rawB64 ? (rawB64.startsWith('data:') ? rawB64 : `data:image/png;base64,${rawB64}`) : '';
    // PERSISTE QR + expiry na Subscription: é o que permite RETOMAR o mesmo PIX
    // quando o usuário sai e volta (padrão gateway — sem criar ordem órfã).
    if (subscriptionColumns.hasPixResume) {
      await updateSubscriptionCompat(sub.id, {
        mpPaymentId: String(pay.id),
        pixQrCode: td?.qr_code ?? '',
        pixQrBase64: qrImg,
        pixExpiresAt: expires,
        pixCredits: pack.credits,
      });
    } else {
      await updateSubscriptionCompat(sub.id, { mpPaymentId: String(pay.id) });
    }
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

// PIX PENDENTE (padrão gateway): o frontend chama no mount da página Planos.
// Se existe PIX não-expirado, retorna os dados pra retomar (QR + timer restante).
router.get('/pending-payment', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const subscriptionColumns = await getSubscriptionColumnSupport();
    if (!subscriptionColumns.hasPixResume) { res.json({ hasPending: false }); return; }
    const pending = await prisma.subscription.findFirst({
      where: { userId: req.userId!, status: 'PENDING', periodDays: 0, pixExpiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      select: {
        mpPaymentId: true,
        pixQrCode: true,
        pixQrBase64: true,
        pixExpiresAt: true,
        pixCredits: true,
        amount: true,
      },
    });
    if (!pending?.pixQrCode) { res.json({ hasPending: false }); return; }
    res.json({
      hasPending: true,
      paymentId: pending.mpPaymentId ?? '',
      qrCode: pending.pixQrCode,
      qrBase64: pending.pixQrBase64 ?? '',
      expiresAt: pending.pixExpiresAt!.toISOString(),
      credits: pending.pixCredits ?? 0,
      price: pending.amount,
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
    // ENFORCE assinatura HMAC do Mercado Pago (x-signature; secret = MP_WEBHOOK_SECRET).
    // Antes só LOGávamos pra confirmar o formato — webhook forjado poderia ativar
    // premium/créditos falsos. Agora: se o secret tá definido (prod), assinatura
    // ausente ou inválida → 401 (não processa). Sem secret (DEV) segue liberado.
    const sig = req.get('x-signature') || '';
    const rid = req.get('x-request-id') || '';
    const dataId = data?.id;
    if (config.mpWebhookSecret) {
      const tsMatch = sig.match(/ts=(\d+)/);
      const v1Match = sig.match(/v1=([0-9a-f]+)/i);
      const sigOk = !!(tsMatch && v1Match && dataId != null && (() => {
        const template = `id:${dataId};request-id:${rid};ts:${tsMatch![1]}`;
        const expected = crypto.createHmac('sha256', config.mpWebhookSecret).update(template).digest('hex');
        return expected === v1Match![1].toLowerCase();
      })());
      if (!sigOk) {
        console.warn(`[billing] webhook REJEITADO — assinatura inválida/ausente (rid=${rid}, dataId=${dataId})`);
        res.status(401).json({ error: 'assinatura inválida' });
        return;
      }
    } else {
      console.warn('[billing] MP_WEBHOOK_SECRET ausente — webhook sem verificação de assinatura (DEV apenas).');
    }
    const isPayment = type === 'payment' || String(action || '').startsWith('payment');
    if (isPayment && data?.id && hasMercadoPago()) {
      const subscriptionColumns = await getSubscriptionColumnSupport();
      const paymentId = data.id;
      const r = await fetch(`${config.mpApiBaseUrl}/v1/payments/${paymentId}`, { headers: { Authorization: `Bearer ${config.mpAccessToken}` } });
      if (r.ok) {
        const pay: any = await r.json();
        // AUDITORIA: grava o payload bruto do MP no Subscription (admin vê em disputa/reclamação).
        // Captura TODOS os status (approved/pending/rejected/refunded) — não só approved.
        const extRef = String(pay.external_reference ?? '');
        const [subIdRef] = extRef.split('|');
        if (subscriptionColumns.hasRawWebhook && subIdRef && !extRef.startsWith('doctor_sub_')) {
          await prisma.subscription.updateMany({ where: { id: subIdRef }, data: { rawWebhook: pay, mpPaymentId: String(paymentId) } }).catch(() => {});
        }
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
          const sub = await findSubscriptionByIdCompat(subId);
          if (sub && sub.status !== 'APPROVED') {
            if (creditsStr) {
              // PACOTE DE CRÉDITOS
              const credits = Number(creditsStr);
              if (credits > 0) {
                await prisma.$transaction(async (tx) => {
                  await updateSubscriptionCompatWithDb(tx, sub.id, { status: 'APPROVED', mpPaymentId: String(paymentId) });
                  await tx.user.update({ where: { id: sub.userId }, data: { credits: { increment: credits } } });
                  await tx.creditTransaction.create({ data: { userId: sub.userId, delta: credits, kind: 'purchase', label: `Compra de créditos (+${credits})`, refId: sub.id } });
                });
                console.log(`[billing] créditos +${credits} p/ user ${sub.userId} (sub ${sub.id})`);
              }
            } else if (sub.periodDays > 0) {
              // PLANO MENSAL — ativa + concede pacote mensal de créditos (parametrizado em app_settings)
              const expires = new Date(Date.now() + sub.periodDays * 86400000);
              const monthlyCredits = getSettings().grants.monthly;
              await prisma.$transaction(async (tx) => {
                await updateSubscriptionCompatWithDb(tx, sub.id, { status: 'APPROVED', mpPaymentId: String(paymentId) });
                await tx.user.update({ where: { id: sub.userId }, data: { planExpiresAt: expires, credits: { increment: monthlyCredits } } });
                await tx.creditTransaction.create({ data: { userId: sub.userId, delta: monthlyCredits, kind: 'plan_monthly', label: 'Plano Premium (mensal)', refId: sub.id } });
              });
              // FUNDADOR: se essa cobrança foi no preço promocional, consome 1 vaga (condicional ao
              // limite — 2 webhooks simultâneos na última vaga: no máximo 1 incrementa; aprovar a
              // mais é aceitável e documentado). Créditos/vigência não dependem disso.
              const st = getSettings();
              const f = (st as any).founder;
              if (Number(f?.enabled) === 1 && Number(f?.price) > 0 && Math.abs(Number(sub.amount) - Number(f.price)) < 0.001 && Number(f.used) < Number(f.limit)) {
                const claimed = await prisma.appSetting.updateMany({
                  where: { key: 'founder', value: { path: ['used'], lt: Number(f.limit) } },
                  data: { value: { ...f, used: Number(f.used) + 1 } as any },
                }).catch(() => ({ count: 0 }));
                if (claimed.count > 0) {
                  await loadSettings(); // sincroniza o cache em memória com o novo `used`
                  console.log(`[billing] vaga de FUNDADOR consumida (${Number(f.used) + 1}/${f.limit}) — sub ${sub.id}`);
                }
              }
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
