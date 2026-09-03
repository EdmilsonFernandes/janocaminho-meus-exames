/**
 * activitySummary — consumidor WEB do consolidado de atividade (ActivityCard duas-fontes).
 *
 * O APK lê o Health Connect direto pela bridge nativa (services/healthConnect.ts).
 * O navegador NÃO tem acesso ao dispositivo — este serviço busca no backend o que o
 * app JÁ sincronizou (GET /measurements/activity-summary) e converte p/ ActivityDay[],
 * alimentando a MESMA matemática do card (summarize() de utils/activityStats).
 * A web nunca tenta acessar o Health Connect: apenas lê o snapshot consolidado.
 */
import { API_URL, apiHeaders } from '../config';
import type { ActivityDay } from '../utils/activityStats';

export interface MetricSummary {
  latest: number | null;
  latestDate: string | null;
  goal?: number;
  goalPct?: number | null;
  avg7: number | null;
  avg30: number | null;
  prevAvg30: number | null;
  deltaPct30: number | null;
  series7: { date: string; value: number }[];
  series30: { date: string; value: number }[];
}

export interface ActivitySummaryRemote {
  lastSyncAt: string | null;
  metrics: {
    STEPS: MetricSummary;
    CALORIES: MetricSummary;
    DISTANCE: MetricSummary;
    HEART_RATE: MetricSummary;
    /** Opcional: server anterior ao P2-j não devolve (fallback vazio no mapping). */
    EXERCISE_MINUTES?: MetricSummary;
  };
}

/** null em falha/offline — quem chama decide (nunca joga). patientId explícito preserva
 *  a semântica de perfil selecionado (sem ele o server resolve p/ pids[0]). */
export const fetchActivitySummary = async (days = 30, patientId?: string | null): Promise<ActivitySummaryRemote | null> => {
  try {
    const qs = new URLSearchParams({ days: String(days) });
    if (patientId) qs.set('patientId', patientId);
    const r = await fetch(`${API_URL}/measurements/activity-summary?${qs}`, { headers: apiHeaders() });
    return r.ok ? await r.json() : null;
  } catch { return null; }
};

/** Converte o consolidado do server em ActivityDay[] (ordem DESC — contrato do summarize()).
 *  A FC gravada no server é `hrRest ?? hrAvg` do sync (um só número/dia) → mapeia nos dois
 *  campos: o card exibe hrRest; hrAvg serve de fallback interno. */
export const summaryToDays = (s: ActivitySummaryRemote): ActivityDay[] => {
  const byDate = new Map<string, ActivityDay>();
  const put = (date: string, fn: (d: ActivityDay) => void) => {
    const d = byDate.get(date) ?? { date, steps: 0, kcal: 0, km: 0 };
    fn(d);
    byDate.set(date, d);
  };
  for (const p of s.metrics.STEPS.series30) put(p.date, (d) => { d.steps = p.value; });
  for (const p of s.metrics.CALORIES.series30) put(p.date, (d) => { d.kcal = p.value; });
  for (const p of s.metrics.DISTANCE.series30) put(p.date, (d) => { d.km = p.value; });
  for (const p of s.metrics.HEART_RATE.series30) put(p.date, (d) => { d.hrRest = p.value; d.hrAvg = p.value; });
  for (const p of s.metrics.EXERCISE_MINUTES?.series30 ?? []) put(p.date, (d) => { d.exerciseMin = p.value; });
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
};

/** Carimbo relativo do último sync: "hoje às 08:42" · "há 2 horas" · "ontem" · "há 3 dias".
 *  stale = >24h sem sincronizar → a UI acrescenta "Abra o app Dr. Exame para atualizar". */
export const syncStamp = (iso: string): { label: string; stale: boolean } => {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return { label: '', stale: false };
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 1) return { label: 'agora mesmo', stale: false };
  if (mins < 60) return { label: `há ${mins} min`, stale: false };
  const hours = Math.round(mins / 60);
  if (hours < 24) return { label: `há ${hours} hora${hours > 1 ? 's' : ''}`, stale: false };
  const days = Math.round(hours / 24);
  if (days === 1) return { label: 'ontem', stale: true };
  return { label: `há ${days} dias`, stale: true };
};
