import crypto from 'crypto';

/* TOTP (RFC 6238) + HOTP (RFC 4226) — implementação própria, sem libs externas.
 * Espelha o padrão do projeto EdEspeto (SHA1, 6 dígitos, 30s, window ±1). */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; // Base32 (RFC 4648)

export function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = '';
  for (const b of buf) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(s: string): Buffer {
  const cleaned = s.replace(/=+$/, '').toUpperCase();
  let bits = 0, value = 0, bytes: number[] = [];
  for (const c of cleaned) {
    const idx = ALPHABET.indexOf(c);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(bytes);
}

export function generateTotpSecret(bytes = 20): string {
  return base32Encode(crypto.randomBytes(bytes));
}

function generateHotp(secret: string, counter: number, digits = 6): string {
  const key = base32Decode(secret);
  const buf = Buffer.alloc(8);
  let tmp = counter;
  for (let i = 7; i >= 0; i--) { buf[i] = tmp & 0xff; tmp = Math.floor(tmp / 256); }
  const hmac = crypto.createHmac('sha1', key);
  hmac.update(buf);
  const digest = hmac.digest();
  const offset = digest[digest.length - 1] & 0xf;
  const code = ((digest[offset] & 0x7f) << 24 | (digest[offset + 1] & 0xff) << 16 | (digest[offset + 2] & 0xff) << 8 | (digest[offset + 3] & 0xff)) % Math.pow(10, digits);
  return String(code).padStart(digits, '0');
}

export function generateTotpCode(secret: string, opts?: { timeMs?: number; period?: number; digits?: number }): string {
  const period = opts?.period ?? 30;
  const counter = Math.floor((opts?.timeMs ?? Date.now()) / 1000 / period);
  return generateHotp(secret, counter, opts?.digits ?? 6);
}

export function verifyTotpCode(secret: string, token: string, opts?: { timeMs?: number; period?: number; digits?: number; window?: number }): boolean {
  const clean = String(token || '').replace(/\D/g, '');
  const digits = opts?.digits ?? 6;
  if (clean.length !== digits) return false;
  const period = opts?.period ?? 30;
  const timeMs = opts?.timeMs ?? Date.now();
  const window = opts?.window ?? 1; // ±1 step (±30s)
  const baseCounter = Math.floor(timeMs / 1000 / period);
  for (let drift = -window; drift <= window; drift++) {
    const expected = generateHotp(secret, baseCounter + drift, digits);
    if (crypto.timingSafeEqual(Buffer.from(clean), Buffer.from(expected))) return true;
  }
  return false;
}

export function buildOtpAuthUri(params: { issuer?: string; accountName: string; secret: string; algorithm?: string; digits?: number; period?: number }): string {
  const issuer = params.issuer || 'Meus Exames';
  const label = encodeURIComponent(`${issuer}:${params.accountName}`);
  const query = new URLSearchParams({
    secret: params.secret, issuer,
    algorithm: params.algorithm || 'SHA1',
    digits: String(params.digits ?? 6),
    period: String(params.period ?? 30),
  });
  return `otpauth://totp/${label}?${query.toString()}`;
}
