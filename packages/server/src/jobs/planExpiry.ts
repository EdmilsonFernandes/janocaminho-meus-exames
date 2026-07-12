import { prisma } from '../prisma';
import { sendEmail } from '../utils/mailer';
import { sendPushToUser } from '../utils/push';
import { config } from '../config';
import { planExpiryEmail } from '../utils/emailTemplate';

/** Scheduler de NUDGE de vencimento do plano Premium.
 *  - Roda a cada 1h; só ENVIA na janela 8-11h (não incomoda de madrugada).
 *  - Avisa quando faltam até 5 dias pra expirar — UMA vez por ciclo (dedupe de 7 dias).
 *  - NÃO renova sozinho (sem auto-renew): só lembra + link de renovação (opt-in do usuário).
 *  - E-mail + central de notificações (in-app) + push (Firebase, se configurado). */
const WINDOW_DAYS = 5;
const DEDUPE_MS = 7 * 24 * 60 * 60 * 1000; // não re-envia dentro de 7 dias (1x por ciclo)

export function startPlanExpiryJob(): void {
  const run = async () => {
    try {
      const h = new Date().getHours();
      if (h < 8 || h > 11) return; // só pela manhã
      const now = new Date();
      const to = new Date(now.getTime() + WINDOW_DAYS * 86400000);
      const dedupeSince = new Date(now.getTime() - DEDUPE_MS);
      // Premium ativo, vence nos próximos 5 dias, sem nudge nos últimos 7 dias.
      const users = await prisma.user.findMany({
        where: {
          planExpiresAt: { gte: now, lte: to },
          notifications: { none: { createdAt: { gte: dedupeSince }, type: 'plan_expiry' } },
        },
        select: { id: true, name: true, email: true, planExpiresAt: true },
        take: 200,
      });
      for (const u of users) {
        await nudge(u.id, u.name, u.email, u.planExpiresAt!).catch((e) => console.error('[planExpiry] erro user', u.id, (e as Error).message));
      }
    } catch (e) {
      console.error('[planExpiry] job error:', (e as Error).message);
    }
  };
  setInterval(run, 60 * 60 * 1000); // a cada 1h
  setTimeout(run, 60_000);           // 1min após iniciar (pega no boot)
  console.log('[planExpiry] job de vencimento iniciado (avisa 5d antes, 1x por ciclo, sem auto-renew)');
}

async function nudge(userId: string, name: string, email: string, expiresAt: Date): Promise<void> {
  const first = (name || '').split(' ')[0];
  const days = Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 86400000));
  const title = `${first}, seu Premium vence em ${days} ${days === 1 ? 'dia' : 'dias'}`;
  const body = 'Renove pra continuar com relatórios, score e o Dr. Exame. Sem renovação automática — você decide.';
  const renewUrl = `${config.webOrigin}${config.webBasePath}/#/planos`;

  // central de notificações (in-app)
  await prisma.notification.create({ data: { userId, type: 'plan_expiry', title, body, data: { link: '/planos' } } });
  // push (se Firebase configurado)
  await sendPushToUser(userId, title, body, { type: 'plan_expiry', link: '/planos' });
  // e-mail (o usuário pode não abrir o app)
  try {
    await sendEmail({
      to: email,
      subject: `${title} — Meus Exames`,
      html: planExpiryEmail({ name, days, expiresAt, renewUrl }),
    });
  } catch (e: any) { console.error('[planExpiry] falha email:', e?.message); }
  console.log(`[planExpiry] nudge p/ ${email}: vence em ${days}d`);
}
