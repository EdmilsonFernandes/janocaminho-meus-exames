import { prisma } from '../prisma';
import { sendEmail } from '../utils/mailer';
import { reminderEmail } from '../utils/emailTemplate';

const notified = new Set<string>();

/** Job que verifica lembretes próximos do vencimento e envia e-mail automático. */
export function startReminderEmailJob(): void {
  const check = async () => {
    try {
      const soon = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const reminders = await prisma.reminder.findMany({
        where: { done: false, dueDate: { lte: soon } },
        include: { patient: { include: { owner: { select: { email: true, name: true } } } } },
      });
      for (const r of reminders) {
        if (notified.has(r.id)) continue;
        const email = r.patient?.owner?.email;
        const name = r.patient?.owner?.name ?? 'Paciente';
        if (email) {
          await sendEmail({
            to: email,
            subject: `Lembrete: ${r.title}`,
            html: reminderEmail(name, r.title, new Date(r.dueDate).toLocaleDateString('pt-BR')),
          }).catch((e) => console.error('[reminders] e-mail falhou:', e?.message));
          notified.add(r.id);
          console.log(`[reminders] e-mail enviado para ${email}: ${r.title}`);
        }
      }
    } catch (e) {
      console.error('[reminders] job error:', (e as Error).message);
    }
  };

  setInterval(check, 60 * 60 * 1000); // a cada 1h
  setTimeout(check, 30_000);           // 30s após iniciar
  console.log('[reminders] job de e-mail iniciado (verifica a cada 1h)');
}
