/**
 * Faixa de referência UNIFICADA de uma série temporal (mandato do dono 2026-08-18):
 * laboratórios diferentes usam faixas diferentes para o mesmo analito (ex.: hemoglobina
 * 12–15.8 num exame, 13–16.5 noutro). A série inteira é exibida e classificada contra
 * UMA faixa só — a MEDIANA dos limites dos pontos com faixa válida (mediana > média:
 * imune a outlier de extração, ex.: refHigh=0.03). Espelha o cálculo do header do
 * TrendsChart (web), que já rotula "mediana dos exames" quando as faixas divergem.
 */

/** Mediana de um array numérico (ímpar: central; par: média dos 2 centrais). Vazio → null. */
export function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export interface HasRange {
  refLow: number | null;
  refHigh: number | null;
}

/**
 * Mediana das faixas dos pontos (só faixas completas e válidas: refHigh > refLow contam).
 * Sem nenhum ponto com faixa válida → { null, null } (o caller decide o fallback, tipicamente
 * a faixa do item mais recente).
 */
export function medianRefRange<T extends HasRange>(points: T[]): { refLow: number | null; refHigh: number | null } {
  const valid = points.filter(
    (p) => p.refLow != null && p.refHigh != null && (p.refHigh as number) > (p.refLow as number),
  );
  if (!valid.length) return { refLow: null, refHigh: null };
  return {
    refLow: median(valid.map((p) => p.refLow as number)),
    refHigh: median(valid.map((p) => p.refHigh as number)),
  };
}
