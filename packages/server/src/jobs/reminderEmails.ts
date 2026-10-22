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
/** Intervalo da recorrência em passos de data (lote "estilo Teams" 18/10/26).
 *  Tipado com ReminderRecurrence: se alguém adicionar valor novo na whitelist
 *  sem step aqui, o COMPILADOR reclama (antes eram 2 listas soltas). */
const RECURRENCE_STEP: Record<import('../utils/reminderConstants').ReminderRecurrence, (d: Date) => Date> = {
  diario: (d) => new Date(d.getTime() + MS_DAY),
  semanal: (d) => new Date(d.getTime() + 7 * MS_DAY),
  mensal: (d) => addMonths(d, 1),
  semestral: (d) => addMonths(d, 6),
  anual: (d) => addMonths(d, 12),
};
function addMonths(d: Date, n: number): Date {
  const out = new Date(d);
  const day = out.getDate();
  out.setMonth(out.getMonth() + n);
  // 31/jan +1m → 3/mar (JS estoura o mês): clampa pro último dia do mês-alvo (31/28-29).
  if (out.getDate() < day) out.setDate(0);
  return out;
}

/**
 * ROLL de recorrência (linha que ROLA, não duplica — padrão "série" do Teams):
 * quando o lembrete recorrente é marcado FEITO, ou fica >24h atrasado, avança a
 * dueDate p/ a próxima ocorrência (sempre à frente de now), rearma os disparos
 * (sentOffsets=[]) e renova o consentimento (cada teleconsulta pede aceite próprio).
 * Mantém UMA linha limpa por série — a lista nunca vira cemitério de ocorrências.
 */
export async function rollRecurringReminders(now: number): Promise<void> {
  // Cursor por id (take sem orderBy repetia sempre as mesmas 200 e ia pra trás de
  // linhas 201+ em bases grandes — cada lote processado muda o dueDate, então o
  // where deixa de casar e o cursor avança até esvaziar).
  let cursor: string | undefined;
  do {
    const stale = await prisma.reminder.findMany({
      where: {
        recurrence: { not: null },
        OR: [{ done: true }, { done: false, dueDate: { lt: new Date(now - 24 * MS_HOUR) } }],
      },
      orderBy: { id: 'asc' },
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      take: 200,
    });
    if (!stale.length) break;
    cursor = stale[stale.length - 1].id;
    for (const r of stale) {
      const rec = r.recurrence as import('../utils/reminderConstants').ReminderRecurrence | null;
      if (!rec) continue;
      const step = RECURRENCE_STEP[rec];
      if (!step) continue;
      let next = step(new Date(r.dueDate));
      // Catch-up: atraso maior que 1 intervalo (ex.: app parado 3 meses) avança até o futuro.
      let guard = 0;
      while (next.getTime() <= now && guard++ < 120) next = step(next);
      // Race-safe: só rola se o estado AINDA bate (paciente pode ter desmarcado
      // "feito" entre o findMany e o update — update condicional não sobrescreve).
      await prisma.reminder.updateMany({
        where: {
          id: r.id,
          recurrence: r.recurrence,
          OR: [{ done: true }, { done: false, dueDate: r.dueDate }],
        },
        data: { dueDate: next, sentOffsets: [], done: false, consentAt: null,
          // D5 (F3, 20/10): o pacote da PRÓXIMA consulta começa limpo — consent de
          // gravação e transcrição são POR consulta (áudio novo, consent novo).
          recordConsentAt: null, recordingAt: null, transcriptEnc: null, transcriptIv: null, transcriptAt: null,
          // Ciclo de vida (22/10): a PRÓXIMA ocorrência nasce ABERTA — sem isto o
          // endedAt da ocorrência anterior bloquearia o join da nova p/ sempre.
          endedAt: null },
      }).catch((e) => { console.error('[reminders] roll falhou:', r.id, e?.message); });
    }
  } while (true);
}

/**
 * AUTO-END de teleconsulta (22/10/26, nice-to-have): consulta INACABADA onde SÓ UM
 * papel entrou (join no auditLog) e o último join foi há >30min — ninguém mais vem.
 * Encerra sozinha (endedAt = último join + 30min, done=true) para o card virar
 * "encerrada" e o /join parar de aceitar re-entrada infinita (dono 22/10: "entrou
 * 15x e ela nunca encerra"). Se AMBOS os papéis entraram, a chamada aconteceu —
 * encerramento é humano (POST /end ou feedback), job não mexe.
 * Falha não derruba o job (catch por linha); banco legado sem a coluna → no-op.
 */
export async function autoEndStaleTeleconsultas(now: number): Promise<void> {
  // `endedAt: null` no where precisa da coluna — legado pré-migration rejeita a query
  // inteira → catch → [] (no-op até a migration aplicada).
  const rows = await prisma.reminder.findMany({
    where: { type: 'teleconsulta', endedAt: null },
    select: { id: true },
    take: 200,
  }).catch(() => [] as { id: string }[]);
  for (const r of rows) {
    const joins = await prisma.auditLog.findMany({
      where: { action: 'TELECONSULTA_JOIN', targetId: r.id },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true, after: true },
    });
    if (!joins.length) continue; // ninguém nunca entrou — agenda normal segue
    const roles = new Set(joins.map((j: any) => (j.after as any)?.role).filter(Boolean));
    if (roles.size >= 2) continue; // chamada aconteceu — fim é humano
    const lastJoinMs = new Date(joins[joins.length - 1].createdAt).getTime();
    if (now - lastJoinMs < 30 * MS_MIN) continue; // ainda dentro da janela de espera
    await prisma.reminder.updateMany({
      where: { id: r.id, endedAt: null }, // race-safe: não pisa em end manual simultâneo
      data: { endedAt: new Date(lastJoinMs + 30 * MS_MIN), done: true },
    }).catch((e) => console.error('[reminders] auto-end falhou:', r.id, (e as Error)?.message));
  }
}

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
    try {
      await rollRecurringReminders(Date.now());
    } catch (e) {
      console.error('[reminders] roll error:', (e as Error).message);
    }
    try {
      await autoEndStaleTeleconsultas(Date.now());
    } catch (e) {
      console.error('[reminders] auto-end error:', (e as Error).message);
    }
  };

  setInterval(check, 5 * MS_MIN); // a cada 5 min — "na hora" dispara com no máx 5 min de atraso
  setTimeout(check, 30_000);      // 30s após iniciar
  console.log('[reminders] job iniciado (antecedências configuráveis · push+email+in-app · a cada 5 min)');
}
