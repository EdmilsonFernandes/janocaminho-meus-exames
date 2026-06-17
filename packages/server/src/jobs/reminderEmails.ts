import { prisma } from '../prisma';
import { sendEmail } from '../utils/mailer';
import { reminderEmail } from '../utils/emailTemplate';
import { sendPushToUser } from '../utils/push';

const notified = new Set<string>();

/** Job que verifica lembretes próximos do vencimento e envia e-mail + push automático. */
export function startReminderEmailJob(): void {
  const check = async () => {
    try {
      const now = Date.now();
      const soon = new Date(now + 24 * 60 * 60 * 1000);
      // Janela: só avisa de 2h ATÉ a hora ATÉ 24h à frente.
      // Antes o "Set notified" era só em memória → zerava a cada restart/deploy e
      // reenviava lembretes muito atrasados infinitamente. O gte corta isso.
      const cutoff = new Date(now - 2 * 60 * 60 * 1000);
      const reminders = await prisma.reminder.findMany({
        where: { done: false, dueDate: { gte: cutoff, lte: soon } },
        include: { patient: { include: { owner: { select: { id: true, email: true, name: true } } } } },
      });
      for (const r of reminders) {
        if (notified.has(r.id)) continue;
        const owner = r.patient?.owner;
        const name = owner?.name ?? 'Paciente';
        const dateStr = new Date(r.dueDate).toLocaleDateString('pt-BR');
        if (owner?.email) {
          await sendEmail({
            to: owner.email,
            subject: `Lembrete: ${r.title}`,
            html: reminderEmail(name, r.title, dateStr),
          }).catch((e) => console.error('[reminders] e-mail falhou:', e?.message));
          console.log(`[reminders] e-mail enviado para ${owner.email}: ${r.title}`);
        }
        // push notification (se o usuário registrou o dispositivo)
        if (owner?.id) {
          await sendPushToUser(owner.id, `Lembrete: ${r.title}`, `${name}, vence em ${dateStr}.`, { type: 'reminder', reminderId: r.id }).catch(() => {});
        }
        notified.add(r.id);
      }
    } catch (e) {
      console.error('[reminders] job error:', (e as Error).message);
    }
  };

  setInterval(check, 60 * 60 * 1000); // a cada 1h
  setTimeout(check, 30_000);           // 30s após iniciar
  console.log('[reminders] job de e-mail+push iniciado (verifica a cada 1h)');
}
