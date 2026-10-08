// E2E do webhook Asaas (POST /api/webhooks/asaas): aprova por payment.id ("pay_..."),
// idempotente no reenvio, ignora id inexistente/evento não-recebido e RECUSA valor
// divergente (mesma defesa do OpenPix — payload não vem assinado) e pagamento NÃO
// confirmado na API do provider (verificação server-side — audit #1).
// Vitest roda sequencial (fileParallelism:false) — DB de teste compartilhado.
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { api, resetDb, createUser, getUserCredits, mpResponse } from './helpers';
import { prisma } from '../src/prisma';
import { createSubscriptionCompat, updateSubscriptionCompat, resetSubscriptionColumnsCacheForTests } from '../src/utils/subscriptionCompat';

const fetchMock = () => globalThis.fetch as unknown as Mock;

/** Resposta do GET /v3/payments/{id} no Asaas. */
const asaasPaymentApi = (status: string) => mpResponse({ id: 'pay_x', value: 9.9, status });

/** Simula o buy-credits PIX no provider asaas: Subscription PENDING + mpPaymentId=pay_*. */
async function createPendingAsaasPix(userId: string, price: number, credits: number) {
  const sub = await createSubscriptionCompat({ userId, amount: price, periodDays: 0, status: 'PENDING' });
  const paymentId = `pay_${sub.id}`;
  await updateSubscriptionCompat(sub.id, {
    mpPaymentId: paymentId,
    pixQrCode: 'EMV-ASAAS',
    pixQrBase64: 'data:image/png;base64,QQ==',
    pixExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
    pixCredits: credits,
  });
  return { sub, paymentId };
}

/** Payload oficial (prova ao vivo 03/10): value EM REAIS float (não centavos). */
const asaasPayload = (paymentId: string, valueBrl: number, status = 'RECEIVED') => ({
  event: 'PAYMENT_RECEIVED',
  payment: { id: paymentId, value: valueBrl, status },
});

describe('webhook Asaas: aprovação de PIX por payment.id', () => {
  beforeEach(async () => {
    await resetDb();
    resetSubscriptionColumnsCacheForTests();
    // Provider NÃO confirma por padrão (fail-closed): quem aprova mocka RECEIVED explicitamente.
    fetchMock().mockClear();
    fetchMock().mockResolvedValue(mpResponse({}));
  });

  it('PAYMENT_RECEIVED com valor correto → credita créditos + APPROVED', async () => {
    const { user } = await createUser({ credits: 0 });
    const { sub, paymentId } = await createPendingAsaasPix(user.id, 9.9, 140);

    fetchMock().mockResolvedValueOnce(asaasPaymentApi('RECEIVED'));
    const r = await api().post('/api/webhooks/asaas').send(asaasPayload(paymentId, 9.9));
    expect(r.status).toBe(200);
    expect(r.body.approved).toBe(true);

    const dbSub = await prisma.subscription.findUnique({ where: { id: sub.id }, select: { status: true, mpPaymentId: true } });
    expect(dbSub?.status).toBe('APPROVED');
    expect(dbSub?.mpPaymentId).toBe(paymentId);
    expect(await getUserCredits(user.id)).toBe(140);
    const tx = await prisma.creditTransaction.findFirst({ where: { userId: user.id, kind: 'purchase' }, select: { delta: true, refId: true } });
    expect(tx?.delta).toBe(140);
    expect(tx?.refId).toBe(sub.id);
  });

  it('idempotente: reenvio do MESMO webhook NÃO credita 2x', async () => {
    const { user } = await createUser({ credits: 0 });
    const { paymentId } = await createPendingAsaasPix(user.id, 9.9, 140);

    fetchMock().mockResolvedValueOnce(asaasPaymentApi('RECEIVED'));
    await api().post('/api/webhooks/asaas').send(asaasPayload(paymentId, 9.9));
    const r2 = await api().post('/api/webhooks/asaas').send(asaasPayload(paymentId, 9.9));
    expect(r2.status).toBe(200);
    expect(r2.body.approved).toBeUndefined(); // ignorado (já APPROVED)
    expect(await getUserCredits(user.id)).toBe(140); // não virou 280
  });

  it('payment.id inexistente → ignorado (200-ack), nada credita', async () => {
    const { user } = await createUser({ credits: 5 });
    const r = await api().post('/api/webhooks/asaas').send(asaasPayload('pay_fantasma', 9.9));
    expect(r.status).toBe(200);
    expect(r.body.ignored).toBeTruthy();
    expect(await getUserCredits(user.id)).toBe(5);
  });

  it('valor divergente do registrado → RECUSADO (valor é a defesa — payload sem assinatura)', async () => {
    const { user } = await createUser({ credits: 0 });
    const { sub, paymentId } = await createPendingAsaasPix(user.id, 9.9, 140);

    const r = await api().post('/api/webhooks/asaas').send(asaasPayload(paymentId, 1.0)); // ≠ 9.90
    expect(r.status).toBe(200);
    expect(r.body.ignored).toBe('valor divergente');
    const dbSub = await prisma.subscription.findUnique({ where: { id: sub.id }, select: { status: true } });
    expect(dbSub?.status).toBe('PENDING'); // segue pendente
    expect(await getUserCredits(user.id)).toBe(0);
  });

  it('evento não-recebido (PAYMENT_CREATED) → ignorado', async () => {
    const { user } = await createUser({ credits: 0 });
    const { paymentId } = await createPendingAsaasPix(user.id, 9.9, 140);
    const r = await api().post('/api/webhooks/asaas').send({
      event: 'PAYMENT_CREATED',
      payment: { id: paymentId, value: 9.9, status: 'PENDING' },
    });
    expect(r.status).toBe(200);
    expect(r.body.ignored).toContain('PAYMENT_CREATED');
    expect(await getUserCredits(user.id)).toBe(0);
  });

  it('pacote de API (tag api_pack) → credita CHAMADAS no ledger, não créditos do app', async () => {
    const { user } = await createUser({ credits: 0 });
    const sub = await createSubscriptionCompat({ userId: user.id, amount: 25, periodDays: 0, status: 'PENDING' });
    const paymentId = `pay_${sub.id}`;
    await updateSubscriptionCompat(sub.id, { mpPreferenceId: 'api_pack', mpPaymentId: paymentId, pixCredits: 500, pixExpiresAt: new Date(Date.now() + 5 * 60 * 1000) });

    fetchMock().mockResolvedValueOnce(asaasPaymentApi('RECEIVED'));
    const r = await api().post('/api/webhooks/asaas').send(asaasPayload(paymentId, 25));
    expect(r.status).toBe(200);
    expect(r.body.approved).toBe(true);
    expect(await getUserCredits(user.id)).toBe(0); // créditos de IA intactos
    const tx = await prisma.creditTransaction.findFirst({ where: { userId: user.id, kind: 'api_pack' }, select: { delta: true } });
    expect(tx?.delta).toBe(500);
  });

  it('VERIFICAÇÃO SERVER-SIDE: pagamento NÃO confirmado no provider → 400, NÃO aprova (anti-spoof)', async () => {
    const { user } = await createUser({ credits: 0 });
    const { sub, paymentId } = await createPendingAsaasPix(user.id, 9.9, 140);

    // Payload de webhook PERFEITO (evento/valor corretos), mas o provider diz que o
    // payment segue PENDING — é exatamente o caso do webhook FORJADO (spoof).
    fetchMock().mockResolvedValueOnce(asaasPaymentApi('PENDING'));
    const r = await api().post('/api/webhooks/asaas').send(asaasPayload(paymentId, 9.9));
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('Pagamento não confirmado no provider.');
    const dbSub = await prisma.subscription.findUnique({ where: { id: sub.id }, select: { status: true } });
    expect(dbSub?.status).toBe('PENDING'); // NADA aprovado
    expect(await getUserCredits(user.id)).toBe(0);
    // Consultou o provider com auth access_token (mesmo header do asaas-provider)
    expect(fetchMock()).toHaveBeenCalledWith(
      expect.stringContaining(`/v3/payments/${paymentId}`),
      expect.objectContaining({ headers: { access_token: 'asaas-test-key' } }),
    );
  });

  it('VERIFICAÇÃO SERVER-SIDE: provider fora do ar (não-ok) → 400, NÃO aprova (fail closed)', async () => {
    const { user } = await createUser({ credits: 0 });
    const { sub, paymentId } = await createPendingAsaasPix(user.id, 9.9, 140);

    fetchMock().mockResolvedValueOnce(mpResponse({}, { ok: false, status: 502 }));
    const r = await api().post('/api/webhooks/asaas').send(asaasPayload(paymentId, 9.9));
    expect(r.status).toBe(400);
    const dbSub = await prisma.subscription.findUnique({ where: { id: sub.id }, select: { status: true } });
    expect(dbSub?.status).toBe('PENDING');
    expect(await getUserCredits(user.id)).toBe(0);
  });

  it('status CONFIRMED no provider também aprova (dinheiro recebido em variante aceita)', async () => {
    const { user } = await createUser({ credits: 0 });
    const { paymentId } = await createPendingAsaasPix(user.id, 9.9, 140);

    fetchMock().mockResolvedValueOnce(asaasPaymentApi('CONFIRMED'));
    const r = await api().post('/api/webhooks/asaas').send(asaasPayload(paymentId, 9.9));
    expect(r.status).toBe(200);
    expect(r.body.approved).toBe(true);
    expect(await getUserCredits(user.id)).toBe(140);
  });
});
