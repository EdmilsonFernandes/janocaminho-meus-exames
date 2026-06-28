/**
 * Resumo de evolução — RUNTIME, sem diagnóstico.
 *
 * Veredito por DISTÂNCIA À FAIXA de referência (não por direção bruta):
 * "subir" não é bom nem ruim por si só (HDL subindo é bom; glicose subindo é ruim).
 * O que importa é se o valor APROXIMOU ou AFASTOU da faixa entre as coletas.
 *   - último mais perto da faixa que o primeiro → melhorou
 *   - último mais longe → piorou
 *   - ambos na faixa / equidistantes → estável
 *
 * RESPONSÁVEL: é um resumo educativo de tendência. A decisão clínica é do médico.
 */

import { trendVerdict as verdictByDistance, type TrendVerdict } from '@meus-exames/shared';

export type Verdict = TrendVerdict;

export interface VerdictMeta { key: Verdict; emoji: string; label: string; color: string }

export const VERDICT_META: Record<Verdict, VerdictMeta> = {
  melhorou: { key: 'melhorou', emoji: '🟢', label: 'Melhoraram', color: '#16a34a' },
  piorou:   { key: 'piorou',   emoji: '🔴', label: 'Pioraram',   color: '#dc2626' },
  estavel:  { key: 'estavel',  emoji: '✅', label: 'Estáveis',   color: '#64748b' },
};

export interface TrendItem {
  firstValue: number;
  lastValue: number;
  refLow?: number | null;
  refHigh?: number | null;
  direction?: 'up' | 'down' | 'stable' | string | null;
}

/**
 * Veredito de evolução de UM marcador entre a primeira e a última medição.
 * Delega ao `trendVerdict` canônico do @meus-exames/shared (distância à faixa) —
 * fonte única da lógica de tendência, compartilhada c/ o server (health-state).
 * Sem faixa de referência → 'estavel' (não opinamos sobre bom/ruim).
 */
export const trendVerdict = (it: TrendItem | null | undefined): Verdict => {
  if (!it) return 'estavel';
  if (Number.isNaN(it.firstValue) || Number.isNaN(it.lastValue)) return 'estavel';
  return verdictByDistance(it.firstValue, it.lastValue, it.refLow ?? null, it.refHigh ?? null);
};

export interface EvolutionSummary { counts: Record<Verdict, number>; total: number }

/** Conta vereditos de uma lista de marcadores. */
export const summarizeTrends = (items: TrendItem[]): EvolutionSummary => {
  const counts = { melhorou: 0, piorou: 0, estavel: 0 };
  for (const it of items) counts[trendVerdict(it)]++;
  return { counts, total: items.length };
};

/** Frase de leitura NÃO-alarmista (educativa) a partir das contagens. */
export const trendHeadline = (s: EvolutionSummary): string => {
  const { melhorou: m, piorou: p } = s.counts;
  if (s.total === 0) return 'Envie ao menos 2 exames de datas diferentes pra ver sua evolução.';
  if (p === 0 && m > 0) return 'Seus marcadores estão evoluindo bem — continue assim. ✅';
  if (p > m) return `Alguns marcadores pioraram (${p}) — vale conversar com seu médico na próxima consulta.`;
  if (m > 0 && p > 0) return 'Mistura de melhoras e pioras — acompanhe os destaques abaixo.';
  return 'Tudo estável entre as coletas — mantenha o acompanhamento.';
};
