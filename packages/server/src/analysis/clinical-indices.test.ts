import { describe, expect, it } from 'vitest';
import { computeClinicalIndices, computeBodyRegions, type RegionInput } from './clinical-indices';
import type { MarkerState } from './health-state';

/** Fábrica de MarkerState mínimo p/ o compute (só o que o índice lê: canonical + latest). */
const mk = (nameCanonical: string, valueNumeric: number | null, unit: string | null = null): MarkerState =>
  ({
    nameCanonical,
    name: nameCanonical,
    unit,
    latest: { valueNumeric, valueText: null, performedAt: new Date(), ageMonths: 0, stale: false },
    prior: null,
    deltaPct: null,
    refLow: null,
    refHigh: null,
    refText: null,
    flag: 'NORMAL',
    isAbnormal: false,
    priority: 'normal',
    trend: 'primeiro',
    points: 1,
    confidence: 'baixa',
    temporalClass: 'atual',
    outdated: false,
    priorAbnormal: false,
  }) as unknown as MarkerState;

const byKey = (res: ReturnType<typeof computeClinicalIndices>) =>
  Object.fromEntries(res.map((r) => [r.key, r]));

describe('computeClinicalIndices — fórmulas com valores conhecidos', () => {
  it('Castelli I: CT 200 / HDL 50 = 4,0 (bom); CT 300 / HDL 50 = 6,0 (alterado)', () => {
    const r = byKey(computeClinicalIndices([mk('COLESTEROL_TOTAL', 200), mk('HDL', 50)]));
    expect(r.castelli_i.value).toBe(4.0);
    expect(r.castelli_i.level).toBe('bom');
    const r2 = byKey(computeClinicalIndices([mk('COLESTEROL_TOTAL', 300), mk('HDL', 50)]));
    expect(r2.castelli_i.value).toBe(6.0);
    expect(r2.castelli_i.level).toBe('alterado');
  });

  it('Castelli II: LDL 120 / HDL 50 = 2,4 (bom); LDL 190 / HDL 40 = 4,8 (alterado)', () => {
    const r = byKey(computeClinicalIndices([mk('LDL', 120), mk('HDL', 50)]));
    expect(r.castelli_ii.value).toBe(2.4);
    expect(r.castelli_ii.level).toBe('bom');
    const r2 = byKey(computeClinicalIndices([mk('LDL', 190), mk('HDL', 40)]));
    expect(r2.castelli_ii.value).toBe(4.8);
    expect(r2.castelli_ii.level).toBe('alterado');
  });

  it('TG/HDL: 100/100 = 1,0 (bom); 100/50 = 2,0 (atencao); 400/40 = 10 (alterado)', () => {
    expect(byKey(computeClinicalIndices([mk('TRIGLICERIDES', 100), mk('HDL', 100)])).tg_hdl.level).toBe('bom');
    const mid = byKey(computeClinicalIndices([mk('TRIGLICERIDES', 100), mk('HDL', 50)]));
    expect(mid.tg_hdl.value).toBe(2.0);
    expect(mid.tg_hdl.level).toBe('atencao');
    expect(byKey(computeClinicalIndices([mk('TRIGLICERIDES', 400), mk('HDL', 40)])).tg_hdl.level).toBe('alterado');
  });

  it('AIP: log10 em mmol/L — TG 100/HDL 50 mg/dL ≈ -0,06 (bom); TG 300/HDL 35 ≈ 0,57 (alterado)', () => {
    const bom = byKey(computeClinicalIndices([mk('TRIGLICERIDES', 100), mk('HDL', 50)]));
    // TG 1,129 mmol/L / HDL 1,293 mmol/L = 0,873 → log10 = -0,059
    expect(bom.aip.value).toBeCloseTo(-0.06, 1);
    expect(bom.aip.level).toBe('bom');
    const ruim = byKey(computeClinicalIndices([mk('TRIGLICERIDES', 300), mk('HDL', 35)]));
    expect(ruim.aip.value).toBeCloseTo(0.57, 1);
    expect(ruim.aip.level).toBe('alterado');
  });

  it('HOMA-IR: 90×15/405 = 3,33 (atencao); 85×10/405 ≈ 2,10 (bom); 110×25/405 ≈ 6,79 (alterado)', () => {
    const a = byKey(computeClinicalIndices([mk('GLICEMIA', 90), mk('INSULINA', 15)]));
    expect(a.homa_ir.value).toBeCloseTo(3.33, 1);
    expect(a.homa_ir.level).toBe('atencao');
    expect(byKey(computeClinicalIndices([mk('GLICEMIA', 85), mk('INSULINA', 10)])).homa_ir.level).toBe('bom');
    expect(byKey(computeClinicalIndices([mk('GLICEMIA', 110), mk('INSULINA', 25)])).homa_ir.level).toBe('alterado');
  });

  it('TYG: ln(100×90/2) ≈ 8,41 (bom com corte 8,5); ln(180×110/2) ≈ 9,19 (alterado)', () => {
    const bom = byKey(computeClinicalIndices([mk('TRIGLICERIDES', 100), mk('GLICEMIA', 90)]));
    expect(bom.tyg.value).toBeCloseTo(8.41, 1);
    expect(bom.tyg.level).toBe('bom');
    const ruim = byKey(computeClinicalIndices([mk('TRIGLICERIDES', 180), mk('GLICEMIA', 110)]));
    expect(ruim.tyg.value).toBeCloseTo(9.19, 1);
    expect(ruim.tyg.level).toBe('alterado');
  });

  it('FIB-4: 50a TGO 30 PLT 200 TGP 40 ≈ 1,19 (bom); 60a TGO 50 PLT 120 TGP 35 ≈ 4,23 (alterado)', () => {
    const ctx = { ageYears: 50 };
    const r = byKey(computeClinicalIndices([mk('TGO', 30), mk('TGP', 40), mk('PLAQUETAS', 200)], ctx));
    expect(r.fib4.value).toBeCloseTo(1.19, 1);
    expect(r.fib4.level).toBe('bom');
    const r2 = byKey(computeClinicalIndices([mk('TGO', 50), mk('TGP', 35), mk('PLAQUETAS', 120)], { ageYears: 60 }));
    expect(r2.fib4.value).toBeCloseTo(4.23, 1);
    expect(r2.fib4.level).toBe('alterado');
  });

  it('FIB-4 sem idade → índice NÃO aparece', () => {
    const r = computeClinicalIndices([mk('TGO', 30), mk('TGP', 40), mk('PLAQUETAS', 200)]);
    expect(r.find((x) => x.key === 'fib4')).toBeUndefined();
  });

  it('eGFR: creat 1,0 / 40a / masculino ≈ 98 (bom); creat 2,5 / 70a / feminino < 30 (alterado)', () => {
    const r = byKey(computeClinicalIndices([mk('CREATININA', 1.0)], { ageYears: 40, sex: 'male' }));
    expect(r.egfr.value).toBeGreaterThanOrEqual(95);
    expect(r.egfr.value).toBeLessThanOrEqual(100);
    expect(r.egfr.level).toBe('bom');
    const r2 = byKey(computeClinicalIndices([mk('CREATININA', 2.5)], { ageYears: 70, sex: 'female' }));
    expect(r2.egfr.value).toBeLessThan(30);
    expect(r2.egfr.level).toBe('alterado');
  });

  it('eGFR sem sexo/idade → não aparece (nunca calcula valor possivelmente errado)', () => {
    expect(computeClinicalIndices([mk('CREATININA', 1.0)]).find((x) => x.key === 'egfr')).toBeUndefined();
  });

  it('não-HDL: 200-60 = 140 (atencao); 180-60 = 120 (bom); 250-40 = 210 (alterado)', () => {
    expect(byKey(computeClinicalIndices([mk('COLESTEROL_TOTAL', 200), mk('HDL', 60)])).non_hdl.level).toBe('atencao');
    expect(byKey(computeClinicalIndices([mk('COLESTEROL_TOTAL', 180), mk('HDL', 60)])).non_hdl.level).toBe('bom');
    expect(byKey(computeClinicalIndices([mk('COLESTEROL_TOTAL', 250), mk('HDL', 40)])).non_hdl.level).toBe('alterado');
  });

  it('LH/FSH: mulher 30a LH 10/FSH 4 = 2,5 (atencao); homem mesma razão (informativo)', () => {
    const mulh = byKey(computeClinicalIndices([mk('LH', 10), mk('FSH', 4)], { ageYears: 30, sex: 'female' }));
    expect(mulh.lh_fsh.value).toBe(2.5);
    expect(mulh.lh_fsh.level).toBe('atencao');
    const hom = byKey(computeClinicalIndices([mk('LH', 10), mk('FSH', 4)], { ageYears: 35, sex: 'male' }));
    expect(hom.lh_fsh.level).toBe('bom');
  });

  it('FAI: homem T 500 ng/dL + SHBG 40 → ≈ 43 (bom); mulher T 60 ng/dL + SHBG 30 → ≈ 6,9 (atencao)', () => {
    const hom = byKey(computeClinicalIndices(
      [mk('TESTOSTERONA_TOTAL', 500, 'ng/dL'), mk('SHBG', 40, 'nmol/L')],
      { ageYears: 35, sex: 'male' },
    ));
    // 500 ng/dL × 0,0347 = 17,35 nmol/L → 17,35/40×100 = 43,4
    expect(hom.fai.value).toBeCloseTo(43.4, 0);
    expect(hom.fai.level).toBe('bom');
    const mulh = byKey(computeClinicalIndices(
      [mk('TESTOSTERONA_TOTAL', 60, 'ng/dL'), mk('SHBG', 30, 'nmol/L')],
      { ageYears: 30, sex: 'female' },
    ));
    // 60 × 0,0347 = 2,08 nmol/L → 2,08/30×100 = 6,9
    expect(mulh.fai.value).toBeCloseTo(6.9, 0);
    expect(mulh.fai.level).toBe('atencao');
  });

  it('FAI com T já em nmol/L (unidade real) → NÃO converte de novo', () => {
    const r = byKey(computeClinicalIndices(
      [mk('TESTOSTERONA_TOTAL', 17.3, 'nmol/L'), mk('SHBG', 40, 'nmol/L')],
      { ageYears: 35, sex: 'male' },
    ));
    expect(r.fai.value).toBeCloseTo(43.3, 0); // 17,3/40×100 — sem ×0,0347
  });

  it('sem TODOS os marcadores exigidos → índice não aparece (honestidade)', () => {
    // HDL só + glicemia só: nenhum índice completo
    const r = computeClinicalIndices([mk('HDL', 50), mk('GLICEMIA', 90)]);
    expect(r).toHaveLength(0);
    // HOMA-IR exige insulina também
    expect(computeClinicalIndices([mk('GLICEMIA', 90)]).find((x) => x.key === 'homa_ir')).toBeUndefined();
  });

  it('HDL=0 ou valor inválido → razões retornam null (não Infinity/NaN)', () => {
    const r = computeClinicalIndices([mk('COLESTEROL_TOTAL', 200), mk('HDL', 0)]);
    expect(r.find((x) => x.key === 'castelli_i')).toBeUndefined();
  });

  it('painel completo: todos os 11 índices calculam juntos e trazem fonte', () => {
    const r = computeClinicalIndices(
      [
        mk('COLESTEROL_TOTAL', 200), mk('LDL', 120), mk('HDL', 50), mk('TRIGLICERIDES', 120),
        mk('GLICEMIA', 92), mk('INSULINA', 8), mk('TGO', 25), mk('TGP', 30), mk('PLAQUETAS', 220),
        mk('CREATININA', 1.0), mk('LH', 5), mk('FSH', 4), mk('TESTOSTERONA_TOTAL', 550, 'ng/dL'), mk('SHBG', 35, 'nmol/L'),
      ],
      { ageYears: 40, sex: 'male' },
    );
    expect(r.map((x) => x.key).sort()).toEqual([
      'aip', 'castelli_i', 'castelli_ii', 'egfr', 'fai', 'fib4', 'homa_ir', 'lh_fsh', 'non_hdl', 'tg_hdl', 'tyg',
    ]);
    for (const x of r) expect(x.source.length).toBeGreaterThan(10);
  });
});

describe('computeBodyRegions — agregação por região', () => {
  const input = (canonical: string, priority: RegionInput['priority'], name = canonical): RegionInput =>
    ({ nameCanonical: canonical, name, priority, valueText: 'x' });

  it('região acende no PIOR nível dos seus marcadores', () => {
    const regions = computeBodyRegions([
      input('LDL', 'moderada'), input('HDL', 'normal'), // coração: moderada → alterado
      input('TSH', 'normal'), // cérebro: ok
    ]);
    const by = Object.fromEntries(regions.map((r) => [r.key, r]));
    expect(by.coracao.level).toBe('alterado');
    expect(by.cerebro.level).toBe('ok');
  });

  it('borderline (leve) → atencao (amarelo), não alterado', () => {
    const by = Object.fromEntries(computeBodyRegions([input('TGO', 'leve')]).map((r) => [r.key, r]));
    expect(by.figado.level).toBe('atencao');
  });

  it('região sem marcadores → sem_dados (cinza — nunca verde)', () => {
    const by = Object.fromEntries(computeBodyRegions([input('TSH', 'normal')]).map((r) => [r.key, r]));
    expect(by.pulmoes.level).toBe('sem_dados');
    expect(by.pulmoes.markers).toHaveLength(0);
    expect(by.coracao.level).toBe('sem_dados');
  });

  it('matchers por CONTÉM casam canônicos crus (BILIRRUBINA TOTAL, FOSFORO, DHEA)', () => {
    const by = Object.fromEntries(computeBodyRegions([
      input('BILIRRUBINA TOTAL', 'moderada'), input('FOSFORO', 'normal'), input('DHEA SULFATO', 'normal'),
    ]).map((r) => [r.key, r]));
    expect(by.figado.level).toBe('alterado');
    expect(by.ossos.level).toBe('ok');
    expect(by.musculos.level).toBe('ok');
  });

  it('hemograma completo acende sangue; creatinina alterada acende rins', () => {
    const by = Object.fromEntries(computeBodyRegions([
      input('HEMOGLOBINA', 'normal'), input('PLAQUETAS', 'normal'), input('CREATININA', 'importante'),
    ]).map((r) => [r.key, r]));
    expect(by.sangue.level).toBe('ok');
    expect(by.sangue.markers).toHaveLength(2);
    expect(by.rins.level).toBe('alterado');
  });
});
