// @vitest-environment node
/**
 * Linha do tempo da composição corporal: janela do gráfico, passos do "reproduzir" e
 * histórico por mês. Dados fictícios (a mesma massa sintética do seed de demonstração).
 */
import { describe, expect, it } from 'vitest';
import { buildDemoScenario } from '../../../../server/src/bodycomp/demo-scenarios';
import { availableRanges, formatDayMonth, formatWeekday, groupByMonth, inRange, sampleSteps, type BodyReading } from './model';

const DAY = 86_400_000;
const END = new Date('2026-11-20T15:00:00Z').getTime();
/** Avaliações mais antiga → mais recente, a tantos dias da última. */
const readings = (...daysBeforeEnd: number[]): BodyReading[] =>
  daysBeforeEnd.map((days, index) => ({ id: `r${index}`, measuredAt: new Date(END - days * DAY).toISOString(), weightKg: 80 - index } as BodyReading));

describe('janela do gráfico', () => {
  it('é contada a partir da avaliação mais recente, não de hoje', () => {
    const list = readings(400, 200, 100, 30, 0);
    expect(inRange(list, '3m').map((r) => r.id)).toEqual(['r3', 'r4']);
    expect(inRange(list, '6m').map((r) => r.id)).toEqual(['r2', 'r3', 'r4']);
    expect(inRange(list, '1a').map((r) => r.id)).toEqual(['r1', 'r2', 'r3', 'r4']);
    expect(inRange(list, 'tudo')).toBe(list);
    expect(inRange([], '3m')).toEqual([]);
  });

  it('só oferece janela que esconde algo e ainda deixa duas avaliações', () => {
    expect(availableRanges(readings(400, 200, 100, 30, 0))).toEqual(['3m', '6m', '1a', 'tudo']);
    // tudo dentro de 3 meses: não há o que escolher
    expect(availableRanges(readings(60, 30, 0))).toEqual([]);
    // 3 meses deixaria uma avaliação só; 6 meses e 1 ano mostram as mesmas duas → fica a mais curta
    expect(availableRanges(readings(500, 150, 0))).toEqual(['6m', 'tudo']);
    expect(availableRanges([])).toEqual([]);
  });
});

describe('passos do "reproduzir"', () => {
  it('lista curta passa inteira; lista longa é amostrada com a primeira e a última', () => {
    expect(sampleSteps([1, 2, 3])).toEqual([1, 2, 3]);
    const long = Array.from({ length: 400 }, (_, i) => i);
    const steps = sampleSteps(long, 24);
    expect(steps).toHaveLength(24);
    expect(steps[0]).toBe(0);
    expect(steps[23]).toBe(399);
    expect([...steps].sort((a, b) => a - b)).toEqual(steps);
    expect(new Set(steps).size).toBe(24);
  });
});

describe('histórico por mês', () => {
  it('agrupa na ordem recebida e usa o mês de São Paulo, não o de UTC', () => {
    const items = [
      { id: 'a', measuredAt: '2026-11-10T12:00:00Z' },
      // 01:30 UTC de 1º de novembro ainda é 31 de outubro em São Paulo
      { id: 'b', measuredAt: '2026-11-01T01:30:00Z' },
      { id: 'c', measuredAt: '2026-10-05T12:00:00Z' },
      { id: 'd', measuredAt: '2025-10-05T12:00:00Z' },
    ] as BodyReading[];
    const groups = groupByMonth(items);
    expect(groups.map((g) => [g.key, g.label, g.items.map((i) => i.id)])).toEqual([
      ['2026-11', 'Novembro 2026', ['a']],
      ['2026-10', 'Outubro 2026', ['b', 'c']],
      ['2025-10', 'Outubro 2025', ['d']],
    ]);
    expect(groupByMonth([])).toEqual([]);
  });

  it('data curta da linha: dia, mês e dia da semana, sem ponto', () => {
    expect(formatDayMonth('2026-11-02T15:00:00Z')).toBe('02 nov');
    expect(formatWeekday('2026-11-02T15:00:00Z')).toBe('seg');
  });

  it('a massa de demonstração inteira cai em algum mês, sem perder avaliação', () => {
    const items = buildDemoScenario('emagrecimento', new Date('2026-11-12T15:00:00Z'))
      .map((row, index) => ({ ...row, id: `e-${index}`, measuredAt: row.measuredAt.toISOString(), note: null }))
      .reverse() as unknown as BodyReading[];
    const groups = groupByMonth(items);
    expect(groups.flatMap((g) => g.items)).toEqual(items);
    expect(new Set(groups.map((g) => g.key)).size).toBe(groups.length);
  });
});
