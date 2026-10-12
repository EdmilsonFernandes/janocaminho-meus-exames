import { describe, it, expect } from 'vitest';
import { getUrgency, getUrgencyDetail, URGENCY_RULES, type UrgencyItem } from '../src/analysis/urgency';

const item = (over: Partial<UrgencyItem>): UrgencyItem => ({
  nameCanonical: over.nameCanonical ?? 'POTASSIO',
  valueNumeric: over.valueNumeric ?? null,
  refLow: over.refLow ?? null,
  refHigh: over.refHigh ?? null,
  ...over,
});

describe('getUrgency — regras hardcoded (triagem determinística)', () => {
  it('potássio 6,5 → CRITICO (arritmia — emergência)', () => {
    expect(getUrgency([item({ nameCanonical: 'POTASSIO', valueNumeric: 6.5 })])).toBe('CRITICO');
  });

  it('hematócrito 55% → ATENCAO (avaliação em breve)', () => {
    expect(getUrgency([item({ nameCanonical: 'HEMATOCRITO', valueNumeric: 55 })])).toBe('ATENCAO');
  });

  it('exame 100% normal → NORMAL (nenhuma regra dispara)', () => {
    expect(getUrgency([
      item({ nameCanonical: 'POTASSIO', valueNumeric: 4.2, refLow: 3.5, refHigh: 5.1 }),
      item({ nameCanonical: 'HEMATOCRITO', valueNumeric: 45 }),
      item({ nameCanonical: 'TSH', valueNumeric: 2.1, refLow: 0.4, refHigh: 4 }),
    ])).toBe('NORMAL');
  });

  it('lista vazia e itens sem valor numérico → NORMAL (nunca grita sem dado)', () => {
    expect(getUrgency([])).toBe('NORMAL');
    expect(getUrgency([item({ nameCanonical: 'POTASSIO', valueNumeric: null })])).toBe('NORMAL');
  });

  it('pega o MAIOR nível entre todos os itens (CRITICO vence ATENCAO)', () => {
    expect(getUrgency([
      item({ nameCanonical: 'HEMATOCRITO', valueNumeric: 56 }), // ATENCAO
      item({ nameCanonical: 'HEMOGLOBINA', valueNumeric: 6.5 }), // CRITICO
    ])).toBe('CRITICO');
  });

  it('troponina: dispara só acima de 2× o refHigh do laudo (relativo, não absoluto)', () => {
    expect(getUrgency([item({ nameCanonical: 'TROPONINA I', valueNumeric: 60, refHigh: 30 })])).toBe('NORMAL');
    expect(getUrgency([item({ nameCanonical: 'TROPONINA I ULTRASSENSIVEL', valueNumeric: 61, refHigh: 30 })])).toBe('CRITICO');
    // sem refHigh não há como avaliar relativo → não dispara
    expect(getUrgency([item({ nameCanonical: 'TROPONINA T', valueNumeric: 500 })])).toBe('NORMAL');
  });

  it('glicemia: <50 CRITICO, >300 ATENCAO, normal NORMAL', () => {
    expect(getUrgency([item({ nameCanonical: 'GLICEMIA', valueNumeric: 42 })])).toBe('CRITICO');
    expect(getUrgency([item({ nameCanonical: 'GLICEMIA', valueNumeric: 320 })])).toBe('ATENCAO');
    expect(getUrgency([item({ nameCanonical: 'GLICEMIA', valueNumeric: 95 })])).toBe('NORMAL');
  });

  it('sinônimo de laboratório ("Glicose") casa com GLICEMIA via canonicalName', () => {
    expect(getUrgency([item({ nameCanonical: 'GLICOSE', valueNumeric: 350 })])).toBe('ATENCAO');
  });

  it('HbA1c NÃO dispara a regra de HEMOGLOBINA (analito distinto — sem substring)', () => {
    expect(getUrgency([item({ nameCanonical: 'HEMOGLOBINA GLICADA', valueNumeric: 6.1 })])).toBe('NORMAL');
  });

  it('TSH >10 e <0,1 → ATENCAO; dentro da banda alterada comum não dispara', () => {
    expect(getUrgency([item({ nameCanonical: 'TSH', valueNumeric: 12 })])).toBe('ATENCAO');
    expect(getUrgency([item({ nameCanonical: 'TSH', valueNumeric: 0.05 })])).toBe('ATENCAO');
    expect(getUrgency([item({ nameCanonical: 'TSH', valueNumeric: 6 })])).toBe('NORMAL');
  });

  it('demais regras ATENCAO: creatinina 3,2 / PSA 12 / PCR 120', () => {
    expect(getUrgency([item({ nameCanonical: 'CREATININA', valueNumeric: 3.2 })])).toBe('ATENCAO');
    expect(getUrgency([item({ nameCanonical: 'PSA TOTAL', valueNumeric: 12 })])).toBe('ATENCAO');
    expect(getUrgency([item({ nameCanonical: 'PCR', valueNumeric: 120 })])).toBe('ATENCAO');
  });
});

describe('getUrgencyDetail — nível + mensagem p/ o resumo', () => {
  it('devolve a mensagem da regra disparada (banner lê isto)', () => {
    const d = getUrgencyDetail([item({ nameCanonical: 'HEMATOCRITO', valueNumeric: 55 })]);
    expect(d.level).toBe('ATENCAO');
    expect(d.message).toContain('54%');
  });

  it('CRITICO vence e traz a mensagem da 1ª regra crítica disparada', () => {
    const d = getUrgencyDetail([
      item({ nameCanonical: 'HEMATOCRITO', valueNumeric: 58 }), // ATENCAO
      item({ nameCanonical: 'POTASSIO', valueNumeric: 6.8 }), // CRITICO
    ]);
    expect(d.level).toBe('CRITICO');
    expect(d.message).toContain('URGENTE');
  });

  it('normal → level NORMAL, message null', () => {
    const d = getUrgencyDetail([item({ nameCanonical: 'POTASSIO', valueNumeric: 4.0 })]);
    expect(d).toEqual({ level: 'NORMAL', message: null });
  });
});

describe('URGENCY_RULES — contrato da tabela (não inventar limiares)', () => {
  it('toda regra tem mensagem educativa com conduta (não-diagnóstica)', () => {
    for (const r of URGENCY_RULES) {
      expect(r.canonical).toBeTruthy();
      expect(r.message.length).toBeGreaterThan(20);
      expect(r.level === 'CRITICO' || r.level === 'ATENCAO').toBe(true);
    }
  });
});
