import { describe, it, expect } from 'vitest';
import { coerceComparativo, coerceStaleness, guardHistoricalAsCurrent, attachDesatualizados } from '../src/analysis/health-summary';
import type { MarkerState, CurrentHealthSummary } from '../src/analysis/health-state';

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

  it('remove prazo inventado MESMO quando há outros marcadores stale (>12m)', () => {
    // A IA alucina prazo pra marcadores RECENTES mesmo quando há outros realmente stale no contexto.
    const s: any = { resumoGeral: 'TGO não medido há 14 meses.' };
    const stale = [{ nameCanonical: 'URINA' }] as any; // outro marcador stale (não o TGO)
    expect(coerceStaleness(s, stale).resumoGeral).not.toContain('14 meses');
  });

  it('preserva "desatualizado" sem prazo (não corta aviso legítimo sem número inventado)', () => {
    const s: any = { resumoGeral: 'Seu TSH está desatualizado, considere refazer.' };
    expect(coerceStaleness(s, []).resumoGeral).toContain('desatualizado');
  });

  it('descarta ponto de atenção que ficou vazio após a remoção', () => {
    const s: any = { pontosAtencao: [{ titulo: 'Fígado', detalhe: 'TGP desatualizado há 14 meses.' }] };
    const out = coerceStaleness(s, []);
    expect(out.pontosAtencao.length).toBe(0);
  });
});

describe('guardHistoricalAsCurrent — IA não lista marcador só histórico como atenção ATUAL', () => {
  const mkSnapshot = (over: Partial<CurrentHealthSummary>): CurrentHealthSummary => ({
    patientId: 'p1', generatedAt: new Date(), markers: 2, score: 80,
    byPriority: { normal: 1, leve: 0, moderada: 1, importante: 0 },
    abnormalAnalytes: [], topAttention: [], improving: [], worsening: [], stale: [], whatChanged: [],
    ...over,
  });

  // Cenário pedido no spec: TGP alterado em 2018, sem medição recente (stale/desatualizado).
  it('REMOVE de pontosAtencao o marcador stale (2018) sem versão fresca e anota em leituraFinal', () => {
    const tgpStale = mkMarker({
      nameCanonical: 'TGP', name: 'TGP', flag: 'HIGH', isAbnormal: true,
      temporalClass: 'desatualizado', outdated: true,
      latest: { valueNumeric: 82, valueText: '82', performedAt: null, ageMonths: 90, stale: true },
    });
    const snap = mkSnapshot({ stale: [tgpStale] });
    const summary: any = { pontosAtencao: [{ titulo: 'TGP elevada', detalhe: 'Sua TGP está muito alta.' }], leituraFinal: 'Resumo.' };
    const out = guardHistoricalAsCurrent(summary, snap);
    expect(out.pontosAtencao.length).toBe(0); // removido das atenções atuais
    expect(out.leituraFinal).toContain('TGP');
    expect(out.leituraFinal).toContain('medição recente'); // vira orientação, não alarme
  });

  it('MANTÉM pontosAtencao que casa com marcador FRESCO (atenção legítima)', () => {
    const glicFresca = mkMarker({
      nameCanonical: 'GLICEMIA', name: 'Glicemia', flag: 'HIGH', isAbnormal: true, temporalClass: 'atual',
      latest: { valueNumeric: 168, valueText: '168', performedAt: null, ageMonths: 2, stale: false },
    });
    const snap = mkSnapshot({ topAttention: [glicFresca] });
    const summary: any = { pontosAtencao: [{ titulo: 'Glicemia alta', detalhe: '168 mg/dL.' }], leituraFinal: 'Ok.' };
    const out = guardHistoricalAsCurrent(summary, snap);
    expect(out.pontosAtencao.length).toBe(1);
    expect(out.leituraFinal).toBe('Ok.');
  });

  it('NÃO mexe quando não há marcadores stale no snapshot', () => {
    const fresca = mkMarker({ nameCanonical: 'GLICEMIA', name: 'Glicemia', temporalClass: 'atual' });
    const snap = mkSnapshot({ topAttention: [fresca] });
    const summary: any = { pontosAtencao: [{ titulo: 'Glicemia alta', detalhe: 'x' }], leituraFinal: 'Ok.' };
    expect(guardHistoricalAsCurrent(summary, snap).pontosAtencao.length).toBe(1);
  });

  it('conservador: NÃO remove quando o título não casa com marcador conhecido', () => {
    const tgpStale = mkMarker({
      nameCanonical: 'TGP', name: 'TGP', temporalClass: 'desatualizado', outdated: true,
      latest: { valueNumeric: 82, valueText: '82', performedAt: null, ageMonths: 90, stale: true },
    });
    const snap = mkSnapshot({ stale: [tgpStale] });
    // Título genérico que não casa com "TGP" → mantém (não arriscar remover atenção legítima)
    const summary: any = { pontosAtencao: [{ titulo: 'Função hepática', detalhe: 'algo' }], leituraFinal: 'Ok.' };
    expect(guardHistoricalAsCurrent(summary, snap).pontosAtencao.length).toBe(1);
  });
});

describe('attachDesatualizados — seção estruturada de acompanhamentos desatualizados', () => {
  const mkSnapshot = (over: Partial<CurrentHealthSummary>): CurrentHealthSummary => ({
    patientId: 'p1', generatedAt: new Date(), markers: 1, score: 80,
    byPriority: { normal: 1, leve: 0, moderada: 0, importante: 0 },
    abnormalAnalytes: [], topAttention: [], improving: [], worsening: [], stale: [], whatChanged: [],
    ...over,
  });

  it('preenche desatualizados[] a partir do snapshot.stale (dados do DB, confiável)', () => {
    const tgpStale = mkMarker({
      nameCanonical: 'TGP', name: 'TGP', flag: 'HIGH',
      latest: { valueNumeric: 82, valueText: '82', performedAt: new Date('2018-03-15'), ageMonths: 90, stale: true },
    });
    const snap = mkSnapshot({ stale: [tgpStale] });
    const out = attachDesatualizados({ resumoGeral: 'x', leituraFinal: 'y' } as any, snap);
    expect(out.desatualizados).toHaveLength(1);
    expect(out.desatualizados[0]).toMatchObject({ marcador: 'TGP', ultimoResultado: '82', haMeses: 90 });
    expect(out.desatualizados[0].data).toMatch(/2018/); // data formatada
    expect(out.desatualizados[0].situacao).toContain('alterado');
  });

  it('NÃO adiciona desatualizados quando o snapshot não tem marcadores stale', () => {
    const snap = mkSnapshot({});
    const out = attachDesatualizados({ resumoGeral: 'x', leituraFinal: 'y' } as any, snap);
    // Sem stale → early return sem modificar (relatórios reais trazem desatualizados=[] do schema default).
    expect(out.desatualizados || []).toEqual([]);
  });
});
