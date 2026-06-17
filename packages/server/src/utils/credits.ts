import { prisma } from '../prisma';

// Custos em créditos por ação de IA (extração por visão conta!).
export const CREDIT_COSTS = { extraction: 5, summary: 5, consolidated: 25, chat: 1 } as const;

/** Débito atômico: só desconta se houver saldo suficiente. true = debitado. */
export async function chargeCredits(userId: string, amount: number): Promise<boolean> {
  if (amount <= 0) return true;
  const r = await prisma.user.updateMany({
    where: { id: userId, credits: { gte: amount } },
    data: { credits: { decrement: amount } },
  });
  return r.count > 0;
}

/** Plano premium (mensal) ativo agora? */
export async function isPremium(userId: string): Promise<boolean> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { planExpiresAt: true } });
  return !!u?.planExpiresAt && u.planExpiresAt > new Date();
}
