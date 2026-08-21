import { prisma } from '../prisma';
import { sendPushToUser } from '../utils/push';

/**
 * PixExpiryJob — recuperação de conversão PIX (padrão gateway).
 *
 * Roda a cada 30s e:
 * 1. PIX a ≤1min de expirar → push "finaliza o pagamento!" (urgência)
 * 2. PIX expirado sem pagamento → cancela + push "expirou, toca pra gerar novo"
 *
 * Sobrevive a restart (estado no banco, não em memória). Idempotente:
 * o campo `pixNotifiedAt` (aditivo) marca que já avisou.
 */

/** Adiciona a coluna se não existir (drift gate — sem migration obrigatória). */
async function ensureColumn(): Promise<void> {
  try {
    await prisma.$executeRaw`SELECT "pixNotifiedAt" FROM subscriptions LIMIT 1`;
  } catch {
    await prisma.$executeRaw`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS "pixNotifiedAt" TIMESTAMP`;
  }
}

export function startPixExpiryJob(): void {
  const tick = async () => {
    try {
      await ensureColumn();
      const now = new Date();

      // 1. WARNING: PIX a ≤60s de expirar, ainda PENDING, sem notificação enviada
      const warningIn = new Date(now.getTime() + 60 * 1000);
      const toWarn = await prisma.subscription.findMany({
        where: {
          status: 'PENDING',
          periodDays: 0,
          pixExpiresAt: { gt: now, lte: warningIn },
          pixNotifiedAt: null,
        },
        select: { id: true, userId: true, pixCredits: true, amount: true },
        take: 20,
      });
      for (const sub of toWarn) {
        try {
          await sendPushToUser(
            sub.userId,
            '⚡ Seu PIX expira em 1 minuto!',
            `Finalize o pagamento de R$ ${sub.amount.toFixed(2).replace('.', ',')} (${sub.pixCredits ?? ''} créditos) antes que expire.`,
            { type: 'pix_warning', route: '/planos' },
          );
          await prisma.subscription.update({ where: { id: sub.id }, data: { pixNotifiedAt: now } });
          console.log(`[pix-expiry] WARNING sent: sub ${sub.id}`);
        } catch (e) {
          console.error(`[pix-expiry] WARN push failed for ${sub.id}:`, (e as Error).message);
        }
      }

      // 2. EXPIRADO: PIX que passou do expiresAt, ainda PENDING → cancela + push
      const expired = await prisma.subscription.findMany({
        where: {
          status: 'PENDING',
          periodDays: 0,
          pixExpiresAt: { lt: now },
        },
        select: { id: true, userId: true, pixCredits: true, amount: true, pixNotifiedAt: true },
        take: 20,
      });
      for (const sub of expired) {
        try {
          await prisma.subscription.update({ where: { id: sub.id }, data: { status: 'CANCELLED' } });
          // Só manda push de expirado se já mandou o warning (evita spam duplo)
          if (sub.pixNotifiedAt) {
            await sendPushToUser(
              sub.userId,
              '⏰ Seu PIX expirou',
              `O pagamento de R$ ${sub.amount.toFixed(2).replace('.', ',')} não foi concluído a tempo. Toque para gerar um novo.`,
              { type: 'pix_expired', route: '/planos' },
            );
          }
          console.log(`[pix-expiry] EXPIRED: sub ${sub.id} cancelled`);
        } catch (e) {
          console.error(`[pix-expiry] EXPIRE failed for ${sub.id}:`, (e as Error).message);
        }
      }
    } catch (e) {
      console.error('[pix-expiry] job error:', (e as Error).message);
    }
  };

  // Roda a cada 30s (não a cada 1min — a janela de warning é de 60s)
  setInterval(tick, 30 * 1000);
  tick(); // dispara imediatamente
  console.log('[pix-expiry] job iniciado (warning 1min + auto-cancel + push · a cada 30s)');
}
