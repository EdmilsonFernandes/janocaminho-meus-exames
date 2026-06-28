import { describe, it, expect } from 'vitest';
import {
  computeMarkerState,
  trendDirection,
  deltaPct,
  priorityOfItem,
  ageMonths,
  type ItemRow,
} from '../src/analysis/health-state';

const monthsAgo = (m: number) => new Date(Date.now() - m * 30 * 86400000);
const row = (over: Partial<ItemRow>): ItemRow => ({
  name: 'X', nameCanonical: 'X', valueNumeric: null, valueText: null, unit: null,
  refLow: null, refHigh: null, refText: null, flag: 'NORMAL', isAbnormal: false, performedAt: null,
  ...over,
});

describe('trendDirection', () => {
  const band = { refLow: 10, refHigh: 20 } as const;
  it('primeiro exame sem prior', () => {
    expect(trendDirection({ valueNumeric: 25, isAbnormal: true }, null, band.refLow, band.refHigh)).toBe('primeiro');
  });
  it('entrou na faixa -> melhorando', () => {
    expect(trendDirection({ valueNumeric: 15, isAbnormal: false }, { valueNumeric: 25, isAbnormal: true }, band.refLow, band.refHigh)).toBe('melhorando');
  });
  it('saiu da faixa -> piorando', () => {
    expect(trendDirection({ valueNumeric: 25, isAbnormal: true }, { valueNumeric: 15, isAbnormal: false }, band.refLow, band.refHigh)).toBe('piorando');
  });
  it('ambos dentro -> estavel', () => {
    expect(trendDirection({ valueNumeric: 12, isAbnormal: false }, { valueNumeric: 18, isAbnormal: false }, band.refLow, band.refHigh)).toBe('estavel');
  });
  it('ambos fora, aproxima da banda -> melhorando', () => {
    // banda 10-20 (largura 10); prior 40 (dist 20), latest 24 (dist 4) -> aproxima
    expect(trendDirection({ valueNumeric: 24, isAbnormal: true }, { valueNumeric: 40, isAbnormal: true }, band.refLow, band.refHigh)).toBe('melhorando');
  });
  it('ambos fora, afasta da banda -> piorando', () => {
    expect(trendDirection({ valueNumeric: 40, isAbnormal: true }, { valueNumeric: 24, isAbnormal: true }, band.refLow, band.refHigh)).toBe('piorando');
  });
  it('fallback nao-numerico: normalizou -> melhorando', () => {
    expect(trendDirection({ valueNumeric: null, isAbnormal: false }, { valueNumeric: null, isAbnormal: true }, null, null)).toBe('melhorando');
  });
});

describe('deltaPct', () => {
  it('calcula variacao percentual', () => {
    expect(deltaPct({ valueNumeric: 90 }, { valueNumeric: 100 })).toBe(-10);
    expect(deltaPct({ valueNumeric: 110 }, { valueNumeric: 100 })).toBe(10);
  });
  it('null sem prior', () => expect(deltaPct({ valueNumeric: 5 }, null)).toBeNull());
  it('null com prior=0', () => expect(deltaPct({ valueNumeric: 5 }, { valueNumeric: 0 })).toBeNull());
  it('null nao-numerico', () => expect(deltaPct({ valueNumeric: null }, { valueNumeric: 5 })).toBeNull());
});

describe('priorityOfItem', () => {
  const band = { refLow: 10, refHigh: 20 };
  it('normal -> normal', () => expect(priorityOfItem({ ...band, valueNumeric: 15, isAbnormal: false, flag: 'NORMAL' })).toBe('normal'));
  it('CRITICAL -> importante', () => expect(priorityOfItem({ ...band, valueNumeric: 15, isAbnormal: true, flag: 'CRITICAL' })).toBe('importante'));
  it('>=100% alem do limite -> importante', () => expect(priorityOfItem({ ...band, valueNumeric: 40, isAbnormal: true, flag: 'HIGH' })).toBe('importante'));
  it('25-100% -> moderada', () => expect(priorityOfItem({ ...band, valueNumeric: 24, isAbnormal: true, flag: 'HIGH' })).toBe('moderada'));
  it('<25% -> leve', () => expect(priorityOfItem({ ...band, valueNumeric: 21, isAbnormal: true, flag: 'HIGH' })).toBe('leve'));
  it('sem faixa + ABNORMAL -> moderada', () => expect(priorityOfItem({ valueNumeric: null, isAbnormal: true, flag: 'ABNORMAL' })).toBe('moderada'));
});

describe('ageMonths', () => {
  it('null sem data', () => expect(ageMonths(null)).toBeNull());
  it('aproximado em meses', () => {
    const m = ageMonths(monthsAgo(12));
    expect(m).not.toBeNull();
    expect(m!).toBeGreaterThan(11.5);
    expect(m!).toBeLessThan(12.5);
  });
});

describe('computeMarkerState', () => {
  it('agrupa por nameCanonical e ordena latest/prior', () => {
    const rows: ItemRow[] = [
      row({ nameCanonical: 'GLICOSE', name: 'Glicose', valueNumeric: 110, valueText: '110', performedAt: monthsAgo(1), isAbnormal: true, flag: 'HIGH', refLow: 70, refHigh: 99 }),
      row({ nameCanonical: 'GLICOSE', name: 'Glicose', valueNumeric: 95, valueText: '95', performedAt: monthsAgo(13), isAbnormal: false, flag: 'NORMAL', refLow: 70, refHigh: 99 }),
      row({ nameCanonical: 'HEMOGLOBINA', name: 'Hemoglobina', valueNumeric: 14, valueText: '14', performedAt: monthsAgo(2), isAbnormal: false, flag: 'NORMAL', refLow: 13, refHigh: 17 }),
    ];
    const state = computeMarkerState(rows);
    expect(state).toHaveLength(2);
    const glic = state.find((m) => m.nameCanonical === 'GLICOSE')!;
    expect(glic.latest.valueNumeric).toBe(110);
    expect(glic.prior?.valueNumeric).toBe(95);
    expect(glic.points).toBe(2);
    expect(glic.trend).toBe('piorando'); // saiu da faixa
    expect(glic.deltaPct).toBeCloseTo(((110 - 95) / 95) * 100, 1);
    expect(glic.priority).toBe('moderada'); // (110-99)/29 largura ≈ 0.379 -> moderada
    expect(glic.confidence).toBe('alta'); // 2 pts, latest com 1 mês
  });

  it('1 ponto -> primeiro, confidence baixa', () => {
    const state = computeMarkerState([row({ nameCanonical: 'TSH', valueNumeric: 7, performedAt: monthsAgo(1), isAbnormal: true, flag: 'HIGH', refLow: 0.4, refHigh: 4 })]);
    expect(state[0].trend).toBe('primeiro');
    expect(state[0].prior).toBeNull();
    expect(state[0].confidence).toBe('baixa');
  });

  it('latest desatualizado (>12m) -> stale + confidence baixa', () => {
    const state = computeMarkerState([row({ nameCanonical: 'TSH', valueNumeric: 7, performedAt: monthsAgo(18), isAbnormal: true, flag: 'HIGH', refLow: 0.4, refHigh: 4 })]);
    expect(state[0].latest.stale).toBe(true);
    expect(state[0].confidence).toBe('baixa');
  });

  it('2 pts mas latest stale -> confidence baixa (mesmo com historico)', () => {
    const state = computeMarkerState([
      row({ nameCanonical: 'TSH', valueNumeric: 7, performedAt: monthsAgo(20), isAbnormal: true, flag: 'HIGH', refLow: 0.4, refHigh: 4 }),
      row({ nameCanonical: 'TSH', valueNumeric: 6, performedAt: monthsAgo(18), isAbnormal: true, flag: 'HIGH', refLow: 0.4, refHigh: 4 }),
    ]);
    expect(state[0].points).toBe(2);
    expect(state[0].latest.stale).toBe(true);
    expect(state[0].confidence).toBe('baixa');
  });

  it('marcador normal -> prioridade normal e score 100', () => {
    const state = computeMarkerState([row({ nameCanonical: 'HEMOGLOBINA', valueNumeric: 14, performedAt: monthsAgo(1), isAbnormal: false, flag: 'NORMAL', refLow: 13, refHigh: 17 })]);
    expect(state[0].priority).toBe('normal');
  });
});
