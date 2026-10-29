import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createHmac } from 'node:crypto';

vi.mock('../src/kyc/sync', async (orig) => ({
  ...(await orig<typeof import('../src/kyc/sync')>()),
  syncVerification: vi.fn(async () => ({ ok: true })),
}));

import { api } from './helpers';
import { syncVerification } from '../src/kyc/sync';

const SECRET = 'whsec_test';
const sign = (body: string, t = Math.floor(Date.now() / 1000)) => `t=${t},v1=${createHmac('sha256', SECRET).update(`${t}.${body}`).digest('hex')}`;
const post = (body: string, sig?: string) => {
  const r = api().post('/api/webhooks/uaiid').set('Content-Type', 'application/json');
  return (sig ? r.set('X-Uai-Signature', sig) : r).send(body);
};
const APPROVED = JSON.stringify({ id: '9d2c7a41-0f3e-4f2a-8b1c-2e7d6f5a4b3c', event: 'verification.approved', verification_id: '6c5db95c-8d67-41b3-aabc-2e1439f614c3', data: { verification_id: '6c5db95c-8d67-41b3-aabc-2e1439f614c3', score: 830, reason_code: null, full_name: 'MARIA DA SILVA', birth_date: '1990-01-01', cpf_masked: '123.***.***-09', cpf_situacao: 'REGULAR', cpf_consulta_cache: false } });
const MANUAL = JSON.stringify({ id: 'b5095a09-5dc9-4fd7-87b6-6da3eba7f187', data: { reason_code: 'document_not_recognized', verification_id: '5fc6fac8-47bc-4734-a1fd-f01cffb5aa1c' }, event: 'verification.manual_review', verification_id: '5fc6fac8-47bc-4734-a1fd-f01cffb5aa1c' });

describe('POST /api/webhooks/uaiid (spec §3)', () => {
  beforeEach(() => {
    process.env.UAIID_WEBHOOK_SECRET = SECRET;
    vi.mocked(syncVerification).mockClear();
  });

  it('sem assinatura ou com assinatura errada → 401, sem sync', async () => {
    expect((await post(APPROVED)).status).toBe(401);
    const bad = `t=${Math.floor(Date.now() / 1000)},v1=${'0'.repeat(64)}`;
    const r = await post(APPROVED, bad);
    expect(r.status).toBe(401);
    expect(r.body.code).toBe('BAD_SIGNATURE');
    expect(vi.mocked(syncVerification)).not.toHaveBeenCalled();
  });

  it('timestamp velho (>300s) → 401', async () => {
    expect((await post(APPROVED, sign(APPROVED, Math.floor(Date.now() / 1000) - 301))).status).toBe(401);
  });

  it('approved assinado → 200 e sync com o nome do documento', async () => {
    expect((await post(APPROVED, sign(APPROVED))).status).toBe(200);
    await vi.waitFor(() => expect(vi.mocked(syncVerification))
      .toHaveBeenCalledWith('6c5db95c-8d67-41b3-aabc-2e1439f614c3', 'webhook', { documentName: 'MARIA DA SILVA' }));
  });

  it('manual_review enxuto (só reason_code) → 200 e sync sem nome', async () => {
    expect((await post(MANUAL, sign(MANUAL))).status).toBe(200);
    await vi.waitFor(() => expect(vi.mocked(syncVerification))
      .toHaveBeenCalledWith('5fc6fac8-47bc-4734-a1fd-f01cffb5aa1c', 'webhook', { documentName: null }));
  });

  it('evento que não é verification.* → 200, sem sync', async () => {
    const body = JSON.stringify({ id: 'b1', event: 'billing.spend_alert', data: {} });
    expect((await post(body, sign(body))).status).toBe(200);
    expect(vi.mocked(syncVerification)).not.toHaveBeenCalled();
  });

  it('corpo não-JSON assinado → 400', async () => {
    expect((await post('nao-json', sign('nao-json'))).status).toBe(400);
  });
});
