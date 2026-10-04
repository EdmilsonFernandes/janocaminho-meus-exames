// Unit test do Asaas (pix + cadeia do pix-provider) — puro, só fetch global mockado,
// zero DB. Prova ao vivo 03/10 codificada aqui: auth `access_token` SEM Bearer, value
// FLOAT EM REAIS, QR assíncrono com retry, mínimo R$5 com fallback pro OpenPix.
import { describe, it, expect, afterEach, vi, type Mock } from 'vitest';

const fetchMock = () => globalThis.fetch as unknown as Mock;

const resp = (body: unknown, ok = true, status = 200) => ({
  ok, status, json: async () => body, text: async () => JSON.stringify(body),
});

/** Reimporta config+provider com o env desejado (undefined = remove a var). */
const loadProvider = async (env: Record<string, string | undefined>) => {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  const pix = await import('../src/payments/pix-provider');
  const asaas = await import('../src/payments/asaas-provider');
  return { ...pix, ...asaas };
};

afterEach(() => {
  delete process.env.PAYMENT_PROVIDER;
  delete process.env.ASAAS_API_KEY;
  delete process.env.OPENPIX_APP_ID;
  process.env.MP_ACCESS_TOKEN = 'test-token'; // setup.ts seta — restaura se algum teste limpou
});

describe('asaas-provider: customer + PIX', () => {
  it('customer criado com auth access_token (SEM Bearer); payment PIX com value FLOAT em REAIS + dueDate YYYY-MM-DD', async () => {
    const { createAsaasPixCharge, clearAsaasCustomerCache } = await loadProvider({ ASAAS_API_KEY: 'asaas-key-test' });
    clearAsaasCustomerCache();
    fetchMock().mockReset();
    fetchMock()
      .mockResolvedValueOnce(resp({ id: 'cus_abc' })) // POST /v3/customers
      .mockResolvedValueOnce(resp({ id: 'pay_123', status: 'PENDING' })); // POST /v3/payments
    const charge = await createAsaasPixCharge({
      amountBrlCents: 500, correlationID: 'credits_s1_140', description: 'Dr. Exame — 140 créditos',
      userId: 'user-1', userName: 'Ana Souza', userEmail: 'ana@x.com',
    });
    expect(charge).toMatchObject({ paymentId: 'pay_123', customerId: 'cus_abc', status: 'PENDING' });
    // customer: header access_token DIRETO, sem Authorization Bearer
    const [curl, cinit] = fetchMock().mock.calls[0];
    expect(String(curl)).toBe('https://api.asaas.com/v3/customers');
    expect(cinit.method).toBe('POST');
    expect(cinit.headers.access_token).toBe('asaas-key-test');
    expect(cinit.headers.Authorization).toBeUndefined();
    const cbody = JSON.parse(cinit.body);
    expect(cbody.name).toBe('Ana Souza');
    expect(cbody.externalReference).toBe('user-1');
    // payment: value em REAIS (500 centavos → 5), billingType PIX, dueDate amanhã
    const [purl, pinit] = fetchMock().mock.calls[1];
    expect(String(purl)).toBe('https://api.asaas.com/v3/payments');
    const pbody = JSON.parse(pinit.body);
    expect(pbody.customer).toBe('cus_abc');
    expect(pbody.billingType).toBe('PIX');
    expect(pbody.value).toBe(5); // FLOAT EM REAIS — não centavos!
    expect(pbody.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(pbody.externalReference).toBe('credits_s1_140');
  });

  it('customer REUSADO: 2ª cobrança do mesmo userId NÃO cria outro customer (cache)', async () => {
    const { createAsaasPixCharge, clearAsaasCustomerCache } = await loadProvider({ ASAAS_API_KEY: 'asaas-key-test' });
    clearAsaasCustomerCache();
    fetchMock().mockReset();
    fetchMock()
      .mockResolvedValueOnce(resp({ id: 'cus_abc' }))
      .mockResolvedValueOnce(resp({ id: 'pay_1', status: 'PENDING' }))
      .mockResolvedValueOnce(resp({ id: 'pay_2', status: 'PENDING' })); // 2ª cobrança: direto no payment
    await createAsaasPixCharge({ amountBrlCents: 990, correlationID: 'credits_s1_140', description: 'd', userId: 'user-1' });
    const c2 = await createAsaasPixCharge({ amountBrlCents: 2500, correlationID: 'credits_s2_140', description: 'd', userId: 'user-1' });
    expect(c2.paymentId).toBe('pay_2');
    const urls = fetchMock().mock.calls.map((c: unknown[]) => String(c[0]));
    expect(urls.filter((u) => u.endsWith('/v3/customers'))).toHaveLength(1); // criado 1x
    expect(urls.filter((u) => u.endsWith('/v3/payments'))).toHaveLength(2); // 2 cobranças
  });

  it('customer em cache SEM CPF ganha CPF via UPDATE do mesmo cus_* (não duplica)', async () => {
    const { createAsaasPixCharge, clearAsaasCustomerCache } = await loadProvider({ ASAAS_API_KEY: 'asaas-key-test' });
    clearAsaasCustomerCache();
    fetchMock().mockReset();
    fetchMock()
      .mockResolvedValueOnce(resp({ id: 'cus_abc' }))          // 1ª: cria sem CPF
      .mockResolvedValueOnce(resp({ id: 'pay_1', status: 'PENDING' }))
      .mockResolvedValueOnce(resp({ id: 'cus_upd' }))          // 2ª: update do cus_abc com CPF
      .mockResolvedValueOnce(resp({ id: 'pay_2', status: 'PENDING' }));
    await createAsaasPixCharge({ amountBrlCents: 990, correlationID: 'c1', description: 'd', userId: 'user-1' });
    const c2 = await createAsaasPixCharge({ amountBrlCents: 2500, correlationID: 'c2', description: 'd', userId: 'user-1', payerCpfCnpj: '987.654.321-00' });
    expect(c2.customerId).toBe('cus_abc'); // MESMO customer, agora com CPF
    const upd = fetchMock().mock.calls.find((c: unknown[]) => String(c[0]) === 'https://api.asaas.com/v3/customers/cus_abc');
    expect(upd).toBeTruthy();
    expect(JSON.parse((upd![1] as RequestInit).body as string).cpfCnpj).toBe('98765432100');
    const creates = fetchMock().mock.calls.filter((c: unknown[]) => String(c[0]) === 'https://api.asaas.com/v3/customers');
    expect(creates).toHaveLength(1); // 1 criação + 1 update (nunca 2 customers)
  });

  it('ASAAS_API_KEY ausente → throw claro, sem fetch', async () => {
    const { createAsaasPixCharge } = await loadProvider({ ASAAS_API_KEY: undefined });
    fetchMock().mockReset();
    await expect(createAsaasPixCharge({ amountBrlCents: 990, correlationID: 'c', description: 'd', userId: 'u1' }))
      .rejects.toThrow('ASAAS_API_KEY');
    expect(fetchMock().mock.calls).toHaveLength(0);
  });

  it('PIX abaixo de R$ 5,00 → throw ANTES de qualquer fetch (fallback é papel do pix-provider)', async () => {
    const { createAsaasPixCharge } = await loadProvider({ ASAAS_API_KEY: 'asaas-key-test' });
    fetchMock().mockReset();
    await expect(createAsaasPixCharge({ amountBrlCents: 400, correlationID: 'c', description: 'd', userId: 'u1' }))
      .rejects.toThrow('PIX mínimo R$ 5,00');
    expect(fetchMock().mock.calls).toHaveLength(0);
  });
});

describe('asaas-provider: QR assíncrono (demora ~3s)', () => {
  it('payload + encodedImage → data URI', async () => {
    const { getAsaasQrCode } = await loadProvider({ ASAAS_API_KEY: 'asaas-key-test' });
    fetchMock().mockReset();
    fetchMock().mockResolvedValueOnce(resp({ payload: 'EMV123', encodedImage: 'QUJD' }));
    const qr = await getAsaasQrCode('pay_1', { delayMs: 0 });
    expect(qr.payload).toBe('EMV123');
    expect(qr.encodedImage).toBe('data:image/png;base64,QUJD');
    expect(String(fetchMock().mock.calls[0][0])).toBe('https://api.asaas.com/v3/payments/pay_1/pixQrCode');
  });

  it('retry: 1ª tentativa ainda sem payload → espera delay → 2ª devolve', async () => {
    const { getAsaasQrCode } = await loadProvider({ ASAAS_API_KEY: 'asaas-key-test' });
    fetchMock().mockReset();
    fetchMock()
      .mockResolvedValueOnce(resp({ payload: null })) // QR ainda não pronto
      .mockResolvedValueOnce(resp({ payload: 'EMV-LATE' })); // pronto após o sleep
    const qr = await getAsaasQrCode('pay_1', { retries: 1, delayMs: 0 });
    expect(qr.payload).toBe('EMV-LATE');
    const urls = fetchMock().mock.calls.map((c: unknown[]) => String(c[0]));
    expect(urls.filter((u) => u.endsWith('/pixQrCode'))).toHaveLength(2); // tentou 2x
  });

  it('esgota retries → throw com o último erro', async () => {
    const { getAsaasQrCode } = await loadProvider({ ASAAS_API_KEY: 'asaas-key-test' });
    fetchMock().mockReset();
    fetchMock()
      .mockResolvedValueOnce(resp({}, false, 404))
      .mockResolvedValueOnce(resp({}, false, 404));
    await expect(getAsaasQrCode('pay_1', { retries: 1, delayMs: 0 })).rejects.toThrow('pixQrCode');
  });
});

describe('asaas-provider: cartão (uso futuro)', () => {
  it('createAsaasCardCharge → billingType CREDIT_CARD + creditCard/holder no corpo', async () => {
    const { createAsaasCardCharge, clearAsaasCustomerCache } = await loadProvider({ ASAAS_API_KEY: 'asaas-key-test' });
    clearAsaasCustomerCache();
    fetchMock().mockReset();
    fetchMock()
      .mockResolvedValueOnce(resp({ id: 'cus_abc' }))
      .mockResolvedValueOnce(resp({ id: 'pay_cc1', status: 'PENDING' }));
    const charge = await createAsaasCardCharge({
      amountBrlCents: 2990, correlationID: 'credits_s1_400', description: 'Plano', userId: 'u1',
      creditCard: { number: '4111111111111111', holderName: 'ANA S', expiryMonth: '12', expiryYear: '2030', ccv: '123' },
      creditCardHolder: { name: 'Ana Souza', email: 'ana@x.com', cpfCnpj: '12345678909' },
    });
    expect(charge.paymentId).toBe('pay_cc1');
    const body = JSON.parse(fetchMock().mock.calls[1][1].body);
    expect(body.billingType).toBe('CREDIT_CARD');
    expect(body.value).toBe(29.9);
    expect(body.creditCard.number).toBe('4111111111111111');
    expect(body.creditCardHolder.name).toBe('Ana Souza');
    expect(body.installmentCount).toBe(1); // campo oficial v3 (não "installments")
  });

  it('DEBIT_CARD: mesma estrutura, só muda o billingType; threeDSUrl repassado quando existe', async () => {
    const { createAsaasCardCharge, clearAsaasCustomerCache } = await loadProvider({ ASAAS_API_KEY: 'asaas-key-test' });
    clearAsaasCustomerCache();
    fetchMock().mockReset();
    fetchMock()
      .mockResolvedValueOnce(resp({ id: 'cus_abc' }))
      .mockResolvedValueOnce(resp({ id: 'pay_db1', status: 'PENDING', threeDSecureUrl: 'https://asaas.com/3ds/pay_db1' }));
    const charge = await createAsaasCardCharge({
      amountBrlCents: 990, correlationID: 'credits_s1_50', description: 'd', userId: 'u1', billingType: 'DEBIT_CARD',
      creditCard: { number: '4111111111111111', holderName: 'ANA S', expiryMonth: '12', expiryYear: '2030', ccv: '123' },
      creditCardHolder: { name: 'Ana Souza' },
    });
    expect(charge.status).toBe('PENDING');
    expect(charge.threeDSUrl).toBe('https://asaas.com/3ds/pay_db1');
    expect(JSON.parse(fetchMock().mock.calls[1][1].body).billingType).toBe('DEBIT_CARD');
  });

  it('Asaas 400 com errors[] → AsaasApiError com a 1ª descrição legível (CVV errado etc.)', async () => {
    const { createAsaasCardCharge, clearAsaasCustomerCache, AsaasApiError } = await loadProvider({ ASAAS_API_KEY: 'asaas-key-test' });
    clearAsaasCustomerCache();
    fetchMock().mockReset();
    fetchMock()
      .mockResolvedValueOnce(resp({ id: 'cus_abc' }))
      .mockResolvedValueOnce(resp({ errors: [{ code: 'invalidCvv', description: 'CVV inválido' }] }, false, 400));
    await expect(createAsaasCardCharge({
      amountBrlCents: 990, correlationID: 'c', description: 'd', userId: 'u1',
      creditCard: { number: '4111111111111111', holderName: 'ANA S', expiryMonth: '12', expiryYear: '2030', ccv: '999' },
      creditCardHolder: { name: 'Ana Souza' },
    })).rejects.toThrow('CVV inválido');
    // sanity da classe exportada (usada pelo billing/pay-card p/ mapear 400 → mensagem)
    expect(AsaasApiError.name).toBe('AsaasApiError');
  });
});

describe('pix-provider: Asaas como 3ª opção (PAYMENT_PROVIDER=asaas)', () => {
  const input = (over: Partial<Parameters<typeof import('../src/payments/pix-provider')['createPixCharge']>[0]> = {}) => ({
    amountBrlCents: 990, correlationID: 'credits_s1_140', externalReference: 's1|140',
    description: 'Dr. Exame — 140 créditos', expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    userId: 'user-1', payerName: 'Ana Souza', payerCpfCnpj: '123.456.789-00', ...over,
  });
  const asaasHappy = () => [
    resp({ id: 'cus_abc' }), // customer
    resp({ id: 'pay_9', status: 'PENDING' }), // payment PIX
    resp({ payload: 'EMV-ASAAS', encodedImage: 'QUJD' }), // QR
  ];

  it('ativa e pronto só com ASAAS_API_KEY', async () => {
    const on = await loadProvider({ PAYMENT_PROVIDER: 'asaas', ASAAS_API_KEY: 'k' });
    expect(on.activePixProvider()).toBe('asaas');
    expect(on.pixProviderReady()).toBe(true);
    const off = await loadProvider({ PAYMENT_PROVIDER: 'asaas', ASAAS_API_KEY: undefined });
    expect(off.activePixProvider()).toBe('asaas');
    expect(off.pixProviderReady()).toBe(false);
  });

  it('fluxo completo: customer → payment → QR; id=pay_*, qr=copia-e-cola, imagem data URI', async () => {
    const { createPixCharge, clearAsaasCustomerCache } = await loadProvider({ PAYMENT_PROVIDER: 'asaas', ASAAS_API_KEY: 'k' });
    clearAsaasCustomerCache();
    fetchMock().mockReset();
    asaasHappy().forEach((r) => fetchMock().mockResolvedValueOnce(r));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const charge = await createPixCharge(input({ expiresAt }));
    expect(charge.id).toBe('pay_9'); // webhook asaas casa por payment.id
    expect(charge.qrCode).toBe('EMV-ASAAS');
    expect(charge.qrBase64).toBe('data:image/png;base64,QUJD');
    expect(charge.expiresAt).toBe(expiresAt);
    const urls = fetchMock().mock.calls.map((c: unknown[]) => String(c[0]));
    expect(urls).toEqual([
      'https://api.asaas.com/v3/customers',
      'https://api.asaas.com/v3/payments',
      'https://api.asaas.com/v3/payments/pay_9/pixQrCode',
    ]);
  });

  it('valor < R$ 5,00 → cai DIRETO pro OpenPix (Asaas nem é chamado)', async () => {
    const { createPixCharge, clearAsaasCustomerCache } = await loadProvider({
      PAYMENT_PROVIDER: 'asaas', ASAAS_API_KEY: 'k', OPENPIX_APP_ID: 'appid-teste',
    });
    clearAsaasCustomerCache();
    fetchMock().mockReset();
    fetchMock().mockResolvedValueOnce(resp({
      charge: { correlationID: 'credits_s1_140', brCode: 'BRCODE-SMALL', status: 'ACTIVE' },
    }));
    const charge = await createPixCharge(input({ amountBrlCents: 400 })); // R$ 4,00
    expect(charge.id).toBe('credits_s1_140'); // id openpix = correlationID
    expect(charge.qrCode).toBe('BRCODE-SMALL');
    const urls = fetchMock().mock.calls.map((c: unknown[]) => String(c[0]));
    expect(urls[0]).toBe('https://api.openpix.com.br/api/v1/charge'); // openpix primeiro
    expect(urls.some((u) => u.includes('asaas.com'))).toBe(false); // asaas pulado
  });

  // 04/10: Asaas rejeita PIX de customer sem CPF (400 invalid_object, provado em prod
  // — o pagamento só sobreviveu porque o fallback openpix assumiu). Sem CPF no input,
  // o Asaas é pulado ANTES de qualquer fetch.
  it('SEM CPF do pagador → Asaas pulado na hora, OpenPix assume (sem 400 garantido)', async () => {
    const { createPixCharge, clearAsaasCustomerCache } = await loadProvider({
      PAYMENT_PROVIDER: 'asaas', ASAAS_API_KEY: 'k', OPENPIX_APP_ID: 'appid-teste',
    });
    clearAsaasCustomerCache();
    fetchMock().mockReset();
    fetchMock().mockResolvedValueOnce(resp({
      charge: { correlationID: 'credits_s1_140', brCode: 'BRCODE-NOCPF', status: 'ACTIVE' },
    }));
    const charge = await createPixCharge(input({ payerCpfCnpj: undefined }));
    expect(charge.id).toBe('credits_s1_140');
    expect(charge.qrCode).toBe('BRCODE-NOCPF');
    const urls = fetchMock().mock.calls.map((c: unknown[]) => String(c[0]));
    expect(urls[0]).toBe('https://api.openpix.com.br/api/v1/charge');
    expect(urls.some((u) => u.includes('asaas.com'))).toBe(false); // nem customer nem payment
  });

  it('COM CPF → customer Asaas nasce com cpfCnpj (só dígitos) na cobrança PIX', async () => {
    const { createPixCharge, clearAsaasCustomerCache } = await loadProvider({
      PAYMENT_PROVIDER: 'asaas', ASAAS_API_KEY: 'k',
    });
    clearAsaasCustomerCache();
    fetchMock().mockReset();
    asaasHappy().forEach((r) => fetchMock().mockResolvedValueOnce(r));
    await createPixCharge(input());
    const [, cinit] = fetchMock().mock.calls[0];
    expect(JSON.parse(cinit.body).cpfCnpj).toBe('12345678900'); // sem máscara
  });

  it('asaas falha (payments 500) → openpix resgata a mesma cobrança', async () => {
    const { createPixCharge, clearAsaasCustomerCache } = await loadProvider({
      PAYMENT_PROVIDER: 'asaas', ASAAS_API_KEY: 'k', OPENPIX_APP_ID: 'appid-teste',
    });
    clearAsaasCustomerCache();
    fetchMock().mockReset();
    fetchMock()
      .mockResolvedValueOnce(resp({ id: 'cus_abc' }))
      .mockResolvedValueOnce(resp({ error: 'boom' }, false, 500)) // asaas fora
      .mockResolvedValueOnce(resp({ charge: { correlationID: 'credits_s1_140', brCode: 'BRCODE-FB', status: 'ACTIVE' } }));
    const charge = await createPixCharge(input());
    expect(charge.id).toBe('credits_s1_140');
    expect(charge.qrCode).toBe('BRCODE-FB');
    const urls = fetchMock().mock.calls.map((c: unknown[]) => String(c[0]));
    expect(urls[0]).toContain('asaas.com');
    expect(urls[2]).toContain('api.openpix.com.br');
  });

  it('asaas falha e openpix não configurado → propaga o erro original (sem fallback possível)', async () => {
    const { createPixCharge, clearAsaasCustomerCache } = await loadProvider({
      PAYMENT_PROVIDER: 'asaas', ASAAS_API_KEY: 'k', OPENPIX_APP_ID: undefined,
    });
    clearAsaasCustomerCache();
    fetchMock().mockReset();
    fetchMock()
      .mockResolvedValueOnce(resp({ id: 'cus_abc' }))
      .mockResolvedValueOnce(resp({ error: 'boom' }, false, 500));
    // sem external_reference → MP de resgate fica inelegível (webhook creditaria errado)
    await expect(createPixCharge(input({ externalReference: undefined }))).rejects.toThrow('Asaas /v3/payments falhou (500)');
  });
});
