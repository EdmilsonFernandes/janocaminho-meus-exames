import { describe, it, expect } from 'vitest';
import { generateTotpSecret, generateTotpCode, verifyTotpCode, buildOtpAuthUri } from '../src/utils/totp';

describe('TOTP (RFC 6238)', () => {
  it('gera secret + código válido de 6 dígitos aceito', () => {
    const secret = generateTotpSecret();
    const code = generateTotpCode(secret);
    expect(code).toHaveLength(6);
    expect(verifyTotpCode(secret, code)).toBe(true);
  });
  it('código de 5 min atrás rejeitado (fora da window ±1)', () => {
    const secret = generateTotpSecret();
    const old = generateTotpCode(secret, { timeMs: Date.now() - 5 * 60_000 });
    expect(verifyTotpCode(secret, old)).toBe(false);
  });
  it('drift +30s aceito (dentro da window ±1)', () => {
    const secret = generateTotpSecret();
    const future = generateTotpCode(secret, { timeMs: Date.now() + 30_000 });
    expect(verifyTotpCode(secret, future)).toBe(true);
  });
  it('buildOtpAuthUri tem formato otpauth:// correto', () => {
    const uri = buildOtpAuthUri({ accountName: 'a@b.com', secret: 'JBSWY3DPEHPK3PXP' });
    expect(uri).toMatch(/^otpauth:\/\/totp\//);
    expect(uri).toContain('secret=JBSWY3DPEHPK3PXP');
    expect(uri).toContain('Meus+Exames');
  });
});
