import { describe, it, expect } from 'vitest';
import { collapseAdjacentNearDupes } from '../src/analysis/dedup';

const D = (iso: string) => new Date(iso).getTime();
const acc = { date: (p: { date: number }) => p.date, value: (p: { value: number }) => p.value };

describe('collapseAdjacentNearDupes — dedup cross-day (TSH 05/03 + 06/03)', () => {
  it('mesmo valor em datas adjacentes → colapsa em 1, mantém o mais antigo (data de coleta)', () => {
    const pts = [
      { date: D('2026-03-06'), value: 25.7 }, // bundle "HEMOGRAMA COMPLETO" (mislabeled)
      { date: D('2026-03-05'), value: 25.7 }, // painel tireoidiano (correto)
    ];
    const out = collapseAdjacentNearDupes(pts, acc.date, acc.value);
    expect(out).toHaveLength(1);
    expect(out[0].date).toBe(D('2026-03-05')); // mantém a coleta (mais antiga)
  });

  it('dias consecutivos com valores DIFERENTES → mantém os 2 (evolução real)', () => {
    const pts = [
      { date: D('2026-03-05'), value: 25.7 },
      { date: D('2026-03-06'), value: 30.0 },
    ];
    expect(collapseAdjacentNearDupes(pts, acc.date, acc.value)).toHaveLength(2);
  });

  it('fora da janela (>3 dias) mesmo valor → mantém os 2', () => {
    const pts = [
      { date: D('2026-03-01'), value: 25.7 },
      { date: D('2026-03-10'), value: 25.7 }, // 9 dias depois — exame real diferente
    ];
    expect(collapseAdjacentNearDupes(pts, acc.date, acc.value, 3, 0.01)).toHaveLength(2);
  });

  it('cluster de 3 re-envios do mesmo laudo em dias seguidos → 1 ponto', () => {
    const pts = [
      { date: D('2026-03-05'), value: 25.7 },
      { date: D('2026-03-06'), value: 25.7 },
      { date: D('2026-03-07'), value: 25.7 },
    ];
    const out = collapseAdjacentNearDupes(pts, acc.date, acc.value);
    expect(out).toHaveLength(1);
    expect(out[0].date).toBe(D('2026-03-05'));
  });

  it('tolerância relativa 1%: dentro colapsa, acima mantém', () => {
    const near = [
      { date: D('2026-03-05'), value: 100 },
      { date: D('2026-03-06'), value: 100.5 }, // 0,5% → colapsa (rounding do mesmo laudo)
    ];
    expect(collapseAdjacentNearDupes(near, acc.date, acc.value)).toHaveLength(1);
    const far = [
      { date: D('2026-03-05'), value: 100 },
      { date: D('2026-03-06'), value: 102 }, // 2% → mantém (evolução real)
    ];
    expect(collapseAdjacentNearDupes(far, acc.date, acc.value)).toHaveLength(2);
  });

  it('vazio ou 1 ponto → passa direto', () => {
    expect(collapseAdjacentNearDupes([], acc.date, acc.value)).toEqual([]);
    const one = [{ date: D('2026-03-05'), value: 25.7 }];
    expect(collapseAdjacentNearDupes(one, acc.date, acc.value)).toHaveLength(1);
  });

  it('série real do Edmilson (TSH): só o reenvio 06/03 colapsa, resto permanece', () => {
    const pts = [
      { date: D('2018-03-03'), value: 2.61 },
      { date: D('2021-05-19'), value: 2.75 },
      { date: D('2023-05-22'), value: 2.12 },
      { date: D('2025-05-05'), value: 2.22 },
      { date: D('2026-03-05'), value: 25.7 }, // painel tireoidiano
      { date: D('2026-03-06'), value: 25.7 }, // bundle duplicado
      { date: D('2026-05-12'), value: 11.0 },
      { date: D('2026-06-11'), value: 7.32 },
    ];
    const out = collapseAdjacentNearDupes(pts, acc.date, acc.value);
    expect(out).toHaveLength(7); // 8 − 1 duplicado
    expect(out.find((p) => p.date === D('2026-03-06'))).toBeUndefined();
    expect(out.find((p) => p.date === D('2026-03-05'))?.value).toBe(25.7);
  });
});
