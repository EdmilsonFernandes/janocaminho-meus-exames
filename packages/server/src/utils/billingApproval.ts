// Aprovação de Subscription PENDING — compartilhada entre os webhooks do Mercado Pago
// (/api/billing/webhook) e do OpenPix (/api/webhooks/openpix). Extraída do handler MP
// (billing.routes.ts) na migração PIX→OpenPix (02/10): MESMA semântica, dois provedores.
//
// Idempotente pelo status: só credita/ativa se a Subscription existir E status !== 'APPROVED'.
// Ramos (iguais ao external_reference do MP):
//   api      → pacote de CHAMADAS de API (ledger kind api_pack; moeda separada de créditos)
//   credits  → pacote de CRÉDITOS de IA (user.credits + CreditTransaction purchase)
//   plan     → plano mensal (planExpiresAt + créditos mensais + vaga de fundador condicional)
import { prisma } from '../prisma';
import { config, hasAsaas } from '../config';
import { getSettings, loadSettings } from './settings';
import { findSubscriptionByIdCompat, updateSubscriptionCompatWithDb } from './subscriptionCompat';
import { recordTeleconsultaPayment } from '../finance/ledger';
import { recordCouponRedemption } from './coupons';

export type ApprovalKind =
  | { type: 'credits'; credits: number }
  | { type: 'api'; calls: number }
  | { type: 'report'; vouchers: number }
  | { type: 'plan' }
  // Consulta particular (23/10): pagamento de teleconsulta agendada pelo médico — não
  // credita nada no app; marca o Reminder (teleconsulta) como pago (paidAt/paymentRef).
  | { type: 'teleconsulta'; reminderId: string };

/** Aprova (ou ignora) uma Subscription. Retorna true se aprovou/creditou nesta chamada. */
export async function approvePendingSubscription(
  subId: string,
  kind: ApprovalKind,
  paymentId: string,
): Promise<boolean> {
  const sub = await findSubscriptionByIdCompat(subId);
  if (!sub || sub.status === 'APPROVED') return false; // idempotência: reenvio não credita 2x

  if (kind.type === 'api') {
    // PACOTE DE CHAMADAS DE API — credita no LEDGER (kind api_pack), NÃO nos créditos do app.
    const calls = kind.calls;
    if (!(calls > 0)) return false;
    await prisma.$transaction(async (tx) => {
      await updateSubscriptionCompatWithDb(tx, sub.id, { status: 'APPROVED', mpPaymentId: String(paymentId) });
      await tx.creditTransaction.create({ data: { userId: sub.userId, delta: calls, kind: 'api_pack', label: `Pacote API +${calls} chamadas`, refId: sub.id } });
    });
    console.log(`[billing] API pack +${calls} chamadas p/ user ${sub.userId} (sub ${sub.id})`);
    return true;
  }

  if (kind.type === 'credits') {
    // PACOTE DE CRÉDITOS
    const credits = kind.credits;
    if (!(credits > 0)) return false;
    await prisma.$transaction(async (tx) => {
      await updateSubscriptionCompatWithDb(tx, sub.id, { status: 'APPROVED', mpPaymentId: String(paymentId) });
      await tx.user.update({ where: { id: sub.userId }, data: { credits: { increment: credits } } });
      await tx.creditTransaction.create({ data: { userId: sub.userId, delta: credits, kind: 'purchase', label: `Compra de créditos (+${credits})`, refId: sub.id } });
    });
    // Cupom (T3): incrementa uses + grava a redenção — só no pagamento CONFIRMADO.
    await recordCouponRedemption(sub, 'credits');
    console.log(`[billing] créditos +${credits} p/ user ${sub.userId} (sub ${sub.id})`);
    return true;
  }

  if (kind.type === 'report') {
    // RELATÓRIO AVULSO (18/10): compra única → +N vouchers (users.reportVouchers).
    // Ledger delta=0 (não é crédito) — mas precisa aparecer no extrato (compra aconteceu).
    const v = kind.vouchers;
    if (!(v > 0)) return false;
    await prisma.$transaction(async (tx) => {
      await updateSubscriptionCompatWithDb(tx, sub.id, { status: 'APPROVED', mpPaymentId: String(paymentId) });
      await tx.user.update({ where: { id: sub.userId }, data: { reportVouchers: { increment: v } } });
      await tx.creditTransaction.create({ data: { userId: sub.userId, delta: 0, kind: 'report_voucher', label: 'Relatório completo avulso', refId: sub.id } });
    });
    console.log(`[billing] relatório avulso +${v} voucher(s) p/ user ${sub.userId} (sub ${sub.id})`);
    return true;
  }

  if (kind.type === 'teleconsulta') {
    // CONSULTA PARTICULAR (23/10): marca a teleconsulta como paga (Reminder.paidAt +
    // paymentRef) — "Paga ✓" pros dois lados. Não credita nada: é pagamento de serviço
    // médico, não saldo do app. Idempotente pelo paidAt (webhook reenviado é no-op).
    await prisma.$transaction(async (tx) => {
      await tx.reminder.updateMany({
        where: { id: kind.reminderId, paidAt: null },
        data: { paidAt: new Date(), paymentRef: String(paymentId) },
      });
      await updateSubscriptionCompatWithDb(tx, sub.id, { status: 'APPROVED', mpPaymentId: String(paymentId) });
    });
    // ONDA 2 FINANCEIRA (§18.3): partidas duplas do pagamento + congela commissionSnapshot
    // + releaseEligibleAt. Fora da transação acima de propósito: falha aqui (ex. drift de
    // coluna) NÃO pode derrubar a aprovação — o job de conciliação repara (idempotente por txnId).
    // Dono 26/10 ("a taxa entra na ENTRADA"): busca o LÍQUIDO real do pagamento no Asaas
    // (netValue) — o held passa a valer o que existe de verdade e o estorno dele nunca
    // esbarra em "saldo insuficiente". Sem netValue (provider legado/MP) → held = bruto.
    let netCents: number | undefined;
    if (hasAsaas() && /^pay_/.test(String(paymentId))) {
      try {
        const pres = await fetch(`${config.asaasApiBaseUrl}/v3/payments/${encodeURIComponent(String(paymentId))}`, { headers: { access_token: config.asaasApiKey } });
        if (pres.ok) {
          const p: any = await pres.json();
          const n = Math.round(Number(p?.netValue ?? 0) * 100);
          if (n > 0) netCents = n;
        }
      } catch { /* sem info de taxa → bruto; o degrau do estorno cobre */ }
    }
    await recordTeleconsultaPayment(kind.reminderId, netCents).catch((e: any) => {
      console.error('[finance] ledger do pagamento falhou (conciliação repara):', kind.reminderId, e?.message);
    });
    console.log(`[billing] consulta particular paga — reminder ${kind.reminderId} (${String(paymentId)})`);
    return true;
  }

  // PLANO MENSAL — ativa + concede pacote mensal de créditos (parametrizado em app_settings)
  if (!(sub.periodDays > 0)) return false;
  const expires = new Date(Date.now() + sub.periodDays * 86400000);
  const monthlyCredits = getSettings().grants.monthly;
  await prisma.$transaction(async (tx) => {
    await updateSubscriptionCompatWithDb(tx, sub.id, { status: 'APPROVED', mpPaymentId: String(paymentId) });
    await tx.user.update({ where: { id: sub.userId }, data: { planExpiresAt: expires, credits: { increment: monthlyCredits } } });
    await tx.creditTransaction.create({ data: { userId: sub.userId, delta: monthlyCredits, kind: 'plan_monthly', label: 'Plano Premium (mensal)', refId: sub.id } });
  });
  // Cupom (T3): incrementa uses + grava a redenção — só no pagamento CONFIRMADO.
  await recordCouponRedemption(sub, 'plan_monthly');
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
  return true;
}
