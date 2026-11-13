// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  RADAR_COMPOUNDS, batemanReleasePerDay, compoundById, computeRadarSeries, computeRadarStats, familyTotal, findMarker,
  calibrationRange, doctorQuestions, doseStatus, examAlerts, markersForProtocol, nextComparableDraws, positionInSwing, RADAR_MARKERS, staleMarkers, type EvolutionRow, type RadarProtocolItem,
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

describe('aplicações registradas', () => {
  it('sem registro, a curva é idêntica à de antes', () => {
    const a = computeRadarSeries([item('test_cyp')], 12 * 7, 0);
    const b = computeRadarSeries([item('test_cyp')], 12 * 7, 0, false, {});
    expect(b.total).toEqual(a.total);
    expect(b.seriesPerItem[0].loggedDays).toEqual([]);
  });

  it('registro igual ao calendário dá a mesma curva', () => {
    const plan = computeRadarSeries([item('test_cyp', { conc: 200 })], 6 * 7, 0);
    const days = plan.seriesPerItem[0].injectionDays;
    const logged = computeRadarSeries([item('test_cyp', { conc: 200 })], 6 * 7, 0, false, { test_cyp: days.map((day) => ({ day, mg: 200 })) });
    logged.total.forEach((v, i) => expect(v).toBeCloseTo(plan.total[i], 6));
    expect(logged.seriesPerItem[0].loggedDays).toEqual(days);
  });

  it('aplicação atrasada desloca a curva e a previsão segue da última registrada', () => {
    const it0 = item('test_cyp', { conc: 200, endWeek: 6 });
    const plan = computeRadarSeries([it0], 6 * 7, 0);
    const late = computeRadarSeries([it0], 6 * 7, 0, false, { test_cyp: [{ day: 0, mg: 200 }, { day: 7, mg: 200 }, { day: 17, mg: 200 }] });
    expect(late.seriesPerItem[0].injectionDays).toEqual([0, 7, 17, 24, 31, 38]);
    expect(late.seriesPerItem[0].loggedDays).toEqual([0, 7, 17]);
    const at = (r: typeof plan, d: number) => r.total[d * 4];
    expect(at(late, 16)).toBeLessThan(at(plan, 16)); // no dia 16 a dose do dia 14 não aconteceu
    expect(at(late, 6)).toBeCloseTo(at(plan, 6), 6); // antes do atraso, igual
  });

  it('dose registrada diferente da do protocolo muda a altura', () => {
    const base = computeRadarSeries([item('test_enan')], 4 * 7, 0, false, { test_enan: [{ day: 0, mg: 250 }] });
    const half = computeRadarSeries([item('test_enan')], 4 * 7, 0, false, { test_enan: [{ day: 0, mg: 125 }] });
    expect(half.total[8]).toBeCloseTo(base.total[8] / 2, 6);
  });

  it('o registro não entra no cenário "e se dividir em 2x"', () => {
    const split = computeRadarSeries([item('test_cyp')], 6 * 7, 0, true, { test_cyp: [{ day: 3, mg: 999 }] });
    expect(split.seriesPerItem[0].loggedDays).toEqual([]);
  });

  it('situação: última, próxima e atraso', () => {
    const D = 86_400_000;
    const now = Date.UTC(2026, 10, 13, 12);
    expect(doseStatus(7, [], now)).toEqual({ last: null, next: null, lateDays: 0 });
    expect(doseStatus(7, [now - 9 * D, now - 2 * D], now)).toEqual({ last: now - 2 * D, next: now + 5 * D, lateDays: 0 });
    expect(doseStatus(7, [now - 10 * D], now).lateDays).toBe(3);
  });
});

describe('pontos de atenção e calibração', () => {
  const NOW = new Date('2026-11-13T12:00:00Z').getTime();
  const START = new Date('2026-07-01T12:00:00Z').getTime();
  const m = (key: string) => RADAR_MARKERS.find((x) => x.key === key)!;
  const row = (lastValue: number, lastDate: string, over: Partial<EvolutionRow> = {}): EvolutionRow =>
    ({ nameCanonical: 'X', unit: '%', refLow: 41, refHigh: 53, lastValue, lastDate, inRange: lastValue >= 41 && lastValue <= 53, ...over });

  it('fora da faixa do laudo vira ponto de atenção, sem orientar conduta', () => {
    const out = examAlerts({ found: [{ marker: m('hematocrito'), row: row(55, '2026-10-20T12:00:00Z') }], protocolStart: START, now: NOW });
    expect(out).toHaveLength(1);
    expect(out[0].level).toBe('atencao');
    expect(out[0].title).toBe('Hematócrito acima da faixa do laudo');
    expect(out[0].text).toContain('Leve ao seu médico');
    expect(out[0].text).not.toMatch(/dose|reduz|aument|pare|suspend/i);
  });

  it('dentro da faixa mas subindo desde antes do protocolo: aviso de tendência', () => {
    const points = [{ value: 44, date: '2026-05-01T12:00:00Z' }, { value: 51, date: '2026-10-20T12:00:00Z' }];
    const out = examAlerts({ found: [{ marker: m('hematocrito'), row: row(51, '2026-10-20T12:00:00Z', { points }) }], protocolStart: START, now: NOW });
    expect(out.map((a) => a.key)).toEqual(['tendencia-hematocrito']);
    expect(out[0].title).toContain('subiu 16%');
    // variação pequena não avisa
    const calm = examAlerts({ found: [{ marker: m('hematocrito'), row: row(46, '2026-10-20T12:00:00Z', { points: [{ value: 44, date: '2026-05-01T12:00:00Z' }, { value: 46, date: '2026-10-20T12:00:00Z' }] }) }], protocolStart: START, now: NOW });
    expect(calm).toEqual([]);
  });

  it('3 meses de protocolo sem exame depois do início: aviso de controle', () => {
    const out = examAlerts({ found: [{ marker: m('hematocrito'), row: row(45, '2026-04-01T12:00:00Z') }], protocolStart: START, now: NOW });
    expect(out.map((a) => a.key)).toEqual(['controle']);
    expect(out[0].title).toBe('4 meses de protocolo sem exame de controle');
    // com exame depois do início, nada
    expect(examAlerts({ found: [{ marker: m('hematocrito'), row: row(45, '2026-09-01T12:00:00Z') }], protocolStart: START, now: NOW })).toEqual([]);
    // sem data de início não dá para afirmar
    expect(examAlerts({ found: [{ marker: m('hematocrito'), row: row(45, '2026-04-01T12:00:00Z') }], protocolStart: null, now: NOW })).toEqual([]);
  });

  it('calibração: precisa de 2 exames durante o protocolo e devolve menor e maior fator', () => {
    const series = computeRadarSeries([item('test_cyp', { conc: 200, endWeek: 16 })], 16 * 7, 0);
    const testo = familyTotal(series, 'testosterona')!;
    const at = (day: number) => testo[day * 4];
    const iso = (day: number) => new Date(START + day * 86_400_000).toISOString();
    const pts = [{ value: at(40) * 30, date: iso(40) }, { value: at(75) * 36, date: iso(75) }, { value: 900, date: iso(3) }, { value: 500, date: iso(-20) }];
    const cal = calibrationRange(pts, testo, 4, START, 16 * 7)!;
    expect(cal.n).toBe(2);
    expect(cal.lo).toBeCloseTo(30, 5);
    expect(cal.hi).toBeCloseTo(36, 5);
    expect(calibrationRange(pts.slice(0, 1), testo, 4, START, 16 * 7)).toBeNull();
    expect(calibrationRange(pts, testo, 4, null, 16 * 7)).toBeNull();
  });
});
