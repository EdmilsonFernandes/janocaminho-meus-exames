import { describe, it, expect } from 'vitest';
import { maskKey } from './ai-config';
import { encryptPII } from '../utils/crypto';

// Segurança: o GET /admin/ai-config devolve maskKey() — a chave (cifrada no banco)
// NUNCA pode voltar completa pra UI. Este teste trava essa invariante.
describe('ai-config maskKey', () => {
  it('mascara como •••• + últimos 4 e NUNCA expõe a chave cheia', () => {
    const plain = 'sk-zhizhuxia-abc123-CHAVESECRETA-9876';
    const { enc, iv } = encryptPII(plain)!;
    const masked = maskKey(enc, iv)!;
    expect(masked).toBe('••••9876');
    expect(masked.includes(plain)).toBe(false); // nada da chave cheia vaza
    expect(masked.length).toBeLessThan(plain.length);
  });

  it('chaves curtas (≤4) viram •••• sem revelar nada', () => {
    const { enc, iv } = encryptPII('abc')!;
    const masked = maskKey(enc, iv)!;
    expect(masked).toBe('••••');
    expect(masked.includes('abc')).toBe(false);
  });

  it('retorna null quando não há chave (provider sem chave salva)', () => {
    expect(maskKey(null, null)).toBeNull();
    expect(maskKey('', '')).toBeNull();
  });
});
