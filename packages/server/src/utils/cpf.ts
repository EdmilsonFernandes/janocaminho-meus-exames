import nodeCrypto from 'crypto';
import { config } from '../config';
import { decryptPII, encryptPII } from './crypto';

export function normalizeCpf(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '');
}

export function isValidCpf(value: unknown): boolean {
  const cpf = normalizeCpf(value);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  const calc = (baseLength: number) => {
    let sum = 0;
    for (let i = 0; i < baseLength; i++) sum += Number(cpf[i]) * (baseLength + 1 - i);
    const mod = (sum * 10) % 11;
    return mod === 10 ? 0 : mod;
  };

  return calc(9) === Number(cpf[9]) && calc(10) === Number(cpf[10]);
}

export function parseCpf(value: unknown): string | null {
  const cpf = normalizeCpf(value);
  return isValidCpf(cpf) ? cpf : null;
}

export function formatCpf(value: unknown): string {
  const cpf = normalizeCpf(value).slice(0, 11);
  const p1 = cpf.slice(0, 3);
  const p2 = cpf.slice(3, 6);
  const p3 = cpf.slice(6, 9);
  const p4 = cpf.slice(9, 11);
  if (cpf.length <= 3) return p1;
  if (cpf.length <= 6) return `${p1}.${p2}`;
  if (cpf.length <= 9) return `${p1}.${p2}.${p3}`;
  return `${p1}.${p2}.${p3}-${p4}`;
}

export function maskCpf(value: unknown): string | null {
  const cpf = normalizeCpf(value);
  if (cpf.length !== 11) return null;
  return `***.***.***-${cpf.slice(-2)}`;
}

export function maskCpfLast4(last4?: string | null): string | null {
  const digits = normalizeCpf(last4);
  if (digits.length < 2) return null;
  return `***.***.***-${digits.slice(-2)}`;
}

function cpfHashSecret(): string {
  return (
    process.env.CPF_HASH_SECRET ||
    process.env.PII_HASH_SECRET ||
    config.appEncryptionKey ||
    config.jwtSecret ||
    'meus-exames-dev-cpf-hash'
  );
}

export function cpfFingerprint(value: unknown): string | null {
  const cpf = parseCpf(value);
  if (!cpf) return null;
  return nodeCrypto.createHmac('sha256', cpfHashSecret()).update(cpf).digest('hex');
}

export function cpfLast4(value: unknown): string | null {
  const cpf = parseCpf(value);
  return cpf ? cpf.slice(-4) : null;
}

export function encryptedCpfData(value: unknown): {
  cpfEncrypted: string;
  cpfIv: string;
  cpfHash: string;
  cpfLast4: string;
} | null {
  const cpf = parseCpf(value);
  if (!cpf) return null;
  const enc = encryptPII(cpf);
  const hash = cpfFingerprint(cpf);
  if (!enc || !hash) return null;
  return { cpfEncrypted: enc.enc, cpfIv: enc.iv, cpfHash: hash, cpfLast4: cpf.slice(-4) };
}

export function maskStoredCpf(row: { cpfLast4?: string | null; cpfEncrypted?: string | null; cpfIv?: string | null }): string | null {
  return maskCpfLast4(row.cpfLast4) || maskCpf(decryptPII(row.cpfEncrypted, row.cpfIv));
}

export function revealStoredCpf(row: { cpfEncrypted?: string | null; cpfIv?: string | null }): string | null {
  const cpf = decryptPII(row.cpfEncrypted, row.cpfIv);
  return cpf && isValidCpf(cpf) ? formatCpf(cpf) : null;
}
