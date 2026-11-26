// ============================================================================
// ACTIVITY SUMMARY (consolidado) — a fonte da WEB (duas-fontes do ActivityCard).
// O APK lê o Health Connect direto pela bridge nativa; o navegador NÃO tem
// acesso ao dispositivo. Consolida o que o APK JÁ sincronizou
// (mesma tabela measurements, note='Health Connect') numa resposta única por
// métrica: último valor, médias 7/30d, delta vs período anterior e séries
// diárias. lastSyncAt = max(createdAt) das rows (o sync é delete+create por
// dia → o createdAt da linha mais recente ≈ hora do último sync) — SEM
// coluna nova/SEM migration.
//
// Serviço (antes a lógica vivia só no handler de GET /measurements/activity-summary):
// extraída SEM mudança de comportamento para o panorama da saúde
// (GET /patients/:id/panorama) ler a MESMA conta que a tela de atividade mostra.
// ============================================================================
import { prisma } from '../prisma';

export const ACTIVITY_METRICS = ['STEPS', 'CALORIES', 'DISTANCE', 'HEART_RATE', 'EXERCISE_MINUTES', 'SLEEP_MINUTES'] as const;
export type ActivityMetric = (typeof ACTIVITY_METRICS)[number];
/** Meta diária de passos — espelha STEPS_GOAL do web (utils/activityStats.ts). */
export const ACTIVITY_STEP_GOAL = 8000;
export type MetricSummary = {
  latest: number | null; latestDate: string | null;
  goal?: number; goalPct?: number | null;
  avg7: number | null; avg30: number | null; prevAvg30: number | null; deltaPct30: number | null;
  series7: { date: string; value: number }[]; series30: { date: string; value: number }[];
};
export type ActivitySummary = { lastSyncAt: string | null; metrics: Record<ActivityMetric, MetricSummary> };
/** DISTANCE guarda km com 2 decimais — round() genérico amassava 3,46 → 4. */
const rndMetric = (t: ActivityMetric, v: number) => (t === 'DISTANCE' ? Number(v.toFixed(2)) : Math.round(v));

const emptyMetrics = (): Record<ActivityMetric, MetricSummary> => ({
  STEPS: { latest: null, latestDate: null, goal: ACTIVITY_STEP_GOAL, goalPct: null, avg7: null, avg30: null, prevAvg30: null, deltaPct30: null, series7: [], series30: [] },
  CALORIES: { latest: null, latestDate: null, avg7: null, avg30: null, prevAvg30: null, deltaPct30: null, series7: [], series30: [] },
  DISTANCE: { latest: null, latestDate: null, avg7: null, avg30: null, prevAvg30: null, deltaPct30: null, series7: [], series30: [] },
  HEART_RATE: { latest: null, latestDate: null, avg7: null, avg30: null, prevAvg30: null, deltaPct30: null, series7: [], series30: [] },
  EXERCISE_MINUTES: { latest: null, latestDate: null, avg7: null, avg30: null, prevAvg30: null, deltaPct30: null, series7: [], series30: [] },
  SLEEP_MINUTES: { latest: null, latestDate: null, avg7: null, avg30: null, prevAvg30: null, deltaPct30: null, series7: [], series30: [] },
});

/**
 * Resumo da atividade de um paciente numa janela de `days` (7–90). `now` é parâmetro só para
 * poder testar/exigir o mesmo instante numa mesma resposta — o default é o relógio.
 */
export async function buildActivitySummary(patientId: string, days: number, now: Date = new Date()): Promise<ActivitySummary> {
  const since = new Date(now.getTime() - 2 * days * 86400000); // janela 2×: período atual + anterior
  const rows = await prisma.measurement.findMany({
    where: { patientId, type: { in: [...ACTIVITY_METRICS] }, note: 'Health Connect', measuredAt: { gte: since } },
    orderBy: [{ measuredAt: 'desc' }, { createdAt: 'desc' }],
    select: { type: true, value: true, measuredAt: true, createdAt: true },
  });
  if (rows.length === 0) return { lastSyncAt: null, metrics: emptyMetrics() };

  // Dedup de LEITURA por type+dia: o sort é desc, o 1º visto é o mais recente do dia.
  // (O sync já é idempotente, mas rows de syncs distintos podem cruzar a janela 2×.)
  const byMetricDay = new Map<ActivityMetric, Map<string, number>>();
  let lastSyncAt: Date | null = null;
  for (const r of rows) {
    const t = r.type as ActivityMetric;
    if (!ACTIVITY_METRICS.includes(t)) continue;
    const day = r.measuredAt.toISOString().slice(0, 10);
    const daysMap = byMetricDay.get(t) ?? new Map<string, number>();
    if (!daysMap.has(day)) daysMap.set(day, r.value);
    byMetricDay.set(t, daysMap);
    if (!lastSyncAt || r.createdAt > lastSyncAt) lastSyncAt = r.createdAt;
  }

  const metrics = emptyMetrics();
  const cutoff = now.getTime() - days * 86400000;
  for (const t of ACTIVITY_METRICS) {
    const daysMap = byMetricDay.get(t);
    if (!daysMap) continue;
    const entries = [...daysMap.entries()].map(([date, value]) => ({ date, value })).sort((a, b) => (a.date < b.date ? -1 : 1));
    const inWindow = (e: { date: string }) => new Date(`${e.date}T12:00:00Z`).getTime() >= cutoff;
    const cur = entries.filter(inWindow);
    const prev = entries.filter((e) => !inWindow(e));
    const avg = (arr: { value: number }[]) => (arr.length ? arr.reduce((s, e) => s + e.value, 0) / arr.length : null);
    const avg7 = avg(cur.slice(-7));
    const avg30 = avg(cur.slice(-Math.min(30, days)));
    const prevAvg = avg(prev.slice(-days));
    const last = entries[entries.length - 1] ?? null;
    metrics[t] = {
      latest: last?.value ?? null,
      latestDate: last?.date ?? null,
      ...(t === 'STEPS' ? { goal: ACTIVITY_STEP_GOAL, goalPct: last ? Math.min(100, Math.round((last.value / ACTIVITY_STEP_GOAL) * 100)) : null } : {}),
      avg7: avg7 != null ? rndMetric(t, avg7) : null,
      avg30: avg30 != null ? rndMetric(t, avg30) : null,
      prevAvg30: prevAvg != null ? rndMetric(t, prevAvg) : null,
      deltaPct30: avg30 != null && prevAvg && prevAvg > 0 ? Math.round(((avg30 - prevAvg) / prevAvg) * 100) : null,
      series7: cur.slice(-7),
      series30: cur.slice(-30),
    };
  }
  return { lastSyncAt: lastSyncAt?.toISOString() ?? null, metrics };
}
