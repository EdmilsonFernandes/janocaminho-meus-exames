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

/** Status do Asaas que representam dinheiro RECEBIDO (mesma lista do webhook
 *  /webhooks/asaas — fonte única p/ conciliação §15.2 e verificação server-side). */
export const ASAAS_RECEIVED_STATUSES = new Set(['RECEIVED', 'RECEIVED_IN_CASH', 'CONFIRMED', 'DETERMINED']);

/** Consulta o status de um payment no Asaas (GET /v3/payments/{id}) — usado pela
 *  CONCILIAÇÃO (§15.2 do spec gaps teleconsulta: revalidar "pago" quando o webhook
 *  não chegou) e reutilizável pela verificação server-side do webhook. Fail-closed:
 *  qualquer falha (rede/API/sem key) → null (NUNCA trata como pago).
 *  Camada pura (só fetch global + config) → mockável em teste via stub de fetch. */
export async function getAsaasPaymentStatus(paymentId: string): Promise<string | null> {
  try {
    const pay = await asaasFetch<{ status?: string }>(`/v3/payments/${encodeURIComponent(paymentId)}`);
    return pay?.status ? String(pay.status).toUpperCase() : null;
  } catch {
    return null; // provider fora do ar / id inválido → não confirmado (fail closed)
  }
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

// ─────────────────────────────────────────────────────────────────────────────────
// ONDA 4 — §18.5/§18.6/§18.7: REPASSE (transferência PIX), ESTORNO (refund) e
// CAIXA (saldo). Docs consultadas 24/10: docs.asaas.com (transferências, estornar
// cobrança, finance/balance). Idempotência oficial = externalReference (NÃO existe
// header de idempotency-key na API) — a reserva atômica no ledger é NOSSA camada.
// ─────────────────────────────────────────────────────────────────────────────────

/** Tipos de chave PIX do app → enum do Asaas (pixAddressKeyType). */
export const ASAAS_PIX_KEY_TYPE_MAP: Record<string, string> = {
  cpf: 'CPF',
  cnpj: 'CNPJ',
  email: 'EMAIL',
  phone: 'PHONE',
  random: 'EVP',
};

export interface AsaasTransferInput {
  pixKey: string; // chave DECRIPTADA (só existe em memória, nunca logada/gravada)
  pixKeyType: string; // 'cpf'|'cnpj'|'email'|'phone'|'random' (map acima)
  valueBrlCents: number; // centavos → convertido p/ reais float aqui
  externalReference: string; // idempotência oficial (ex.: payout_<payoutId>)
  description?: string;
}

export interface AsaasTransferResult {
  transferId: string; // id Asaas ("trf_..."-like) — gravado em Payout.providerTransferId
  status: string; // PENDING|SCHEDULED|BANK_PROCESSING|DONE|FAILED|CANCELLED|BLOCKED
  authorized: boolean; // false = ação crítica aguardando TOKEN SMS (§2.2 da arq.)
  failReason: string | null;
}

/** Transferência PIX p/ conta de outra instituição (repasse do médico).
 *  `authorized:false` na resposta = transferência CRIADA mas aguardando token SMS —
 *  o chamador decide (tratamos como falha supervisionável, nunca retry cego). */
export async function createAsaasPixTransfer(input: AsaasTransferInput): Promise<AsaasTransferResult> {
  if (!hasAsaas()) throw new Error('Asaas transfers: ASAAS_API_KEY ausente.');
  const t = await asaasFetch<Record<string, any>>('/v3/transfers', {
    method: 'POST',
    body: JSON.stringify({
      value: input.valueBrlCents / 100, // reais float (mesma convenção dos payments)
      pixAddressKey: input.pixKey,
      pixAddressKeyType: ASAAS_PIX_KEY_TYPE_MAP[input.pixKeyType] ?? 'EVP',
      operationType: 'PIX',
      description: String(input.description ?? '').slice(0, 100),
      externalReference: input.externalReference, // idempotência oficial do Asaas
    }),
  });
  return {
    transferId: String(t?.id ?? ''),
    status: String(t?.status ?? 'PENDING').toUpperCase(),
    authorized: t?.authorized !== false,
    failReason: t?.failReason ? String(t.failReason) : null,
  };
}

export interface AsaasTransferLookup {
  found: boolean;
  transferId: string | null;
  status: string | null; // DONE|FAILED|CANCELLED|PENDING|BANK_PROCESSING|...
  failReason: string | null;
}

/** CONSULTA transferência por externalReference (conciliação do estado `unknown` —
 *  §18.6: resposta perdida NUNCA reenvia; investiga aqui). Fail-closed: falha de
 *  rede/query → { found:false, status:null } com flag `error` p/ NÃO decidir cedo. */
export async function lookupAsaasTransferByExternalRef(
  externalReference: string,
): Promise<AsaasTransferLookup & { error: boolean }> {
  try {
    const res = await asaasFetch<{ data?: Record<string, any>[]; totalCount?: number }>(
      `/v3/transfers?externalReference=${encodeURIComponent(externalReference)}`,
    );
    const row = Array.isArray(res?.data) ? res.data[0] : undefined;
    if (!row) return { found: false, transferId: null, status: null, failReason: null, error: false };
    return {
      found: true,
      transferId: row.id ? String(row.id) : null,
      status: row.status ? String(row.status).toUpperCase() : null,
      failReason: row.failReason ? String(row.failReason) : null,
      error: false,
    };
  } catch {
    // Query falhou (rede/key) → error=true: chamador NÃO resolve p/ failed (§18.6).
    return { found: false, transferId: null, status: null, failReason: null, error: true };
  }
}

export interface AsaasRefundResult {
  status: string; // REFUNDED (estorno aplicado) | REFUND_REQUESTED | REFUND_IN_PROGRESS
}

/** ESTORNO TOTAL de uma cobrança (corpo vazio = total — §2.1 da arquitetura).
 *  Exige SALDO DISPONÍVEL: sem saldo o Asaas responde 400 ("saldo suficiente") —
 *  AsaasApiError com status 400; o chamador classifica (fila manual). */
export async function refundAsaasPayment(paymentId: string): Promise<AsaasRefundResult> {
  if (!hasAsaas()) throw new Error('Asaas refund: ASAAS_API_KEY ausente.');
  const r = await asaasFetch<{ status?: string }>(
    `/v3/payments/${encodeURIComponent(paymentId)}/refund`,
    { method: 'POST', body: '' },
  );
  return { status: String(r?.status ?? 'REFUNDED').toUpperCase() };
}

export interface AsaasBalance {
  balanceCents: number; // saldo disponível
}

/** CAIXA Asaas (§18.8): GET /v3/finance/balance — saldo disponível da conta.
 *  ≠ lucro: é caixa externo (a caption da UI reforça). Sem campo `balance`
 *  numérico → throw (o chamador cacheia null; a UI mostra "—", nunca R$ 0,00 falso). */
export async function getAsaasFinanceBalance(): Promise<AsaasBalance> {
  if (!hasAsaas()) throw new Error('Asaas balance: ASAAS_API_KEY ausente.');
  const b = await asaasFetch<{ balance?: number }>(`/v3/finance/balance?date=${new Date().toISOString().slice(0, 10)}`);
  const v = Number(b?.balance);
  if (!Number.isFinite(v)) throw new Error('Asaas balance: resposta sem saldo válido');
  return { balanceCents: Math.round(v * 100) };
}

/** Heurística de TOKEN SMS/2FA (§2.2 da arq.): resposta authorized=false OU erro
 *  4xx citando token/autenticação — a conta exige ação crítica por SMS (config do
 *  Asaas, dispensa só via suporte). Chamador NUNCA reenvia: fila específica. */
export function isAsaasTokenSmsIssue(err: unknown, transfer?: AsaasTransferResult | null): boolean {
  if (transfer && transfer.authorized === false) return true;
  if (err instanceof AsaasApiError) {
    if (err.status === 403 || err.status === 401) return false; // key/perm → outro caminho
    const txt = `${err.message} ${err.errors.map((e) => `${e.code} ${e.description}`).join(' ')}`.toLowerCase();
    return /token|autentic|2fa|dois fatores|sms/.test(txt);
  }
  return false;
}

/** Heurística de SALDO INSUFICIENTE p/ estorno (400 "disponibilizar saldo"). */
export function isAsaasBalanceIssue(err: unknown): boolean {
  if (!(err instanceof AsaasApiError)) return false;
  const txt = `${err.message} ${err.errors.map((e) => `${e.code} ${e.description}`).join(' ')}`.toLowerCase();
  return err.status === 400 && /saldo/.test(txt);
}
