import crypto from 'crypto';
import { config } from '../config';

/**
 * Token de unsubscribe de nudges por e-mail (HMAC-SHA256 com o jwtSecret).
 * Não é JWT — é propositalmente curto e stateless: `base64url(userId).base64url(sig)`.
 * Assim o link "parar de receber" funciona num clique (GET), sem login, e é
 * imutável: só quem tem o jwtSecret consegue forjar.
 */
const DOMAIN = 'nudge-unsub:v1';

function sig(userId: string): string {
  return crypto.createHmac('sha256', config.jwtSecret).update(`${DOMAIN}:${userId}`).digest('base64url');
}

export function makeUnsubToken(userId: string): string {
  return `${Buffer.from(userId, 'utf8').toString('base64url')}.${sig(userId)}`;
}

export function verifyUnsubToken(token: string): string | null {
  const idx = token.indexOf('.');
  if (idx <= 0) return null;
  const b64 = token.slice(0, idx);
  const got = token.slice(idx + 1);
  let userId: string;
  try { userId = Buffer.from(b64, 'base64url').toString('utf8'); } catch { return null; }
  if (!userId) return null;
  const expected = sig(userId);
  // comparação de tempo constante (anti-timing) — só após validar o tamanho
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return userId;
}
