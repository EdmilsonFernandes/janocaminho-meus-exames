import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { normalizeKey, canonicalName, computeFlag, parseNumeric } from './normalize';
import { extractJsonObject } from './json';
import { withRateLimitRetry } from './retry';

describe('normalizeKey', () => {
  it('tira acento e coloca em maiúsculas', () => {
    expect(normalizeKey('Hematócrito')).toBe('HEMATOCRITO');
    expect(normalizeKey('ácido Úrico')).toBe('ACIDO URICO');
  });
  it('colapsa espaços extras', () => {
    expect(normalizeKey('  glicemia   de   jejum  ')).toBe('GLICEMIA DE JEJUM');
  });
});

describe('canonicalName (casa sinônimos entre laboratórios)', () => {
  it('mapeia abreviações comuns', () => {
    expect(canonicalName('HGB')).toBe('HEMOGLOBINA');
    expect(canonicalName('Hb')).toBe('HEMOGLOBINA');
    expect(canonicalName('WBC')).toBe('LEUCOCITOS');
    expect(canonicalName('HCT')).toBe('HEMATOCRITO');
    expect(canonicalName('LDL C')).toBe('LDL');
  });
  it('mantém o nome quando não é sinônimo conhecido', () => {
    expect(canonicalName('Exame Incomum')).toBe('EXAME INCOMUM');
  });
});

describe('computeFlag (faixa de referência)', () => {
  it('LOW quando abaixo do mínimo', () => {
    expect(computeFlag(10, 12, 16)).toEqual({ flag: 'LOW', isAbnormal: true });
  });
  it('HIGH quando acima do máximo', () => {
    expect(computeFlag(20, 12, 16)).toEqual({ flag: 'HIGH', isAbnormal: true });
  });
  it('NORMAL dentro da faixa', () => {
    expect(computeFlag(14, 12, 16)).toEqual({ flag: 'NORMAL', isAbnormal: false });
  });
  it('UNKNOWN quando não há valor', () => {
    expect(computeFlag(null, 12, 16)).toEqual({ flag: 'UNKNOWN', isAbnormal: false });
  });
  it('UNKNOWN quando não há faixa de referência', () => {
    expect(computeFlag(14, null, null)).toEqual({ flag: 'UNKNOWN', isAbnormal: false });
  });
  it('no limite exato é NORMAL', () => {
    expect(computeFlag(12, 12, 16)).toEqual({ flag: 'NORMAL', isAbnormal: false });
    expect(computeFlag(16, 12, 16)).toEqual({ flag: 'NORMAL', isAbnormal: false });
  });
});

describe('parseNumeric (decimal brasileiro)', () => {
  it('vírgula vira ponto decimal', () => {
    expect(parseNumeric('17,1')).toBe(17.1);
    expect(parseNumeric('12,9 g/dL')).toBe(12.9);
  });
  it('separador de milhar com ponto é ignorado', () => {
    expect(parseNumeric('8.620 /mm³')).toBe(8620);
    expect(parseNumeric('1.234,56')).toBe(1234.56);
  });
  it('número negativo', () => {
    expect(parseNumeric('-3,5')).toBe(-3.5);
  });
  it('null quando vazio, texto puro ou null', () => {
    expect(parseNumeric('')).toBeNull();
    expect(parseNumeric('Ausente')).toBeNull();
    expect(parseNumeric(null)).toBeNull();
    expect(parseNumeric(undefined)).toBeNull();
  });
});

describe('extractJsonObject (resposta da IA)', () => {
  it('JSON puro', () => {
    expect(extractJsonObject('{"a":1,"b":"x"}')).toEqual({ a: 1, b: 'x' });
  });
  it('JSON cercado por texto/markdown', () => {
    expect(extractJsonObject('Resposta:\n```json\n{"ok":true}\n```\nfim')).toEqual({ ok: true });
    expect(extractJsonObject('aqui {"n":42} ok')).toEqual({ n: 42 });
  });
  it('lança erro quando não há JSON', () => {
    expect(() => extractJsonObject('sem objeto aqui')).toThrow();
  });
});

describe('withRateLimitRetry', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('NÃO retenta erro que não é rate-limit (ex.: 500)', async () => {
    const fn = vi.fn().mockRejectedValue(Object.assign(new Error('internal'), { status: 500 }));
    await expect(withRateLimitRetry(fn)).rejects.toThrow('internal');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('REtenta em 429 e converge pro sucesso', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('rate_limit_error'), { status: 429 }))
      .mockResolvedValueOnce('ok');
    const p = withRateLimitRetry(fn);
    await vi.advanceTimersByTimeAsync(10000);
    await expect(p).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
