import { describe, expect, it } from 'vitest';
import { cpfFingerprint, formatCpf, isValidCpf, maskCpf, normalizeCpf } from './cpf';

describe('cpf utils', () => {
  it('normaliza, formata e mascara CPF valido', () => {
    expect(normalizeCpf('529.982.247-25')).toBe('52998224725');
    expect(formatCpf('52998224725')).toBe('529.982.247-25');
    expect(maskCpf('529.982.247-25')).toBe('***.***.***-25');
    expect(isValidCpf('529.982.247-25')).toBe(true);
  });

  it('rejeita CPF com digitos invalidos ou repetidos', () => {
    expect(isValidCpf('000.000.000-00')).toBe(false);
    expect(isValidCpf('111.111.111-11')).toBe(false);
    expect(isValidCpf('529.982.247-24')).toBe(false);
  });

  it('gera fingerprint estavel sem expor o CPF', () => {
    const a = cpfFingerprint('529.982.247-25');
    const b = cpfFingerprint('52998224725');
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    expect(a).not.toContain('52998224725');
  });
});
