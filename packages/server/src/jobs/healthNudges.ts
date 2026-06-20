import { prisma } from '../prisma';
import { sendPushToUser } from '../utils/push';

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
          notifications: { none: { createdAt: { gte: cutoff } } }, // cooldown respeitado
          patients: { some: { exams: { some: { status: 'EXTRACTED' } } } }, // tem exames
        },
        select: { id: true, name: true },
        take: 200,
      });
      for (const u of users) {
        await maybeNudge(u.id, u.name).catch((e) => console.error('[nudges] erro usuário', u.id, (e as Error).message));
      }
    } catch (e) {
      console.error('[nudges] job error:', (e as Error).message);
    }
  };
  setInterval(run, 60 * 60 * 1000); // a cada 1h
  setTimeout(run, 60_000);           // 1min após iniciar
  console.log('[nudges] job de nudges iniciado (janela 8-11h, cooldown 3 dias)');
}

async function maybeNudge(userId: string, userName: string): Promise<void> {
  const first = (userName || '').split(' ')[0];
  // valor alterado em exame recente?
  const since = new Date(Date.now() - RECENT_MS);
  const abnormal = await prisma.examItem.findFirst({
    where: { isAbnormal: true, exam: { patient: { ownerId: userId }, performedAt: { gte: since } } },
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
  console.log(`[nudges] enviado p/ ${userName}: ${title}`);
}
