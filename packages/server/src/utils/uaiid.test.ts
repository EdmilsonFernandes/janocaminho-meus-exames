import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { createUaiidVerification, getUaiidVerification, verifyUaiidSignature, UaiidError } from './uaiid';

// lida na chamada (padrão cfm.ts); test/setup.ts zera, aqui pomos uma fake.
process.env.UAIID_API_KEY = 'uai_test_key';
const sign = (secret: string, t: number, body: string) => `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`;

describe('verifyUaiidSignature', () => {
  const body = '{"id":"e1","event":"verification.approved","verification_id":"v1","data":{}}';
  const t = 1760000000;
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
});

describe('createUaiidVerification', () => {
  beforeEach(() => vi.restoreAllMocks());
  const input = { cpf: '529.982.247-25', fullName: 'MARIA SOUZA', externalReference: 'doc-1', returnUrl: 'https://drexame.janocaminho.com.br/#/doctor?kyc=1', idempotencyKey: 'drexame-doc-1-1' };

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

  it('429 → KYC_ATTEMPT_LIMIT com retryAfterHours', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({ error_code: 'attempt_limit_cooldown', retry_after_hours: 3 }) }));
    await expect(createUaiidVerification(input)).rejects.toMatchObject({ code: 'KYC_ATTEMPT_LIMIT', retryAfterHours: 3 });
  });

  it('500 / rede → KYC_UNAVAILABLE', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }));
    await expect(createUaiidVerification(input)).rejects.toBeInstanceOf(UaiidError);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNRESET')));
    await expect(createUaiidVerification(input)).rejects.toMatchObject({ code: 'KYC_UNAVAILABLE' });
  });

  it('sem UAIID_API_KEY → KYC_UNAVAILABLE sem chamar fetch', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    const saved = process.env.UAIID_API_KEY;
    delete process.env.UAIID_API_KEY;
    await expect(createUaiidVerification(input)).rejects.toMatchObject({ code: 'KYC_UNAVAILABLE' });
    expect(f).not.toHaveBeenCalled();
    process.env.UAIID_API_KEY = saved;
  });
});

describe('getUaiidVerification', () => {
  beforeEach(() => vi.restoreAllMocks());

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
});
