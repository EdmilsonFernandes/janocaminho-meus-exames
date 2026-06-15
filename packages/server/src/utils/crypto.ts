import crypto from 'crypto';
import { config } from '../config';

/** Hash SHA-256 do conteúdo do arquivo (chave de idempotência). */
export function sha256Buffer(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

const ALGO = 'aes-256-gcm';

function encryptionKey(): Buffer {
  if (config.appEncryptionKey) return Buffer.from(config.appEncryptionKey, 'hex');
  // fallback de dev: chave estável por processo (não persiste entre reinícios se a env estiver vazia)
  return crypto.createHash('sha256').update('meus-exames-dev-key').digest();
}

/** Criptografa PII (CPF/RG). Devolve {enc, iv} para guardar em colunas separadas. */
export function encryptPII(plain: string): { enc: string; iv: string } | null {
  if (!plain) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { enc: `${enc.toString('hex')}:${tag.toString('hex')}`, iv: iv.toString('hex') };
}

export function decryptPII(enc?: string | null, iv?: string | null): string | null {
  if (!enc || !iv) return null;
  try {
    const [data, tag] = enc.split(':');
    const decipher = crypto.createDecipheriv(ALGO, encryptionKey(), Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(tag, 'hex'));
    const out = Buffer.concat([decipher.update(Buffer.from(data, 'hex')), decipher.final()]);
    return out.toString('utf8');
  } catch {
    return null;
  }
}
