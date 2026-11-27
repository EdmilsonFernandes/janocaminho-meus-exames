import { describe, expect, it } from 'vitest';
import { attentionDir, refRange } from './attention';

describe('refRange — a faixa que a pessoa lê ao lado do valor', () => {
  it('faixa fechada, só limite de cima, só limite de baixo, sem faixa', () => {
    expect(refRange({ refLow: 30, refHigh: 100, unit: 'ng/mL' })).toBe('faixa 30 a 100 ng/mL');
    expect(refRange({ refLow: null, refHigh: 130, unit: 'mg/dL' })).toBe('faixa até 130 mg/dL');
    expect(refRange({ refLow: 40, refHigh: null, unit: 'mg/dL' })).toBe('faixa a partir de 40 mg/dL');
    expect(refRange({ refLow: null, refHigh: null, unit: null })).toBe('fora da faixa do laboratório');
  });

  it('decimal com vírgula, como no laudo brasileiro', () => {
    expect(refRange({ refLow: 0.4, refHigh: 4.5, unit: 'µUI/mL' })).toBe('faixa 0,4 a 4,5 µUI/mL');
  });
});

describe('attentionDir — a seta nunca contradiz o número', () => {
  it('o número decide', () => {
    expect(attentionDir({ valueNumeric: 162, refLow: null, refHigh: 130, flag: 'LOW' })).toBe('up');
    expect(attentionDir({ valueNumeric: 18, refLow: 30, refHigh: 100, flag: 'HIGH' })).toBe('down');
  });

  it('número dentro da faixa não ganha seta, mesmo com marcação do laudo', () => {
    expect(attentionDir({ valueNumeric: 50, refLow: 30, refHigh: 100, flag: 'HIGH' })).toBeNull();
  });

  it('sem número, vale a marcação do laudo', () => {
    expect(attentionDir({ valueNumeric: null, refLow: null, refHigh: null, flag: 'high' })).toBe('up');
    expect(attentionDir({ valueNumeric: null, refLow: null, refHigh: null, flag: 'LOW' })).toBe('down');
    expect(attentionDir({ valueNumeric: null, refLow: null, refHigh: null, flag: 'ABNORMAL' })).toBeNull();
  });
});
