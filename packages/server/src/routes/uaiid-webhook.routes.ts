// Webhook do UaiID (spec §3). Montado em app.ts ANTES do express.json global, com express.raw:
// o HMAC (X-Uai-Signature) é sobre o corpo CRU. O corpo é só a campainha — o resultado vem do
// GET (syncVerification). Exceção: data.full_name (nome do documento) só existe aqui, assinado.
import type { Request, Response } from 'express';
import { prisma } from '../prisma';
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
  const id = String(evt?.verification_id ?? evt?.data?.verification_id ?? '');
  const isKycEvent = !!id && String(evt?.event ?? '').startsWith('verification.');
  const documentName = typeof evt?.data?.full_name === 'string' ? evt.data.full_name.trim().slice(0, 200) || null : null;
  // Revisão final I3: o nome do documento só existe AQUI (assinado; o GET não o traz). Respondíamos 200 e só depois
  // o syncVerification o recebia em memória — qualquer falha (GET do UaiID, timeout, banco) o perdia para sempre,
  // porque o UaiID já tinha o 200 e não reentrega. Agora é gravado ANTES do 200; se não der, 5xx: o UaiID reentrega
  // (30 s / 2 min / 10 min / 30 min, até 5x) e o nome não se perde. O último valor assinado vence.
  if (isKycEvent && documentName) {
    try {
      await prisma.doctorVerification.updateMany({ where: { providerId: id }, data: { documentName } });
    } catch (e) {
      log.error('não consegui gravar o nome do documento do webhook (o UaiID reentrega)', { id, msg: (e as Error)?.message });
      res.status(500).json({ code: 'PERSIST_FAILED' });
      return;
    }
  }
  res.status(200).json({ ok: true }); // responde já; o processamento segue (o job cobre falhas)
  if (!isKycEvent) return;
  void syncVerification(id, 'webhook', { documentName })
    .catch((e) => log.warn('sync do webhook falhou (o job reconcilia)', { id, msg: (e as Error)?.message }));
}
