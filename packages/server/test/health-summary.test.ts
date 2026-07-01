import { describe, it, expect } from 'vitest';
import { coerceComparativo } from '../src/analysis/health-summary';
import type { MarkerState } from '../src/analysis/health-state';

/** Marca o bug de credibilidade: relatório mostra TSH=3, mas o valor real no DB é 2,75. */
const mkMarker = (over: Partial<MarkerState>): MarkerState => ({
  nameCanonical: 'TSH',
  name: 'TSH',
  unit: 'µUI/mL',
  latest: { valueNumeric: 2.75, valueText: '2,75', performedAt: null, ageMonths: null, stale: false },
  prior: { valueNumeric: 2.61, valueText: '2,61', performedAt: null },
  deltaPct: 5.3,
  refLow: 0.4,
  refHigh: 4.0,
  refText: null,
  flag: 'NORMAL',
  isAbnormal: false,
  priority: 'normal',
  trend: 'estavel',
  points: 2,
  confidence: 'alta',
  ...over,
});

describe('coerceComparativo — anti-alucinação do relatório consolidado', () => {
  it('substitui o valor fabricado pela IA (3) pelo real do banco (2,75)', () => {
    const summary: any = { comparativo: [{ name: 'TSH', anterior: '2', atual: '3', leitura: 'Estável', entenda: 'x' }] };
    const out = coerceComparativo(summary, [mkMarker({})]);
    expect(out.comparativo[0].atual).toBe('2,75');
    expect(out.comparativo[0].anterior).toBe('2,61');
  });

  it('casa por nome de exibição longo (IA escreve "Hormônio Tireoestimulante")', () => {
    const summary: any = { comparativo: [{ name: 'Hormônio Tireoestimulante', atual: '5' }] };
    const out = coerceComparativo(summary, [mkMarker({ name: 'Hormônio Tireoestimulante (TSH)' })]);
    expect(out.comparativo[0].atual).toBe('2,75');
  });

  it('casa por nameCanonical (IA escreve "TSH", marker nameCanonical "TSH")', () => {
    const summary: any = { comparativo: [{ name: 'TSH', atual: '9' }] };
    const out = coerceComparativo(summary, [mkMarker({ name: 'Tireotropina', nameCanonical: 'TSH' })]);
    expect(out.comparativo[0].atual).toBe('2,75');
  });

  it('mantém o valor da IA quando o analito NÃO está no snapshot (sem falso casamento)', () => {
    const summary: any = { comparativo: [{ name: 'Colesterol Total', atual: '200' }] };
    const out = coerceComparativo(summary, [mkMarker({})]);
    expect(out.comparativo[0].atual).toBe('200');
  });

  it('não quebra com comparativo vazio ou markers vazios', () => {
    expect(coerceComparativo({ comparativo: [] } as any, [mkMarker({})]).comparativo).toEqual([]);
    expect(coerceComparativo({ comparativo: [{ name: 'TSH', atual: '3' }] } as any, []).comparativo[0].atual).toBe('3');
  });
});
