// PoC (security validation): billing webhook spoofing — full attacker chain.
// Story under test (per threat model priority 2): register → buy-credits (PENDING PIX)
// → read paymentId (= mpPaymentId = OpenPix correlationID, client-visible) → POST the
// PUBLIC /api/webhooks/openpix with a forged {charge:{correlationID,status:'COMPLETED'},...}
// → premium/credits without paying. Same for /api/webhooks/asaas (pay_*) and the plan
// variant. The OpenPix webhook is unauthenticated/un-signed (Asaas now ALSO requires
// header asaas-access-token === ASAAS_API_KEY — 401 fail closed, see asaas-webhook.test);
// the question here is whether the server-side provider re-check actually stops the
// forged payload even when the attacker HAS the token (token vazado/cenário interno).
// Provider API (globalThis.fetch) is mocked the same way as the project's own tests
// (openpix-webhook.test.ts / asaas-webhook.test.ts patterns — helpers.mpResponse).
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { api, resetDb, createUser, getUserCredits, mintToken, mpResponse } from './helpers';
import { prisma } from '../src/prisma';
import {
  createSubscriptionCompat,
  updateSubscriptionCompat,
  resetSubscriptionColumnsCacheForTests,
} from '../src/utils/subscriptionCompat';

const fetchMock = () => globalThis.fetch as unknown as Mock;

/** What the OpenPix charge API would say about a charge nobody paid. */
const openpixNotPaid = () => mpResponse({ charge: { correlationID: 'x', status: 'PENDING', value: 990 } });
const openpixPaid = () => mpResponse({ charge: { correlationID: 'x', status: 'COMPLETED', value: 990 } });
/** What the Asaas payments API would say about a payment nobody made. */
const asaasNotPaid = () => mpResponse({ id: 'pay_x', value: 9.9, status: 'PENDING' });

const openpixSpoof = (correlationID: string, valueCents: number) => ({
  event: 'CHARGE_COMPLETED',
  charge: { correlationID, status: 'COMPLETED', value: valueCents },
  payment: { status: 'COMPLETED', value: valueCents },
});

const asaasSpoof = (paymentId: string, valueBrl: number) => ({
  event: 'PAYMENT_RECEIVED',
  payment: { id: paymentId, value: valueBrl, status: 'RECEIVED' },
});

describe('PoC: webhook spoofing — premium/credits without payment', () => {
  beforeEach(async () => {
    await resetDb();
    resetSubscriptionColumnsCacheForTests();
    fetchMock().mockClear();
    // Provider says NOT paid (the real-world state for a forged webhook).
    fetchMock().mockResolvedValue(mpResponse({}));
  });

  it('OpenPix spoof: full chain (PENDING sub + paymentId + forged webhook) → BLOCKED by provider check', async () => {
    const { user } = await createUser({ credits: 0 });
    // Attacker created a credit-pack PIX (buy-credits) — pending, unpaid.
    const sub = await createSubscriptionCompat({ userId: user.id, amount: 9.9, periodDays: 0, status: 'PENDING' });
    const paymentId = `credits_${sub.id}_140`; // = correlationID, returned to the client by buy-credits
    await updateSubscriptionCompat(sub.id, {
      mpPaymentId: paymentId,
      pixQrCode: 'BRCODE',
      pixQrBase64: 'data:image/png;base64,QQ==',
      pixExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
      pixCredits: 140,
    });

    // Forged webhook: perfect payload (id + exact amount + COMPLETED), NO provider involvement.
    fetchMock().mockResolvedValueOnce(openpixNotPaid());
    const r = await api().post('/api/webhooks/openpix').send(openpixSpoof(paymentId, 990));
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('Cobrança não confirmada no provider.');
    expect(await getUserCredits(user.id)).toBe(0);
    const dbSub = await prisma.subscription.findUnique({ where: { id: sub.id }, select: { status: true } });
    expect(dbSub?.status).toBe('PENDING');
  });

  it('OpenPix spoof with EMPTY status (skips the payload status check) → still BLOCKED', async () => {
    const { user } = await createUser({ credits: 0 });
    const sub = await createSubscriptionCompat({ userId: user.id, amount: 9.9, periodDays: 0, status: 'PENDING' });
    const paymentId = `credits_${sub.id}_140`;
    await updateSubscriptionCompat(sub.id, {
      mpPaymentId: paymentId,
      pixQrCode: 'BRCODE',
      pixQrBase64: 'data:image/png;base64,QQ==',
      pixExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
      pixCredits: 140,
    });

    // charge.status empty → handler skips the payload-status filter, still verifies provider.
    fetchMock().mockResolvedValueOnce(openpixNotPaid());
    const r = await api().post('/api/webhooks/openpix').send({
      event: 'CHARGE_COMPLETED',
      charge: { correlationID: paymentId, value: 990 },
      payment: { value: 990 },
    });
    expect(r.status).toBe(400);
    expect(await getUserCredits(user.id)).toBe(0);
  });

  it('Asaas spoof: PENDING card payment + forged PAYMENT_RECEIVED → BLOCKED', async () => {
    const { user } = await createUser({ credits: 0 });
    const sub = await createSubscriptionCompat({ userId: user.id, amount: 9.9, periodDays: 0, status: 'PENDING' });
    const paymentId = `pay_${sub.id}`; // pay-card response field
    await updateSubscriptionCompat(sub.id, {
      mpPaymentId: paymentId,
      pixQrCode: 'EMV',
      pixQrBase64: 'data:image/png;base64,QQ==',
      pixExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
      pixCredits: 140,
    });

    // Header VÁLIDO de propósito: atesta que MESMO com o token (vazamento interno) a
    // defesa seguinte (confirmação no provider) continua bloqueando o payload forjado.
    fetchMock().mockResolvedValueOnce(asaasNotPaid());
    const r = await api().post('/api/webhooks/asaas').set('asaas-access-token', 'asaas-test-key').send(asaasSpoof(paymentId, 9.9));
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('Pagamento não confirmado no provider.');
    expect(await getUserCredits(user.id)).toBe(0);
  });

  it('PLAN spoof: forged COMPLETED webhook for monthly plan → BLOCKED (no planExpiresAt)', async () => {
    const { user } = await createUser({ credits: 0 });
    const sub = await createSubscriptionCompat({ userId: user.id, amount: 19.9, periodDays: 30, status: 'PENDING' });
    const paymentId = `plan_${sub.id}`;
    await updateSubscriptionCompat(sub.id, {
      mpPaymentId: paymentId,
      pixQrCode: 'BRCODE',
      pixQrBase64: 'data:image/png;base64,QQ==',
      pixExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
      pixCredits: 300,
    });

    fetchMock().mockResolvedValueOnce(openpixNotPaid());
    const r = await api().post('/api/webhooks/openpix').send(openpixSpoof(paymentId, 1990));
    expect(r.status).toBe(400);
    const u = await prisma.user.findUnique({ where: { id: user.id }, select: { planExpiresAt: true, credits: true } });
    expect(u?.planExpiresAt).toBeNull();
    expect(u?.credits).toBe(0);
  });

  it('CONTROL: when the provider DOES confirm, the same webhook approves — chain otherwise viable', async () => {
    const { user } = await createUser({ credits: 0 });
    const sub = await createSubscriptionCompat({ userId: user.id, amount: 9.9, periodDays: 0, status: 'PENDING' });
    const paymentId = `credits_${sub.id}_140`;
    await updateSubscriptionCompat(sub.id, {
      mpPaymentId: paymentId,
      pixQrCode: 'BRCODE',
      pixQrBase64: 'data:image/png;base64,QQ==',
      pixExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
      pixCredits: 140,
    });

    fetchMock().mockResolvedValueOnce(openpixPaid());
    const r = await api().post('/api/webhooks/openpix').send(openpixSpoof(paymentId, 990));
    expect(r.status).toBe(200);
    expect(r.body.approved).toBe(true);
    expect(await getUserCredits(user.id)).toBe(140);
  });

  it('INFO LEAK (chain enabler): /billing/pending-payment returns the paymentId (= correlationID) to the owner', async () => {
    const { user, token } = await createUser({ credits: 0 });
    const sub = await createSubscriptionCompat({ userId: user.id, amount: 9.9, periodDays: 0, status: 'PENDING' });
    const paymentId = `credits_${sub.id}_140`;
    await updateSubscriptionCompat(sub.id, {
      mpPaymentId: paymentId,
      pixQrCode: 'BRCODE',
      pixQrBase64: 'data:image/png;base64,QQ==',
      pixExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
      pixCredits: 140,
    });
    const r = await api().get('/api/billing/pending-payment').set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(r.body.hasPending).toBe(true);
    expect(r.body.paymentId).toBe(paymentId);
  });

  it('MISSING CONFIG: no OPENPIX_APP_ID/ASAAS_API_KEY → fail CLOSED (400), never blind-approves', async () => {
    const orig = process.env.OPENPIX_APP_ID;
    process.env.OPENPIX_APP_ID = '';
    const { user } = await createUser({ credits: 0 });
    const sub = await createSubscriptionCompat({ userId: user.id, amount: 9.9, periodDays: 0, status: 'PENDING' });
    const paymentId = `credits_${sub.id}_140`;
    await updateSubscriptionCompat(sub.id, {
      mpPaymentId: paymentId,
      pixQrCode: 'BRCODE',
      pixQrBase64: 'data:image/png;base64,QQ==',
      pixExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
      pixCredits: 140,
    });
    const r = await api().post('/api/webhooks/openpix').send(openpixSpoof(paymentId, 990));
    expect(r.status).toBe(400);
    expect(await getUserCredits(user.id)).toBe(0);
    process.env.OPENPIX_APP_ID = orig;
  });
});