import { describe, expect, it } from 'vitest';
import { normalizeWhatsappPhone } from './whatsapp';

describe('normalizeWhatsappPhone (canal exame-pronto)', () => {
  it('celular BR sem DDI ganha 55 + dígitos', () => {
    expect(normalizeWhatsappPhone('(11) 98765-4321')).toBe('5511987654321');
    expect(normalizeWhatsappPhone('11987654321')).toBe('5511987654321');
  });
  it('número já com DDI 55 é preservado (só dígitos)', () => {
    expect(normalizeWhatsappPhone('+55 11 98765-4321')).toBe('5511987654321');
  });
  it('internacional fora do 55 passa direto', () => {
    expect(normalizeWhatsappPhone('+1 555 010 2030')).toBe('15550102030');
  });
  it('vazio/lixo → null (sender vira no-op)', () => {
    expect(normalizeWhatsappPhone('')).toBeNull();
    expect(normalizeWhatsappPhone('---')).toBeNull();
  });
});
