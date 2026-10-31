import { prisma } from '../prisma';
import { config } from '../config';

// Custos em créditos por ação de IA (extração por visão conta!).
// extração (upload) é GRÁTIS (Modelo A: o gancho é subir exames; a IA interpretação é que custa).
// NÃO usar `as const` — o admin edita esses valores em runtime.
export const CREDIT_COSTS: { extraction: number; summary: number; consolidated: number; chat: number; actionPlan: number; question: number } = { extraction: 0, summary: 10, consolidated: 20, chat: 2, actionPlan: 8, question: 2 };

// Regras de cobrança de UPLOAD de exame (mutável em runtime via painel admin;
// inicializado dos defaults do config/env). *Volta ao padrão se reiniciar o container.
export const UPLOAD_RULES: { freeCost: number; premiumFreeQuota: number; premiumCost: number } = {
  freeCost: config.uploadRules.freeCost,
  premiumFreeQuota: config.uploadRules.premiumFreeQuota,
  premiumCost: config.uploadRules.premiumCost,
};

/** Grava uma linha no extrato (ledger). Best-effort: loga erro mas não quebra o fluxo.
 *  Passe `tx` pra ser atômico com a mudança de saldo. */
export async function logCredit(userId: string, delta: number, kind: string, label: string, refId?: string | null, tx?: any): Promise<void> {
  try {
    const client = tx ?? prisma;
    await client.creditTransaction.create({ data: { userId, delta, kind, label, refId: refId ?? undefined } });
  } catch (e: any) {
    console.error('[credits] falha ao gravar ledger:', kind, (e as Error)?.message);
  }
}

/** Débito atômico: só desconta se houver saldo suficiente. true = debitado.
 *  kind/label/refId (opcionais) gravam a linha no extrato na MESMA transação. */
export async function chargeCredits(userId: string, amount: number, kind?: string, label?: string, refId?: string): Promise<boolean> {
  if (amount <= 0) return true;
  let ok = false;
  await prisma.$transaction(async (tx) => {
    const r = await tx.user.updateMany({ where: { id: userId, credits: { gte: amount } }, data: { credits: { decrement: amount } } });
    if (r.count > 0) {
      if (kind) await tx.creditTransaction.create({ data: { userId, delta: -amount, kind, label: label || kind, refId } });
      ok = true;
    }
  });
  return ok;
}

/** Reembolso: incrementa créditos + grava no extrato (atômico). Usa após chargeCredits quando a
 *  operação de IA falha (ex.: stream quebrou) — devolve o que foi debitado. */
export async function refundCredits(userId: string, amount: number, kind: string, label: string): Promise<void> {
  if (amount <= 0) return;
  try {
    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { credits: { increment: amount } } }),
      prisma.creditTransaction.create({ data: { userId, delta: amount, kind, label } }),
    ]);
  } catch (e: any) {
    console.error('[credits] falha no reembolso:', kind, (e as Error)?.message);
  }
}

/** Estorno do crédito de UPLOAD quando a extração FALHA (exame vira FAILED): devolve o débito
 *  'upload' ligado ao exame (refId) UMA vez só — idempotente pela checagem de 'upload_refund'
 *  existente. Mesmo princípio do refundCredits das features de IA (que já estornam em falha);
 *  o upload era o único débito sem estorno. Best-effort: nunca derruba o pipeline. */
export async function refundUploadOnFailure(examId: string): Promise<void> {
  try {
    const charge = await prisma.creditTransaction.findFirst({
      where: { kind: 'upload', refId: examId, delta: { lt: 0 } },
      select: { userId: true, delta: true },
    });
    if (!charge?.userId) return; // upload foi grátis (1º exame / cota premium) — nada a devolver
    const already = await prisma.creditTransaction.findFirst({ where: { kind: 'upload_refund', refId: examId }, select: { id: true } });
    if (already) return;
    await prisma.$transaction([
      prisma.user.update({ where: { id: charge.userId }, data: { credits: { increment: -charge.delta } } }),
      prisma.creditTransaction.create({ data: { userId: charge.userId, delta: -charge.delta, kind: 'upload_refund', label: 'Estorno: não conseguimos ler o exame', refId: examId } }),
    ]);
    console.log(`[credits] upload estornado (+${-charge.delta}) — exame ${examId} falhou na extração`);
  } catch (e: any) {
    console.error('[credits] falha no estorno de upload:', (e as Error)?.message);
  }
}

/** Plano premium (mensal) ativo agora? */
export async function isPremium(userId: string): Promise<boolean> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { planExpiresAt: true } });
  return !!u?.planExpiresAt && u.planExpiresAt > new Date();
}

/** Custo em créditos de 1 upload, dado o plano e quantos envios já fez no mês (naquele dependente).
 *  - Premium ativo: primeiros premiumFreeQuota do mês = grátis (0); depois = premiumCost.
 *  - Free: sempre freeCost.
 *  `countSoFarThisMonth` = envios já contabilizados no mês (antes deste). Função PURA (testável). */
export function computeUploadCost(
  active: boolean,
  countSoFarThisMonth: number,
  rules: { freeCost: number; premiumFreeQuota: number; premiumCost: number } = UPLOAD_RULES,
): number {
  const countAfter = countSoFarThisMonth + 1;
  if (active) return countAfter <= rules.premiumFreeQuota ? 0 : rules.premiumCost;
  return rules.freeCost;
}
