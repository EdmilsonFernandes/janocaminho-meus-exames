// Webhook do UaiID (spec §3). Montado em app.ts ANTES do express.json global, com express.raw:
// o HMAC (X-Uai-Signature) é sobre o corpo CRU. O corpo é só a campainha — o resultado vem do
// GET (syncVerification). Exceção: data.full_name (nome do documento) só existe aqui, assinado.
import type { Request, Response } from 'express';
import { verifyUaiidSignature } from '../utils/uaiid';
import { syncVerification } from '../kyc/sync';
import { createLogger } from '../utils/logger';

const log = createLogger('uaiid-webhook');

export async function uaiidWebhookHandler(req: Request, res: Response): Promise<void> {
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifyUaiidSignature(raw, req.header('x-uai-signature'), process.env.UAIID_WEBHOOK_SECRET || '')) {
    log.warn('assinatura inválida', { bytes: raw.length });
    res.status(401).json({ code: 'BAD_SIGNATURE' });
    return;
  }
  let evt: any;
  try { evt = JSON.parse(raw.toString('utf8')); } catch { res.status(400).json({ code: 'BAD_JSON' }); return; }
  res.status(200).json({ ok: true }); // responde já; o processamento segue (o job cobre falhas)
  const id = String(evt?.verification_id ?? evt?.data?.verification_id ?? '');
  if (!id || !String(evt?.event ?? '').startsWith('verification.')) return;
  const documentName = typeof evt?.data?.full_name === 'string' ? evt.data.full_name : null;
  void syncVerification(id, 'webhook', { documentName })
    .catch((e) => log.warn('sync do webhook falhou (o job reconcilia)', { id, msg: (e as Error)?.message }));
}
