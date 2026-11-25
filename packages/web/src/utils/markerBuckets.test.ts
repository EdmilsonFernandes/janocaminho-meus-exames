// @vitest-environment node
/**
 * Régua única do "fora da faixa" na Home: o card "Seus Marcadores" tem que concordar com o
 * herói e com o bloco "Fora da faixa" (conta de QA real em 25/11/26: herói "1 Leve", bloco "5",
 * card "4 de 8 normais · 3 requer atenção").
 */
import { describe, expect, it } from 'vitest';
import { currentBucketsFromHealth } from './markerBuckets';

describe('currentBucketsFromHealth — buckets no estado atual', () => {
  it('conta de QA de 25/11: 3 normais, 4 com desvio pequeno, 1 moderada, 0 importante', () => {
    expect(currentBucketsFromHealth({ normal: 3, leve: 4, moderada: 1, importante: 0 }, 8))
      .toEqual({ bons: 3, alerta: 5, alterados: 0 });
  });

  it('a soma fora da faixa bate com o bloco "Fora da faixa" e com as pílulas do herói', () => {
    const bp = { normal: 10, leve: 2, moderada: 3, importante: 1 };
    const b = currentBucketsFromHealth(bp, 16)!;
    expect(b.alerta + b.alterados).toBe(2 + 3 + 1);
    expect(b.bons + b.alerta + b.alterados).toBe(16);
  });

  it('devolve null sem resumo de saúde ou sem marcador recente (a tela cai no histórico)', () => {
    expect(currentBucketsFromHealth(null, 8)).toBeNull();
    expect(currentBucketsFromHealth(undefined, 8)).toBeNull();
    expect(currentBucketsFromHealth({ normal: 3, leve: 4, moderada: 1 }, 0)).toBeNull();
    expect(currentBucketsFromHealth({ normal: 3 }, null)).toBeNull();
    expect(currentBucketsFromHealth({ normal: 3 }, undefined)).toBeNull();
  });

  it('tudo normal', () => {
    expect(currentBucketsFromHealth({ normal: 9, leve: 0, moderada: 0, importante: 0 }, 9))
      .toEqual({ bons: 9, alerta: 0, alterados: 0 });
  });

  it('ignora valor ausente, negativo ou que não é número', () => {
    expect(currentBucketsFromHealth({ normal: 5, leve: -2, moderada: Number.NaN, importante: '1' as unknown as number }, 5))
      .toEqual({ bons: 5, alerta: 0, alterados: 0 });
  });

  it('importante vira "Requer atenção"; moderada fica na família "Leve"', () => {
    expect(currentBucketsFromHealth({ normal: 4, leve: 0, moderada: 0, importante: 2 }, 6))
      .toEqual({ bons: 4, alerta: 0, alterados: 2 });
    expect(currentBucketsFromHealth({ normal: 4, leve: 0, moderada: 2, importante: 0 }, 6))
      .toEqual({ bons: 4, alerta: 2, alterados: 0 });
  });
});
