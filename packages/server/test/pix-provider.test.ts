// Unit test do pix-provider (puro — só fetch global mockado, zero DB).
// Provider por env PAYMENT_PROVIDER: config.ts congela no import → trocamos env +
// vi.resetModules() + import dinâmico pra testar 'mp' e 'openpix' no MESMO arquivo.
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
  return await import('../src/payments/pix-provider');
};

afterEach(() => {
  delete process.env.PAYMENT_PROVIDER;
  delete process.env.OPENPIX_APP_ID;
  delete process.env.OPENPIX_API_BASE_URL;
});

describe('pix-provider: Mercado Pago (default)', () => {
  it('PAYMENT_PROVIDER ausente → provider mp', async () => {
    const { activePixProvider } = await loadProvider({ PAYMENT_PROVIDER: undefined });
    expect(activePixProvider()).toBe('mp');
  });

  it('replica o shape MP: id do payment + qr_code/qr_code_base64 do transaction_data', async () => {
    const { createPixCharge } = await loadProvider({ PAYMENT_PROVIDER: undefined });
    fetchMock().mockReset();
    fetchMock().mockResolvedValueOnce(resp({
      id: 12345, status: 'pending',
      point_of_interaction: { transaction_data: { qr_code: 'COPYPASTE', qr_code_base64: 'AAAA' } },
    }));
    const expiresAt = new Date('2026-10-02T12:10:00.000Z');
    const charge = await createPixCharge({
      amountBrlCents: 990,
      correlationID: 'credits_sub9_140',
      externalReference: 'sub9|140',
      description: 'Dr. Exame — 140 créditos',
      payerEmail: 'a@b.c',
      payerFirstName: 'Ana',
      expiresAt,
    });
    expect(charge.id).toBe('12345');
    expect(charge.qrCode).toBe('COPYPASTE');
    expect(charge.qrBase64).toBe('data:image/png;base64,AAAA'); // base64 puro → data URI
    expect(charge.expiresAt).toBe(expiresAt);
    // fetch replicado: POST /v1/payments com payment_method_id pix + centavos→BRL
    const [url, init] = fetchMock().mock.calls[0];
    expect(String(url)).toContain('/v1/payments');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body.payment_method_id).toBe('pix');
    expect(body.transaction_amount).toBe(9.9); // 990 centavos → BRL
    expect(body.external_reference).toBe('sub9|140');
    expect(body.date_of_expiration).toBe(expiresAt.toISOString());
  });

  it('MP devolve erro → throw com status (caller transforma em 502)', async () => {
    const { createPixCharge } = await loadProvider({ PAYMENT_PROVIDER: undefined });
    fetchMock().mockReset();
    fetchMock().mockResolvedValueOnce(resp({ error: 'x' }, false, 401));
    await expect(createPixCharge({ amountBrlCents: 990, correlationID: 'c', description: 'd', expiresAt: new Date() }))
      .rejects.toThrow('MP PIX falhou (401)');
  });

  it('MP sem qr_code na resposta → throw claro', async () => {
    const { createPixCharge } = await loadProvider({ PAYMENT_PROVIDER: undefined });
    fetchMock().mockReset();
    fetchMock().mockResolvedValueOnce(resp({ id: 1, status: 'pending' }));
    await expect(createPixCharge({ amountBrlCents: 990, correlationID: 'c', description: 'd', expiresAt: new Date() }))
      .rejects.toThrow('sem qr_code');
  });
});

describe('pix-provider: OpenPix', () => {
  it('charge + QR base64 (2 fetches: /charge e o qrCodeImage do CORPO da resposta)', async () => {
    const { createPixCharge, activePixProvider } = await loadProvider({
      PAYMENT_PROVIDER: 'openpix', OPENPIX_APP_ID: 'appid-teste',
    });
    expect(activePixProvider()).toBe('openpix');
    fetchMock().mockReset();
    fetchMock()
      .mockResolvedValueOnce(resp({
        charge: {
          correlationID: 'credits_sub9_140', brCode: 'BRCODE123', status: 'ACTIVE',
          expiresDate: '2026-10-02T12:10:00.000Z',
          // 02/10: imagem vem NA charge (PNG público) — endpoint /image/qrcode/base64
          // responde 'not found' pra DYNAMIC (prova ao vivo).
          paymentMethods: { pix: { qrCodeImage: 'https://api.woovi.com/x.png' } },
        },
      }))
      .mockResolvedValueOnce({ ok: true, json: async () => ({}), arrayBuffer: async () => new Uint8Array([0x42, 0x41, 0x41]).buffer });
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const charge = await createPixCharge({ amountBrlCents: 990, correlationID: 'credits_sub9_140', description: 'd', expiresAt });
    expect(charge.id).toBe('credits_sub9_140'); // paymentId = correlationID
    expect(charge.qrCode).toBe('BRCODE123');
    expect(charge.qrBase64).toBe(`data:image/png;base64,${Buffer.from([0x42, 0x41, 0x41]).toString('base64')}`);
    expect(charge.expiresAt).toBe(expiresAt);
    const [url, init] = fetchMock().mock.calls[0];
    expect(String(url)).toBe('https://api.openpix.com.br/api/v1/charge');
    expect(init.headers.Authorization).toBe('appid-teste');
    const body = JSON.parse(init.body);
    expect(body.correlationID).toBe('credits_sub9_140');
    expect(body.value).toBe(990);
    // QR imagem: baixa o PNG do corpo da charge (URL pública)
    expect(String(fetchMock().mock.calls[1][0])).toBe('https://api.woovi.com/x.png');
  });

  it('QR imagem falha → qrBase64 null (copia-e-cola segue válido)', async () => {
    const { createPixCharge } = await loadProvider({ PAYMENT_PROVIDER: 'openpix', OPENPIX_APP_ID: 'appid-teste' });
    fetchMock().mockReset();
    fetchMock()
      .mockResolvedValueOnce(resp({ charge: { correlationID: 'credits_x_10', brCode: 'BRCODE', status: 'ACTIVE' } }))
      .mockResolvedValueOnce(resp({}, false, 500));
    const charge = await createPixCharge({ amountBrlCents: 990, correlationID: 'credits_x_10', description: 'd', expiresAt: new Date() });
    expect(charge.qrCode).toBe('BRCODE');
    expect(charge.qrBase64).toBeNull();
  });

  it('OPENPIX_APP_ID ausente → throw claro', async () => {
    const { createPixCharge } = await loadProvider({ PAYMENT_PROVIDER: 'openpix', OPENPIX_APP_ID: undefined });
    await expect(createPixCharge({ amountBrlCents: 990, correlationID: 'c', description: 'd', expiresAt: new Date() }))
      .rejects.toThrow('OPENPIX_APP_ID');
  });
});
