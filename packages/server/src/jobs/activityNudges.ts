import { prisma } from '../prisma';
import { sendPushToUser } from '../utils/push';
import { applyMergeFields, hcStepsByOwner } from '../utils/pushAudience';

/**
 * Scheduler de TRIGGERS AUTOMÁTICOS de atividade/engajamento (tick diário 08h BRT).
 *
 * 4 gatilhos (1 por usuário/dia, por prioridade — nunca dois no mesmo dia):
 *  1. GOAL       🎉 bateu a meta de passos (8k) ONTEM — celebração. Cooldown 3d.
 *  2. STREAK7    🔥 streak ≥ 7 dias e ativo ontem. Cooldown 30d (não celebra toda semana).
 *  3. DROP       📉 média 3d < 50% da própria média 30d (base ≥ 4k/dia) — reengajio
 *                educativo ("10 min de caminhada"), NÃO cobrança. Cooldown 7d.
 *  4. REACTIVATE 📂 sumido ≥ 14d com exames no histórico — "seus exames continuam aqui".
 *                Cooldown 30d.
 *
 * Anti-spam por Notification type (mesmo padrão do firstExamNudge). Só usuários
 * ALCANÇÁVEIS (≥1 device token, não bloqueados). Voz educativa do Dr. Exame —
 * celebra comportamento, nunca diagnostica.
 */
const NUDGE_UTC_HOUR = 11; // 08h BRT
const STEPS_GOAL = 8000;
const DAY_MS = 24 * 60 * 60 * 1000;

const dayStr = (offsetDays: number): string => new Date(Date.now() - offsetDays * DAY_MS).toISOString().slice(0, 10);

function msUntilNextUtcHour(targetHour: number): number {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), targetHour, 0, 0, 0));
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime() - now.getTime();
}

/** Já recebeu notificação desse type dentro do cooldown (dias)? */
async function inCooldown(userId: string, type: string, days: number): Promise<boolean> {
  return !!(await prisma.notification.findFirst({
    where: { userId, type, createdAt: { gte: new Date(Date.now() - days * DAY_MS) } },
    select: { id: true },
  }));
}

const avgOf = (days: { date: string; value: number }[], from: number, to: number): number | null => {
  const lo = dayStr(to), hi = dayStr(from);
  const sel = days.filter((d) => d.date >= lo && d.date <= hi);
  return sel.length ? sel.reduce((t, d) => t + d.value, 0) / sel.length : null;
};

export function startActivityNudgeJob(): void {
  const run = async () => {
    try {
      console.log(`[activityNudges] tick 08h BRT @ ${new Date().toISOString()}`);

      // Candidatos: alcançáveis (push chega) e não bloqueados.
      const users = await prisma.user.findMany({
        where: { blocked: false, deviceTokens: { some: {} } },
        select: { id: true, name: true, streakDays: true, lastActiveDay: true },
        take: 5000,
      });
      const stepsByOwner = await hcStepsByOwner(35);
      const withExtractedExam = new Set(
        (await prisma.patient.findMany({
          where: { exams: { some: { status: 'EXTRACTED' } } },
          select: { ownerId: true },
        })).map((p) => p.ownerId),
      );

      let counts = { goal: 0, streak7: 0, drop: 0, reactivate: 0 };
      for (const u of users) {
        const steps = stepsByOwner.get(u.id);
        const stepsYesterday = steps?.find((d) => d.date === dayStr(1))?.value;
        const ctx = { name: u.name, streakDays: u.streakDays, stepsYesterday };
        const send = (type: string, title: string, body: string, route: string) =>
          sendPushToUser(u.id, applyMergeFields(title, ctx), applyMergeFields(body, ctx), { type, route });

        // 1. GOAL — meta batida ontem (celebração; 3d de cooldown p/ não virar rotina)
        if (stepsYesterday != null && stepsYesterday >= STEPS_GOAL && !(await inCooldown(u.id, 'activity_goal', 3))) {
          await send('activity_goal',
            '🎉 {{nome}}, meta batida ontem!',
            `Foram {{passosOntem}} passos — a partir de 8 mil por dia é onde a ciência vê o maior ganho pra coração e metabolismo. Segue esse ritmo! 💚`,
            '/evolucao');
          counts.goal++;
          continue;
        }

        // 2. STREAK7 — constância rara (≥7d e ativo ontem); celebra 1x/mês no máximo
        if (u.streakDays >= 7 && u.lastActiveDay === dayStr(1) && !(await inCooldown(u.id, 'streak7', 30))) {
          await send('streak7',
            '🔥 {{streak}} dias seguidos, {{nome}}!',
            'Constância é o que muda exame de verdade — e você está entregando. O Dr. Exame registrou (e aplaudiu).',
            '/');
          counts.streak7++;
          continue;
        }

        // 3. DROP — atividade caiu pela metade vs. a própria média (convite, não cobrança)
        if (steps?.length) {
          const avg3 = avgOf(steps, 1, 3);
          const avg30 = avgOf(steps, 4, 33);
          const daysWithData = steps.filter((d) => d.date >= dayStr(3) && d.date <= dayStr(1)).length;
          if (avg3 != null && avg30 != null && avg30 >= 4000 && avg3 < avg30 * 0.5 && daysWithData >= 2
            && !(await inCooldown(u.id, 'activity_drop', 7))) {
            await send('activity_drop',
              '{{nome}}, o corpo sente a pausa',
              'Sua média de passos caiu pela metade nos últimos 3 dias. 10 minutos de caminhada já ajudam pressão, açúcar e humor — dá pra encaixar um hoje?',
              '/evolucao');
            counts.drop++;
            continue;
          }
        }

        // 4. REACTIVATE — sumido 14d+, com histórico (o app tem valor acumulado a relembrar)
        if (u.lastActiveDay && u.lastActiveDay <= dayStr(14) && withExtractedExam.has(u.id)
          && !(await inCooldown(u.id, 'reactivate', 30))) {
          await send('reactivate',
            '{{nome}}, seus exames continuam aqui',
            'Faz um tempinho desde sua última visita. Que tal conferir se algo mudou na sua evolução? Seu histórico está guardadinho. 📋',
            '/evolucao');
          counts.reactivate++;
        }
      }
      console.log(`[activityNudges] goal=${counts.goal} streak7=${counts.streak7} drop=${counts.drop} reactivate=${counts.reactivate}`);
    } catch (e) {
      console.error('[activityNudges] job error:', (e as Error).message);
    }
    scheduleNext();
  };
  const scheduleNext = () => {
    const ms = msUntilNextUtcHour(NUDGE_UTC_HOUR);
    console.log(`[activityNudges] próximo disparo 08h BRT em ${Math.round(ms / 60000)} min`);
    setTimeout(run, ms);
  };
  console.log('[activityNudges] job iniciado (meta 8k, streak 7d, queda de atividade, reativação 14d)');
  scheduleNext();
}
