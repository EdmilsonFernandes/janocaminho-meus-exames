// Asaas — gateway COMPLETO (PIX + cartão). 3ª opção de PIX (PAYMENT_PROVIDER=asaas).
// Camada PURA (só fetch global + config) → mockável em teste (stub de globalThis.fetch,
// igual ao MP/OpenPix em test/helpers). Prova ao vivo 03/10:
//   - Auth: header `access_token: $ASAAS_API_KEY` (SEM "Bearer" — direto).
//   - Customer: POST /v3/customers {name, cpfCnpj, ...} → {id: "cus_..."} — 1x por
//     usuário, cache em memória (Map<userId, customerId>).
//   - PIX: POST /v3/payments {customer, billingType: "PIX", value: FLOAT EM REAIS
//     (NÃO centavos!), dueDate: "YYYY-MM-DD"} → {id: "pay_...", status: "PENDING"}.
//   - QR PIX: GET /v3/payments/{id}/pixQrCode → {payload (copia-e-cola), encodedImage
//     (base64)} — demora ~3s p/ ficar pronto → getAsaasQrCode com retry + sleep.
//   - Mínimo PIX: R$ 5,00 — abaixo disso o pix-provider cai pro OpenPix (aceita R$0,01).
//   - API: produção https://api.asaas.com (a chave já é de produção).
import { config, hasAsaas } from '../config';

export const ASAAS_PIX_MIN_CENTS = 500; // Asaas não aceita PIX abaixo de R$ 5,00

export interface AsaasChargeInput {
  /** valor EM CENTAVOS (padrão interno do app; convertido p/ reais float aqui) */
  amountBrlCents: number;
  /** correlação única da cobrança (vai no externalReference do payment Asaas) */
  correlationID: string;
  description: string;
  /** chave do cache de customer (cus_*) — id do usuário do app */
  userId: string;
  userName?: string;
  userEmail?: string;
  payerCpfCnpj?: string;
}

export interface AsaasCharge {
  /** id do payment no Asaas ("pay_...") — gravado em Subscription.mpPaymentId;
   *  o webhook /api/webhooks/asaas casa a aprovação por ele */
  paymentId: string;
  customerId: string;
  status: string;
  amountBrlCents: number;
}

/** Cartão (fluxo inline POST /billing/pay-card). Dados exigidos pela API direta do
 *  Asaas (tokenização de cartão é etapa separada, não usada aqui). */
export interface AsaasCardFields {
  creditCard: { number: string; holderName: string; expiryMonth: string; expiryYear: string; ccv: string };
  creditCardHolder: { name: string; email?: string; cpfCnpj?: string; postalCode?: string; addressNumber?: string; phone?: string };
}

/** Erro do Asaas ESTRUTURADO (400 de cartão inválido/CVV errado vem com lista `errors`).
 *  `message` já é a 1ª descrição legível — a rota devolve pro front sem vazar payload. */
export class AsaasApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly errors: { code: string; description: string }[] = [],
  ) {
    super(message);
    this.name = 'AsaasApiError';
  }
}

export interface AsaasQrCode {
  /** copia-e-cola (payload EMV) */
  payload: string;
  /** data URI da imagem (null = Asaas não devolveu) */
  encodedImage: string | null;
}

// Cache de customers por userId: cria 1x, reusa nas cobranças seguintes (prova ao vivo).
// Cache por userId guardando o CPF com que o customer foi criado: Asaas EXIGE CPF
// no cliente p/ cobrança PIX (400 invalid_object, provado em prod 04/10). Se o
// customer nasceu sem CPF (usuário completou o cadastro depois), o próximo pagamento
// com CPF ATUALIZA o mesmo cus_* em vez de criar outro órfão.
const customerCache = new Map<string, { id: string; cpfCnpj?: string }>();
export function clearAsaasCustomerCache(): void {
  customerCache.clear();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const toDataUri = (b64: string) => (b64.startsWith('data:') ? b64 : `data:image/png;base64,${b64}`);

/** dueDate mínimo aceito: amanhã (Asaas exige data futura p/ criar o payment). */
const tomorrowYmd = () => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

async function asaasFetch<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`${config.asaasApiBaseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      access_token: config.asaasApiKey, // SEM Bearer — header direto (prova ao vivo 03/10)
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  if (!r.ok) {
    const text = (await r.text()).slice(0, 2000);
    // 400 do Asaas traz { errors: [{ code, description }] } — extrai a 1ª descrição
    // legível (ex.: "Cartão de crédito inválido") p/ devolver pro usuário final.
    let first = '';
    let list: { code: string; description: string }[] = [];
    try {
      const j = JSON.parse(text);
      list = Array.isArray(j?.errors) ? j.errors : [];
      first = String(list[0]?.description ?? '');
    } catch { /* corpo não-JSON */ }
    throw new AsaasApiError(first || `Asaas ${path} falhou (${r.status}): ${text.slice(0, 200)}`, r.status, list);
  }
  return (await r.json()) as T;
}

/** Cria (1ª vez) ou reusa o customer Asaas do usuário. Cache em memória por userId;
 *  customer existente sem CPF é ATUALIZADO quando o CPF passa a existir. */
export async function getOrCreateAsaasCustomer(input: AsaasChargeInput): Promise<string> {
  const digits = input.payerCpfCnpj?.replace(/\D/g, '') || undefined;
  const cached = customerCache.get(input.userId);
  if (cached && (!digits || cached.cpfCnpj === digits)) return cached.id;
  // Customer já existe mas nasceu sem CPF → atualiza o MESMO cus_* (não duplica).
  if (cached?.id && digits && !cached.cpfCnpj) {
    await asaasFetch(`/v3/customers/${cached.id}`, { method: 'POST', body: JSON.stringify({ cpfCnpj: digits }) });
    customerCache.set(input.userId, { id: cached.id, cpfCnpj: digits });
    return cached.id;
  }
  const c = await asaasFetch<{ id?: string }>('/v3/customers', {
    method: 'POST',
    body: JSON.stringify({
      name: input.userName?.trim() || 'Cliente Dr. Exame',
      cpfCnpj: digits,
      email: input.userEmail?.trim() || undefined,
      externalReference: input.userId, // casa o cus_* com o usuário do app no dashboard
    }),
  });
  const id = String(c?.id ?? '');
  if (!id.startsWith('cus_')) throw new Error('Asaas customers: resposta sem id (cus_)');
  customerCache.set(input.userId, { id, cpfCnpj: digits });
  return id;
}

/** Cria a cobrança PIX. Retorna imediatamente — o QR é gerado ASSÍNCRONAMENTE pelo
 *  Asaas (~3s); buscá-lo é papel do getAsaasQrCode (o pix-provider encadeia os dois). */
export async function createAsaasPixCharge(input: AsaasChargeInput): Promise<AsaasCharge> {
  if (!hasAsaas()) {
    throw new Error('Asaas selecionado (PAYMENT_PROVIDER=asaas) mas ASAAS_API_KEY está ausente.');
  }
  if (input.amountBrlCents < ASAAS_PIX_MIN_CENTS) {
    throw new Error(`Asaas: PIX mínimo R$ 5,00 (recebeu R$ ${(input.amountBrlCents / 100).toFixed(2)})`);
  }
  const customerId = await getOrCreateAsaasCustomer(input);
  const pay = await asaasFetch<{ id?: string; status?: string }>('/v3/payments', {
    method: 'POST',
    body: JSON.stringify({
      customer: customerId,
      billingType: 'PIX',
      value: input.amountBrlCents / 100, // FLOAT EM REAIS — NÃO centavos (prova ao vivo)
      dueDate: tomorrowYmd(), // +1 dia (mínimo aceito); countdown real do front é o expiresAt interno
      description: String(input.description ?? '').slice(0, 100),
      externalReference: input.correlationID,
    }),
  });
  const paymentId = String(pay?.id ?? '');
  if (!paymentId) throw new Error('Asaas payments: resposta sem id');
  return { paymentId, customerId, status: String(pay?.status ?? 'PENDING'), amountBrlCents: input.amountBrlCents };
}

/** Busca o QR (copia-e-cola + imagem) de um payment PIX. O QR demora ~3s p/ ficar
 *  pronto após a criação → default retries=1 com sleep de 3s (prova ao vivo 03/10). */
export async function getAsaasQrCode(
  paymentId: string,
  opts: { retries?: number; delayMs?: number } = {},
): Promise<AsaasQrCode> {
  const retries = opts.retries ?? 1;
  const delayMs = opts.delayMs ?? 3000;
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(delayMs); // Asaas gera o QR de forma assíncrona
    try {
      const qr = await asaasFetch<{ payload?: string; encodedImage?: string }>(
        `/v3/payments/${encodeURIComponent(paymentId)}/pixQrCode`,
      );
      if (qr?.payload) {
        return { payload: String(qr.payload), encodedImage: qr.encodedImage ? toDataUri(String(qr.encodedImage)) : null };
      }
      lastErr = new Error('Asaas pixQrCode: resposta sem payload');
    } catch (e) {
      lastErr = e as Error;
    }
  }
  throw lastErr ?? new Error('Asaas pixQrCode falhou');
}

/** Cobrança no CARTÃO (inline — form próprio do app, sem redirect). billingType
 *  CREDIT_CARD ou DEBIT_CARD (mesma estrutura de campos, muda só o tipo).
 *  Resposta: status CONFIRMED (aprovado na hora) ou PENDING (3DS/análise — o Asaas
 *  pode devolver URL de autenticação; se vier, é repassada como threeDSUrl). */
export async function createAsaasCardCharge(
  input: AsaasChargeInput & AsaasCardFields & { billingType?: 'CREDIT_CARD' | 'DEBIT_CARD' },
): Promise<AsaasCharge & { threeDSUrl: string | null }> {
  if (!hasAsaas()) {
    throw new Error('Asaas selecionado (PAYMENT_PROVIDER=asaas) mas ASAAS_API_KEY está ausente.');
  }
  const { creditCard, creditCardHolder, billingType = 'CREDIT_CARD', ...base } = input;
  if (!creditCard?.number || !creditCardHolder?.name) {
    throw new Error('Asaas cartão: exige creditCard (número/holder/validade/ccv) e creditCardHolder.name.');
  }
  const customerId = await getOrCreateAsaasCustomer(base);
  const pay = await asaasFetch<{ id?: string; status?: string; threeDSecureUrl?: string; threeDSUrl?: string; authenticationUrl?: string }>('/v3/payments', {
    method: 'POST',
    body: JSON.stringify({
      customer: customerId,
      billingType,
      value: base.amountBrlCents / 100, // reais float
      dueDate: tomorrowYmd(),
      description: String(base.description ?? '').slice(0, 100),
      externalReference: base.correlationID,
      // À VISTA: NÃO enviar installmentCount — a API v3 exige installmentValue sempre que
      // installmentCount vem preenchido (mesmo 1x → erro "valor da parcela deve ser informado").
      // Sem o campo = 1x sem juros (bug do dono 05/10).
      creditCard,
      creditCardHolder,
    }),
  });
  const paymentId = String(pay?.id ?? '');
  if (!paymentId) throw new Error('Asaas payments (cartão): resposta sem id');
  const threeDSUrl = pay.threeDSecureUrl || pay.threeDSUrl || pay.authenticationUrl || null;
  return { paymentId, customerId, status: String(pay?.status ?? 'PENDING'), amountBrlCents: base.amountBrlCents, threeDSUrl: threeDSUrl ? String(threeDSUrl) : null };
}
