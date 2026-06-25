import { prisma } from '../prisma';
import { latestHealthScore } from './healthScore';

export interface BadgeDef {
  id: string;
  emoji: string;
  title: string;
  desc: string;
  metric: 'exams' | 'score' | 'streak';
  threshold: number;
  reward: number;
}

/** Fonte única de verdade das conquistas (server-authoritative). reward em créditos.
 *  Recompensas GRADUATIVAS por dificuldade: fácil = 2, médio = 5, difícil = 10, mestre = 20.
 *  Total máximo: 52 créditos (incentivo real sem inflacionar — plano mensal = 300). */
export const BADGES: BadgeDef[] = [
  { id: 'first_exam', emoji: '🎉', title: 'Primeiro exame', desc: 'Envie seu primeiro exame', metric: 'exams', threshold: 1, reward: 2 },
  { id: 'collector', emoji: '📚', title: 'Colecionador', desc: 'Acumule 5 exames', metric: 'exams', threshold: 5, reward: 3 },
  { id: 'scholar', emoji: '🎓', title: 'Estudioso', desc: 'Acumule 10 exames', metric: 'exams', threshold: 10, reward: 5 },
  { id: 'archive', emoji: '🗄️', title: 'Arquivista', desc: 'Acumule 25 exames', metric: 'exams', threshold: 25, reward: 10 },
  { id: 'healthy', emoji: '💚', title: 'Saudável', desc: 'Score de saúde acima de 80', metric: 'score', threshold: 80, reward: 5 },
  { id: 'streak3', emoji: '🔥', title: 'Constância', desc: '3 dias seguidos no app', metric: 'streak', threshold: 3, reward: 2 },
  { id: 'streak7', emoji: '⚡', title: 'Dedicado', desc: '7 dias seguidos no app', metric: 'streak', threshold: 7, reward: 5 },
  { id: 'streak30', emoji: '👑', title: 'Mestre da saúde', desc: '30 dias seguidos no app', metric: 'streak', threshold: 30, reward: 20 },
];

export interface UserMetrics {
  exams: number;
  score: number | null;
  streak: number;
}

/** Métricas server-side que alimentam as conquistas (não-farmável: vêm do banco). */
export async function getUserMetrics(userId: string): Promise<UserMetrics> {
  const [exams, health, user] = await Promise.all([
    prisma.exam.count({ where: { patient: { ownerId: userId } } }),
    latestHealthScore(userId),
    prisma.user.findUnique({ where: { id: userId }, select: { streakDays: true } }),
  ]);
  return { exams, score: health?.score ?? null, streak: user?.streakDays ?? 0 };
}

/** Avalia cada badge contra as métricas: earned + progresso (0-1).
 *  Aceita badges customizadas (do banco via settings) — default = BADGES hardcoded. */
export function evalBadges(m: UserMetrics, badges: BadgeDef[] = BADGES): Array<BadgeDef & { earned: boolean; progress: number }> {
  return badges.map((b) => {
    const val = b.metric === 'exams' ? m.exams : b.metric === 'score' ? m.score ?? 0 : m.streak;
    return { ...b, earned: val >= b.threshold, progress: Math.min(val / b.threshold, 1) };
  });
}
