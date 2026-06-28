import { describe, it, expect } from 'vitest';
import { trendVerdict, summarizeTrends, trendHeadline, VERDICT_META } from './evolutionSummary';

describe('evolutionSummary — trendVerdict (distância à faixa)', () => {
  // Faixa 70–100 (ex.: glicose)
  it('saiu da faixa → piorou', () => {
    expect(trendVerdict({ firstValue: 80, lastValue: 130, refLow: 70, refHigh: 100 })).toBe('piorou');
  });
  it('entrou na faixa → melhorou', () => {
    expect(trendVerdict({ firstValue: 130, lastValue: 85, refLow: 70, refHigh: 100 })).toBe('melhorou');
  });
  it('ambos na faixa → estável', () => {
    expect(trendVerdict({ firstValue: 80, lastValue: 90, refLow: 70, refHigh: 100 })).toBe('estavel');
  });
  it('ambos fora, aproximou → melhorou; afastou → piorou', () => {
    expect(trendVerdict({ firstValue: 140, lastValue: 110, refLow: 70, refHigh: 100 })).toBe('melhorou'); // dist 40→10
    expect(trendVerdict({ firstValue: 110, lastValue: 140, refLow: 70, refHigh: 100 })).toBe('piorou');   // dist 10→40
  });
  it('equidistante → estável', () => {
    expect(trendVerdict({ firstValue: 130, lastValue: 130, refLow: 70, refHigh: 100 })).toBe('estavel');
  });

  it('HDL subindo E entrando na faixa → melhorou (não assume subir=ruim)', () => {
    // HDL: ref 40–60; 35→45 (subiu e entrou na faixa) → melhorou
    expect(trendVerdict({ firstValue: 35, lastValue: 45, refLow: 40, refHigh: 60 })).toBe('melhorou');
  });

  it('sem faixa de referência → estável (não opina bom/ruim)', () => {
    expect(trendVerdict({ firstValue: 10, lastValue: 50, refLow: null, refHigh: null })).toBe('estavel');
    expect(trendVerdict({ firstValue: 10, lastValue: 50 })).toBe('estavel');
  });

  it('entrada inválida/nula → estável (sem regressão)', () => {
    expect(trendVerdict(null)).toBe('estavel');
    expect(trendVerdict({ firstValue: NaN, lastValue: 5, refLow: 1, refHigh: 10 })).toBe('estavel');
  });
});

describe('evolutionSummary — summarizeTrends + headline', () => {
  it('conta vereditos corretamente', () => {
    const s = summarizeTrends([
      { firstValue: 130, lastValue: 85, refLow: 70, refHigh: 100 },  // melhorou
      { firstValue: 80, lastValue: 130, refLow: 70, refHigh: 100 },  // piorou
      { firstValue: 80, lastValue: 90, refLow: 70, refHigh: 100 },   // estavel
    ]);
    expect(s.counts).toEqual({ melhorou: 1, piorou: 1, estavel: 1 });
    expect(s.total).toBe(3);
  });

  it('headline não-alarmista por cenário', () => {
    expect(trendHeadline({ counts: { melhorou: 3, piorou: 0, estavel: 1 }, total: 4 })).toMatch(/evoluindo bem/i);
    expect(trendHeadline({ counts: { melhorou: 1, piorou: 4, estavel: 0 }, total: 5 })).toMatch(/conversar com seu médico/i);
    expect(trendHeadline({ counts: { melhorou: 0, piorou: 0, estavel: 0 }, total: 0 })).toMatch(/ao menos 2 exames/i);
  });

  it('VERDICT_META expõe os 3 vereditos', () => {
    expect(Object.keys(VERDICT_META).sort()).toEqual(['estavel', 'melhorou', 'piorou']);
  });
});
