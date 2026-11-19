// Webhook público do OpenPix (PIX) — montado em app.ts como POST /api/webhooks/openpix.
// Registro no dashboard OpenPix: https://janocaminho.com.br/meus-exames/api/webhooks/openpix
//
// SEGURANÇA (OpenPix NÃO tem assinatura HMAC nativa): só aprova quando TODOS valem —
//   1. existe Subscription PENDING com mpPaymentId == correlationID (charge criada por nós;
//      correlationID gerado no server, nunca aceito do cliente);
//   2. valor do pagamento (centavos) BATE com o registrado na Subscription;
//   3. idempotente pelo status (reenvio não credita 2x — helper compartilhado com o MP);
//   4. VERIFICAÇÃO SERVER-SIDE (audit segurança 10/26): a cobrança é CONFIRMADA na API do
//      OpenPix (GET /api/v1/charge/{correlationID}) antes de aprovar — webhook forjado com
//      payload inventado não passa, o provider é a fonte de verdade (mesmo padrão do MP).
// Aprovação = MESMA função do webhook MP (utils/billingApproval) — créditos, plano e
// pacote de API seguem idênticos entre provedores.
//
// Payload oficial (evento de pagamento): { event, charge: { correlationID, status, value },
// payment: { correlationID?, status, value }, ... } — parse defensivo em várias formas.
import { Router } from 'express';
import { prisma } from '../prisma';
import { config, hasOpenPix } from '../config';
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

    // DR. EXAME PRO (médico premium) — correlationID: doctor_sub_<doctorId>[_<timestamp>]
    // 🔒 FIX CRITICAL (audit manual 19/11): antes ativava premium SEM nenhuma verificação —
    // um POST forjado com "doctor_sub_<id>" dava 30 dias grátis a qualquer médico.
    // Agora exige as MESMAS 4 travas do caminho normal: subscription PENDING + valor +
    // verificação server-side no provider (charge REAL tem que existir no OpenPix).
    if (correlationID.startsWith('doctor_sub_')) {
      const doctorId = correlationID.replace('doctor_sub_', '').split('_')[0];
      // 1. Subscription PENDING precisa existir pro médico
      const docSub = await prisma.subscription.findFirst({
        where: { mpPaymentId: correlationID, status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
        select: { id: true, userId: true, amount: true },
      });
      if (!docSub) {
        console.warn(`[openpix-webhook] doctor_sub sem subscription PENDING — RECUSADO (${correlationID})`);
        res.status(200).json({ ok: true, ignored: 'doctor_sub sem subscription' });
        return;
      }
      // 2. Valor confere
      const docExpectedCents = Math.round(Number(docSub.amount) * 100);
      if (valueCents !== docExpectedCents) {
        console.warn(`[openpix-webhook] doctor_sub valor divergente — RECUSADO (${valueCents} ≠ ${docExpectedCents})`);
        res.status(200).json({ ok: true, ignored: 'valor divergente' });
        return;
      }
      // 3. Verificação server-side no OpenPix (charge real existe e está COMPLETED)
      if (!hasOpenPix()) {
        console.warn('[openpix-webhook] OPENPIX_APP_ID ausente — impossível verificar doctor_sub, RECUSADO.');
        res.status(400).json({ error: 'Cobrança não confirmada no provider.' });
        return;
      }
      try {
        const vr = await fetch(`${config.openPixApiBaseUrl}/api/v1/charge/${encodeURIComponent(correlationID)}`, {
          headers: { Authorization: config.openPixAppId },
        });
        const vc = vr.ok ? ((await vr.json().catch(() => null)) as { charge?: { status?: string } } | null) : null;
        if (String(vc?.charge?.status ?? '') !== 'COMPLETED') {
          console.warn(`[openpix-webhook] doctor_sub NÃO confirmado no provider — RECUSADO (${correlationID})`);
          res.status(400).json({ error: 'Cobrança não confirmada no provider.' });
          return;
        }
      } catch { /* provider fora → fail closed */ }
      // 4. Aprovado: ativa premium + marca subscription
      const expires = new Date(Date.now() + 30 * 86400000);
      await prisma.doctor.update({ where: { id: doctorId }, data: { plan: 'premium', planExpiresAt: expires } }).catch(() => {});
      await prisma.subscription.update({ where: { id: docSub.id }, data: { status: 'APPROVED' } }).catch(() => {});
      console.log(`[openpix-webhook] Dr. Exame Pro VERIFICADO e ativado — doctor ${doctorId}, +30d`);
      res.status(200).json({ ok: true, doctorId });
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

    // VERIFICAÇÃO SERVER-SIDE (audit #1 — webhook público e sem assinatura): confirma na
    // API do OpenPix que a cobrança REALMENTE foi paga antes de aprovar. Payload forjado
    // não existe no provider → 400. Sem App ID não há como confirmar → falha FECHADA
    // (nunca aprova às cegas — em prod o ID existe sempre que uma charge foi criada).
    if (!hasOpenPix()) {
      console.warn('[openpix-webhook] OPENPIX_APP_ID ausente — impossível verificar no provider, RECUSADO.');
      res.status(400).json({ error: 'Cobrança não confirmada no provider.' });
      return;
    }
    let providerCharge: { charge?: { status?: string } } | null = null;
    try {
      const r = await fetch(`${config.openPixApiBaseUrl}/api/v1/charge/${encodeURIComponent(correlationID)}`, {
        headers: { Authorization: config.openPixAppId },
      });
      providerCharge = r.ok ? ((await r.json().catch(() => null)) as { charge?: { status?: string } } | null) : null;
    } catch { /* provider fora do ar → tratado como NÃO confirmado (fail closed) */ }
    if (String(providerCharge?.charge?.status ?? '') !== 'COMPLETED') {
      console.warn(`[openpix-webhook] cobrança NÃO confirmada no provider — RECUSADO (${correlationID})`);
      res.status(400).json({ error: 'Cobrança não confirmada no provider.' });
      return;
    }

    // correlationID: credits_<subId>_<n> | api_<subId>_<n> | report_<subId> — count é fallback se pixCredits faltar
    const countFromCorrelation = Number(String(correlationID).split('_')[2] ?? 0);
    const pixCredits = (sub as any).pixCredits ?? null;
    const kind =
      sub.mpPreferenceId?.startsWith('teleconsulta_')
        ? { type: 'teleconsulta' as const, reminderId: sub.mpPreferenceId.slice('teleconsulta_'.length) }
        : sub.mpPreferenceId === 'api_pack'
        ? { type: 'api' as const, calls: pixCredits ?? countFromCorrelation }
        : sub.mpPreferenceId === 'report_pack'
          ? { type: 'report' as const, vouchers: pixCredits ?? 1 }
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
