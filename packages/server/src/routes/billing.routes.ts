import { Router } from 'express';
import crypto from 'crypto';
import { prisma } from '../prisma';
import { config, hasMercadoPago, hasAsaas } from '../config';
import { requireAuth, AuthedRequest, userPatientIds } from '../middleware/auth';
import { CREDIT_COSTS, UPLOAD_RULES } from '../utils/credits';
import { getSettings, getMonthlyPlan, getEffectivePlanPrice, getCreditPacks, getPremiumPerks } from '../utils/settings';
import { createSubscriptionCompat, getSubscriptionColumnSupport, updateSubscriptionCompat } from '../utils/subscriptionCompat';
import { createPixCharge, activePixProvider, pixProviderReady, type PixChargeResult } from '../payments/pix-provider';
import { cancelStalePendingPixes } from '../jobs/pix-expiry';
import { approvePendingSubscription, type ApprovalKind } from '../utils/billingApproval';
import { createAsaasCardCharge, AsaasApiError } from '../payments/asaas-provider';
import { validateCardCharge, cardLast4, onlyDigits } from '../utils/card-validation';
import { decryptPII } from '../utils/crypto';

/** CPF do pagador (paciente TITULAR da conta, descriptografado) — o Asaas exige CPF
 *  no customer p/ cobrança PIX (400 invalid_object sem ele, provado em prod 04/10).
 *  Undefined = sem CPF no cadastro → o provider pula o Asaas e o fallback assume. */
async function payerCpfFor(userId: string): Promise<string | undefined> {
  const titular = await prisma.patient.findFirst({
    where: { ownerId: userId, relationship: 'Titular' },
    select: { cpfEncrypted: true, cpfIv: true },
  });
  return decryptPII(titular?.cpfEncrypted, titular?.cpfIv) ?? undefined;
}

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
    pixProvider: activePixProvider(), // 'mp' | 'openpix' | 'asaas' — diagnóstico (toggle PAYMENT_PROVIDER)
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

// QUIZ DE BOAS-VINDAS — recompensa por responder "o que você quer entender?" (GoalQuiz).
// Anti-farm: 1x por USUÁRIO — o próprio ledger é a guarda (kind='quiz' atômico no $transaction).
// Valor editável no admin (AppSetting grants.quiz; 0 = desliga).
router.post('/quiz-reward', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const userId = req.userId!;
    const amount = Math.max(0, Number(getSettings().grants?.quiz ?? 5));
    if (amount === 0) { res.json({ ok: false, already: false, amount: 0 }); return; }
    let granted = false;
    await prisma.$transaction(async (tx) => {
      const dup = await tx.creditTransaction.findFirst({ where: { userId, kind: 'quiz' }, select: { id: true } });
      if (dup) return;
      await tx.user.update({ where: { id: userId }, data: { credits: { increment: amount } } });
      await tx.creditTransaction.create({ data: { userId, delta: amount, kind: 'quiz', label: 'Quiz de boas-vindas' } });
      granted = true;
    });
    res.json({ ok: granted, already: !granted, amount });
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
// LOCK 1-POR-VEZ (dono 03/10): existe PIX PENDING não-expirado → 409 com o PIX
// pendente (QR/timer) — o front REABRE o modal com o mesmo código. O usuário NÃO
// compra outro pack (nem por cartão) enquanto o PIX atual vive.
router.post('/buy-credits', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    // Gate por provider: PIX usa o ativo (mp|openpix|asaas); cartão/débito exigem MP abaixo.
    if (!pixProviderReady()) { res.status(503).json({ error: 'Pagamentos não configurados.' }); return; }
    const subscriptionColumns = await getSubscriptionColumnSupport();
    const pack = packById(String(req.body?.pack ?? ''));
    if (!pack) { res.status(400).json({ error: 'Pacote inválido' }); return; }
    const method = String(req.body?.method ?? 'pix').toLowerCase(); // pix | card | debit
    const user = await prisma.user.findUnique({ where: { id: req.userId! } });
    if (!user) { res.status(404).json({ error: 'Usuário não encontrado' }); return; }

    // ===== LOCK (PIX de créditos): 1 PIX pendente por vez — vale p/ QUALQUER método =====
    if (subscriptionColumns.hasPixResume) {
      // Rede de segurança: PIX órfão >24h vira CANCELLED antes do lock (job boot/1h
      // normalmente já pegou — aqui cobre a janela até a próxima varredura).
      await cancelStalePendingPixes().catch(() => {}); // não bloqueia a compra se falhar
      const existing = await prisma.subscription.findFirst({
        where: {
          userId: user.id, status: 'PENDING', periodDays: 0, pixExpiresAt: { gt: new Date() },
          // Só PIX de CRÉDITOS trava compra de créditos (o de API é marcado api_pack).
          OR: [{ mpPreferenceId: null }, { mpPreferenceId: { not: 'api_pack' } }],
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true, mpPaymentId: true, pixQrCode: true, pixQrBase64: true, pixExpiresAt: true, pixCredits: true, amount: true },
      });
      if (existing?.pixQrCode && existing?.pixQrBase64 && existing?.pixExpiresAt) {
        // Mesmo PIX, mesmo QR, mesmo timer — SEM criar ordem nova. 409 = front reabre o modal.
        res.status(409).json({
          error: 'Você já tem um PIX pendente. Conclua o pagamento ou aguarde expirar.',
          pendingPix: {
            id: existing.id,
            paymentId: existing.mpPaymentId ?? '',
            qrCode: existing.pixQrCode,
            qrBase64: existing.pixQrBase64,
            expiresAt: existing.pixExpiresAt.toISOString(),
            credits: existing.pixCredits ?? pack.credits,
            price: existing.amount,
          },
        });
        return;
      }
      if (existing) {
        // PENDING vivo SEM QR (ordem quebrada) → inútil: cancela e segue a compra.
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
      // OpenPix é PIX-ONLY: cartão/débito seguem no MP até provedor de cartão entrar.
      if (!hasMercadoPago()) { res.status(503).json({ error: 'Cartão/débito indisponível (Mercado Pago não configurado).' }); return; }
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

    // PIX — QR Code inline (copia-cola + countdown). Provider abstraído em
    // payments/pix-provider (env PAYMENT_PROVIDER: 'mp' default | 'openpix' — toggle
    // da suspensão do MP 02/10). Cartão/débito seguem no MP acima (OpenPix é PIX-only).
    const correlationID = `credits_${sub.id}_${pack.credits}`; // webhook OpenPix casa por mpPaymentId
    let charge: PixChargeResult;
    try {
      charge = await createPixCharge({
        amountBrlCents: Math.round(pack.price * 100),
        correlationID,
        externalReference, // MP: subId|credits — webhook MP depende deste formato
        description: `Dr. Exame — ${pack.credits} créditos de IA para análise de exames`,
        payerEmail: user.email,
        payerFirstName: (user.name || 'Cliente').split(' ')[0],
        userId: user.id, // Asaas: cache de customer (cus_*) por usuário
        payerName: user.name || undefined, // Asaas: customer com nome real
        payerCpfCnpj: await payerCpfFor(user.id), // Asaas PIX exige CPF no customer
        expiresAt: expires,
        notificationUrl: publicNotifyUrl(),
      });
    } catch (e) {
      console.error('[buy-credits] PIX falhou (' + activePixProvider() + '):', (e as Error).message);
      await updateSubscriptionCompat(sub.id, { status: 'FAILED' });
      res.status(503).json({ error: 'Pagamento indisponível no momento — tente novamente em alguns minutos. Se persistir, fale com o suporte.' });
      return;
    }
    console.log('[buy-credits] PIX criado:', charge.id, '| provider:', activePixProvider(), '| tem QR img:', !!charge.qrBase64);
    // qrBase64 pode vir null (OpenPix best-effort) — o front mostra o copia-e-cola.
    const qrImg = charge.qrBase64 ? (charge.qrBase64.startsWith('data:') ? charge.qrBase64 : `data:image/png;base64,${charge.qrBase64}`) : '';
    // PERSISTE QR + expiry na Subscription: é o que permite RETOMAR o mesmo PIX
    // quando o usuário sai e volta (padrão gateway — sem criar ordem órfã).
    if (subscriptionColumns.hasPixResume) {
      await updateSubscriptionCompat(sub.id, {
        mpPaymentId: charge.id, // id externo genérico (MP payment id | OpenPix correlationID)
        pixQrCode: charge.qrCode,
        pixQrBase64: qrImg,
        pixExpiresAt: expires,
        pixCredits: pack.credits,
      });
    } else {
      await updateSubscriptionCompat(sub.id, { mpPaymentId: charge.id });
    }
    res.json({
      paymentId: charge.id,
      qrCode: charge.qrCode,
      qrBase64: qrImg,
      expiresAt: expires.toISOString(),
      credits: pack.credits,
      price: pack.price,
    });
  } catch (e) { next(e); }
});

// ===== CARTÃO INLINE (Asaas direto — SEM redirect Checkout Pro) =====
// POST /billing/pay-card { pack, method: 'card'|'debit', card, holder }
// Form próprio do app → server valida (Luhn/validade/CVV/CPF server-side, nunca só
// no client) → createAsaasCardCharge (billingType CREDIT_CARD | DEBIT_CARD).
//   CONFIRMED → aprova NA HORA (mesma approvePendingSubscription dos webhooks);
//   PENDING   → 3DS/análise: devolve threeDSUrl se o Asaas mandar, senão o front
//               aguarda o webhook /api/webhooks/asaas (poll em payment-status).
// SEGURANÇA: PAN/CVV NUNCA logados (log só ****últimos4), NUNCA persistidos (nada em
// Subscription/auditLog), CVV nunca ecoado na resposta. Rate limit 3/min por usuário
// (Map em memória, mesmo padrão do OTP — keyed por userId, não por IP de proxy).

const payCardAttempts = new Map<string, number[]>(); // userId → timestamps (ms) na janela
const PAY_CARD_WINDOW_MS = 60_000;
const PAY_CARD_MAX = 3;

function payCardRateLimited(userId: string): boolean {
  const now = Date.now();
  const hits = (payCardAttempts.get(userId) ?? []).filter((t) => now - t < PAY_CARD_WINDOW_MS);
  if (hits.length >= PAY_CARD_MAX) {
    payCardAttempts.set(userId, hits);
    return true;
  }
  hits.push(now);
  payCardAttempts.set(userId, hits);
  return false;
}

router.post('/pay-card', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    if (!hasAsaas()) { res.status(503).json({ error: 'Cartão indisponível (Asaas não configurado).' }); return; }
    if (payCardRateLimited(req.userId!)) { res.status(429).json({ error: 'Muitas tentativas. Aguarde 1 minuto.' }); return; }

    const pack = packById(String(req.body?.pack ?? ''));
    if (!pack) { res.status(400).json({ error: 'Pacote inválido' }); return; }
    const method = String(req.body?.method ?? 'card').toLowerCase() === 'debit' ? 'debit' : 'card';
    const billingType = method === 'debit' ? 'DEBIT_CARD' as const : 'CREDIT_CARD' as const;

    const user = await prisma.user.findUnique({ where: { id: req.userId! } });
    if (!user) { res.status(404).json({ error: 'Usuário não encontrado' }); return; }

    // Validação SERVER-SIDE (Luhn, validade futura, CVV, CPF, CEP/nº) — o front valida
    // também, mas aqui é a barreira real. Erros já em PT-BR p/ exibir direto no form.
    const card = req.body?.card ?? {};
    const holder = req.body?.holder ?? {};
    const errs = validateCardCharge(card, holder, { address: true });
    if (errs.length) { res.status(400).json({ error: errs[0], errors: errs }); return; }

    // LOCK 1-por-vez (mesma regra do buy-credits): PIX PENDING vivo trava cartão também.
    const subscriptionColumns = await getSubscriptionColumnSupport();
    if (subscriptionColumns.hasPixResume) {
      await cancelStalePendingPixes().catch(() => {});
      const existing = await prisma.subscription.findFirst({
        where: {
          userId: user.id, status: 'PENDING', periodDays: 0, pixExpiresAt: { gt: new Date() },
          OR: [{ mpPreferenceId: null }, { mpPreferenceId: { not: 'api_pack' } }],
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true, mpPaymentId: true, pixQrCode: true, pixQrBase64: true, pixExpiresAt: true, pixCredits: true, amount: true },
      });
      if (existing?.pixQrCode && existing?.pixQrBase64 && existing?.pixExpiresAt) {
        res.status(409).json({
          error: 'Você já tem um PIX pendente. Conclua o pagamento ou aguarde expirar.',
          pendingPix: {
            id: existing.id, paymentId: existing.mpPaymentId ?? '', qrCode: existing.pixQrCode,
            qrBase64: existing.pixQrBase64, expiresAt: existing.pixExpiresAt.toISOString(),
            credits: existing.pixCredits ?? pack.credits, price: existing.amount,
          },
        });
        return;
      }
      if (existing) await updateSubscriptionCompat(existing.id, { status: 'CANCELLED' });
      await prisma.subscription.updateMany({
        where: { userId: user.id, status: 'PENDING', periodDays: 0, pixExpiresAt: { lt: new Date() } },
        data: { status: 'CANCELLED' },
      });
    }
    // Cartão/débito PENDING sem webhook há >30 min = abandonado → CANCELLED.
    await prisma.subscription.updateMany({
      where: { userId: user.id, status: 'PENDING', createdAt: { lt: new Date(Date.now() - 30 * 60 * 1000) } },
      data: { status: 'CANCELLED' },
    }).catch(() => {});

    const sub = await createSubscriptionCompat({ userId: user.id, amount: pack.price, periodDays: 0, status: 'PENDING' });
    const externalReference = `${sub.id}|${pack.credits}`; // mesmo contrato do MP (dashboard Asaas legível)

    let charge;
    try {
      charge = await createAsaasCardCharge({
        amountBrlCents: Math.round(pack.price * 100),
        correlationID: externalReference,
        description: `Dr. Exame — ${pack.credits} créditos de IA`,
        userId: user.id,
        userName: user.name ?? undefined,
        userEmail: user.email,
        payerCpfCnpj: onlyDigits(holder.cpf),
        billingType,
        creditCard: {
          number: onlyDigits(card.number),
          holderName: String(card.holderName ?? '').trim().toUpperCase(),
          expiryMonth: String(card.expiryMonth ?? '').padStart(2, '0'),
          expiryYear: String(card.expiryYear ?? '').length === 2 ? `20${card.expiryYear}` : String(card.expiryYear ?? ''),
          ccv: onlyDigits(card.ccv),
        },
        creditCardHolder: {
          name: String(holder.name ?? '').trim(),
          email: user.email,
          cpfCnpj: onlyDigits(holder.cpf),
          postalCode: onlyDigits(holder.postalCode),
          addressNumber: String(holder.addressNumber ?? '').trim() || undefined,
          phone: onlyDigits(holder.phone) || undefined,
        },
      });
    } catch (e) {
      // Asaas recusou (cartão inválido, CVV errado, limite etc.) → 400 com a razão
      // legível. Log SANITIZADO: só últimos 4 do PAN — número completo/CVV nunca.
      if (e instanceof AsaasApiError) {
        console.warn(`[pay-card] Asaas recusou (****${cardLast4(card.number)}, ${billingType}): ${e.status} ${e.errors[0]?.code ?? ''} — ${e.message}`);
        await updateSubscriptionCompat(sub.id, { status: 'FAILED' });
        const friendly = e.status === 400
          ? (e.message || 'Cartão recusado. Confira os dados e tente novamente.')
          : 'Não foi possível processar o pagamento agora. Tente novamente em instantes.';
        res.status(e.status === 400 ? 400 : 502).json({ error: friendly });
        return;
      }
      console.error(`[pay-card] erro inesperado (****${cardLast4(card.number)}):`, (e as Error).message);
      await updateSubscriptionCompat(sub.id, { status: 'FAILED' });
      res.status(503).json({ error: 'Pagamento indisponível no momento — tente novamente em alguns minutos.' });
      return;
    }

    // Registra o payment ANTES de aprovar: o webhook do Asaas (PAYMENT_RECEIVED pode
    // disparar em segundos no cartão) casa por mpPaymentId e credita por pixCredits.
    if (subscriptionColumns.hasPixResume) {
      await updateSubscriptionCompat(sub.id, { mpPaymentId: charge.paymentId, pixCredits: pack.credits });
    } else {
      await updateSubscriptionCompat(sub.id, { mpPaymentId: charge.paymentId });
    }

    // CONFIRMED = capturado na hora → aprova com o MESMO helper dos webhooks (créditos
    // + transação, idempotente pelo status). PENDING = 3DS/análise antifraude → o front
    // mostra o 3DS (se veio URL) ou aguarda webhook/poll.
    const confirmed = charge.status === 'CONFIRMED' || charge.status === 'RECEIVED' || charge.status === 'DETERMINED';
    if (confirmed) {
      await approvePendingSubscription(sub.id, { type: 'credits', credits: pack.credits }, charge.paymentId);
      console.log(`[pay-card] aprovado — ${charge.paymentId} (****${cardLast4(card.number)}, ${billingType}) +${pack.credits} créditos`);
      res.json({ paymentId: charge.paymentId, status: 'CONFIRMED', approved: true, credits: pack.credits });
      return;
    }
    console.log(`[pay-card] pendente — ${charge.paymentId} (****${cardLast4(card.number)}, ${billingType}, 3DS: ${charge.threeDSUrl ? 'sim' : 'não'})`);
    res.json({ paymentId: charge.paymentId, status: 'PENDING', approved: false, credits: pack.credits, threeDSUrl: charge.threeDSUrl });
  } catch (e) { next(e); }
});

// COMPRA DE PACOTE DE CHAMADAS DE API (Fase 2 — parceiros): mesmo fluxo MP de buy-credits
// (PIX QR inline / Checkout Pro cartão+débito), mas external_reference `subId|calls|API` —
// o webhook distingue pelo 3º segmento e credita CHAMADAS (kind api_pack), não créditos de IA.
// ANTI-DUPLICAÇÃO igual ao buy-credits: PIX ainda válido → devolve o MESMO QR (sem ordem
// nova no MP); expirado → CANCELLED e ordem nova. Timer de 5 min. A ordem de API é marcada
// em rawWebhook {kind:'api_pack'} — é o que separa o PIX de API do PIX de créditos na retomada.
const API_PIX_TTL_MS = 5 * 60 * 1000;

router.post('/buy-api-pack', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    // Gate por provider (igual buy-credits): PIX no provider ativo (mp|openpix|asaas); cartão exige MP.
    if (!pixProviderReady()) { res.status(503).json({ error: 'Pagamentos não configurados.' }); return; }
    const packs = (getSettings().apiAccess?.packs ?? []) as { id: string; calls: number; price: number; label: string }[];
    const pack = packs.find((p) => p.id === String(req.body?.pack ?? ''));
    if (!pack) { res.status(400).json({ error: 'Pacote de API inválido' }); return; }
    const method = String(req.body?.method ?? 'pix').toLowerCase();
    const user = await prisma.user.findUnique({ where: { id: req.userId! } });
    if (!user) { res.status(404).json({ error: 'Usuário não encontrado' }); return; }
    const subscriptionColumns = await getSubscriptionColumnSupport();
    // TAG da ordem de API = mpPreferenceId 'api_pack' (mesmo padrão do marcador referral_ do
    // auth). NÃO usar rawWebhook: o MP dispara WEBHOOK JÁ NA CRIAÇÃO do PIX (status pending)
    // e o handler sobrescreve rawWebhook com o payload — a tag sumia e a retomada não achava
    // o PIX (bug visto em prod). mpPreferenceId: nem o PIX nem o webhook jamais escrevem nele.
    const apiTag = { mpPreferenceId: 'api_pack' as const };

    if (method === 'pix' && subscriptionColumns.hasPixResume) {
      // RETOMA: PIX de API ainda válido → mesmo QR, mesmo timer, ZERO ordem nova.
      const existing = await prisma.subscription.findFirst({
        where: { userId: user.id, status: 'PENDING', periodDays: 0, pixExpiresAt: { gt: new Date() }, ...apiTag },
        orderBy: { createdAt: 'desc' },
      });
      if (existing?.pixQrCode && existing?.pixQrBase64 && existing?.pixExpiresAt) {
        res.json({
          paymentId: existing.mpPaymentId ?? '',
          qrCode: existing.pixQrCode,
          qrBase64: existing.pixQrBase64,
          expiresAt: existing.pixExpiresAt.toISOString(),
          calls: existing.pixCredits ?? pack.calls,
          price: existing.amount,
          resumed: true,
        });
        return;
      }
      // Expirou: cancela órfãos de API — sem acumular ordens.
      await prisma.subscription.updateMany({
        where: { userId: user.id, status: 'PENDING', periodDays: 0, pixExpiresAt: { lt: new Date() }, ...apiTag },
        data: { status: 'CANCELLED' },
      });
    }

    const sub = await createSubscriptionCompat({ userId: user.id, amount: pack.price, periodDays: 0, status: 'PENDING' });
    await updateSubscriptionCompat(sub.id, { mpPreferenceId: 'api_pack' }); // marca ANTES de chamar o MP
    const externalReference = `${sub.id}|${pack.calls}|API`;
    const expires = new Date(Date.now() + API_PIX_TTL_MS); // 5 min (créditos usam 10)
    const base = (process.env.WEB_BASE_PATH ?? '').replace(/\/$/, '');
    const origin = process.env.WEB_ORIGIN || '';

    if (method !== 'pix') {
      // CARTÃO/DÉBITO — segue MP (OpenPix é PIX-only).
      if (!hasMercadoPago()) { res.status(503).json({ error: 'Cartão/débito indisponível (Mercado Pago não configurado).' }); return; }
      const prefResp = await fetch(`${config.mpApiBaseUrl}/checkout/preferences`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.mpAccessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{ id: pack.id, title: `Dr. Exame API — ${pack.label} (${pack.calls.toLocaleString('pt-BR')} chamadas)`, quantity: 1, unit_price: pack.price, currency_id: 'BRL' }],
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
        console.error('[billing] MP Checkout Pro (API pack) falhou:', prefResp.status);
        await updateSubscriptionCompat(sub.id, { status: 'FAILED' });
        res.status(502).json({ error: 'Falha ao abrir o pagamento no Mercado Pago.' });
        return;
      }
      const pref: any = await prefResp.json();
      res.json({ init_point: pref.init_point ?? pref.sandbox_init_point, calls: pack.calls, price: pack.price });
      return;
    }

    // PIX via provider abstraído (PAYMENT_PROVIDER=mp|openpix — OpenPix é PIX-only).
    const correlationID = `api_${sub.id}_${pack.calls}`; // webhook OpenPix casa por mpPaymentId
    let charge: PixChargeResult;
    try {
      charge = await createPixCharge({
        amountBrlCents: Math.round(pack.price * 100),
        correlationID,
        externalReference, // MP: subId|calls|API — webhook MP depende deste formato
        description: `Dr. Exame API — ${pack.label}: ${pack.calls} chamadas`,
        payerEmail: user.email,
        payerFirstName: (user.name || 'Parceiro').split(' ')[0],
        userId: user.id, // Asaas: cache de customer (cus_*) por usuário
        payerName: user.name || undefined, // Asaas: customer com nome real
        payerCpfCnpj: await payerCpfFor(user.id), // Asaas PIX exige CPF no customer
        expiresAt: expires,
        notificationUrl: publicNotifyUrl(),
      });
    } catch (e) {
      console.error('[buy-api-pack] PIX falhou (' + activePixProvider() + '):', (e as Error).message);
      await updateSubscriptionCompat(sub.id, { status: 'FAILED' });
      res.status(503).json({ error: 'Pagamento indisponível no momento — tente novamente em alguns minutos. Se persistir, fale com o suporte.' });
      return;
    }
    console.log('[buy-api-pack] PIX criado:', charge.id, '| provider:', activePixProvider(), '| tem QR img:', !!charge.qrBase64);
    const qrImg = charge.qrBase64 ? (charge.qrBase64.startsWith('data:') ? charge.qrBase64 : `data:image/png;base64,${charge.qrBase64}`) : '';
    if (subscriptionColumns.hasPixResume) {
      await updateSubscriptionCompat(sub.id, { mpPaymentId: charge.id, pixQrCode: charge.qrCode, pixQrBase64: qrImg, pixExpiresAt: expires, pixCredits: pack.calls });
    } else {
      await updateSubscriptionCompat(sub.id, { mpPaymentId: charge.id });
    }
    res.json({ paymentId: charge.id, qrCode: charge.qrCode, qrBase64: qrImg, expiresAt: expires.toISOString(), calls: pack.calls, price: pack.price });
  } catch (e) { next(e); }
});

// PIX DE API PENDENTE (retomada no painel #/api): existe PIX de pacote válido → devolve QR
// + timer restante. Mesmo contrato do pending-payment de créditos. Filtro pelo marcador
// mpPreferenceId='api_pack' — imune ao webhook que sobrescreve rawWebhook na criação do PIX.
router.get('/pending-api-pack', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const subscriptionColumns = await getSubscriptionColumnSupport();
    if (!subscriptionColumns.hasPixResume) { res.json({ hasPending: false }); return; }
    const pending = await prisma.subscription.findFirst({
      where: { userId: req.userId!, status: 'PENDING', periodDays: 0, pixExpiresAt: { gt: new Date() }, mpPreferenceId: 'api_pack' },
      orderBy: { createdAt: 'desc' },
    });
    if (!pending?.pixQrCode || !pending.pixQrBase64) { res.json({ hasPending: false }); return; }
    res.json({
      hasPending: true,
      qrCode: pending.pixQrCode,
      qrBase64: pending.pixQrBase64,
      expiresAt: pending.pixExpiresAt!.toISOString(),
      calls: pending.pixCredits ?? 0,
      price: pending.amount,
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
      where: {
        userId: req.userId!, status: 'PENDING', periodDays: 0, pixExpiresAt: { gt: new Date() },
        // Só PIX de CRÉDITOS (o de pacote de API é marcado api_pack — tem endpoint próprio).
        OR: [{ mpPreferenceId: null }, { mpPreferenceId: { not: 'api_pack' } }],
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
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
      id: pending.id, // p/ cancelar manualmente (DELETE /billing/pending/:id)
      paymentId: pending.mpPaymentId ?? '',
      qrCode: pending.pixQrCode,
      qrBase64: pending.pixQrBase64 ?? '',
      expiresAt: pending.pixExpiresAt!.toISOString(),
      credits: pending.pixCredits ?? 0,
      price: pending.amount,
    });
  } catch (e) { next(e); }
});

// CANCELAR PIX pendente (manual — dono 03/10): usuário desiste do pack atual e
// quer comprar outro sem esperar o expiry. Só o PRÓPRIO usuário, só PENDING de
// créditos (periodDays=0) → CANCELLED. Idempotente por natureza (2ª vez = 404).
router.delete('/pending/:id', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const sub = await prisma.subscription.findFirst({
      where: { id: String(req.params.id ?? ''), userId: req.userId!, status: 'PENDING', periodDays: 0 },
      select: { id: true },
    });
    if (!sub) { res.status(404).json({ error: 'PIX pendente não encontrado.' }); return; }
    await updateSubscriptionCompat(sub.id, { status: 'CANCELLED' });
    res.json({ ok: true, id: sub.id, status: 'CANCELLED' });
  } catch (e) { next(e); }
});

// Status de um pagamento (polling do frontend: modal PIX e tela 3DS do cartão).
// 1º olha a Subscription LOCAL (mpPaymentId = id externo — pay_*/correlationID): o
// cartão inline (pay-card) e os providers OpenPix/Asaas atualizam por webhook, e isso
// vale INDEPENDENTE do PAYMENT_PROVIDER da vez. Só consulta a API do MP quando não há
// ordem local (legado Checkout Pro / PIX MP — lá o webhook nem sempre chega antes).
router.get('/payment-status/:id', requireAuth, async (req, res, next) => {
  try {
    const sub = await prisma.subscription.findFirst({
      where: { userId: (req as AuthedRequest).userId!, mpPaymentId: String(req.params.id) },
      orderBy: { createdAt: 'desc' },
      select: { status: true },
    });
    if (sub) {
      const approved = sub.status === 'APPROVED';
      res.json({ status: approved ? 'approved' : String(sub.status ?? 'pending').toLowerCase(), approved });
      return;
    }
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
          // Mensal/pacotes: MESMA aprovação do webhook OpenPix (helper compartilhado em
          // utils/billingApproval — extraída daqui na migração PIX→OpenPix 02/10).
          const [subId, creditsStr, marker] = String(pay.external_reference).split('|');
          const kind: ApprovalKind = marker === 'API' && creditsStr
            ? { type: 'api', calls: Number(creditsStr) }
            : creditsStr
              ? { type: 'credits', credits: Number(creditsStr) }
              : { type: 'plan' };
          await approvePendingSubscription(subId, kind, String(paymentId));
        }
      }
    }
  } catch (e) {
    console.error('[billing] webhook erro:', (e as Error).message);
  }
  res.status(200).json({ ok: true }); // sempre 200 pro MP
});

export default router;
