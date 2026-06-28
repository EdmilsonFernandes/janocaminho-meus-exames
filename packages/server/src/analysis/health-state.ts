/**
 * Camada de ESTADO DE SAÚDE por marcador (Layer 1 + Layer 2).
 *
 * O núcleo conceitual que faltava ao Dr. Exame: hoje tudo é linha de ExamItem
 * (histórico completo, Layer 0) e a IA é instruída por PROMPT a "priorizar o mais
 * recente". Aqui materializamos, POR MARCADOR (nameCanonical):
 *   - estado atual (último valor) + staleness (idade da última medição)
 *   - tendência (melhorando/piorando/estável/primeiro) relativa à banda de referência
 *   - delta% vs exame anterior  (computado server-side — não fica a cargo do LLM)
 *   - prioridade de atenção (magnitude) + confiança (≥2 pts e não-stale)
 * E o roll-up (Layer 2): snapshot do paciente (score, top atenção, melhoras, pioras,
 * stale, "o que mudou") — consumido por dashboard, visão de 1-min do médico e contexto IA.
 *
 * LEITURA PURA sobre ExamItem — ZERO migration. Priorização temporal vira DADO, não prompt.
 *
 * (V1: unificar priorityOf/categorize em packages/shared p/ web+server; hoje o marker
 *  leva nameCanonical e a web categoriza — sem duplicar CATS. refScaleSuspect fica no front.)
 */
import { prisma } from '../prisma';

// ───────────────────────────── tipos ─────────────────────────────

export type TrendDirection = 'melhorando' | 'piorando' | 'estavel' | 'primeiro';
export type Priority = 'normal' | 'leve' | 'moderada' | 'importante';
export type Confidence = 'alta' | 'baixa';

/** Item "achatado" com a data do exame — entrada da computação (vem do join ExamItem×Exam). */
export interface ItemRow {
  name: string;
  nameCanonical: string;
  valueNumeric: number | null;
  valueText: string | null;
  unit: string | null;
  refLow: number | null;
  refHigh: number | null;
  refText: string | null;
  flag: string;
  isAbnormal: boolean;
  performedAt: Date | null;
}

/** Layer 1 — estado de um marcador (paciente × nameCanonical). */
export interface MarkerState {
  nameCanonical: string;
  name: string; // nome de exibição (do item mais recente)
  unit: string | null;
  latest: { valueNumeric: number | null; valueText: string | null; performedAt: Date | null; ageMonths: number | null; stale: boolean };
  prior: { valueNumeric: number | null; valueText: string | null; performedAt: Date | null } | null;
  deltaPct: number | null; // latest vs prior (null se não-numérico/prior=0)
  refLow: number | null;
  refHigh: number | null;
  refText: string | null;
  flag: string;
  isAbnormal: boolean;
  priority: Priority;
  trend: TrendDirection;
  points: number; // qtd de medições
  confidence: Confidence; // baixa se <2 pts OU stale
}

/** Layer 2 — snapshot roll-up do paciente. */
export interface CurrentHealthSummary {
  patientId: string;
  generatedAt: Date;
  markers: number;
  score: number | null; // % de marcadores normais (consistente com o donut do dashboard)
  byPriority: Record<Priority, number>;
  topAttention: MarkerState[]; // anormais, por prioridade → delta
  improving: MarkerState[]; // trend melhorando
  worsening: MarkerState[]; // trend piorando
  stale: MarkerState[]; // marcadores não medidos há >12m
  whatChanged: { nameCanonical: string; name: string; deltaPct: number | null; trend: TrendDirection }[];
}

// ───────────────────────── helpers puros ─────────────────────────

const STALE_MONTHS = 12;

export function ageMonths(d: Date | null): number | null {
  if (!d) return null;
  const ms = Date.now() - d.getTime();
  if (Number.isNaN(ms) || ms < 0) return null;
  return ms / (30 * 86400000);
}

/** Delta % de latest vs prior. Null se não-numérico ou prior=0 (divisão instável). */
export function deltaPct(latest: { valueNumeric: number | null }, prior: { valueNumeric: number | null } | null): number | null {
  if (!prior || latest.valueNumeric == null || prior.valueNumeric == null) return null;
  if (prior.valueNumeric === 0) return null;
  return ((latest.valueNumeric - prior.valueNumeric) / Math.abs(prior.valueNumeric)) * 100;
}

/**
 * Tendência relativa à BANDA de referência (não só direção do número):
 *  - entrou na faixa → melhorando; saiu da faixa → piorando
 *  - os dois fora: compara distância até a banda (aproxima → melhorando, afasta → piorando)
 *  - os dois dentro → estável
 *  - sem prior ou não-numérico → flag-based; sem prior → primeiro
 */
export function trendDirection(
  latest: { valueNumeric: number | null; isAbnormal: boolean },
  prior: { valueNumeric: number | null; isAbnormal: boolean } | null,
  refLow: number | null,
  refHigh: number | null,
): TrendDirection {
  if (!prior) return 'primeiro';
  const lv = latest.valueNumeric;
  const pv = prior.valueNumeric;
  const hasBand = refLow != null && refHigh != null && refHigh > refLow;
  if (lv != null && pv != null && hasBand) {
    const inBand = (v: number) => v >= refLow! && v <= refHigh!;
    const lin = inBand(lv), pin = inBand(pv);
    if (lin && pin) return 'estavel';
    if (lin && !pin) return 'melhorando';
    if (!lin && pin) return 'piorando';
    // ambos fora da faixa — distância até a banda
    const dist = (v: number) => (v > refHigh! ? v - refHigh! : refLow! - v);
    const dl = dist(lv), dp = dist(pv);
    if (dl < dp - 1e-9) return 'melhorando';
    if (dl > dp + 1e-9) return 'piorando';
    return 'estavel';
  }
  // fallback não-numérico: anormalidade de antes → agora
  if (!latest.isAbnormal && prior.isAbnormal) return 'melhorando';
  if (latest.isAbnormal && !prior.isAbnormal) return 'piorando';
  return 'estavel';
}

/**
 * Prioridade de atenção por MAGNITUDE (responsável, não-alarmista — espelha alertPriority.ts do front).
 * Marcador normal → 'normal'. CRITICAL → importante. Com faixa: % além do limite relativo à largura.
 */
export function priorityOfItem(it: {
  flag?: string | null;
  isAbnormal?: boolean | null;
  valueNumeric?: number | null;
  refLow?: number | null;
  refHigh?: number | null;
}): Priority {
  const flag = (it.flag || '').toUpperCase();
  if (!it.isAbnormal && flag !== 'HIGH' && flag !== 'LOW' && flag !== 'ABNORMAL' && flag !== 'CRITICAL') return 'normal';
  if (flag === 'CRITICAL') return 'importante';
  const v = it.valueNumeric, lo = it.refLow, hi = it.refHigh;
  if (v != null && lo != null && hi != null && hi > lo) {
    const width = hi - lo;
    if (v > hi) {
      const over = (v - hi) / width;
      if (over >= 1) return 'importante';
      if (over >= 0.25) return 'moderada';
      return 'leve';
    }
    if (v < lo) {
      const under = (lo - v) / width;
      if (under >= 1) return 'importante';
      if (under >= 0.25) return 'moderada';
      return 'leve';
    }
  }
  if (flag === 'ABNORMAL' || flag === 'HIGH' || flag === 'LOW') return 'moderada';
  return 'leve';
}

const PRIORITY_RANK: Record<Priority, number> = { importante: 3, moderada: 2, leve: 1, normal: 0 };

// ─────────────────────── Layer 1: computação pura ───────────────────────

/**
 * Computa o estado de cada marcador a partir de itens achatados.
 * PURA (sem DB) — testável diretamente. Agrupa por nameCanonical; dentro de cada grupo
 * ordena por performedAt desc (null/sem data por último) e deriva latest/prior/trend/etc.
 */
export function computeMarkerState(rows: ItemRow[]): MarkerState[] {
  // agrupar por canonical
  const groups = new Map<string, ItemRow[]>();
  for (const r of rows) {
    const key = r.nameCanonical || r.name;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  const out: MarkerState[] = [];
  for (const [canonical, items] of groups) {
    // ordenar por performedAt desc; sem data vai pro fim (não vira "latest")
    const sorted = [...items].sort((a, b) => {
      const ta = a.performedAt ? a.performedAt.getTime() : -Infinity;
      const tb = b.performedAt ? b.performedAt.getTime() : -Infinity;
      return tb - ta;
    });
    const latest = sorted[0];
    const prior = sorted[1] ?? null;
    const age = ageMonths(latest.performedAt);
    const stale = age != null && age > STALE_MONTHS;
    const tr = trendDirection(latest, prior, latest.refLow, latest.refHigh);
    out.push({
      nameCanonical: canonical,
      name: latest.name,
      unit: latest.unit,
      latest: { valueNumeric: latest.valueNumeric, valueText: latest.valueText, performedAt: latest.performedAt, ageMonths: age, stale },
      prior: prior ? { valueNumeric: prior.valueNumeric, valueText: prior.valueText, performedAt: prior.performedAt } : null,
      deltaPct: deltaPct(latest, prior),
      refLow: latest.refLow,
      refHigh: latest.refHigh,
      refText: latest.refText,
      flag: latest.flag,
      isAbnormal: latest.isAbnormal,
      priority: priorityOfItem(latest),
      trend: tr,
      points: sorted.length,
      confidence: sorted.length >= 2 && !stale ? 'alta' : 'baixa',
    });
  }
  return out;
}

// ─────────────────────── Layer 1+2: DB ───────────────────────

/** Carrega os ExamItems de um paciente (só exames EXTRACTED) já achatados com performedAt. */
async function loadPatientRows(patientId: string): Promise<ItemRow[]> {
  const rows = await prisma.examItem.findMany({
    where: { exam: { patientId, status: 'EXTRACTED' } },
    include: { exam: { select: { performedAt: true } } },
  });
  return rows.map((r) => ({
    name: r.name,
    nameCanonical: r.nameCanonical,
    valueNumeric: r.valueNumeric,
    valueText: r.valueText,
    unit: r.unit,
    refLow: r.refLow,
    refHigh: r.refHigh,
    refText: r.refText,
    flag: r.flag,
    isAbnormal: r.isAbnormal,
    performedAt: (r.exam as { performedAt: Date | null }).performedAt,
  }));
}

/** Layer 1 — estado de todos os marcadores de um paciente. */
export async function buildMarkerState(patientId: string): Promise<MarkerState[]> {
  return computeMarkerState(await loadPatientRows(patientId));
}

/** Layer 2 — snapshot do estado atual do paciente (roll-up do Layer 1). */
export async function buildCurrentHealthSummary(patientId: string): Promise<CurrentHealthSummary> {
  const markers = await buildMarkerState(patientId);
  const byPriority: Record<Priority, number> = { normal: 0, leve: 0, moderada: 0, importante: 0 };
  for (const m of markers) byPriority[m.priority]++;
  const total = markers.length;
  const score = total ? Math.round((byPriority.normal / total) * 100) : null;

  const abnormal = markers.filter((m) => m.priority !== 'normal');
  const sortByPriorityThenDelta = (a: MarkerState, b: MarkerState) =>
    PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] || Math.abs(b.deltaPct ?? 0) - Math.abs(a.deltaPct ?? 0);

  return {
    patientId,
    generatedAt: new Date(),
    markers: total,
    score,
    byPriority,
    topAttention: abnormal.sort(sortByPriorityThenDelta).slice(0, 6),
    improving: markers.filter((m) => m.trend === 'melhorando').sort(sortByPriorityThenDelta).slice(0, 6),
    worsening: markers.filter((m) => m.trend === 'piorando').sort(sortByPriorityThenDelta).slice(0, 6),
    stale: markers.filter((m) => m.latest.stale).slice(0, 12),
    whatChanged: markers
      .filter((m) => m.deltaPct != null)
      .sort((a, b) => Math.abs(b.deltaPct ?? 0) - Math.abs(a.deltaPct ?? 0))
      .slice(0, 6)
      .map((m) => ({ nameCanonical: m.nameCanonical, name: m.name, deltaPct: m.deltaPct, trend: m.trend })),
  };
}
