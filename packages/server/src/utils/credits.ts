import { prisma } from '../prisma';

// Custos em créditos por ação de IA (extração por visão conta!).
// extração (upload) é GRÁTIS (Modelo A: o gancho é subir exames; a IA interpretação é que custa).
export const CREDIT_COSTS = { extraction: 0, summary: 10, consolidated: 30, chat: 3 } as const;

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
