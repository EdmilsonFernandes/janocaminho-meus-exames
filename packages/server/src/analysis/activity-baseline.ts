import { prisma } from '../prisma';

/**
 * ActivityBaselineEngine — calcula baselines de atividade por janela temporal.
 *
 * Para cada janela (30/60/90 dias), calcula as médias diárias de passos, kcal,
 * km, exercício e FR. Só retorna se houver cobertura suficiente (≥50% dos dias
 * com dados de passos). Isso alimenta o card "Desde seu último exame" e o
 * CorrelationEngine (Fase 2).
 */
export interface ActivityBaseline {
  windowDays: number;
  startDate: string; // YYYY-MM-DD
  endDate: string;
  avgSteps: number;
  avgKcal: number;
  avgKm: number;
  avgExerciseMin: number;
  avgHrRest: number | null; // FR média (se disponível)
  avgWeightKg: number | null; // peso médio (se medições manuais existirem)
  avgSystolic: number | null; // PA sistólica (se medições existirem)
  daysCovered: number;
  coverage: number; // 0-1
  dataSource: string;
}

/** Calcula o baseline de atividade de um paciente numa janela específica. */
export async function buildBaseline(
  patientId: string,
  windowDays: number,
  endDate: Date = new Date(),
): Promise<ActivityBaseline | null> {
  const startDate = new Date(endDate.getTime() - windowDays * 86400000);
  const rows = await prisma.measurement.findMany({
    where: {
      patientId,
      type: { in: ['STEPS', 'CALORIES', 'DISTANCE', 'WEIGHT', 'BLOOD_PRESSURE'] },
      measuredAt: { gte: startDate, lte: endDate },
    },
    select: { type: true, value: true, valueSecondary: true, measuredAt: true },
  }).catch(() => []);

  if (!rows.length) return null;

  // Agrupa por dia
  const byDay = new Map<string, { s: number; c: number; d: number; e: number; hr: number[]; w: number[]; sys: number[] }>();
  for (const r of rows) {
    const key = r.measuredAt.toISOString().slice(0, 10);
    const acc = byDay.get(key) ?? { s: 0, c: 0, d: 0, e: 0, hr: [], w: [], sys: [] };
    switch (r.type) {
      case 'STEPS': acc.s = r.value; break;
      case 'CALORIES': acc.c = r.value; break;
      case 'DISTANCE': acc.d = r.value; break;
      case 'WEIGHT': if (r.value > 0) acc.w.push(r.value); break;
      case 'BLOOD_PRESSURE': if (r.valueSecondary != null) acc.sys.push(r.value); break; // value = sistólica
    }
    byDay.set(key, acc);
  }

  // Exercício e FR ainda não são persistidos como medições (só em memória no widget).
  // Na Fase 2 serão persistidos via activity-sync.
  const days = [...byDay.values()].filter((a) => a.s > 0); // dia conta se tem passos
  if (days.length < windowDays * 0.5) return null; // cobertura mínima 50%

  const avg = (fn: (d: typeof days[0]) => number) =>
    days.length ? days.reduce((t, d) => t + fn(d), 0) / days.length : 0;
  const avgArr = (arrs: number[][]) => {
    const all = arrs.flat();
    return all.length ? all.reduce((t, v) => t + v, 0) / all.length : null;
  };

  return {
    windowDays,
    startDate: startDate.toISOString().slice(0, 10),
    endDate: endDate.toISOString().slice(0, 10),
    avgSteps: Math.round(avg((d) => d.s)),
    avgKcal: Math.round(avg((d) => d.c)),
    avgKm: Math.round(avg((d) => d.d) * 10) / 10,
    avgExerciseMin: 0, // Fase 2: persistir exercício
    avgHrRest: null, // Fase 2: FR não é persistido ainda
    avgWeightKg: avgArr(days.map((d) => d.w)),
    avgSystolic: avgArr(days.map((d) => d.sys)),
    daysCovered: days.length,
    coverage: days.length / windowDays,
    dataSource: 'Health Connect (via Dr. Exame sync)',
  };
}

/**
 * Compara o baseline ATUAL (após o último exame) com o ANTERIOR (antes do exame).
 * Retorna as mudanças que alimentam o card "Desde seu último exame".
 */
export interface BaselineComparison {
  current: ActivityBaseline;
  previous: ActivityBaseline | null;
  changes: {
    metric: string;
    label: string;
    from: number;
    to: number;
    deltaPct: number | null;
    direction: 'up' | 'down' | 'stable';
    unit: string;
    emoji: string;
  }[];
}

export async function compareBaselines(
  patientId: string,
  lastExamDate: Date,
): Promise<BaselineComparison | null> {
  // Janela ATUAL: do último exame até hoje
  const current = await buildBaseline(patientId, 30, new Date());
  if (!current) return null;

  // Janela ANTERIOR: 30 dias antes do último exame
  const previous = await buildBaseline(patientId, 30, lastExamDate);

  const changes: BaselineComparison['changes'] = [];

  const compare = (
    metric: string, label: string, emoji: string, unit: string,
    from: number | null, to: number,
    invertGood = false, // true = menor é melhor (peso, PA)
  ) => {
    if (from == null || from === 0 || to === 0) return;
    const pct = from !== 0 ? Math.round(((to - from) / Math.abs(from)) * 100) : null;
    if (pct == null || Math.abs(pct) < 5) return; // ignora <5% (ruído)
    changes.push({
      metric, label, emoji, unit,
      from: Math.round(from * 10) / 10,
      to: Math.round(to * 10) / 10,
      deltaPct: pct,
      direction: pct > 0 ? 'up' : 'down',
    });
  };

  const p = previous;
  compare('avgSteps', 'Atividade', '🏃', 'passos/dia', p?.avgSteps ?? null, current.avgSteps);
  compare('avgKm', 'Distância', '📍', 'km/dia', p?.avgKm ?? null, current.avgKm);
  compare('avgWeightKg', 'Peso', '⚖️', 'kg', p?.avgWeightKg ?? null, current.avgWeightKg ?? 0, true);
  compare('avgSystolic', 'Pressão', '🩺', 'mmHg', p?.avgSystolic ?? null, current.avgSystolic ?? 0, true);

  return { current, previous, changes };
}
