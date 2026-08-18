import { prisma } from '../prisma';
import { sendPushToUser } from '../utils/push';
import { sendNudgeEmail } from '../utils/nudgeMail';

/**
 * Scheduler de ENGAJAMENTO de 1º exame (tick diário 08h BRT; por-usuário a cada 3 dias).
 *
 * Alvo: quem cadastrou (tem paciente) mas NÃO tem NENHUM exame EXTRAÍDO — ou seja, ainda não
 * usufruiu do produto. Divide em 2 segmentos:
 *  - RETRY : tem exame FAILED (tentou e deu erro) → "tente novamente com PDF/foto nítida".
 *  - FIRST : nenhum exame (só cadastrou)          → "envie seu primeiro exame (PDF/foto)".
 *
 * Anti-spam: máx 1 nudge a cada 3 dias por usuário (cooldown via Notification type 'first_exam')
 * — 2 dias enchia; 3 dias respeita sem esfriar a ativação (2026-08-18).
 * Teto: MAX_NUDGES (para de insistir). Cessa no 1º exame EXTRAÍDO (o usuário sai do segmento).
 * Não incomoda nas primeiras 24h pós-cadastro. E-mail fallback só p/ quem não tem push.
 */
const COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000; // 3 dias entre nudges do mesmo usuário
const MIN_AGE_MS = 24 * 60 * 60 * 1000;      // só após 24h do cadastro (não incomodar no dia 0)
const MAX_NUDGES = 6;                          // teto: 6×3d ≈ 18 dias de insistência (era 8×2d=16d, mais gritante)
const NUDGE_UTC_HOUR = 11;                     // 08h BRT = 11h UTC
const EXAMS_ROUTE = '/exams/create';
const TYPE = 'first_exam';

function msUntilNextUtcHour(targetHour: number): number {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), targetHour, 0, 0, 0));
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1); // já passou hoje → amanhã
  return next.getTime() - now.getTime();
}

export function startFirstExamNudgeJob(): void {
  const run = async () => {
    try {
      console.log(`[firstExamNudge] tick 08h BRT @ ${new Date().toISOString()}`);
      // Usuários c/ paciente, SEM exame EXTRAÍDO, c/ >24h de cadastro.
      const users = await prisma.user.findMany({
        where: {
          createdAt: { lt: new Date(Date.now() - MIN_AGE_MS) },
          patients: { some: {} },
          NOT: { patients: { some: { exams: { some: { status: 'EXTRACTED' } } } } },
        },
        select: {
          id: true, email: true, nudgeEmails: true, emailVerified: true,
          patients: { select: { fullName: true }, take: 1 },
        },
        take: 1000,
      });
      console.log(`[firstExamNudge] ${users.length} usuário(s) sem 1º exame extraído`);
      for (const u of users) {
        await maybeNudge(u).catch((e) => console.error('[firstExamNudge] erro user', u.id, (e as Error).message));
      }
      console.log('[firstExamNudge] tick concluído');
    } catch (e) {
      console.error('[firstExamNudge] job error:', (e as Error).message);
    }
    scheduleNext();
  };
  const scheduleNext = () => {
    const ms = msUntilNextUtcHour(NUDGE_UTC_HOUR);
    console.log(`[firstExamNudge] próximo disparo 08h BRT em ${Math.round(ms / 60000)} min`);
    setTimeout(run, ms);
  };
  console.log('[firstExamNudge] job iniciado (engajamento de 1º exame; retry p/ falha; a cada 3 dias/usuário)');
  scheduleNext();
}

async function maybeNudge(u: {
  id: string; email: string; nudgeEmails: boolean; emailVerified: boolean;
  patients: { fullName: string }[];
}): Promise<void> {
  const cutoff = new Date(Date.now() - COOLDOWN_MS);
  // Cooldown: já recebeu um first_exam nos últimos 3 dias?
  const recent = await prisma.notification.findFirst({
    where: { userId: u.id, type: TYPE, createdAt: { gte: cutoff } },
    select: { id: true },
  });
  if (recent) return;
  // Teto: já recebeu demais (não insiste pra sempre)?
  const sent = await prisma.notification.count({ where: { userId: u.id, type: TYPE } });
  if (sent >= MAX_NUDGES) return;

  // Segmento: tentou e falhou (FAILED) vs ainda não enviou nenhum.
  const failed = await prisma.exam.findFirst({
    where: { patient: { ownerId: u.id }, status: 'FAILED' },
    select: { id: true },
  });
  const first = (u.patients[0]?.fullName || '').split(' ')[0] || 'Você';

  let title: string;
  let body: string;
  if (failed) {
    title = `${first}, vamos ler seu exame?`;
    body = `Não conseguimos ler seu último envio. Tente de novo com um PDF nítido ou uma foto clara — o Dr. Exame explica cada valor em segundos.`;
  } else {
    title = `${first}, envie seu primeiro exame`;
    body = `Mande um PDF ou foto do seu exame e o Dr. Exame lê, explica cada valor e monta sua leitura de risco. Leva menos de 1 minuto.`;
  }

  await sendPushToUser(u.id, title, body, { type: TYPE, route: EXAMS_ROUTE });

  // E-mail fallback: SÓ pra quem NÃO tem push (iPhone no navegador etc.) — igual ao healthNudges.
  const tokenCount = await prisma.deviceToken.count({ where: { userId: u.id } }).catch(() => 1);
  if (!tokenCount && u.nudgeEmails && u.emailVerified) {
    await sendNudgeEmail({ to: u.email, userId: u.id, firstName: first, title, body });
  }
  console.log(`[firstExamNudge] [${failed ? 'retry' : 'first'}] user ${u.id} (${sent + 1}/${MAX_NUDGES}): ${title}`);
}
