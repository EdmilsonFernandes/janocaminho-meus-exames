import { prisma } from '../prisma';
import { latestHealthScore } from './healthScore';

export interface BadgeDef {
  id: string;
  emoji: string;
  title: string;
  desc: string;
  metric: 'exams' | 'score' | 'streak' | 'examsMonth' | 'sharesMonth';
  threshold: number;
  reward: number;
  /** 'monthly' = desafio RENOVÁVEL: claim-key vira `${id}:${YYYY-MM}` — re-earnable 1x por mês. */
  period?: 'monthly';
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
  /** Uploads no mês corrente (desafios mensais). */
  examsMonth: number;
  /** Compartilhamentos c/ médicos criados no mês corrente (médicos distintos). */
  sharesMonth: number;
}

/** Início do mês corrente (UTC) — janela dos desafios mensais. */
export const monthStartUtc = () => { const n = new Date(); return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), 1)); };

/** Claim-key de um badge: mensal vira `id:YYYY-MM` (renova sozinho a cada mês). */
export const claimKeyOf = (b: BadgeDef) => (b.period === 'monthly' ? `${b.id}:${new Date().toISOString().slice(0, 7)}` : b.id);

/**
 * DESAFIOS MENSAIS (feedback: usuário que completa tudo fica sem conteúdo). Renováveis:
 * cada um paga 1x por mês calendário (claim-key mensal). Métricas computadas do banco —
 * streak/uso e uploads são o hábito que o produto quer mensal (exame novo todo mês).
 * Total mensal: 14 créditos (plano = 300/mês → inflação irrelevante, engajamento real).
 */
export const MONTHLY_BADGES: BadgeDef[] = [
  { id: 'm_upload1', emoji: '📤', title: 'Mês atualizado', desc: 'Envie 1 exame neste mês', metric: 'examsMonth', threshold: 1, reward: 2, period: 'monthly' },
  { id: 'm_upload3', emoji: '🧪', title: 'Check-up do mês', desc: 'Envie 3 exames neste mês', metric: 'examsMonth', threshold: 3, reward: 5, period: 'monthly' },
  { id: 'm_streak10', emoji: '🔥', title: 'Constância mensal', desc: 'Fique 10 dias seguidos no app', metric: 'streak', threshold: 10, reward: 4, period: 'monthly' },
  { id: 'm_share1', emoji: '🤝', title: 'Médico em dia', desc: 'Compartilhe c/ um médico neste mês', metric: 'sharesMonth', threshold: 1, reward: 3, period: 'monthly' },
];

/** Permanentes + mensais (lista completa default). */
export const ALL_BADGES: BadgeDef[] = [...BADGES, ...MONTHLY_BADGES];

/** Badges vigentes: se o admin customizou (settings), PRESERVA a customização e APENDA os
 *  mensais (sem duplicar ids) — config de banco nunca deve esconder os desafios do mês. */
export function resolveBadges(custom?: BadgeDef[]): BadgeDef[] {
  const base = custom?.length ? custom : ALL_BADGES;
  const ids = new Set(base.map((b) => b.id));
  return [...base, ...MONTHLY_BADGES.filter((m) => !ids.has(m.id))];
}

/** Métricas server-side que alimentam as conquistas (não-farmável: vêm do banco). */
export async function getUserMetrics(userId: string): Promise<UserMetrics> {
  const mStart = monthStartUtc();
  const [exams, health, user, examsMonth, sharesMonth] = await Promise.all([
    // Conta UPLOADS (PDFs), NÃO registros split. Um PDF c/ histórico de N anos vira N exames
    // (split pelo #split-N no fileSha256), mas é UMA ação de upload → conta como 1 p/ o engajamento.
    // Sem isto, 1 PDF desbloqueava "Colecionador"(5)/"Estudioso"(10) de uma vez (inflação).
    prisma.exam.count({ where: { patient: { ownerId: userId }, NOT: { fileSha256: { contains: '#split-' } } } }),
    latestHealthScore(userId),
    prisma.user.findUnique({ where: { id: userId }, select: { streakDays: true } }),
    // Uploads do mês corrente (mesma regra anti-split dos uploads permanentes).
    prisma.exam.count({ where: { patient: { ownerId: userId }, createdAt: { gte: mStart }, NOT: { fileSha256: { contains: '#split-' } } } }),
    // Médicos DISTINTOS compartilhados no mês (delete+recriar mesmo médico não farma: distinct).
    prisma.doctorShare.findMany({ where: { patient: { ownerId: userId }, createdAt: { gte: mStart } }, select: { doctorId: true }, distinct: ['doctorId'] }),
  ]);
  return { exams, score: health?.score ?? null, streak: user?.streakDays ?? 0, examsMonth, sharesMonth: sharesMonth.length };
}

/** Avalia cada badge contra as métricas: earned + progresso (0-1).
 *  Aceita badges customizadas (do banco via settings) — default = ALL (permanentes + mensais). */
export function evalBadges(m: UserMetrics, badges: BadgeDef[] = ALL_BADGES): Array<BadgeDef & { earned: boolean; progress: number }> {
  return badges.map((b) => {
    const val = b.metric === 'exams' ? m.exams
      : b.metric === 'score' ? m.score ?? 0
      : b.metric === 'examsMonth' ? m.examsMonth
      : b.metric === 'sharesMonth' ? m.sharesMonth
      : m.streak;
    return { ...b, earned: val >= b.threshold, progress: Math.min(val / b.threshold, 1) };
  });
}
