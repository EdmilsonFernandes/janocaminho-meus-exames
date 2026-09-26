import { describe, expect, it } from 'vitest';
import { parseHeightCm, maskHeightInput, fmtHeight } from './height';

/** Regressão do bug do dono 26/09: campo de altura stripava vírgula/ponto e corrompia
 *  dados ("1.7" → 17cm; 7 registros do prod com alturas 1, 2 e 63). */
describe('parseHeightCm — cm OU metros, sempre válido', () => {
  it('aceita centímetros direto', () => {
    expect(parseHeightCm('172')).toBe(172);
    expect(parseHeightCm('150')).toBe(150);
  });
  it('aceita metros com vírgula e com ponto', () => {
    expect(parseHeightCm('1,72')).toBe(172);
    expect(parseHeightCm('1.72')).toBe(172);
    expect(parseHeightCm('1.80')).toBe(180);
  });
  it('rejeita fora da faixa humana (os dados corrompidos do prod)', () => {
    expect(parseHeightCm('1')).toBeNull();  // "metros inteiros" digitados no campo antigo
    expect(parseHeightCm('2')).toBeNull();
    expect(parseHeightCm('63')).toBeNull(); // peso colado no campo de altura
    expect(parseHeightCm('300')).toBeNull();
    expect(parseHeightCm('')).toBeNull();
  });
  it('1,7 → 170 (arredonda metros com 1 casa)', () => {
    expect(parseHeightCm('1.7')).toBe(170);
  });
});

describe('maskHeightInput — digitação com separador visível', () => {
  it('mantém dígitos e o PRIMEIRO separador', () => {
    expect(maskHeightInput('1,72')).toBe('1,72');
    expect(maskHeightInput('1.72')).toBe('1.72');
    expect(maskHeightInput('172')).toBe('172');
  });
  it('descarta o segundo separador e letras', () => {
    expect(maskHeightInput('1,7,2')).toBe('1,72');
    expect(maskHeightInput('1a7b2')).toBe('172');
  });
});

describe('fmtHeight — exibe como o usuário pensa', () => {
  it('cm → metros legíveis', () => {
    expect(fmtHeight(172)).toBe('1,72 m (172 cm)');
    expect(fmtHeight(180)).toBe('1,80 m (180 cm)');
    expect(fmtHeight(null)).toBe('');
  });
});
