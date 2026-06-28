import { describe, it, expect } from 'vitest';
import { formatSnapshotContext, type CurrentHealthSummary, type MarkerState } from '../src/analysis/health-state';

const monthsAgo = (m: number) => new Date(Date.now() - m * 30 * 86400000);

const mkMarker = (over: Partial<MarkerState>): MarkerState => ({
  nameCanonical: 'X', name: 'X', unit: null,
  latest: { valueText: null, valueNumeric: null, performedAt: null, ageMonths: null, stale: false },
  prior: null, deltaPct: null, refLow: null, refHigh: null, refText: null,
  flag: 'NORMAL', isAbnormal: false, priority: 'normal', trend: 'primeiro', points: 1, confidence: 'baixa',
  ...over,
});

describe('formatSnapshotContext — peso temporal estrutural (M2)', () => {
  const snapshot: CurrentHealthSummary = {
    patientId: 'p1', generatedAt: new Date(),
    markers: 3, score: 67,
    byPriority: { normal: 2, leve: 0, moderada: 1, importante: 0 },
    topAttention: [
      mkMarker({ nameCanonical: 'GLICOSE', name: 'Glicose', unit: 'mg/dL', latest: { valueText: '110', valueNumeric: 110, performedAt: monthsAgo(1), ageMonths: 1, stale: false }, prior: { valueText: '95', valueNumeric: 95, performedAt: monthsAgo(13) }, deltaPct: 15.789, refLow: 70, refHigh: 99, flag: 'HIGH', isAbnormal: true, priority: 'moderada', trend: 'piorou', points: 2, confidence: 'alta' }),
      mkMarker({ nameCanonical: 'VIT_D', name: 'Vitamina D', unit: 'ng/mL', latest: { valueText: '22', valueNumeric: 22, performedAt: monthsAgo(2), ageMonths: 2, stale: false }, prior: null, deltaPct: null, refLow: 30, refHigh: 100, flag: 'LOW', isAbnormal: true, priority: 'leve', trend: 'primeiro', points: 1, confidence: 'baixa' }),
    ],
    improving: [],
    worsening: [
      mkMarker({ nameCanonical: 'GLICOSE', name: 'Glicose', trend: 'piorou', priority: 'moderada' } as any),
    ],
    stale: [
      mkMarker({ nameCanonical: 'TSH', name: 'TSH', unit: 'mUI/L', latest: { valueText: '4.5', valueNumeric: 4.5, performedAt: monthsAgo(20), ageMonths: 20, stale: true }, refLow: 0.4, refHigh: 4, priority: 'normal', trend: 'primeiro', confidence: 'baixa' }),
    ],
    whatChanged: [{ nameCanonical: 'GLICOSE', name: 'Glicose', deltaPct: 15.789, trend: 'piorou' }],
  };

  const out = formatSnapshotContext(snapshot);

  it('seção ESTADO ATUAL com valor + unidade + faixa + prioridade', () => {
    expect(out).toContain('ESTADO ATUAL');
    expect(out).toContain('Glicose: 110 mg/dL');
    expect(out).toContain('ref 70-99');
    expect(out).toContain('moderada');
  });
  it('delta% arredondado server-side (não fica pro LLM derivar)', () => {
    expect(out).toContain('Δ+16%'); // 15.789 → 16
  });
  it('seção TENDÊNCIAS com trend + %', () => {
    expect(out).toContain('TENDÊNCIAS');
    expect(out).toContain('Glicose: piorou (+16%)');
  });
  it('MELHORAS/PIORAS rotuladas', () => {
    expect(out).toContain('PIORAS: Glicose');
    expect(out).toContain('MELHORAS: nenhuma registrada');
  });
  it('CONTEXTO HISTÓRICO só aparece quando há stale', () => {
    expect(out).toContain('CONTEXTO HISTÓRICO');
    expect(out).toContain('TSH');
    expect(out).toContain('há 20m');
  });
  it('marca [confiança baixa] em marcador com 1 ponto', () => {
    expect(out).toContain('[confiança baixa]');
  });
  it('sem stale → não renderiza seção histórica', () => {
    const semStale = { ...snapshot, stale: [] };
    expect(formatSnapshotContext(semStale)).not.toContain('CONTEXTO HISTÓRICO');
  });
});
