// Provedor de cobrança PIX — Mercado Pago (default), OpenPix ou Asaas (env PAYMENT_PROVIDER).
// Toggle de emergência da suspensão do MP (02/10): PAYMENT_PROVIDER=openpix move o PIX
// pro OpenPix; voltar pro MP = remover a env. Camada PURA (só fetch global + config)
// → mockável em teste (stub de globalThis.fetch, igual ao MP em test/helpers).
//
// Contrato único pro caller (billing.routes): { id, qrCode, qrBase64, expiresAt }.
//   - id = id externo genérico: MP payment id | OpenPix correlationID | Asaas payment id
//     ("pay_...") — gravado em Subscription.mpPaymentId (o campo é o "payment id externo"
//     desde o início; cada webhook casa a aprovação pelo formato do seu id).
//   - qrBase64 pode vir NULL (OpenPix QR imagem é best-effort) → front mostra copia-e-cola.
import crypto from 'crypto';
import { config, hasMercadoPago, hasOpenPix, hasAsaas } from '../config';
import { createAsaasPixCharge, getAsaasQrCode } from './asaas-provider';

export type PixProviderName = 'mp' | 'openpix' | 'asaas';

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
  /** Asaas: id do usuário do app — chave do cache de customer (cus_*) */
  userId?: string;
  /** Asaas: nome COMPLETO do pagador (cria o customer com nome real, não só 1º nome) */
  payerName?: string;
  /** Asaas: CPF/CNPJ do pagador (descriptografado do cadastro). Asaas EXIGE CPF no
   *  customer p/ cobrança PIX (400 invalid_object, provado em prod 04/10) — sem ele
   *  o Asaas é pulado e o fallback (openpix) assume direto. */
  payerCpfCnpj?: string;
}

/** Provider ativo segundo env (default 'mp'). */
export function activePixProvider(): PixProviderName {
  if (config.paymentProvider === 'openpix') return 'openpix';
  if (config.paymentProvider === 'asaas') return 'asaas';
  return 'mp';
}

/** Credenciais do provider de PIX OK? (gate 503 de buy-credits/buy-api-pack —
 *  cartão/débito seguem exigindo MP à parte, como hoje). */
export function pixProviderReady(): boolean {
  const p = activePixProvider();
  return p === 'mp' ? hasMercadoPago() : p === 'openpix' ? hasOpenPix() : hasAsaas();
}

const toDataUri = (b64: string) => (b64.startsWith('data:') ? b64 : `data:image/png;base64,${b64}`);

/** Fallback chain (dono 03/10): provider ESCOLHIDO → openpix → mp (se configurados).
 *  - 'mp' primário: sem fallback (PAYMENT_PROVIDER=mp = MP saudável, comportamento histórico).
 *  - 'asaas' primário: PIX exige ≥ R$5 (abaixo o próprio Asaas recusa e o openpix assume).
 *  - MP de resgate exige external_reference (webhook MP casa aprovação por subId|credits) —
 *    sem ela o fallback creditaria errado. Sem token MP → sem resgate.
 *  Fallback tentado E falho → erro amigável (a rota já devolve 503 com ela); sem fallback
 *  possível → propaga o erro original (mais específico p/ log/diagnóstico). */
const PIX_UNAVAILABLE = 'Pagamento indisponível no momento — tente novamente em alguns minutos.';

export async function createPixCharge(input: CreatePixChargeInput): Promise<PixChargeResult> {
  const primary = activePixProvider();
  if (primary === 'mp') return createMercadoPagoPix(input);

  const run: Record<PixProviderName, (inp: CreatePixChargeInput) => Promise<PixChargeResult>> = {
    mp: createMercadoPagoPix,
    openpix: createOpenPixCharge,
    asaas: createAsaasPix,
  };
  try {
    return await run[primary](input);
  } catch (primaryErr) {
    let triedFallback = false;
    for (const p of ['openpix', 'mp'] as PixProviderName[]) {
      if (p === primary) continue;
      const canFallback =
        p === 'mp'
          ? hasMercadoPago() && !!input.externalReference // webhook MP casa por subId|credits
          : hasOpenPix();
      if (!canFallback) continue;
      triedFallback = true;
      console.error(`[pix] ${primary} falhou, tentando ${p}: ${(primaryErr as Error).message}`);
      try {
        return await run[p](input);
      } catch (e2) {
        console.error(`[pix] ${p} também falhou: ${(e2 as Error).message}`);
      }
    }
    throw triedFallback ? new Error(PIX_UNAVAILABLE) : primaryErr;
  }
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

/** Asaas — customer (1x por userId, cache) + payment PIX + QR assíncrono. O QR do
 *  Asaas demora ~3s p/ ficar pronto após criar o payment → getAsaasQrCode com retry
 *  (sleep 3s) antes de devolver o contrato (o caller persiste QR e mostra na hora). */
async function createAsaasPix(input: CreatePixChargeInput): Promise<PixChargeResult> {
  if (!input.payerCpfCnpj?.replace(/\D/g, '')) {
    // Sem CPF no cadastro o Asaas recusa PIX na certa (400 invalid_object — provado
    // em prod 04/10). Falha ANTES do round-trip: o fallback openpix assume direto.
    throw new Error('Asaas PIX exige CPF/CNPJ do cliente — usuário sem CPF no cadastro.');
  }
  const charge = await createAsaasPixCharge({
    amountBrlCents: input.amountBrlCents,
    correlationID: input.correlationID,
    description: input.description,
    userId: input.userId ?? input.payerEmail ?? input.correlationID,
    userName: input.payerName ?? input.payerFirstName,
    userEmail: input.payerEmail,
    payerCpfCnpj: input.payerCpfCnpj,
  });
  const qr = await getAsaasQrCode(charge.paymentId);
  return { id: charge.paymentId, qrCode: qr.payload, qrBase64: qr.encodedImage, expiresAt: input.expiresAt };
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
  // 02/10: o endpoint /api/image/qrcode/base64 devolve 'not found' pra cobrança
  // DYNAMIC — a imagem certa vem NO CORPO da charge (qrCodeImage, PNG público,
  // provado 200/10KB sem auth). Baixa e vira data-uri (contrato do front).
  let qrBase64: string | null = null;
  try {
    const imgUrl: string | undefined = charge.paymentMethods?.pix?.qrCodeImage ?? charge.qrCodeImage;
    if (imgUrl) {
      const img = await fetch(imgUrl);
      if (img.ok) {
        const buf = Buffer.from(await img.arrayBuffer());
        qrBase64 = `data:image/png;base64,${buf.toString('base64')}`;
      }
    }
  } catch { /* best-effort: front mostra o copia-e-cola */ }
  return {
    id: String(charge.correlationID ?? input.correlationID), // paymentId = correlationID
    qrCode: charge.brCode,
    qrBase64,
    expiresAt: input.expiresAt,
  };
}
