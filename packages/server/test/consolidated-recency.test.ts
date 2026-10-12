/**
 * CAMADA 3 — resumo consolidado prioriza o exame MAIS RECENTE.
 * Cenário do dono: hemoglobina 14,0 HOJE + 12,0 há 8 meses → atual é 14,0 e 12,0 vira
 * tendência; vitamina D há 14 meses sem medição mais recente → histórico, não atual.
 * Tudo PURO (computeMarkerState/splitByRecency/formatSnapshotContext/attachRecency) —
 * sem DB, sem LLM: a recência é DADO computado, não sorteio do prompt.
 */
import { describe, it, expect } from 'vitest';
import {
  computeMarkerState, splitByRecency, formatSnapshotContext,
  type ItemRow, type CurrentHealthSummary, type MarkerState,
} from '../src/analysis/health-state';
import { consolidatedLead, attachRecency } from '../src/analysis/health-summary';

const monthsAgo = (m: number) => new Date(Date.now() - m * 30 * 86400000);

const row = (over: Partial<ItemRow>): ItemRow => ({
  name: 'Hemoglobina', nameCanonical: 'HEMOGLOBINA', valueNumeric: null, valueText: null,
  unit: 'g/dL', refLow: 13, refHigh: 17, refText: null, flag: 'NORMAL', isAbnormal: false,
  performedAt: null, ...over,
});

const snapshotOf = (markers: MarkerState[]): CurrentHealthSummary => ({
  patientId: 'p1', generatedAt: new Date(),
  markers: markers.length,
  score: markers.length ? Math.round(markers.filter((m) => m.priority === 'normal').length / markers.length * 100) : null,
  byPriority: { normal: 0, leve: 0, moderada: 0, importante: 0 },
  abnormalAnalytes: markers.filter((m) => m.priority !== 'normal').map((m) => m.nameCanonical),
  topAttention: markers.filter((m) => m.priority !== 'normal'),
  improving: markers.filter((m) => m.trend === 'melhorou'),
  worsening: markers.filter((m) => m.trend === 'piorou'),
  stale: markers.filter((m) => m.latest.stale),
  whatChanged: markers.filter((m) => m.deltaPct != null).map((m) => ({ nameCanonical: m.nameCanonical, name: m.name, deltaPct: m.deltaPct, trend: m.trend })),
  normalized: [],
  recency: splitByRecency(markers),
});

describe('camada 3 — marcador canônico usa a medição MAIS RECENTE como atual', () => {
  const markers = computeMarkerState([
    row({ valueNumeric: 14.0, valueText: '14,0', performedAt: monthsAgo(0) }),
    row({ valueNumeric: 12.0, valueText: '12,0', performedAt: monthsAgo(8), flag: 'LOW', isAbnormal: true }),
  ]);

  it('valor ATUAL = 14,0 (medição de hoje); 12,0 fica como ANTERIOR/tendência', () => {
    expect(markers).toHaveLength(1);
    const hemo = markers[0];
    expect(hemo.latest.valueNumeric).toBe(14.0);
    expect(hemo.prior?.valueNumeric).toBe(12.0);
    expect(hemo.latest.ageMonths != null && hemo.latest.ageMonths < 1).toBe(true);
    expect(hemo.latest.monthsSinceLast).toBe(0);
    expect(hemo.latest.stale).toBe(false);
    expect(hemo.historical).toBe(false);
  });

  it('tendência calculada server-side (12→14 dentro da faixa = melhorou)', () => {
    expect(markers[0].trend).toBe('melhorou');
    expect(markers[0].deltaPct).toBeGreaterThan(0);
  });

  it('splitByRecency: medição recente no bucket current; NÃO vai p/ histórico', () => {
    const r = splitByRecency(markers);
    expect(r.current.map((m) => m.nameCanonical)).toContain('HEMOGLOBINA');
    expect(r.historical).toHaveLength(0);
    expect(r.allOutdated).toBe(false);
  });
});

describe('camada 3 — marcador sem medição recente vira contexto histórico', () => {
  const markers = computeMarkerState([
    row({ name: 'Vitamina D', nameCanonical: 'VITAMINA_D', unit: 'ng/mL', refLow: 30, refHigh: 100, valueNumeric: 22, valueText: '22', performedAt: monthsAgo(14), flag: 'LOW', isAbnormal: true }),
  ]);

  it('14 meses → historical=true + stale=true (só contexto, não estado atual)', () => {
    const vitD = markers[0];
    expect(vitD.latest.stale).toBe(true);
    expect(vitD.historical).toBe(true);
    expect(vitD.latest.monthsSinceLast).toBeGreaterThanOrEqual(13);
  });

  it('splitByRecency joga no bucket historical e marca allOutdated (é o único marcador)', () => {
    const r = splitByRecency(markers);
    expect(r.historical.map((m) => m.nameCanonical)).toContain('VITAMINA_D');
    expect(r.current).toHaveLength(0);
    expect(r.allOutdated).toBe(true);
  });
});

describe('camada 3 — 6–12m: entra como atual COM aviso de frescor', () => {
  it('vitamina D há 8 meses → bucket aging (não histórico), stale=false', () => {
    const markers = computeMarkerState([
      row({ name: 'Vitamina D', nameCanonical: 'VITAMINA_D', unit: 'ng/mL', refLow: 30, refHigh: 100, valueNumeric: 22, valueText: '22', performedAt: monthsAgo(8), flag: 'LOW', isAbnormal: true }),
    ]);
    const r = splitByRecency(markers);
    expect(r.aging.map((m) => m.nameCanonical)).toContain('VITAMINA_D');
    expect(r.historical).toHaveLength(0);
    expect(markers[0].latest.stale).toBe(false); // 8 < 12: ainda conta pro score
  });
});

describe('formatSnapshotContext — layout prioriza o exame mais recente', () => {
  const markers = computeMarkerState([
    // exame MAIS RECENTE (hoje): hemoglobina 14,0 + hematócrito 51,8
    row({ valueNumeric: 14.0, valueText: '14,0', performedAt: monthsAgo(0) }),
    row({ name: 'Hematócrito', nameCanonical: 'HEMATOCRITO', unit: '%', refLow: 36, refHigh: 46, valueNumeric: 51.8, valueText: '51,8', performedAt: monthsAgo(0), flag: 'HIGH', isAbnormal: true }),
    // exame anterior (8m): hemoglobina 12,0 (vira tendência, não atual) + única fonte de vitamina D
    row({ valueNumeric: 12.0, valueText: '12,0', performedAt: monthsAgo(8), flag: 'LOW', isAbnormal: true }),
    row({ name: 'Vitamina D', nameCanonical: 'VITAMINA_D', unit: 'ng/mL', refLow: 30, refHigh: 100, valueNumeric: 22, valueText: '22', performedAt: monthsAgo(8), flag: 'LOW', isAbnormal: true }),
    // exame de 2024 (14m): única fonte de PSA → histórico
    row({ name: 'PSA', nameCanonical: 'PSA', unit: 'ng/mL', refLow: 0, refHigh: 4, valueNumeric: 0.72, valueText: '0,72', performedAt: monthsAgo(14) }),
  ]);
  const out = formatSnapshotContext(snapshotOf(markers));
  const currentSection = out.split('TENDÊNCIAS')[0];
  const histSection = out.includes('CONTEXTO HISTÓRICO') ? out.split('CONTEXTO HISTÓRICO')[1] : '';

  it('abre com EXAME MAIS RECENTE + seção MARCADORES ATUAIS', () => {
    expect(out).toContain('EXAME MAIS RECENTE');
    expect(out).toContain('MARCADORES ATUAIS');
    expect(out).toContain('ESTADO ATUAL'); // compat: prompts/regras referenciam ESTADO ATUAL
  });

  it('marcador atual traz valor MAIS RECENTE + seta vs anterior (14,0 ≠ 12,0 de 8m atrás)', () => {
    expect(currentSection).toContain('Hemoglobina: 14,0');
    expect(currentSection).not.toContain('Hemoglobina: 12,0'); // valor antigo NÃO é estado atual
    expect(currentSection).toMatch(/↑ melhorou vs 12(,0)? em \d{2}\/\d{2}/); // só como tendência
  });

  it('marcador 6–12m (vitamina D, 8m) fica nos atuais COM aviso ⚠️', () => {
    expect(currentSection).toContain('Vitamina D');
    expect(currentSection).toContain('⚠️ última medição há 8 meses');
  });

  it('marcador >12m (PSA, 14m) vai p/ CONTEXTO HISTÓRICO e NÃO fica nos atuais', () => {
    expect(currentSection).not.toContain('PSA');
    expect(histSection).toContain('PSA');
    expect(histSection).toMatch(/há 1[34]m/);
    expect(histSection).toContain('contexto apenas');
  });
});

describe('consolidatedLead + attachRecency — âncora de frescor do prompt e do summary', () => {
  it('lead cita o exame mais recente com data dd/mm/aaaa', () => {
    const lead = consolidatedLead(new Date('2026-10-05T12:00:00'));
    expect(lead).toContain('Baseado no exame mais recente do paciente');
    expect(lead).toContain('05/10/2026');
  });

  it('attachRecency anexa baseDate/allOutdated/idade por marcador (fonte: DB)', () => {
    const markers = computeMarkerState([
      row({ valueNumeric: 14.0, valueText: '14,0', performedAt: monthsAgo(0) }),
      row({ valueNumeric: 12.0, valueText: '12,0', performedAt: monthsAgo(8), flag: 'LOW', isAbnormal: true }),
      row({ name: 'Vitamina D', nameCanonical: 'VITAMINA_D', unit: 'ng/mL', refLow: 30, refHigh: 100, valueNumeric: 22, valueText: '22', performedAt: monthsAgo(14), flag: 'LOW', isAbnormal: true }),
    ]);
    const snapshot = snapshotOf(markers);
    const base: any = { resumoGeral: 'x', comparativo: [], pontosAtencao: [], coisasBoas: [], leituraFinal: 'y', perguntasParaOMedico: [] };
    const withRecency = attachRecency(base, snapshot) as any;
    expect(withRecency.recency.baseDate).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    expect(withRecency.recency.allOutdated).toBe(false);
    const hemo = withRecency.recency.markers.find((m: any) => m.nameCanonical === 'HEMOGLOBINA');
    const vitD = withRecency.recency.markers.find((m: any) => m.nameCanonical === 'VITAMINA_D');
    expect(hemo.monthsSinceLast).toBe(0);
    expect(hemo.historical).toBe(false);
    expect(vitD.historical).toBe(true);
    expect(vitD.monthsSinceLast).toBeGreaterThanOrEqual(13);
  });

  it('snapshot sem recency → summary inalterado (relatório antigo não quebra)', () => {
    const snapshotNoRecency = { ...snapshotOf(computeMarkerState([row({ valueNumeric: 14, performedAt: monthsAgo(0) })])) };
    delete (snapshotNoRecency as any).recency;
    const base: any = { resumoGeral: 'x' };
    expect(attachRecency(base, snapshotNoRecency) as any).toEqual(base);
  });
});
