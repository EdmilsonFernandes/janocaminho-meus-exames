import { prisma } from '../prisma';
import { sendPushToUser } from '../utils/push';
import { sendNudgeEmail } from '../utils/nudgeMail';

/** Scheduler de NUDGES de saúde (Fase 3).
 *  - Roda a cada 1h, mas só ENVIA na janela 8-11h (não incomoda de madrugada).
 *  - COOLDOWN de 3 dias por usuário (anti-spam).
 *  - Sinais: 🔴 valor alterado em exame recente (30d) → alerta;
 *           📅 último exame há >6 meses → lembrete de refazer.
 *  - Cria Notification (central) + envia push (Firebase Admin, se configurado). */
const COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000; // 3 dias
const RECENT_MS = 30 * 24 * 60 * 60 * 1000;  // 30 dias

export function startHealthNudgeJob(): void {
  const run = async () => {
    try {
      const h = new Date().getHours();
      if (h < 8 || h > 11) return; // só pela manhã
      const cutoff = new Date(Date.now() - COOLDOWN_MS);
      const users = await prisma.user.findMany({
        where: {
          // COOLDOWN só conta nudges de SAÚDE (alert/reminder) — não bloqueia por notificação de share/welcome
          notifications: { none: { createdAt: { gte: cutoff }, type: { in: ['alert', 'reminder'] } } },
          patients: { some: { exams: { some: { status: 'EXTRACTED' } } } }, // tem exames
        },
        select: { id: true, name: true, email: true, nudgeEmails: true, emailVerified: true },
        take: 200,
      });
      for (const u of users) {
        await maybeNudge(u.id, u.name, u.email, u.nudgeEmails, u.emailVerified).catch((e) => console.error('[nudges] erro usuário', u.id, (e as Error).message));
      }
    } catch (e) {
      console.error('[nudges] job error:', (e as Error).message);
    }
  };
  setInterval(run, 60 * 60 * 1000); // a cada 1h
  setTimeout(run, 60_000);           // 1min após iniciar
  console.log('[nudges] job de nudges iniciado (janela 8-11h, cooldown 3 dias)');
}

async function maybeNudge(userId: string, userName: string, email: string, nudgeEmails: boolean, emailVerified: boolean): Promise<void> {
  const first = (userName || '').split(' ')[0];
  // valor alterado em exame recente?
  const since = new Date(Date.now() - RECENT_MS);
  // valor alterado em exame recente? (performedAt OU createdAt — imagem sem data no cabeçalho conta pelo upload)
  const abnormal = await prisma.examItem.findFirst({
    where: { isAbnormal: true, exam: { patient: { ownerId: userId }, OR: [{ performedAt: { gte: since } }, { performedAt: null, createdAt: { gte: since } }] } },
    orderBy: { exam: { performedAt: 'desc' } },
    select: { name: true, nameCanonical: true, exam: { select: { id: true } } },
  });

  let type = '', title = '', body = '', data: Record<string, string> = {};
  if (abnormal) {
    type = 'alert';
    title = `${first}, um valor precisa de atenção`;
    body = `Seu ${abnormal.name} está fora da faixa no exame recente. Vale conversar com seu médico pra avaliar.`;
    data = { examId: abnormal.exam?.id ?? '', nameCanonical: abnormal.nameCanonical ?? abnormal.name };
  } else {
    // último exame muito antigo?
    const last = await prisma.exam.findFirst({
      where: { patient: { ownerId: userId }, status: 'EXTRACTED' },
      orderBy: { performedAt: 'desc' },
      select: { performedAt: true },
    });
    if (last?.performedAt) {
      const monthsOld = (Date.now() - new Date(last.performedAt).getTime()) / (30 * 24 * 3600 * 1000);
      if (monthsOld > 6) {
        type = 'reminder';
        title = `${first}, já faz tempo sem exame`;
        body = `Seu último exame foi há mais de 6 meses. Que tal refazer pra acompanhar sua saúde?`;
      }
    }
  }
  if (!type) return; // sem sinal → não enche

  await prisma.notification.create({ data: { userId, type, title, body, data: data.examId ? data : undefined } });
  await sendPushToUser(userId, title, body, { type, ...(data.examId ? { examId: data.examId } : {}) });
  // FALLBACK por e-mail: SÓ pra quem NÃO tem push (ex.: iPhone no navegador — sem app nativo/FCM).
  // Evita duplicar canal pra quem já recebeu o push. Best-effort (sendNudgeEmail loga e não propaga).
  const tokenCount = await prisma.deviceToken.count({ where: { userId } }).catch(() => 1); // em erro, assume "tem push" (não spamma e-mail)
  if (!tokenCount && nudgeEmails && emailVerified) {
    await sendNudgeEmail({ to: email, userId, firstName: first, title, body, examId: data.examId || undefined });
    console.log(`[nudges] e-mail (sem push) p/ ${userName}: ${title}`);
  }
  console.log(`[nudges] enviado p/ ${userName}: ${title}`);
}
