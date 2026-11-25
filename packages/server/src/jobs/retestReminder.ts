// Aviso "faz N meses do seu exame" (25/11/26) — UM por exame, quando o prazo chega.
// Canais: central do app + push (sendPushToUser) e e-mail para quem aceita e-mails (o push só
// alcança quem tem o app instalado com notificação ligada; a maior parte da base não tem).
// Regras de quem recebe e do texto: analysis/retest.ts.
import { prisma } from '../prisma';
import { sendPushToUser } from '../utils/push';
import { sendNudgeEmail } from '../utils/nudgeMail';
import { getRetestPlan, retestMessage } from '../analysis/retest';

const RUN_UTC_HOUR = 13; // 10h de Brasília — fora do horário das dicas (08h) para não empilhar avisos
/** Prazo vencido há mais que isto não gera aviso: chamar alguém por um exame de 2 anos atrás soa spam. */
const MAX_OVERDUE_DAYS = 120;
/** Teto por rodada: a 1ª execução encontra a base inteira; espalha em alguns dias. */
const MAX_PER_RUN = 40;

function msUntilNextUtcHour(targetHour: number): number {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), targetHour, 0, 0));
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime() - now.getTime();
}

/** Uma rodada. Exportada para teste; devolve quantos avisos saíram. */
export async function runRetestReminders(now: Date = new Date()): Promise<number> {
  const patients = await prisma.patient.findMany({
    where: {
      exams: { some: { status: 'EXTRACTED' } },
      owner: { role: 'OWNER', blocked: false },
    },
    select: { id: true, fullName: true, owner: { select: { id: true, email: true, nudgeEmails: true, emailVerified: true } } },
    take: 2000,
  });
  let sent = 0;
  for (const p of patients) {
    if (sent >= MAX_PER_RUN) break;
    try {
      const plan = await getRetestPlan(p.id, now);
      if (!plan || plan.status !== 'chegou' || plan.daysUntil < -MAX_OVERDUE_DAYS) continue;
      // um aviso por exame: se já avisamos deste exame, nunca mais (exame novo reinicia o ciclo)
      const already = await prisma.notification.findFirst({
        where: { userId: p.owner.id, type: 'retest', data: { path: ['examId'], equals: plan.examId } },
        select: { id: true },
      });
      if (already) continue;
      const first = (p.fullName || '').split(' ')[0];
      const { title, body } = retestMessage(first, plan);
      await sendPushToUser(p.owner.id, title, body, { type: 'retest', patientId: p.id, examId: plan.examId });
      if (p.owner.nudgeEmails && p.owner.emailVerified) {
        await sendNudgeEmail({ to: p.owner.email, userId: p.owner.id, firstName: first, title, body, examId: plan.examId });
      }
      sent++;
      console.log(`[retest] aviso p/ paciente ${p.id} (exame ${plan.examId}, ${plan.reason}, venceu há ${-plan.daysUntil}d)`);
    } catch (e) {
      console.error('[retest] erro paciente', p.id, (e as Error).message);
    }
  }
  return sent;
}

export function startRetestReminderJob(): void {
  const run = async () => {
    try {
      const n = await runRetestReminders();
      console.log(`[retest] rodada concluída: ${n} aviso(s)`);
    } catch (e) {
      console.error('[retest] job error:', (e as Error).message);
    }
    schedule();
  };
  const schedule = () => { setTimeout(run, msUntilNextUtcHour(RUN_UTC_HOUR)); };
  console.log('[retest] job iniciado (diário 10h BRT; um aviso por exame quando o prazo chega)');
  schedule();
}
