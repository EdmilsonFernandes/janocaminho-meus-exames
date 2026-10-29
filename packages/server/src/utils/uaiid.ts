/**
 * Cliente do UaiID (KYC do médico) — padrão defensivo do utils/cfm.ts: env lida NA CHAMADA,
 * timeout, CPF nunca em log. Contrato conferido no código do UaiID (spec §Base real):
 *   POST /v1/verifications → {verification_id, verify_url, expires_at, reused_session}
 *   GET  /v1/verifications/{id} → {id, status, reason_code, external_reference, result, completed_at}
 *   Webhook: X-Uai-Signature "t=<unix>,v1=<hex>" = HMAC-SHA256(`${t}.${corpo cru}`).
 * API em https://api.uaiid.com.br (a doc pública diz uaiid.com.br/v1 — dá 404).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export type UaiidErrorCode = 'KYC_UNAVAILABLE' | 'KYC_ATTEMPT_LIMIT';
export class UaiidError extends Error {
  /**
   * `status` = HTTP status devolvido pelo UaiID quando a falha veio de uma resposta; undefined em
   * rede/timeout/sem chave. Nunca guardar chave, CPF nem corpo da resposta aqui.
   */
  constructor(
    public readonly code: UaiidErrorCode,
    public readonly retryAfterHours?: number,
    public readonly status?: number,
  ) {
    super(code);
    this.name = 'UaiidError';
  }
}

const baseUrl = () => (process.env.UAIID_BASE_URL || 'https://api.uaiid.com.br').replace(/\/+$/, '');
/** Inteiro em [1000, 60000] ms; qualquer outro valor (NaN, negativo, 0, decimal, Infinity) → 8000. Assim AbortSignal.timeout nunca lança RangeError. */
const timeoutMs = () => {
  const n = Number(process.env.UAIID_TIMEOUT_MS);
  return Number.isInteger(n) && n >= 1000 && n <= 60000 ? n : 8000;
};
const apiKey = () => process.env.UAIID_API_KEY || '';
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
/** Data ISO da API → Date; ausente ou inválida → null (nunca Invalid Date). */
const toDate = (v: unknown): Date | null => {
  if (typeof v !== 'string' || !v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

export interface UaiidCreateInput { cpf: string; fullName: string; externalReference: string; returnUrl: string; idempotencyKey: string }
export interface UaiidCreated { verificationId: string; verifyUrl: string; expiresAt: Date | null; reused: boolean }

/** Cria a verificação (o UaiID reaproveita sessão aberta do mesmo CPF). Lança UaiidError. */
export async function createUaiidVerification(input: UaiidCreateInput): Promise<UaiidCreated> {
  if (!apiKey()) throw new UaiidError('KYC_UNAVAILABLE');
  const res = await fetch(`${baseUrl()}/v1/verifications`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey()}`, 'Content-Type': 'application/json', 'Idempotency-Key': input.idempotencyKey },
    body: JSON.stringify({
      cpf: input.cpf.replace(/\D/g, ''),
      full_name: input.fullName,
      external_reference: input.externalReference,
      return_url: input.returnUrl,
      mode: 'full',
      flow: 'own',
    }),
    signal: AbortSignal.timeout(timeoutMs()),
  }).catch(() => null);
  if (!res) throw new UaiidError('KYC_UNAVAILABLE');
  const data: any = await res.json().catch(() => ({}));
  if (res.status === 429) throw new UaiidError('KYC_ATTEMPT_LIMIT', num(data?.retry_after_hours) ?? undefined, res.status);
  // verify_url é para onde o front redireciona o médico: só https (nada de http:, javascript:, //host).
  const verifyUrl = typeof data?.verify_url === 'string' ? data.verify_url : '';
  if (!res.ok || !data?.verification_id || !verifyUrl.startsWith('https://')) throw new UaiidError('KYC_UNAVAILABLE', undefined, res.status);
  return {
    verificationId: String(data.verification_id),
    verifyUrl,
    expiresAt: toDate(data.expires_at),
    reused: !!data.reused_session,
  };
}

export interface UaiidVerification {
  id: string;
  status: string;
  reasonCode: string | null;
  score: number | null;
  nameRatio: number | null;
  cpfSituacao: string | null;
  externalReference: string | null;
  completedAt: Date | null;
}

/** Fonte da verdade da decisão. Qualquer falha → null (o chamador tenta de novo depois). */
export async function getUaiidVerification(id: string): Promise<UaiidVerification | null> {
  if (!apiKey()) return null;
  const res = await fetch(`${baseUrl()}/v1/verifications/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${apiKey()}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs()),
  }).catch(() => null);
  if (!res?.ok) return null;
  const d: any = await res.json().catch(() => null);
  if (!d?.status) return null;
  const r = d.result ?? {};
  return {
    id: String(d.id ?? id),
    status: String(d.status),
    reasonCode: d.reason_code ?? null,
    score: num(r.score),
    nameRatio: num(r.declared_vs_document?.name_ratio),
    cpfSituacao: typeof r.receita_federal?.situacao_cadastral === 'string' ? r.receita_federal.situacao_cadastral : null,
    externalReference: d.external_reference ?? null,
    completedAt: toDate(d.completed_at),
  };
}

/** Confere o X-Uai-Signature sobre o corpo CRU (security.py:104 do UaiID). Falha fechada: nunca lança. */
export function verifyUaiidSignature(
  rawBody: Buffer | string,
  header: string | undefined,
  secret: string,
  nowSec = Math.floor(Date.now() / 1000),
  toleranceSec = 300,
): boolean {
  if (typeof header !== 'string' || typeof secret !== 'string' || !header || !secret) return false;
  // corpo já parseado (express.json por engano), undefined etc. → não dá para conferir o corpo cru
  if (!Buffer.isBuffer(rawBody) && typeof rawBody !== 'string') return false;
  const parts = new Map<string, string>();
  for (const part of header.split(',')) {
    const i = part.indexOf('=');
    if (i < 0) continue; // sem "=" não é par chave=valor
    parts.set(part.slice(0, i).trim(), part.slice(i + 1).trim());
  }
  const t = Number(parts.get('t'));
  const v1 = parts.get('v1') ?? '';
  if (!Number.isInteger(t) || !/^[0-9a-f]{64}$/i.test(v1)) return false;
  // escrito assim (e não `> tolerância → false`) para que NaN em nowSec/toleranceSec também reprove
  if (!(Math.abs(nowSec - t) <= toleranceSec)) return false;
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8');
  const expected = createHmac('sha256', secret).update(`${t}.`).update(body).digest();
  const given = Buffer.from(v1, 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}
