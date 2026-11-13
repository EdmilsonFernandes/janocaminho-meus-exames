// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  RADAR_COMPOUNDS, batemanReleasePerDay, compoundById, computeRadarSeries, computeRadarStats, familyTotal, findMarker,
  doctorQuestions, markersForProtocol, nextComparableDraws, positionInSwing, RADAR_MARKERS, staleMarkers, type EvolutionRow, type RadarProtocolItem,
} from './hormoneRadar';

const item = (compoundId: string, over: Partial<RadarProtocolItem> = {}): RadarProtocolItem => ({
  uid: compoundId, compoundId, unit: 'ml', amount: 1, conc: compoundById(compoundId).defaultConc, freqDays: 7, startWeek: 1, endWeek: 16, ...over,
});

describe('curva de uma aplicação', () => {
  it.each(RADAR_COMPOUNDS.flatMap((c) => c.esters.map((e, i) => [`${c.id}#${i}`, e] as const)))('%s: conserva a dose e o pico cai no tmax declarado', (_name, e) => {
    const dt = 0.005;
    let area = 0, best = 0, at = 0;
    for (let t = 0; t < e.halfLife * 40; t += dt) {
      const v = batemanReleasePerDay(t, 100, e.halfLife, e.tmax);
      area += v * dt;
      if (v > best) { best = v; at = t; }
    }
    expect(area).toBeGreaterThan(99);
    expect(area).toBeLessThan(101);
    expect(Math.abs(at - e.tmax)).toBeLessThan(Math.max(0.03, e.tmax * 0.03));
  });

  it('nada antes da aplicação e nada com dose zero', () => {
    expect(batemanReleasePerDay(-1, 100, 4.5, 1.8)).toBe(0);
    expect(batemanReleasePerDay(2, 0, 4.5, 1.8)).toBe(0);
  });
});

describe('protocolo', () => {
  it('em equilíbrio, a média diária é a dose ativa dividida pelo intervalo', () => {
    const series = computeRadarSeries([item('test_enan')], 16 * 7, 0);
    const stats = computeRadarStats(series);
    expect(stats.settled).toBe(true);
    expect(stats.avgDailyMg).toBeCloseTo((250 * 0.72) / 7, 0);
    expect(stats.peakMg).toBeGreaterThan(stats.avgDailyMg);
    expect(stats.troughMg).toBeLessThan(stats.avgDailyMg);
    expect(stats.windowEndDay - stats.windowStartDay).toBe(7);
  });

  it('dividir a mesma dose em 2x/semana mantém a média e reduz a oscilação', () => {
    const one = computeRadarStats(computeRadarSeries([item('test_cyp')], 16 * 7, 0));
    const two = computeRadarStats(computeRadarSeries([item('test_cyp')], 16 * 7, 0, true));
    expect(two.avgDailyMg).toBeCloseTo(one.avgDailyMg, 0);
    expect(two.swingPct).toBeLessThan(one.swingPct * 0.6);
  });

  it('ciclo que termina antes do fim da tela: mede enquanto está ativo, não a cauda', () => {
    const series = computeRadarSeries([item('test_enan', { endWeek: 8 })], 12 * 7, 0);
    const stats = computeRadarStats(series);
    expect(stats.windowEndDay).toBe(56);
    expect(stats.swingPct).toBeLessThan(80); // a 1ª versão dava ~220%
    expect(stats.avgDailyMg).toBeCloseTo((250 * 0.72) / 7, 0);
  });

  it('avisa quando ainda não estabilizou (Nebido em 12 semanas)', () => {
    const stats = computeRadarStats(computeRadarSeries([item('test_und', { amount: 4, freqDays: 70, endWeek: 12 })], 12 * 7, 0));
    expect(stats.settled).toBe(false);
    expect(stats.settleDay).toBeCloseTo(105, 0);
  });

  it('Durateston é a soma dos 4 ésteres: sobe rápido (propionato) e dura (decanoato)', () => {
    const dura = computeRadarSeries([item('sustanon', { endWeek: 1 })], 6 * 7, 0).total;
    const enan = computeRadarSeries([item('test_enan', { endWeek: 1 })], 6 * 7, 0).total;
    const day = (d: number) => d * 4;
    expect(dura[day(0.5)]).toBeGreaterThan(enan[day(0.5)]); // começa mais rápido
    expect(dura[day(28)]).toBeGreaterThan(enan[day(28)]); // e ainda está lá na 4ª semana
    expect(compoundById('sustanon').esterRatio).toBeCloseTo(0.697, 2);
  });

  it('metabolismo mais rápido oscila mais; mais lento, menos', () => {
    const at = (pct: number) => computeRadarStats(computeRadarSeries([item('test_enan')], 16 * 7, pct)).swingPct;
    expect(at(30)).toBeGreaterThan(at(0));
    expect(at(-30)).toBeLessThan(at(0));
  });

  it('família: o exame de testosterona só enxerga testosterona', () => {
    const series = computeRadarSeries([item('sustanon'), item('mast_prop', { freqDays: 3.5 }), item('nand_dec')], 12 * 7, 0);
    const testo = familyTotal(series, 'testosterona')!;
    expect(testo[200]).toBeCloseTo(series.seriesPerItem[0].values[200], 6);
    expect(testo[200]).toBeLessThan(series.total[200]);
    expect(familyTotal(series, 'trembolona')).toBeNull();
  });

  it('todos os valores são finitos e não negativos, inclusive oral diário', () => {
    const series = computeRadarSeries([item('oxand', { unit: 'mg', amount: 20, freqDays: 1 }), item('tren_ace', { freqDays: 2 })], 8 * 7, -30);
    for (const v of series.total) { expect(Number.isFinite(v)).toBe(true); expect(v).toBeGreaterThanOrEqual(0); }
  });
});

describe('cruzamento com exames', () => {
  const row = (nameCanonical: string, lastValue: number, lastDate: string, over: Partial<EvolutionRow> = {}): EvolutionRow =>
    ({ nameCanonical, unit: null, refLow: null, refHigh: null, lastValue, lastDate, inRange: true, ...over });
  const rows = [
    row('TESTOSTERONA LIVRE', 12, '2026-10-01'),
    row('TESTOSTERONA TOTAL', 820, '2026-10-01'),
    row('TESTOSTERONA TOTAL', 640, '2026-03-01'),
    row('HEMOGLOBINA GLICADA', 5.4, '2026-10-01'),
    row('HEMOGLOBINA', 16.9, '2026-10-01'),
    row('COLESTEROL NAO-HDL', 140, '2026-10-01'),
    row('COLESTEROL HDL', 38, '2026-10-01', { refLow: 40, inRange: false }),
    row('COLESTEROL VLDL', 20, '2026-10-01'),
    row('COLESTEROL LDL', 131, '2026-10-01'),
    row('HEMATÓCRITO', 51, '2026-10-01'),
  ];
  const marker = (key: string) => RADAR_MARKERS.find((m) => m.key === key)!;

  it('acha o marcador certo e o mais recente, sem confundir parecidos', () => {
    expect(findMarker(rows, marker('testosterona'))?.lastValue).toBe(820);
    expect(findMarker(rows, marker('hemoglobina'))?.lastValue).toBe(16.9);
    expect(findMarker(rows, marker('hdl'))?.lastValue).toBe(38);
    expect(findMarker(rows, marker('ldl'))?.lastValue).toBe(131);
    expect(findMarker(rows, marker('hematocrito'))?.lastValue).toBe(51); // com acento no nome
    expect(findMarker(rows, marker('psa'))).toBeNull();
  });

  it('só lista marcadores que os compostos do protocolo mexem', () => {
    const keys = (items: RadarProtocolItem[]) => markersForProtocol(items).map((m) => m.key);
    expect(keys([item('mast_prop')])).not.toContain('estradiol'); // não aromatiza
    expect(keys([item('mast_prop')])).not.toContain('tgp');
    expect(keys([item('test_cyp')])).toEqual(expect.arrayContaining(['estradiol', 'hematocrito', 'psa', 'hdl']));
    expect(keys([item('oxand')])).toEqual(expect.arrayContaining(['tgo', 'tgp', 'hdl']));
  });

  it('posição na oscilação: 0 no vale, 1 no pico', () => {
    expect(positionInSwing(18, { peakMg: 30, troughMg: 18 })).toBe(0);
    expect(positionInSwing(30, { peakMg: 30, troughMg: 18 })).toBe(1);
    expect(positionInSwing(24, { peakMg: 30, troughMg: 18 })).toBeCloseTo(0.5);
    expect(positionInSwing(5, { peakMg: 10, troughMg: 10 })).toBe(0.5);
  });
});

describe('próxima coleta, exames antigos e perguntas para o médico', () => {
  const NOW = new Date('2026-11-13T12:00:00Z').getTime();
  const m = (key: string) => RADAR_MARKERS.find((x) => x.key === key)!;
  const row = (lastValue: number, lastDate: string, over: Partial<EvolutionRow> = {}): EvolutionRow =>
    ({ nameCanonical: 'X', unit: '%', refLow: 40, refHigh: 50, lastValue, lastDate, inRange: lastValue >= 40 && lastValue <= 50, ...over });

  it('próximas coletas no mesmo ponto da curva: só datas futuras, sem repetir', () => {
    const shots = [0, 7, 14, 21, 28, 35];
    expect(nextComparableDraws(shots, 2, 15)).toEqual([16, 23]);
    expect(nextComparableDraws(shots, 2, 16)).toEqual([23, 30]); // hoje não conta
    expect(nextComparableDraws(shots, 2, 100)).toEqual([]); // protocolo já acabou
    expect(nextComparableDraws([0, 3.5, 7], 1, 0, 3)).toEqual([1, 5, 8]);
  });

  it('marcadores sem resultado recente: nunca enviados e os com mais de 6 meses', () => {
    const found = [
      { marker: m('hematocrito'), row: row(49, '2026-10-01') },
      { marker: m('psa'), row: row(1, '2025-09-01') },
      { marker: m('estradiol'), row: null },
    ];
    expect(staleMarkers(found, NOW)).toEqual([{ label: 'PSA', monthsAgo: 14 }, { label: 'Estradiol', monthsAgo: null }]);
  });

  it('perguntas saem dos dados: fora da faixa, coleta no pico, oscilação alta e lacunas', () => {
    const found = [
      { marker: m('hematocrito'), row: row(53, '2026-10-01') },
      { marker: m('hdl'), row: row(45, '2026-10-01') },
      { marker: m('estradiol'), row: null },
    ];
    const qs = doctorQuestions({ found, swingPct: 82, drawPosition: 0.9, settled: true, now: NOW });
    expect(qs[0]).toContain('Meu exame de Hematócrito veio 53 %, acima da faixa do laudo (40 a 50)');
    // Faixa com um lado só não vira "40 a —".
    const oneSided = doctorQuestions({ found: [{ marker: m('hdl'), row: row(38, '2026-10-01', { refLow: 40, refHigh: null, inRange: false }) }], swingPct: 10, drawPosition: null, settled: true, now: NOW });
    expect(oneSided[0]).toContain('Colesterol HDL veio 38 %, abaixo da faixa do laudo (a partir de 40)');
    expect(qs.join('\n')).toContain('perto do pico');
    expect(qs.join('\n')).toContain('sobe e desce bastante');
    expect(qs.join('\n')).toContain('Não tenho resultado recente de Estradiol');
    expect(qs.join('\n')).not.toContain('HDL'); // dentro da faixa não vira pergunta
    expect(qs.length).toBeLessThanOrEqual(6);
    // Nenhuma pergunta sugere dose ou conduta.
    expect(qs.join('\n')).not.toMatch(/\bmg\b|\bml\b|aumentar|reduzir|parar/i);
  });

  it('sem nada fora do comum ainda sobra a pergunta geral', () => {
    const qs = doctorQuestions({ found: [{ marker: m('hematocrito'), row: row(45, '2026-11-01') }], swingPct: 20, drawPosition: 0.5, settled: true, now: NOW });
    expect(qs).toEqual(['O que isso muda para a minha fertilidade e para o meu coração a longo prazo?']);
  });
});
