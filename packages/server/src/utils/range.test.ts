import { describe, it, expect } from 'vitest';
import { median, medianRefRange } from './range';

/** medianRefRange — faixa UNIFICADA (mediana) de uma série temporal (mandato 2026-08-18). */
describe('median', () => {
  it('array ímpar → elemento central', () => {
    expect(median([3, 1, 2])).toBe(2);
  });
  it('array par → média dos 2 centrais', () => {
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
  it('vazio → null', () => {
    expect(median([])).toBeNull();
  });
});

describe('medianRefRange', () => {
  const r = (low: number | null, high: number | null) => ({ refLow: low, refHigh: high });

  it('série da Heloisa: mistura 12–15.8 ×5 e 13–16.5 ×2 → mediana 12–15.8', () => {
    const pts = [
      r(12, 15.8), r(12, 15.8), r(13, 16.5), r(12, 15.8), r(12, 15.8), r(13, 16.5), r(12, 15.8),
    ];
    expect(medianRefRange(pts)).toEqual({ refLow: 12, refHigh: 15.8 });
  });

  it('faixas idênticas → a própria faixa (comportamento antigo preservado)', () => {
    expect(medianRefRange([r(0.4, 4), r(0.4, 4)])).toEqual({ refLow: 0.4, refHigh: 4 });
  });

  it('pontos SEM faixa não contam, mas recebem a mediana dos demais (caso do 0,15 g/dL)', () => {
    const pts = [r(12, 15.8), r(null, null), r(13, 16.5), r(null, null)];
    expect(medianRefRange(pts)).toEqual({ refLow: 12.5, refHigh: 16.15 });
  });

  it('faixa inválida (refHigh ≤ refLow, ex.: outlier de extração refHigh=0.03) é ignorada', () => {
    const pts = [r(12, 15.8), r(0.5, 0.03), r(13, 16.5)];
    // só 12–15.8 e 13–16.5 contam → mediana dos pares
    expect(medianRefRange(pts)).toEqual({ refLow: 12.5, refHigh: 16.15 });
  });

  it('faixa parcial (só um limite) não conta para a mediana', () => {
    expect(medianRefRange([r(12, null), r(13, 16.5)])).toEqual({ refLow: 13, refHigh: 16.5 });
  });

  it('nenhum ponto com faixa válida → nulls (caller decide fallback)', () => {
    expect(medianRefRange([r(null, null), r(12, null)])).toEqual({ refLow: null, refHigh: null });
  });
});
