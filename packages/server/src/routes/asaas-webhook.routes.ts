// Webhook público do Asaas — montado em app.ts como POST /api/webhooks/asaas.
// Registro no dashboard Asaas: url https://janocaminho.com.br/minhasaude/api/webhooks/asaas,
// events ["PAYMENT_RECEIVED"] (POST /v3/webhooks — ver asaas-provider p/ payload).
//
// SEGURANÇA (mesma defesa do OpenPix — o payload em si não vem assinado): só aprova
// quando TODOS valem —
//   1. existe Subscription PENDING com mpPaymentId == payment.id ("pay_..." — charge
//      criada por nós; o id nunca é aceito do cliente);
//   2. valor do pagamento (REAIS float → centavos) BATE com o registrado na Subscription;
//   3. idempotente pelo status (reenvio não credita 2x — helper compartilhado MP/OpenPix);
//   4. VERIFICAÇÃO SERVER-SIDE (audit segurança 10/26): o payment é CONFIRMADO na API do
//      Asaas (GET /v3/payments/{id}, status RECEIVED*) antes de aprovar — webhook forjado
//      com payload inventado não passa, o provider é a fonte de verdade (padrão do MP).
// Aprovação = MESMA função dos webhooks MP/OpenPix (utils/billingApproval) — créditos,
// plano e pacote de API seguem idênticos entre provedores.
//
// Payload oficial (prova ao vivo 03/10): { event: "PAYMENT_RECEIVED",
//   payment: { id: "pay_...", value: 5.0 (REAIS float, NÃO centavos), status: "RECEIVED" } }.
// Sem correlationID no payload → o kind (créditos/plano/API) deriva da PRÓPRIA
// Subscription (tag mpPreferenceId='api_pack', periodDays>0, pixCredits) — drift-safe.
import { Router } from 'express';
import { prisma } from '../prisma';
import { config, hasAsaas } from '../config';
import { approvePendingSubscription } from '../utils/billingApproval';
import { getSubscriptionColumnSupport } from '../utils/subscriptionCompat';

const router = Router();

// Status do Asaas que representam dinheiro RECEBIDO (PAYMENT_RECEIVED dispara com RECEIVED;
// os demais são variantes aceitas por segurança — o evento continua sendo o filtro principal).
const RECEIVED_STATUSES = new Set(['RECEIVED', 'RECEIVED_IN_CASH', 'CONFIRMED', 'DETERMINED']);

router.post('/asaas', async (req, res) => {
  try {
    const body = req.body ?? {};
    const payment = body.payment ?? {};
    const paymentId = String(payment.id ?? '');
    const event = String(body.event ?? '');
    const status = String(payment.status ?? '').toUpperCase();
    const valueCents = Math.round(Number(payment.value ?? 0) * 100); // Asaas: REAIS float

    if (!paymentId) {
      res.status(200).json({ ok: true, ignored: 'sem payment.id' });
      return;
    }
    // Só evento de DINHEIRO RECEBIDO interessa (PAYMENT_CREATED/UPDATED etc. → ack sem efeito).
    // Aceita pelo evento (PAYMENT_RECEIVED*) OU pelo status RECEIVED* (mesma leniência
    // defensiva do webhook OpenPix — combinação "evento não-recebido + status recebido"
    // não existe na prática).
    const isReceived = event.startsWith('PAYMENT_RECEIVED') || RECEIVED_STATUSES.has(status);
    if (!isReceived) {
      res.status(200).json({ ok: true, ignored: `event=${event || status || '?'}` });
      return;
    }

    const support = await getSubscriptionColumnSupport();
    const sub = await prisma.subscription.findFirst({
      where: { mpPaymentId: paymentId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        userId: true,
        amount: true,
        periodDays: true,
        mpPreferenceId: true,
        status: true,
        ...(support.hasPixResume ? { pixCredits: true } : {}), // drift-safe: coluna pode não existir
      },
    });
    if (!sub) {
      // payment.id inexistente: 200-ack "ignorado" (não 404 — evita ciclo de retry do Asaas)
      console.warn(`[asaas-webhook] payment.id desconhecido — ignorado (${paymentId})`);
      res.status(200).json({ ok: true, ignored: 'payment.id desconhecido' });
      return;
    }
    if (sub.status !== 'PENDING') {
      // idempotência: já aprovada/cancelada → ack sem re-creditar
      console.log(`[asaas-webhook] sub ${sub.id} já ${sub.status} — ignorado (${paymentId})`);
      res.status(200).json({ ok: true, ignored: `status=${sub.status}` });
      return;
    }
    const expectedCents = Math.round(Number(sub.amount) * 100);
    if (!Number.isFinite(valueCents) || valueCents !== expectedCents) {
      console.warn(`[asaas-webhook] valor divergente — RECUSADO (${paymentId}: ${valueCents} ≠ ${expectedCents} esperados)`);
      res.status(200).json({ ok: true, ignored: 'valor divergente' });
      return;
    }

    // VERIFICAÇÃO SERVER-SIDE (audit #1 — webhook público e sem assinatura): confirma na
    // API do Asaas que o pagamento REALMENTE foi recebido antes de aprovar. Payload forjado
    // não existe no provider → 400. Sem API key não há como confirmar → falha FECHADA
    // (nunca aprova às cegas — em prod a key existe sempre que um payment foi criado).
    if (!hasAsaas()) {
      console.warn('[asaas-webhook] ASAAS_API_KEY ausente — impossível verificar no provider, RECUSADO.');
      res.status(400).json({ error: 'Pagamento não confirmado no provider.' });
      return;
    }
    let providerPayment: { status?: string } | null = null;
    try {
      const r = await fetch(`${config.asaasApiBaseUrl}/v3/payments/${encodeURIComponent(paymentId)}`, {
        headers: { access_token: config.asaasApiKey }, // SEM Bearer — header direto (asaas-provider)
      });
      providerPayment = r.ok ? ((await r.json().catch(() => null)) as { status?: string } | null) : null;
    } catch { /* provider fora do ar → tratado como NÃO confirmado (fail closed) */ }
    if (!providerPayment?.status || !RECEIVED_STATUSES.has(String(providerPayment.status).toUpperCase())) {
      console.warn(`[asaas-webhook] pagamento NÃO confirmado no provider — RECUSADO (${paymentId})`);
      res.status(400).json({ error: 'Pagamento não confirmado no provider.' });
      return;
    }

    // Kind derivado da PRÓPRIA Subscription (payload Asaas NÃO traz correlationID):
    //   mpPreferenceId='api_pack' → pacote de CHAMADAS; periodDays>0 → plano mensal;
    //   senão → pacote de CRÉDITOS (pixCredits gravado na compra; sem a coluna o helper
    //   aprova NADA — approvePendingSubscription recusa credits/calls <= 0, sem crédito errado).
    const pixCredits = (sub as any).pixCredits ?? null;
    const kind =
      sub.mpPreferenceId === 'api_pack'
        ? { type: 'api' as const, calls: pixCredits ?? 0 }
        : sub.periodDays > 0
          ? { type: 'plan' as const }
          : { type: 'credits' as const, credits: pixCredits ?? 0 };

    const approved = await approvePendingSubscription(sub.id, kind, paymentId);
    console.log(`[asaas-webhook] ${approved ? 'aprovado' : 'não aprovado (sem efeito)'} — ${paymentId} → sub ${sub.id} (${kind.type})`);
    res.status(200).json({ ok: true, approved });
  } catch (e) {
    console.error('[asaas-webhook] erro:', (e as Error).message);
    res.status(200).json({ ok: true }); // sempre 200 pro Asaas não entrar em loop de retry
  }
});

export default router;
