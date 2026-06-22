import crypto from 'crypto';
import { config } from '../config';

/* Cifra o secret TOTP com AES-256-GCM (chave derivada do JWT secret do server).
 * Espelha o padrão EdEspeto: encrypted + iv + authTag em colunas separadas. */

function key(): Buffer {
  return crypto.createHash('sha256').update(config.jwtSecret).digest();
}

export function encryptSecret(secret: string): { encrypted: string; iv: string; authTag: string } {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return { encrypted: enc.toString('base64'), iv: iv.toString('base64'), authTag: cipher.getAuthTag().toString('base64') };
}

export function decryptSecret(enc: string, ivB64: string, authTagB64: string): string {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(enc, 'base64')), decipher.final()]).toString('utf8');
}
