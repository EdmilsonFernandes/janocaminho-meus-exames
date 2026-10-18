import { prisma } from '../prisma';

/** Registra um PAYWALL HIT: tentativa de uso travada por saldo insuficiente (402).
 *  Best-effort (nunca bloqueia nem atrasa a resposta), drift-safe (tabela nova → catch
 *  silencioso se o banco ainda não aplicou a migration).
 *
 *  É o sinal nº1 de disposição a pagar — auditoria de monetização 18/10/2026: antes
 *  disto o 402 era invisível e o admin não sabia QUANTOS quiseram usar e não podiam.
 *  Chamar imediatamente antes de cada res.status(402) de crédito. */
export async function logPaywallHit(userId: string, feature: string): Promise<void> {
  try {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { credits: true } });
    await prisma.paywallHit.create({ data: { userId, feature, balance: u?.credits ?? 0 } });
  } catch { /* tabela inexistente (pré-migration) — não trava o 402 */ }
}
