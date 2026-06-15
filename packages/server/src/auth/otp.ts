import crypto from 'crypto';

// Armazenamento em memória dos códigos (curta duração). Single-server OK para OTP.
const store = new Map<string, { code: string; expires: number; tries: number }>();

/** Gera um código de 6 dígitos, guarda e devolve (10 min de validade). */
export function issueOtp(email: string): string {
  const code = String(crypto.randomInt(100000, 1000000));
  store.set(email, { code, expires: Date.now() + 10 * 60_000, tries: 0 });
  return code;
}

/** Valida o código; remove após sucesso ou 5 tentativas. */
export function verifyOtp(email: string, code: string): boolean {
  const entry = store.get(email);
  if (!entry) return false;
  if (Date.now() > entry.expires) { store.delete(email); return false; }
  entry.tries += 1;
  if (entry.code === code.trim()) { store.delete(email); return true; }
  if (entry.tries >= 5) store.delete(email);
  return false;
}
