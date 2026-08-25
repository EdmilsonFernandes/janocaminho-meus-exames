import { createHash, randomBytes } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../prisma';
import { logCredit } from '../utils/credits';
import { getSettings } from '../utils/settings';

export interface ApiKeyRequest extends Request {
  apiUserId?: string;
  apiKeyId?: string;
}

/** Gera uma chave nova (mostrada 1x na criação). Formato: dxk_live_<48hex>. */
export function generateApiKey(): { key: string; hash: string; prefix: string } {
  const secret = randomBytes(24).toString('hex');
  const key = `dxk_live_${secret}`;
  return { key, hash: hashKey(key), prefix: key.slice(0, 12) };
}

export function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

// ── Rate limit por minuto (janela deslizante em memória — instância única do app) ──
const WINDOW_MS = 60_000;
const MAX_PER_MINUTE = 60;
const hits = new Map<string, number[]>();
function allowRate(keyId: string): boolean {
  const now = Date.now();
  const arr = (hits.get(keyId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (arr.length >= MAX_PER_MINUTE) { hits.set(keyId, arr); return false; }
  arr.push(now);
  hits.set(keyId, arr);
  return true;
}
// Limpeza periódica (evita crescer sem bound com chaves antigas).
setInterval(() => {
  const now = Date.now();
  for (const [k, arr] of hits) {
    const live = arr.filter((t) => now - t < WINDOW_MS);
    if (live.length === 0) hits.delete(k); else hits.set(k, live);
  }
}, WINDOW_MS).unref?.();

/** Início do mês corrente (UTC) — a cota mensal reseta no dia 1. */
function monthStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Auth por API key (header `x-api-key`) + rate limit + cota mensal (meter no ledger).
 *  Fase 1: só tier grátis (apiAccess.freeMonthly, default 100/mês, admin edita live).
 *  Tiers pagos entram depois do deep-research de precificação. */
export async function requireApiKey(req: ApiKeyRequest, res: Response, next: NextFunction): Promise<void> {
  const key = req.headers['x-api-key'];
  if (!key || typeof key !== 'string') { res.status(401).json({ error: 'Missing x-api-key header' }); return; }
  try {
    const row = await prisma.apiKey.findUnique({ where: { keyHash: hashKey(key) }, select: { id: true, userId: true, revokedAt: true } });
    if (!row || row.revokedAt) { res.status(401).json({ error: 'Invalid or revoked API key' }); return; }
    if (!allowRate(row.id)) {
      res.status(429).json({ error: 'rate_limited', message: 'Limite de 60 requisições/minuto. Tente em instantes.' });
      return;
    }
    // Cota mensal: conta as chamadas do mês no LEDGER (kind api_call, delta 0 — não gasta crédito).
    const freeMonthly = getSettings().apiAccess?.freeMonthly ?? 100;
    const used = await prisma.creditTransaction.count({
      where: { userId: row.userId, kind: 'api_call', createdAt: { gte: monthStart() } },
    });
    if (used >= freeMonthly) {
      const next = new Date(monthStart().getTime() + 31 * 24 * 3600 * 1000);
      res.status(429).json({ error: 'quota_exceeded', message: `Cota mensal do tier grátis (${freeMonthly} chamadas) atingida. Renova em ${next.toISOString().slice(0, 10)}.`, upgrade: '/api/docs#tiers' });
      return;
    }
    req.apiUserId = row.userId;
    req.apiKeyId = row.id;
    void prisma.apiKey.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
    // Mede DEPOIS de passar (a própria chamada conta 1).
    void logCredit(row.userId, 0, 'api_call', `GET ${req.path}`);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid API key' });
  }
}
