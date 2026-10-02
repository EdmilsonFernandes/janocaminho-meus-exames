// E2E do webhook OpenPix (POST /api/webhooks/openpix): aprova créditos via
// correlationID, idempotente no reenvio, ignora correlationID inexistente e
// RECUSA valor divergente (defesa — OpenPix não tem assinatura nativa).
// Vitest roda sequencial (fileParallelism:false) — DB de teste compartilhado.
import { describe, it, expect, beforeEach } from 'vitest';
import { api, resetDb, createUser, getUserCredits } from './helpers';
import { prisma } from '../src/prisma';
import { createSubscriptionCompat, updateSubscriptionCompat, resetSubscriptionColumnsCacheForTests } from '../src/utils/subscriptionCompat';

/** Simula o buy-credits PIX no provider openpix: Subscription PENDING + mpPaymentId=correlationID. */
async function createPendingPixCredits(userId: string, price: number, credits: number) {
  const sub = await createSubscriptionCompat({ userId, amount: price, periodDays: 0, status: 'PENDING' });
  const correlationID = `credits_${sub.id}_${credits}`;
  await updateSubscriptionCompat(sub.id, {
    mpPaymentId: correlationID,
    pixQrCode: 'BRCODE',
    pixQrBase64: 'data:image/png;base64,QQ==',
    pixExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
    pixCredits: credits,
  });
  return { sub, correlationID };
}

const openpixPayload = (correlationID: string, valueCents: number, status = 'COMPLETED') => ({
  event: 'CHARGE_COMPLETED',
  charge: { correlationID, status, value: valueCents },
  payment: { status, value: valueCents },
});

describe('webhook OpenPix: aprovação de PIX por correlationID', () => {
  beforeEach(async () => {
    await resetDb();
    resetSubscriptionColumnsCacheForTests();
  });

  it('evento COMPLETED com valor correto → credita créditos + APPROVED', async () => {
    const { user } = await createUser({ credits: 0 });
    const { sub, correlationID } = await createPendingPixCredits(user.id, 9.9, 140);

    const r = await api().post('/api/webhooks/openpix').send(openpixPayload(correlationID, 990));
    expect(r.status).toBe(200);
    expect(r.body.approved).toBe(true);

    const dbSub = await prisma.subscription.findUnique({ where: { id: sub.id }, select: { status: true, mpPaymentId: true } });
    expect(dbSub?.status).toBe('APPROVED');
    expect(dbSub?.mpPaymentId).toBe(correlationID);
    expect(await getUserCredits(user.id)).toBe(140);
    const tx = await prisma.creditTransaction.findFirst({ where: { userId: user.id, kind: 'purchase' }, select: { delta: true, refId: true } });
    expect(tx?.delta).toBe(140);
    expect(tx?.refId).toBe(sub.id);
  });

  it('idempotente: reenvio do MESMO webhook NÃO credita 2x', async () => {
    const { user } = await createUser({ credits: 0 });
    const { correlationID } = await createPendingPixCredits(user.id, 9.9, 140);

    await api().post('/api/webhooks/openpix').send(openpixPayload(correlationID, 990));
    const r2 = await api().post('/api/webhooks/openpix').send(openpixPayload(correlationID, 990));
    expect(r2.status).toBe(200);
    expect(r2.body.approved).toBeUndefined(); // ignorado (já APPROVED)
    expect(await getUserCredits(user.id)).toBe(140); // não virou 280
  });

  it('correlationID inexistente → ignorado (200-ack), nada credita', async () => {
    const { user } = await createUser({ credits: 5 });
    const r = await api().post('/api/webhooks/openpix').send(openpixPayload('credits_inexistente_999', 990));
    expect(r.status).toBe(200);
    expect(r.body.ignored).toBeTruthy();
    expect(await getUserCredits(user.id)).toBe(5);
  });

  it('valor divergente do registrado → RECUSADO (sem assinatura nativa, valor é a defesa)', async () => {
    const { user } = await createUser({ credits: 0 });
    const { sub, correlationID } = await createPendingPixCredits(user.id, 9.9, 140);

    const r = await api().post('/api/webhooks/openpix').send(openpixPayload(correlationID, 100)); // ≠ 990
    expect(r.status).toBe(200);
    expect(r.body.ignored).toBe('valor divergente');
    const dbSub = await prisma.subscription.findUnique({ where: { id: sub.id }, select: { status: true } });
    expect(dbSub?.status).toBe('PENDING'); // segue pendente
    expect(await getUserCredits(user.id)).toBe(0);
  });

  it('status não-COMPLETED → ignorado', async () => {
    const { user } = await createUser({ credits: 0 });
    const { correlationID } = await createPendingPixCredits(user.id, 9.9, 140);
    const r = await api().post('/api/webhooks/openpix').send(openpixPayload(correlationID, 990, 'ACTIVE'));
    expect(r.status).toBe(200);
    expect(r.body.ignored).toContain('ACTIVE');
    expect(await getUserCredits(user.id)).toBe(0);
  });

  it('pacote de API (tag api_pack) → credita CHAMADAS no ledger, não créditos do app', async () => {
    const { user } = await createUser({ credits: 0 });
    const sub = await createSubscriptionCompat({ userId: user.id, amount: 25, periodDays: 0, status: 'PENDING' });
    const correlationID = `api_${sub.id}_500`;
    await updateSubscriptionCompat(sub.id, { mpPreferenceId: 'api_pack', mpPaymentId: correlationID, pixCredits: 500, pixExpiresAt: new Date(Date.now() + 5 * 60 * 1000) });

    const r = await api().post('/api/webhooks/openpix').send(openpixPayload(correlationID, 2500));
    expect(r.status).toBe(200);
    expect(r.body.approved).toBe(true);
    expect(await getUserCredits(user.id)).toBe(0); // créditos de IA intactos
    const tx = await prisma.creditTransaction.findFirst({ where: { userId: user.id, kind: 'api_pack' }, select: { delta: true } });
    expect(tx?.delta).toBe(500);
  });
});
