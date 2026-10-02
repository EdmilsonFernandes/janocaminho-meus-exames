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
import { getSettings, loadSettings } from './settings';
import { findSubscriptionByIdCompat, updateSubscriptionCompatWithDb } from './subscriptionCompat';

export type ApprovalKind =
  | { type: 'credits'; credits: number }
  | { type: 'api'; calls: number }
  | { type: 'plan' };

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
    console.log(`[billing] créditos +${credits} p/ user ${sub.userId} (sub ${sub.id})`);
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
