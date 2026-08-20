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
  /** Métrica principal do período (média/dia p/ 7d e 30d; valor do dia p/ hoje). */
  steps: number;
  kcal: number;
  km: number;
  /** Série p/ o sparkline (mais antigo → mais recente), já recortada ao range. */
  series: { date: string; steps: number }[];
  daysCounted: number;
  goalRatio: number;
}

/** Resumo do range a partir da série de dias (esperada em ordem DESC — mais recente primeiro). */
export const summarize = (days: ActivityDay[], range: ActivityRange): ActivitySummary => {
  if (!days.length) {
    return { steps: 0, kcal: 0, km: 0, series: [], daysCounted: 0, goalRatio: 0 };
  }
  if (range === 'today') {
    const d = days[0];
    return {
      steps: d.steps, kcal: d.kcal, km: d.km,
      series: [{ date: d.date, steps: d.steps }],
      daysCounted: 1,
      goalRatio: Math.min(1, d.steps / STEPS_GOAL),
    };
  }
  const n = range === '7d' ? 7 : 30;
  const slice = days.slice(0, n);
  return {
    steps: Math.round(avg(days, 'steps', n)),
    kcal: Math.round(avg(days, 'kcal', n)),
    km: Math.round(avg(days, 'km', n) * 10) / 10,
    series: [...slice].reverse().map((d) => ({ date: d.date, steps: d.steps })),
    daysCounted: slice.length,
    goalRatio: Math.min(1, avg(days, 'steps', n) / STEPS_GOAL),
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

/** Normaliza o payload cru do bridge p/ ActivityDay[] (ORDENA desc + dedup por data). */
export const normalizeDays = (raw: Array<Partial<ActivityDay>>): ActivityDay[] => {
  const byDate = new Map<string, ActivityDay>();
  for (const r of raw) {
    if (!r?.date) continue;
    byDate.set(r.date, {
      date: r.date,
      steps: Math.max(0, Math.round(Number(r.steps ?? 0))),
      kcal: Math.max(0, Number(r.kcal ?? 0)),
      km: metersToKm(Math.max(0, Number(r.km ?? 0))),
    });
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
};
