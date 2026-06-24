import { prisma } from '../prisma';
import { sendEmail } from '../utils/mailer';
import { reminderEmail } from '../utils/emailTemplate';
import { sendPushToUser } from '../utils/push';

const MS_MIN = 60_000;
const MS_HOUR = 3_600_000;
const MS_DAY = 86_400_000;

/** Rótulo humano da antecedência ( minutos antes do dueDate ). */
function offsetLabel(o: number): string {
  const map: Record<number, string> = {
    10080: 'Falta 1 semana',
    1440: 'Falta 1 dia',
    720: 'Faltam 12 horas',
    300: 'Faltam 5 horas',
    60: 'Falta 1 hora',
    0: 'É agora',
  };
  if (map[o]) return map[o];
  if (o >= MS_DAY / MS_MIN) return `Faltam ${Math.round(o / 1440)} dias`;
  if (o >= 60) return `Faltam ${Math.round(o / 60)} horas`;
  return `Em ${o} min`;
}

/**
 * Job de lembretes: para CADA antecedência escolhida pelo usuário ao criar
 * (notifyOffsetsMin — estilo Agenda do Google), dispara push + e-mail + notificação in-app
 * exatamente uma vez. O dedup é persistente (coluna sentOffsets) — sobrevive a restart/deploy,
 * ao contrário do Set em memória antigo (que reenviava infinito ou perdia tudo).
 *
 * Offset > 0 ("X antes")  dispara quando now >= dueDate - offset, e só enquanto dueDate > now.
 * Offset = 0 ("na hora")  dispara quando now >= dueDate, com tolerância de 24h (não dispara p/ lembretes antigos).
 */
export function startReminderEmailJob(): void {
  const check = async () => {
    try {
      const now = Date.now();
      const from = new Date(now - 24 * MS_HOUR);     // tolerância: dispara "na hora" até 24h depois
      const to = new Date(now + 8 * MS_DAY);          // cobre a maior antecedência oferecida (1 semana)
      const reminders = await prisma.reminder.findMany({
        where: { done: false, dueDate: { gte: from, lte: to } },
        include: { patient: { include: { owner: { select: { id: true, email: true, name: true } } } } },
      });

      for (const r of reminders) {
        const owner = r.patient?.owner;
        const dueMs = new Date(r.dueDate).getTime();
        const sent = new Set(r.sentOffsets ?? []);
        const dateStr = new Date(r.dueDate).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        const name = owner?.name?.split(' ')[0] ?? 'Paciente';
        const fired: number[] = [];

        for (const o of r.notifyOffsetsMin ?? []) {
          if (sent.has(o)) continue;
          const triggerMs = dueMs - o * MS_MIN;
          const eligible = o === 0
            ? now >= dueMs && dueMs >= now - 24 * MS_HOUR      // "na hora" (+ tolerância)
            : now >= triggerMs && dueMs > now;                 // "X antes" (só enquanto futuro)
          if (!eligible) continue;

          const label = offsetLabel(o);
          const body = `${label} — ${r.title} (${dateStr}).`;

          // push + notificação in-app (sendPushToUser cria a Notification e manda FCM p/ os devices)
          if (owner?.id) {
            await sendPushToUser(owner.id, `Lembrete: ${r.title}`, `${name}, ${body}`, { type: 'reminder', reminderId: r.id, offset: String(o) }).catch((e) => console.error('[reminders] push falhou:', e?.message));
          }
          // e-mail (cada antecedência avisa por e-mail — iPhone sem push também é lembrado)
          if (owner?.email) {
            await sendEmail({ to: owner.email, subject: `Lembrete: ${r.title}`, html: reminderEmail(name, r.title, dateStr) })
              .catch((e) => console.error('[reminders] e-mail falhou:', e?.message));
          }
          console.log(`[reminders] disparo ${label} p/ ${owner?.email ?? owner?.id}: ${r.title}`);
          fired.push(o);
        }

        // marca os offsets disparados (dedup persistente) — um UPDATE por lembrete com trabalho neste tick
        if (fired.length) {
          await prisma.reminder.update({ where: { id: r.id }, data: { sentOffsets: { push: fired } } }).catch((e) => console.error('[reminders] update sentOffsets falhou:', e?.message));
        }
      }
    } catch (e) {
      console.error('[reminders] job error:', (e as Error).message);
    }
  };

  setInterval(check, 5 * MS_MIN); // a cada 5 min — "na hora" dispara com no máx 5 min de atraso
  setTimeout(check, 30_000);      // 30s após iniciar
  console.log('[reminders] job iniciado (antecedências configuráveis · push+email+in-app · a cada 5 min)');
}
