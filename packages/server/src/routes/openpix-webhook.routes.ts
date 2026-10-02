// Webhook público do OpenPix (PIX) — montado em app.ts como POST /api/webhooks/openpix.
// Registro no dashboard OpenPix: https://janocaminho.com.br/meus-exames/api/webhooks/openpix
//
// SEGURANÇA (OpenPix NÃO tem assinatura HMAC nativa): só aprova quando TODOS valem —
//   1. existe Subscription PENDING com mpPaymentId == correlationID (charge criada por nós;
//      correlationID gerado no server, nunca aceito do cliente);
//   2. valor do pagamento (centavos) BATE com o registrado na Subscription;
//   3. idempotente pelo status (reenvio não credita 2x — helper compartilhado com o MP).
// Aprovação = MESMA função do webhook MP (utils/billingApproval) — créditos, plano e
// pacote de API seguem idênticos entre provedores.
//
// Payload oficial (evento de pagamento): { event, charge: { correlationID, status, value },
// payment: { correlationID?, status, value }, ... } — parse defensivo em várias formas.
import { Router } from 'express';
import { prisma } from '../prisma';
import { approvePendingSubscription } from '../utils/billingApproval';
import { getSubscriptionColumnSupport } from '../utils/subscriptionCompat';

const router = Router();

router.post('/openpix', async (req, res) => {
  try {
    const body = req.body ?? {};
    const charge = body.charge ?? {};
    const payment = body.payment ?? {};
    const correlationID = String(charge.correlationID ?? payment.correlationID ?? body.correlationID ?? '');
    const status = String(charge.status ?? payment.status ?? body.status ?? '').toUpperCase();
    const valueCents = Number(payment.value ?? charge.value ?? body.value ?? 0);

    if (!correlationID) {
      res.status(200).json({ ok: true, ignored: 'sem correlationID' });
      return;
    }
    // Só evento concluído interessa (CHARGE_COMPLETED); demais status → ack sem efeito.
    if (status && status !== 'COMPLETED') {
      res.status(200).json({ ok: true, ignored: `status=${status}` });
      return;
    }

    const support = await getSubscriptionColumnSupport();
    const sub = await prisma.subscription.findFirst({
      where: { mpPaymentId: correlationID },
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
      // correlationID inexistente: 200-ack "ignorado" (não 404 — evita ciclo de retry do OpenPix)
      console.warn(`[openpix-webhook] correlationID desconhecido — ignorado (${correlationID})`);
      res.status(200).json({ ok: true, ignored: 'correlationID desconhecido' });
      return;
    }
    if (sub.status !== 'PENDING') {
      // idempotência: já aprovada/cancelada → ack sem re-creditar
      console.log(`[openpix-webhook] sub ${sub.id} já ${sub.status} — ignorado (${correlationID})`);
      res.status(200).json({ ok: true, ignored: `status=${sub.status}` });
      return;
    }
    const expectedCents = Math.round(Number(sub.amount) * 100);
    if (!Number.isFinite(valueCents) || valueCents !== expectedCents) {
      console.warn(`[openpix-webhook] valor divergente — RECUSADO (${correlationID}: ${valueCents} ≠ ${expectedCents} esperados)`);
      res.status(200).json({ ok: true, ignored: 'valor divergente' });
      return;
    }

    // correlationID: credits_<subId>_<n> | api_<subId>_<n> — count é fallback se pixCredits faltar
    const countFromCorrelation = Number(String(correlationID).split('_')[2] ?? 0);
    const pixCredits = (sub as any).pixCredits ?? null;
    const kind =
      sub.mpPreferenceId === 'api_pack'
        ? { type: 'api' as const, calls: pixCredits ?? countFromCorrelation }
        : sub.periodDays > 0
          ? { type: 'plan' as const }
          : { type: 'credits' as const, credits: pixCredits ?? countFromCorrelation };

    const approved = await approvePendingSubscription(sub.id, kind, correlationID);
    console.log(`[openpix-webhook] ${approved ? 'aprovado' : 'não aprovado (sem efeito)'} — ${correlationID} → sub ${sub.id} (${kind.type})`);
    res.status(200).json({ ok: true, approved });
  } catch (e) {
    console.error('[openpix-webhook] erro:', (e as Error).message);
    res.status(200).json({ ok: true }); // sempre 200 pro OpenPix não entrar em loop de retry
  }
});

export default router;
