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

/** Saldo PRÉ-PAGO de chamadas de API = mesmo ledger de créditos do app.
 *  kinds: api_grant (teste grátis na aprovação) + api_pack (compra PIX/cartão) − api_call (uso).
 *  Sem coluna nova: o extrato É o saldo — mesma fonte de verdade do app. */
export async function apiCallBalance(userId: string): Promise<number> {
  const agg = await prisma.creditTransaction.aggregate({
    where: { userId, kind: { in: ['api_grant', 'api_pack', 'api_call'] } },
    _sum: { delta: true },
  });
  return agg._sum.delta ?? 0;
}

/** Auth por API key (header `x-api-key`) + rate limit + SALDO PRÉ-PAGO.
 *  Sem saldo → 402 com os pacotes disponíveis (quem consume compra mais via PIX/cartão
 *  no mesmo checkout do app — POST /billing/buy-api-pack). */
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
    const balance = await apiCallBalance(row.userId);
    if (balance <= 0) {
      res.status(402).json({
        error: 'payment_required',
        message: 'Saldo de chamadas esgotado. Compre um pacote (PIX, cartão ou débito) no app ou em /billing/buy-api-pack.',
        balance,
        packs: (getSettings().apiAccess?.packs ?? []).map((p: any) => ({ id: p.id, calls: p.calls, price: p.price, label: p.label })),
      });
      return;
    }
    req.apiUserId = row.userId;
    req.apiKeyId = row.id;
    void prisma.apiKey.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
    // Débito AWAIT (não fire-and-forget): o saldo precisa estar consistente ANTES da próxima
    // chamada — duas requisições seguidas não podem passar duas vezes no mesmo saldo.
    await logCredit(row.userId, -1, 'api_call', `GET ${req.path}`);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid API key' });
  }
}

/** Variante com CUSTO PESADO (ex.: extração de laudo = 20 chamadas — LLM real por trás).
 *  Mesma auth/rate-limit/402 do requireApiKey, mas exige saldo >= cost e debita cost.
 *  Em caso de falha da rota (ex.: IA indisponível), ela REEMBOLSA via refundApiCall —
 *  cliente não paga por 5xx. */
export function requireApiKeyCost(cost: number) {
  return async (req: ApiKeyRequest, res: Response, next: NextFunction): Promise<void> => {
    const key = req.headers['x-api-key'];
    if (!key || typeof key !== 'string') { res.status(401).json({ error: 'Missing x-api-key header' }); return; }
    try {
      const row = await prisma.apiKey.findUnique({ where: { keyHash: hashKey(key) }, select: { id: true, userId: true, revokedAt: true } });
      if (!row || row.revokedAt) { res.status(401).json({ error: 'Invalid or revoked API key' }); return; }
      if (!allowRate(row.id)) {
        res.status(429).json({ error: 'rate_limited', message: 'Limite de 60 requisições/minuto. Tente em instantes.' });
        return;
      }
      const balance = await apiCallBalance(row.userId);
      if (balance < cost) {
        res.status(402).json({
          error: 'payment_required',
          message: `Esta chamada custa ${cost} créditos de API e o saldo é ${balance}. Compre um pacote (PIX/cartão) no app ou em /billing/buy-api-pack.`,
          balance, cost,
          packs: (getSettings().apiAccess?.packs ?? []).map((p: any) => ({ id: p.id, calls: p.calls, price: p.price, label: p.label })),
        });
        return;
      }
      req.apiUserId = row.userId;
      req.apiKeyId = row.id;
      void prisma.apiKey.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
      await logCredit(row.userId, -cost, 'api_call', `POST ${req.path} (x${cost})`);
      next();
    } catch {
      res.status(401).json({ error: 'Invalid API key' });
    }
  };
}

/** Reembolso quando a operação pesada FALHOU (o cliente não paga por erro nosso/da IA). */
export async function refundApiCall(userId: string, cost: number, label: string): Promise<void> {
  try { await logCredit(userId, cost, 'api_pack', `reembolso: ${label}`); } catch { /* best-effort */ }
}
