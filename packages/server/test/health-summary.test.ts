import { describe, it, expect } from 'vitest';
import { coerceComparativo, coerceStaleness } from '../src/analysis/health-summary';
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

describe('coerceStaleness — remove prazos inventados (anti-alucinação)', () => {
  it('corta "há X meses" quando NENHUM marcador está desatualizado', () => {
    const s: any = {
      resumoGeral: 'Tudo bem no geral. TGO não medido há 14 meses.',
      pontosAtencao: [{ titulo: 'Fígado', detalhe: 'TGP desatualizado há 14 meses. Cuidado.' }],
      perguntasParaOMedico: ['Refazer TGO que está há 12 meses?'],
    };
    const out = coerceStaleness(s, []); // staleMarkers vazio
    expect(out.resumoGeral).not.toContain('14 meses');
    expect(out.resumoGeral).toContain('Tudo bem');
    expect((out.pontosAtencao ?? []).some((p: any) => (p.detalhe || '').includes('14 meses'))).toBe(false);
    expect((out.perguntasParaOMedico ?? []).some((q: string) => q.includes('12 meses'))).toBe(false);
  });

  it('NÃO mexe quando há marcadores realmente desatualizados (>12m)', () => {
    const s: any = { resumoGeral: 'TGO não medido há 14 meses.' };
    const stale = [{ nameCanonical: 'TGO' }] as any;
    expect(coerceStaleness(s, stale).resumoGeral).toContain('14 meses');
  });

  it('descarta ponto de atenção que ficou vazio após a remoção', () => {
    const s: any = { pontosAtencao: [{ titulo: 'Fígado', detalhe: 'TGP desatualizado há 14 meses.' }] };
    const out = coerceStaleness(s, []);
    expect(out.pontosAtencao.length).toBe(0);
  });
});
