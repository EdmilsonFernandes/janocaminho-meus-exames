/**
 * activityStats — matemática pura do Activity Widget (Health Connect).
 * SEM React/DFS nativo: 100% testável em unidade (vitest node).
 *
 * Contrato de dados: o bridge nativo devolve dias com passos (u), kcal (energia
 * total do dia) e km (distância já convertida). Toda formatação/agregação da UI
 * passa por aqui — o componente só desenha o que estas funções calculam.
 */

export interface ActivityDay {
  /** YYYY-MM-DD (local do aparelho) */
  date: string;
  steps: number;
  kcal: number;
  km: number;
  /** FR média do dia (bpm) — 0 se sem dado */
  hrAvg?: number;
  /** FR máxima do dia (bpm) — 0 se sem dado */
  hrMax?: number;
  /** Minutos de exercício formal (esteira, corrida, etc) */
  exerciseMin?: number;
}

export type ActivityRange = 'today' | '7d' | '30d';

export const STEPS_GOAL = 8000;

/** Metros → km com 2 casas (Health Connect DISTANCE vem em metros/Length). */
export const metersToKm = (meters: number): number => Math.round((meters / 1000) * 100) / 100;

/** Média de um campo dos últimos N dias (incluindo hoje), ignorando dias ausentes. */
const avg = (days: ActivityDay[], key: keyof Omit<ActivityDay, 'date'>, n: number): number => {
  const slice = days.slice(0, n);
  if (!slice.length) return 0;
  return slice.reduce((a, d) => a + (d[key] || 0), 0) / slice.length;
};

export interface ActivitySummary {
  /** Métrica principal legada do período (hoje = valor do dia; 7d/30d = média/dia). */
  steps: number;
  kcal: number;
  km: number;
  /** Totais do período selecionado. */
  totalSteps: number;
  totalKcal: number;
  totalKm: number;
  /** Médias do período selecionado. */
  avgSteps: number;
  avgKcal: number;
  avgKm: number;
  /** FR média (bpm) do período */
  hrAvg: number;
  /** FR máxima (bpm) do período */
  hrMax: number;
  /** Minutos de exercício formal (média/dia ou total do dia) */
  exerciseMin: number;
  /** Série p/ o sparkline (mais antigo → mais recente), já recortada ao range. */
  series: { date: string; steps: number }[];
  daysCounted: number;
  goalRatio: number;
}

/** Resumo do range a partir da série de dias (esperada em ordem DESC — mais recente primeiro). */
export const summarize = (days: ActivityDay[], range: ActivityRange): ActivitySummary => {
  if (!days.length) {
    return { steps: 0, kcal: 0, km: 0, totalSteps: 0, totalKcal: 0, totalKm: 0, avgSteps: 0, avgKcal: 0, avgKm: 0, hrAvg: 0, hrMax: 0, exerciseMin: 0, series: [], daysCounted: 0, goalRatio: 0 };
  }
  if (range === 'today') {
    const d = days[0];
    return {
      steps: d.steps, kcal: d.kcal, km: d.km,
      totalSteps: d.steps, totalKcal: d.kcal, totalKm: d.km,
      avgSteps: d.steps, avgKcal: d.kcal, avgKm: d.km,
      hrAvg: d.hrAvg ?? 0, hrMax: d.hrMax ?? 0, exerciseMin: d.exerciseMin ?? 0,
      series: [{ date: d.date, steps: d.steps }],
      daysCounted: 1,
      goalRatio: Math.min(1, d.steps / STEPS_GOAL),
    };
  }
  const n = range === '7d' ? 7 : 30;
  const slice = days.slice(0, n);
  const hrDays = slice.filter((d) => (d.hrAvg ?? 0) > 0);
  const totalSteps = slice.reduce((a, d) => a + d.steps, 0);
  const totalKcal = slice.reduce((a, d) => a + d.kcal, 0);
  const totalKm = Math.round(slice.reduce((a, d) => a + d.km, 0) * 10) / 10;
  const avgSteps = Math.round(avg(days, 'steps', n));
  const avgKcal = Math.round(avg(days, 'kcal', n));
  const avgKm = Math.round(avg(days, 'km', n) * 10) / 10;
  return {
    steps: avgSteps,
    kcal: avgKcal,
    km: avgKm,
    totalSteps,
    totalKcal,
    totalKm,
    avgSteps,
    avgKcal,
    avgKm,
    hrAvg: hrDays.length ? Math.round(hrDays.reduce((t, d) => t + (d.hrAvg ?? 0), 0) / hrDays.length) : 0,
    hrMax: slice.reduce((m, d) => Math.max(m, d.hrMax ?? 0), 0),
    exerciseMin: Math.round(slice.reduce((t, d) => t + (d.exerciseMin ?? 0), 0) / slice.length),
    series: [...slice].reverse().map((d) => ({ date: d.date, steps: d.steps })),
    daysCounted: slice.length,
    goalRatio: Math.min(1, avgSteps / STEPS_GOAL),
  };
};

/** 8432 → "8.432"; 12450 → "12,4 mil" (compacto acima de 10k p/ caber no mobile). */
export const fmtSteps = (steps: number): string =>
  steps >= 10000
    ? `${(steps / 1000).toFixed(1).replace('.', ',').replace(',0', '')} mil`
    : Math.round(steps).toLocaleString('pt-BR');

/** 5.42 → "5,4 km" (1 casa; a unidade acompanha no rótulo quando o card já diz "km"). */
export const fmtKm = (km: number): string => km.toFixed(1).replace('.', ',').replace(',0', ',0');

export const fmtKcal = (kcal: number): string => Math.round(kcal).toLocaleString('pt-BR');

/** Altura relativa (0..1) da barra do sparkline p/ o valor, com mínimo visível. */
export const barHeight = (value: number, max: number): number =>
  max <= 0 ? 0 : Math.max(0.08, Math.min(1, value / max));

/**
 * Contexto da semana do último exame (Onda 2 — "Dashboard sábio"):
 * média de atividade na janela [exame-6d, exame]. Só retorna se houver >=3 dias
 * com dados nessa janela — sem dados suficientes, NADA aparece (nada inventado).
 */
export const weekOfExam = (days: ActivityDay[], examDate: string): { avgSteps: number; avgKcal: number; avgKm: number; daysCounted: number } | null => {
  const end = new Date(`${examDate}T12:00:00`);
  if (Number.isNaN(end.getTime())) return null;
  const start = new Date(end.getTime() - 6 * 86400000);
  const inWindow = days.filter((d) => {
    const t = new Date(`${d.date}T12:00:00`).getTime();
    return !Number.isNaN(t) && t >= start.getTime() && t <= end.getTime();
  });
  if (inWindow.length < 3) return null;
  const avg = (k: 'steps' | 'kcal' | 'km') => inWindow.reduce((a, d) => a + d[k], 0) / inWindow.length;
  return { avgSteps: Math.round(avg('steps')), avgKcal: Math.round(avg('kcal')), avgKm: Math.round(avg('km') * 10) / 10, daysCounted: inWindow.length };
};

/** Normaliza o payload cru do bridge p/ ActivityDay[] (ORDENA desc + dedup por data). */
export const normalizeDays = (raw: Array<Partial<ActivityDay>>): ActivityDay[] => {
  const byDate = new Map<string, ActivityDay>();
  for (const r of raw) {
    if (!r?.date) continue;
    byDate.set(r.date, {
      date: r.date,
      steps: Math.max(0, Math.round(Number(r.steps ?? 0))),
      kcal: Math.max(0, Number(r.kcal ?? 0)),
      // Bridge já envia KM (não metros) — NÃO converter (bug: metersToKm dividia por 1000)
      km: Math.max(0, Number(r.km ?? 0)),
      hrAvg: Math.max(0, Math.round(Number(r.hrAvg ?? 0))),
      hrMax: Math.max(0, Math.round(Number(r.hrMax ?? 0))),
      exerciseMin: Math.max(0, Math.round(Number(r.exerciseMin ?? 0))),
    });
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
};
