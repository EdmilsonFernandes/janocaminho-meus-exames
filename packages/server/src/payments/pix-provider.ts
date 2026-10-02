// Provedor de cobrança PIX — Mercado Pago (default) ou OpenPix (env PAYMENT_PROVIDER).
// Toggle de emergência da suspensão do MP (02/10): PAYMENT_PROVIDER=openpix move o PIX
// pro OpenPix; voltar pro MP = remover a env. Camada PURA (só fetch global + config)
// → mockável em teste (stub de globalThis.fetch, igual ao MP em test/helpers).
//
// Contrato único pro caller (billing.routes): { id, qrCode, qrBase64, expiresAt }.
//   - id = id externo genérico: MP payment id | OpenPix correlationID (gravado em
//     Subscription.mpPaymentId — o campo é o "payment id externo" desde o início).
//   - qrBase64 pode vir NULL (OpenPix QR imagem é best-effort) → front mostra copia-e-cola.
import crypto from 'crypto';
import { config, hasOpenPix } from '../config';

export type PixProviderName = 'mp' | 'openpix';

export interface PixChargeResult {
  id: string;
  /** copia-e-cola (payload EMV) */
  qrCode: string;
  /** data URI da imagem do QR (null = sem imagem; front exibe só o copia-e-cola) */
  qrBase64: string | null;
  expiresAt: Date;
}

export interface CreatePixChargeInput {
  /** valor EM CENTAVOS (OpenPix exige centavos; MP converte p/ BRL com arredondamento) */
  amountBrlCents: number;
  /** correlação única da cobrança (OpenPix correlationID; também vira o id retornado lá) */
  correlationID: string;
  /** external_reference do MP (formato subId|credits[|API] — webhook MP depende dele) */
  externalReference?: string;
  description: string;
  payerEmail?: string;
  payerFirstName?: string;
  expiresAt: Date;
  /** notification_url pública (MP; undefined em dev/localhost — MP rejeita URL não-HTTPS) */
  notificationUrl?: string;
}

/** Provider ativo segundo env (default 'mp'). */
export function activePixProvider(): PixProviderName {
  return config.paymentProvider === 'openpix' ? 'openpix' : 'mp';
}

const toDataUri = (b64: string) => (b64.startsWith('data:') ? b64 : `data:image/png;base64,${b64}`);

export async function createPixCharge(input: CreatePixChargeInput): Promise<PixChargeResult> {
  return activePixProvider() === 'openpix' ? createOpenPixCharge(input) : createMercadoPagoPix(input);
}

/** Mercado Pago — réplica do fetch que vivia em billing.routes (POST /v1/payments pix). */
async function createMercadoPagoPix(input: CreatePixChargeInput): Promise<PixChargeResult> {
  const r = await fetch(`${config.mpApiBaseUrl}/v1/payments`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.mpAccessToken}`,
      'Content-Type': 'application/json',
      'X-Idempotency-Key': crypto.randomUUID(),
    },
    body: JSON.stringify({
      transaction_amount: Math.round(input.amountBrlCents) / 100,
      description: input.description,
      payment_method_id: 'pix',
      payer: { email: input.payerEmail ?? '', first_name: input.payerFirstName ?? 'Cliente' },
      external_reference: input.externalReference ?? input.correlationID,
      date_of_expiration: input.expiresAt.toISOString(),
      notification_url: input.notificationUrl,
      statement_descriptor: 'DR EXAME',
    }),
  });
  if (!r.ok) {
    throw new Error(`MP PIX falhou (${r.status}): ${(await r.text()).slice(0, 500)}`);
  }
  const pay: any = await r.json();
  const td = pay?.point_of_interaction?.transaction_data;
  if (!td?.qr_code) throw new Error('MP PIX: resposta sem qr_code (transaction_data)');
  const rawB64 = td.qr_code_base64 ?? '';
  return {
    id: String(pay.id),
    qrCode: td.qr_code,
    qrBase64: rawB64 ? toDataUri(rawB64) : null,
    expiresAt: input.expiresAt,
  };
}

/** OpenPix — POST /api/v1/charge (value EM CENTAVOS) + QR imagem best-effort. */
async function createOpenPixCharge(input: CreatePixChargeInput): Promise<PixChargeResult> {
  if (!hasOpenPix()) {
    throw new Error('OpenPix selecionado (PAYMENT_PROVIDER=openpix) mas OPENPIX_APP_ID está ausente.');
  }
  const expiresInSec = Math.max(60, Math.round((input.expiresAt.getTime() - Date.now()) / 1000));
  const r = await fetch(`${config.openPixApiBaseUrl}/api/v1/charge`, {
    method: 'POST',
    headers: { Authorization: config.openPixAppId, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      correlationID: input.correlationID,
      value: input.amountBrlCents,
      expiresIn: expiresInSec, // alinha a validade do QR com o countdown do front
      // OpenPix rejeita NÃO-ASCII no comment (até o travessão — vira 'Emoji não é
      // permitido', provado ao vivo 02/10). Régua: só ASCII imprimível, sem acento.
      comment: String(input.description ?? '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '') // diacríticos (após NFD, o acento separa do caractere)
        .replace(/[^\x20-\x7E]/g, '') // só ASCII imprimível
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 100) || undefined,
    }),
  });
  if (!r.ok) {
    throw new Error(`OpenPix charge falhou (${r.status}): ${(await r.text()).slice(0, 500)}`);
  }
  const data: any = await r.json();
  const charge = data?.charge;
  if (!charge?.brCode) throw new Error('OpenPix: resposta sem charge.brCode');
  // QR em imagem: BEST-EFFORT — falha não derruba a compra (o copia-e-cola basta).
  let qrBase64: string | null = null;
  try {
    const img = await fetch(
      `${config.openPixApiBaseUrl}/api/image/qrcode/base64/${encodeURIComponent(input.correlationID)}`,
      { headers: { Authorization: config.openPixAppId } },
    );
    if (img.ok) {
      const imgData: any = await img.json();
      const b64 = imgData?.imageBase64 ?? '';
      qrBase64 = b64 ? toDataUri(b64) : null;
    }
  } catch { /* best-effort: front mostra o copia-e-cola */ }
  return {
    id: String(charge.correlationID ?? input.correlationID), // paymentId = correlationID
    qrCode: charge.brCode,
    qrBase64,
    expiresAt: input.expiresAt,
  };
}
