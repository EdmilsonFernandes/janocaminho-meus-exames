// Tipos/DTOs compartilhados entre server e web.

export type ExamKind = 'LAB_PANEL' | 'IMAGING' | 'OTHER';
export type ExamStatus = 'UPLOADED' | 'EXTRACTING' | 'EXTRACTED' | 'FAILED';
export type ItemFlag = 'NORMAL' | 'HIGH' | 'LOW' | 'ABNORMAL' | 'CRITICAL' | 'UNKNOWN';

export interface ExamSummary {
  id: string;
  title: string;
  kind: ExamKind;
  status: ExamStatus;
  performedAt: string | null;
  sourceLab: string | null;
  pageCount: number;
  reviewRequired: boolean;
  extractionError: string | null;
}

export interface TimeSeriesPoint {
  examId: string;
  performedAt: string | null;
  title: string;
  valueNumeric: number;
  unit: string | null;
  flag: ItemFlag;
}

// ── Tendência por distância à banda de referência (FONTE CANÔNICA) ──
// "Subir" não é bom nem ruim por si só (HDL subindo é bom; glicose subindo é ruim).
// O que importa é se o valor APROXIMOU ou AFASTOU da faixa entre duas coletas.
// Usada por: server (analysis/health-state.ts) e web (utils/evolutionSummary.ts).
// Manter UMA implementação aqui — evitar drift entre server e web.
export type TrendVerdict = 'melhorou' | 'piorou' | 'estavel';

/** Distância absoluta de um valor ao intervalo [lo, hi] (0 se dentro). */
export const distToRange = (v: number, lo: number, hi: number): number =>
  v < lo ? lo - v : v > hi ? v - hi : 0;

/**
 * Veredito de tendência entre dois valores (primeiro → último) pela DISTÂNCIA
 * à banda de referência. Sem banda ou valores não-numéricos → 'estavel' (neutro,
 * não opinamos sobre bom/ruim). RESPONSÁVEL: resumo educativo; decisão clínica é do médico.
 */
export const trendVerdict = (
  firstValue: number | null,
  lastValue: number | null,
  refLow: number | null,
  refHigh: number | null,
): TrendVerdict => {
  if (firstValue == null || lastValue == null || refLow == null || refHigh == null) return 'estavel';
  const df = distToRange(firstValue, refLow, refHigh);
  const dl = distToRange(lastValue, refLow, refHigh);
  if (dl < df) return 'melhorou';
  if (dl > df) return 'piorou';
  return 'estavel';
};
