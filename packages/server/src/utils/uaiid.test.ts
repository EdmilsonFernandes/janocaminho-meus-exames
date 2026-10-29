import { describe, it, expect, vi, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { createUaiidVerification, getUaiidVerification, verifyUaiidSignature, UaiidError } from './uaiid';

// lida na chamada (padrão cfm.ts); test/setup.ts zera, aqui pomos uma fake.
process.env.UAIID_API_KEY = 'uai_test_key';
const sign = (secret: string, t: number, body: string) => `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`;

// Env, fetch e spies trocados por um teste nunca vazam para o seguinte (nem quando um expect falha).
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('UaiidError', () => {
  it('forma da API (code, retryAfterHours?, status?): chamadas antigas seguem valendo', () => {
    const limit = new UaiidError('KYC_ATTEMPT_LIMIT', 3);
    expect(limit).toBeInstanceOf(Error);
    expect(limit.name).toBe('UaiidError');
    expect(limit.message).toBe('KYC_ATTEMPT_LIMIT');
    expect(limit.code).toBe('KYC_ATTEMPT_LIMIT');
    expect(limit.retryAfterHours).toBe(3);
    expect(limit.status).toBeUndefined();

    const plain = new UaiidError('KYC_UNAVAILABLE');
    expect(plain.retryAfterHours).toBeUndefined();
    expect(plain.status).toBeUndefined();

    expect(new UaiidError('KYC_UNAVAILABLE', undefined, 502).status).toBe(502);
  });
});

describe('verifyUaiidSignature', () => {
  const body = '{"id":"e1","event":"verification.approved","verification_id":"v1","data":{}}';
  const t = 1760000000;
  const good = sign('whsec_x', t, body);
  it('válida → true', () => expect(verifyUaiidSignature(body, sign('whsec_x', t, body), 'whsec_x', t)).toBe(true));
  it('aceita Buffer (corpo cru do express.raw)', () => expect(verifyUaiidSignature(Buffer.from(body), sign('whsec_x', t, body), 'whsec_x', t)).toBe(true));
  it('segredo errado → false', () => expect(verifyUaiidSignature(body, sign('outro', t, body), 'whsec_x', t)).toBe(false));
  it('corpo alterado → false', () => expect(verifyUaiidSignature(body + ' ', sign('whsec_x', t, body), 'whsec_x', t)).toBe(false));
  it('t fora de ±300s → false', () => expect(verifyUaiidSignature(body, sign('whsec_x', t, body), 'whsec_x', t + 301)).toBe(false));
  it('header ausente/malformado → false', () => {
    expect(verifyUaiidSignature(body, undefined, 'whsec_x', t)).toBe(false);
    expect(verifyUaiidSignature(body, 'v1=abc', 'whsec_x', t)).toBe(false);
    expect(verifyUaiidSignature(body, `t=${t},v1=zz`, 'whsec_x', t)).toBe(false);
  });

  it('janela é inclusiva em ±300s: t+300 e t-300 passam, t+301 e t-301 não', () => {
    expect(verifyUaiidSignature(body, good, 'whsec_x', t + 300)).toBe(true);
    expect(verifyUaiidSignature(body, good, 'whsec_x', t - 300)).toBe(true);
    expect(verifyUaiidSignature(body, good, 'whsec_x', t + 301)).toBe(false);
    expect(verifyUaiidSignature(body, good, 'whsec_x', t - 301)).toBe(false);
  });

  it('tolerância customizada é respeitada', () => {
    expect(verifyUaiidSignature(body, good, 'whsec_x', t + 5, 5)).toBe(true);
    expect(verifyUaiidSignature(body, good, 'whsec_x', t + 6, 5)).toBe(false);
  });

  it('janela falha fechada com NaN (nowSec ou toleranceSec): comparação com NaN nunca aprova', () => {
    expect(verifyUaiidSignature(body, good, 'whsec_x', NaN)).toBe(false);
    expect(verifyUaiidSignature(body, good, 'whsec_x', t, NaN)).toBe(false);
  });

  it('segredo vazio → false, mesmo se o header foi assinado com segredo vazio', () => {
    expect(verifyUaiidSignature(body, sign('', t, body), '', t)).toBe(false);
  });

  it.each<[string, unknown]>([
    ['undefined', undefined],
    ['null', null],
    ['objeto (req.body do express.json por engano)', { id: 'e1' }],
    ['array', []],
    ['número', 42],
  ])('corpo que não é Buffer nem string (%s) → false, sem lançar', (_label, bad) => {
    expect(() => verifyUaiidSignature(bad as unknown as string, good, 'whsec_x', t)).not.toThrow();
    expect(verifyUaiidSignature(bad as unknown as string, good, 'whsec_x', t)).toBe(false);
  });

  it('header: partes sem "=" são ignoradas e não viram chave por acidente', () => {
    // "v1x" (sem "=") virava a chave "v1" e sobrescrevia a assinatura válida; "tx" virava "t".
    expect(verifyUaiidSignature(body, `${good},v1x`, 'whsec_x', t)).toBe(true);
    expect(verifyUaiidSignature(body, `${good},tx`, 'whsec_x', t)).toBe(true);
    expect(verifyUaiidSignature(body, `lixo,${good}`, 'whsec_x', t)).toBe(true);
    // espaço depois da vírgula continua aceito
    expect(verifyUaiidSignature(body, good.replace(',', ', '), 'whsec_x', t)).toBe(true);
    // e parte essencial sem "=" continua sendo header malformado
    expect(verifyUaiidSignature(body, `t=${t},v1`, 'whsec_x', t)).toBe(false);
    expect(verifyUaiidSignature(body, good.split(',')[1], 'whsec_x', t)).toBe(false);
  });
});

describe('createUaiidVerification', () => {
  const input = { cpf: '529.982.247-25', fullName: 'MARIA SOUZA', externalReference: 'doc-1', returnUrl: 'https://drexame.janocaminho.com.br/#/doctor?kyc=1', idempotencyKey: 'drexame-doc-1-1' };
  const created = (over: Record<string, unknown> = {}) => ({
    ok: true,
    status: 201,
    json: async () => ({ verification_id: 'v-1', verify_url: 'https://uaiid.com.br/verify/ab12', expires_at: '2026-10-29T12:00:00Z', reused_session: false, ...over }),
  });

  it('POST no contrato real → mapeia a resposta', async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({ verification_id: 'v-1', verify_url: 'https://uaiid.com.br/verify/ab12', expires_at: '2026-10-29T12:00:00Z', reused_session: false }) });
    vi.stubGlobal('fetch', f);
    expect(await createUaiidVerification(input)).toEqual({ verificationId: 'v-1', verifyUrl: 'https://uaiid.com.br/verify/ab12', expiresAt: new Date('2026-10-29T12:00:00Z'), reused: false });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('https://api.uaiid.com.br/v1/verifications');
    expect(init.headers.Authorization).toBe('Bearer uai_test_key');
    expect(init.headers['Idempotency-Key']).toBe('drexame-doc-1-1');
    expect(JSON.parse(init.body)).toEqual({ cpf: '52998224725', full_name: 'MARIA SOUZA', external_reference: 'doc-1', return_url: input.returnUrl, mode: 'full', flow: 'own' });
  });

  it('POST: método, Content-Type JSON, Bearer e signal de timeout', async () => {
    const f = vi.fn().mockResolvedValue(created());
    vi.stubGlobal('fetch', f);
    await createUaiidVerification(input);
    const [, init] = f.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.headers.Authorization).toBe('Bearer uai_test_key');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('UAIID_BASE_URL: override sem as barras finais', async () => {
    const f = vi.fn().mockResolvedValue(created());
    vi.stubGlobal('fetch', f);
    vi.stubEnv('UAIID_BASE_URL', 'https://sandbox.uaiid.test///');
    await createUaiidVerification(input);
    expect(f.mock.calls[0][0]).toBe('https://sandbox.uaiid.test/v1/verifications');
  });

  it('429 → KYC_ATTEMPT_LIMIT com retryAfterHours', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({ error_code: 'attempt_limit_cooldown', retry_after_hours: 3 }) }));
    await expect(createUaiidVerification(input)).rejects.toMatchObject({ code: 'KYC_ATTEMPT_LIMIT', retryAfterHours: 3, status: 429 });
  });

  it('500 / rede → KYC_UNAVAILABLE', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }));
    await expect(createUaiidVerification(input)).rejects.toBeInstanceOf(UaiidError);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNRESET')));
    await expect(createUaiidVerification(input)).rejects.toMatchObject({ code: 'KYC_UNAVAILABLE' });
  });

  it('500 → KYC_UNAVAILABLE com o status HTTP do UaiID no erro', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }));
    await expect(createUaiidVerification(input)).rejects.toMatchObject({ code: 'KYC_UNAVAILABLE', status: 500 });
  });

  it('rede/timeout → KYC_UNAVAILABLE sem status (a falha não veio de uma resposta)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNRESET')));
    const err = await createUaiidVerification(input).catch((e) => e);
    expect(err).toBeInstanceOf(UaiidError);
    expect(err.code).toBe('KYC_UNAVAILABLE');
    expect(err.status).toBeUndefined();
  });

  it.each<[string, string | undefined]>([['vazia', ''], ['ausente', undefined]])('sem UAIID_API_KEY (%s) → KYC_UNAVAILABLE sem chamar fetch', async (_label, value) => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    vi.stubEnv('UAIID_API_KEY', value);
    const err = await createUaiidVerification(input).catch((e) => e);
    expect(err).toBeInstanceOf(UaiidError);
    expect(err.code).toBe('KYC_UNAVAILABLE');
    expect(err.status).toBeUndefined();
    expect(f).not.toHaveBeenCalled();
  });

  it('o erro nunca carrega chave, CPF, nome nem corpo da resposta', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({ detail: 'CANARY-RESPONSE-BODY' }) }));
    const err = await createUaiidVerification(input).catch((e) => e);
    expect(err.message).toBe('KYC_UNAVAILABLE');
    const dump = [err.message, err.stack, JSON.stringify(err)].join('\n');
    for (const secret of ['uai_test_key', '52998224725', '529.982.247-25', 'MARIA SOUZA', 'CANARY-RESPONSE-BODY']) expect(dump).not.toContain(secret);
  });

  it.each<[string, unknown]>([
    ['texto que não é data', 'isso-não-é-data'],
    ['vazia', ''],
    ['null', null],
    ['ausente', undefined],
  ])('expires_at %s → expiresAt null (nunca Invalid Date) e o resto da resposta vale', async (_label, expires_at) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(created({ expires_at })));
    const r = await createUaiidVerification(input);
    expect(r.expiresAt).toBeNull();
    expect(r.verificationId).toBe('v-1');
  });

  it.each(['http://uaiid.com.br/verify/ab12', 'javascript:alert(1)', '//uaiid.com.br/verify/ab12', 'uaiid.com.br/verify/ab12', ''])(
    'verify_url "%s" (não começa com https://) → KYC_UNAVAILABLE',
    async (verify_url) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(created({ verify_url })));
      await expect(createUaiidVerification(input)).rejects.toMatchObject({ code: 'KYC_UNAVAILABLE', status: 201 });
    },
  );

  it('UAIID_TIMEOUT_MS="-1" → a chamada ainda funciona (AbortSignal.timeout não recebe valor inválido)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(created()));
    vi.stubEnv('UAIID_TIMEOUT_MS', '-1');
    await expect(createUaiidVerification(input)).resolves.toMatchObject({ verificationId: 'v-1' });
  });

  it.each<[string, number]>([
    ['-1', 8000], ['0', 8000], ['', 8000], ['abc', 8000], ['Infinity', 8000], ['1.5', 8000], ['999', 8000], ['60001', 8000],
    ['1000', 1000], ['15000', 15000], ['60000', 60000],
  ])('UAIID_TIMEOUT_MS=%j → AbortSignal.timeout(%d)', async (raw, expected) => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(created()));
    vi.stubEnv('UAIID_TIMEOUT_MS', raw);
    await createUaiidVerification(input);
    expect(timeout).toHaveBeenCalledTimes(1);
    expect(timeout).toHaveBeenCalledWith(expected);
  });
});

describe('getUaiidVerification', () => {
  it('mapeia VerificationOut (result.score, name_ratio, Receita)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({
      id: 'v-1', status: 'approved', reason_code: null, external_reference: 'doc-1', completed_at: '2026-10-28T12:10:06Z',
      result: { score: 830, face_similarity: 0.91, declared_vs_document: { name_ratio: 1, name_ok: true }, receita_federal: { situacao_cadastral: 'REGULAR' } },
    }) }));
    expect(await getUaiidVerification('v-1')).toEqual({ id: 'v-1', status: 'approved', reasonCode: null, score: 830, nameRatio: 1, cpfSituacao: 'REGULAR', externalReference: 'doc-1', completedAt: new Date('2026-10-28T12:10:06Z') });
  });

  it('name_ratio ausente/nulo → nameRatio null (não 0)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'v-2', status: 'manual_review', reason_code: 'document_not_recognized', result: { declared_vs_document: { name_ratio: null } } }) }));
    expect((await getUaiidVerification('v-2'))?.nameRatio).toBeNull();
  });

  it('falha → null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }));
    expect(await getUaiidVerification('v-x')).toBeNull();
  });

  it('rede/timeout → null (não lança)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNRESET')));
    expect(await getUaiidVerification('v-x')).toBeNull();
  });

  it('GET exatamente em /v1/verifications/{id} (nunca /details) com Authorization Bearer', async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'v-1', status: 'approved' }) });
    vi.stubGlobal('fetch', f);
    await getUaiidVerification('v-1');
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('https://api.uaiid.com.br/v1/verifications/v-1');
    expect(init.headers.Authorization).toBe('Bearer uai_test_key');
    expect(init.method ?? 'GET').toBe('GET');
    expect(init.body).toBeUndefined();
  });

  it('o id é codificado no path: não dá para escapar de /v1/verifications/', async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'x', status: 'approved' }) });
    vi.stubGlobal('fetch', f);
    await getUaiidVerification('../details?x=1#y');
    expect(f.mock.calls[0][0]).toBe('https://api.uaiid.com.br/v1/verifications/..%2Fdetails%3Fx%3D1%23y');
  });

  it('completed_at inválida → completedAt null (nunca Invalid Date)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'v-1', status: 'approved', completed_at: 'isso-não-é-data' }) }));
    const r = await getUaiidVerification('v-1');
    expect(r?.status).toBe('approved');
    expect(r?.completedAt).toBeNull();
  });

  it.each<[string, string | undefined]>([['vazia', ''], ['ausente', undefined]])('sem UAIID_API_KEY (%s) → null sem chamar fetch', async (_label, value) => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    vi.stubEnv('UAIID_API_KEY', value);
    expect(await getUaiidVerification('v-1')).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it('UAIID_TIMEOUT_MS="-1" → ainda consulta e responde (não lança RangeError)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'v-1', status: 'approved' }) }));
    vi.stubEnv('UAIID_TIMEOUT_MS', '-1');
    expect((await getUaiidVerification('v-1'))?.status).toBe('approved');
  });
});
