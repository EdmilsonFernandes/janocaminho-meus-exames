// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { scrubKycReturnUrl } from './analytics';

// A volta do UaiID traz o id da verificação e o id INTERNO do médico na URL; o PostHog não pode gravá-los.
describe('scrubKycReturnUrl', () => {
  it('tira status, verification_id e external_reference da URL de volta e mantém kyc=1', () => {
    expect(scrubKycReturnUrl('https://drexame.janocaminho.com.br/#/doctor?kyc=1&status=approved&verification_id=2ffc-1&external_reference=cmoDoc1'))
      .toBe('https://drexame.janocaminho.com.br/#/doctor?kyc=1');
  });

  it('funciona com os parâmetros em qualquer ordem e só um deles', () => {
    expect(scrubKycReturnUrl('https://x/#/doctor?status=rejected&kyc=1')).toBe('https://x/#/doctor?kyc=1');
    expect(scrubKycReturnUrl('https://x/#/doctor?external_reference=abc&verification_id=def&kyc=1')).toBe('https://x/#/doctor?kyc=1');
    expect(scrubKycReturnUrl('https://x/#/doctor?kyc=1&verification_id=def')).toBe('https://x/#/doctor?kyc=1');
  });

  it('preserva parâmetros legítimos que estão no meio dos removidos', () => {
    expect(scrubKycReturnUrl('https://x/#/doctor?kyc=1&status=ok&foo=1')).toBe('https://x/#/doctor?kyc=1&foo=1');
    expect(scrubKycReturnUrl('https://x/#/doctor?foo=1&status=ok&kyc=1&bar=2')).toBe('https://x/#/doctor?foo=1&kyc=1&bar=2');
  });

  it('URL sem kyc=1 (status= legítimo de outra tela) e valores que não são texto ficam intactos', () => {
    expect(scrubKycReturnUrl('https://x/#/exames?status=pending&verification_id=1')).toBe('https://x/#/exames?status=pending&verification_id=1');
    expect(scrubKycReturnUrl(42)).toBe(42);
    expect(scrubKycReturnUrl(undefined)).toBeUndefined();
    expect(scrubKycReturnUrl(null)).toBeNull();
  });

  it('também limpa o referrer (a URL de volta aparece nele na página seguinte)', () => {
    expect(scrubKycReturnUrl('https://x/#/doctor?kyc=1&status=approved&external_reference=abc')).not.toMatch(/external_reference|status=/);
  });
});
