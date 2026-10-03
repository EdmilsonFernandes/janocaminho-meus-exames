import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { api, authHeader, resetDb, createUser, getUserCredits, mpResponse } from './helpers';
import { prisma } from '../src/prisma';
import { createSubscriptionCompat, updateSubscriptionCompat, resetSubscriptionColumnsCacheForTests } from '../src/utils/subscriptionCompat';
import { cancelStalePendingPixes } from '../src/jobs/pix-expiry';

const fetchMock = () => globalThis.fetch as unknown as Mock;

describe('billing: planos, webhook (idempotente), compra de créditos', () => {
  beforeEach(async () => {
    await resetDb();
    resetSubscriptionColumnsCacheForTests();
    fetchMock().mockReset();
    fetchMock().mockResolvedValue(mpResponse({})); // default seguro p/ qualquer fetch
  });

  it('GET /billing/plans (público) devolve planos + custos + MP habilitado', async () => {
    const r = await api().get('/api/billing/plans');
    expect(r.status).toBe(200);
    expect(r.body.plans.length).toBeGreaterThan(0);
    expect(r.body.creditPacks.length).toBeGreaterThan(0);
    expect(r.body.creditCosts).toBeTruthy();
    expect(r.body.mercadoPagoEnabled).toBe(true);
  });

  it('GET /billing/status devolve créditos e contagem', async () => {
    const { user, token } = await createUser({ credits: 42 });
    const r = await api().get('/api/billing/status').set(authHeader(token));
    expect(r.status).toBe(200);
    expect(r.body.credits).toBe(42);
    expect(r.body.active).toBe(false);
    expect(r.body.examsCount).toBe(0);
  });

  it('webhook MENSAL aprova: ativa plano + 250 créditos', async () => {
    const { user } = await createUser({ credits: 0 });
    const sub = await createSubscriptionCompat({ userId: user.id, amount: 19.9, periodDays: 30, status: 'PENDING' });
    fetchMock().mockResolvedValueOnce(mpResponse({ status: 'approved', external_reference: sub.id }));

    const r = await api().post('/api/billing/webhook').send({ type: 'payment', data: { id: 'pay1' } });
    expect(r.status).toBe(200);

    const dbSub = await prisma.subscription.findUnique({ where: { id: sub.id }, select: { status: true } });
    expect(dbSub?.status).toBe('APPROVED');
    expect(await getUserCredits(user.id)).toBe(250);
    const u = await prisma.user.findUnique({ where: { id: user.id } });
    expect(u?.planExpiresAt).toBeTruthy();
    expect(u!.planExpiresAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it('webhook é idempotente: 2ª chamada NÃO credita de novo', async () => {
    const { user } = await createUser({ credits: 0 });
    const sub = await createSubscriptionCompat({ userId: user.id, amount: 19.9, periodDays: 30, status: 'PENDING' });
    const approved = mpResponse({ status: 'approved', external_reference: sub.id });
    fetchMock().mockResolvedValue(approved);

    await api().post('/api/billing/webhook').send({ type: 'payment', data: { id: 'pay1' } });
    await api().post('/api/billing/webhook').send({ type: 'payment', data: { id: 'pay1' } });
    expect(await getUserCredits(user.id)).toBe(250); // não virou 500
  });

  it('webhook de PACOTE (external_reference subId|credits) credita N créditos', async () => {
    const { user } = await createUser({ credits: 0 });
    const sub = await createSubscriptionCompat({ userId: user.id, amount: 9.9, periodDays: 0, status: 'PENDING' });
    fetchMock().mockResolvedValueOnce(mpResponse({ status: 'approved', external_reference: `${sub.id}|250` }));

    await api().post('/api/billing/webhook').send({ type: 'payment', data: { id: 'pay9' } });
    expect(await getUserCredits(user.id)).toBe(250);
  });

  it('POST /billing/checkout cria preferência MP (init_point)', async () => {
    const { token } = await createUser();
    fetchMock().mockResolvedValueOnce(mpResponse({ id: 'pref1', init_point: 'https://mp/sandbox' }));
    const r = await api().post('/api/billing/checkout').set(authHeader(token));
    expect(r.status).toBe(200);
    expect(r.body.init_point).toContain('mp');
    expect(r.body.subscriptionId).toBeTruthy();
  });

  it('POST /billing/buy-credits (PIX) devolve QR + créditos do pacote', async () => {
    const { token } = await createUser();
    fetchMock().mockResolvedValueOnce(mpResponse({
      id: 'pay123', status: 'pending',
      point_of_interaction: { transaction_data: { qr_code: 'COPYPASTE', qr_code_base64: 'AAAA' } },
    }));
    const r = await api().post('/api/billing/buy-credits').set(authHeader(token))
      .send({ pack: 'p140', method: 'pix' });
    expect(r.status).toBe(200);
    expect(r.body.qrCode).toBe('COPYPASTE');
    expect(r.body.credits).toBe(140);
  });

  // ===== LOCK 1-por-vez (dono 03/10): PIX PENDING vivo trava NOVA compra (409) =====

  /** Factory: Subscription PENDING de pacote com QR PIX persistido. */
  const createPendingPix = async (userId: string, opts: { expiresAt: Date; credits?: number } ) => {
    const sub = await createSubscriptionCompat({ userId, amount: 24.9, periodDays: 0, status: 'PENDING' });
    await updateSubscriptionCompat(sub.id, {
      mpPaymentId: 'pay-vivo', pixQrCode: 'PIXVIVO123', pixQrBase64: 'data:image/png;base64,AA==',
      pixExpiresAt: opts.expiresAt, pixCredits: opts.credits ?? 140,
    });
    return sub;
  };

  it('buy-credits com PIX PENDING não-expirado → 409 + pendingPix com o QR original (sem nova charge)', async () => {
    const { token, user } = await createUser();
    await createPendingPix(user.id, { expiresAt: new Date(Date.now() + 5 * 60 * 1000) });
    fetchMock().mockReset(); // nenhuma chamada a MP/OpenPix pode acontecer
    const r = await api().post('/api/billing/buy-credits').set(authHeader(token))
      .send({ pack: 'p320', method: 'pix' }); // OUTRO pack — o lock vale igual
    expect(r.status).toBe(409);
    expect(r.body.error).toContain('PIX pendente');
    expect(r.body.pendingPix.qrCode).toBe('PIXVIVO123'); // mesmo QR, mesmo timer
    expect(r.body.pendingPix.expiresAt).toBeTruthy();
    expect(r.body.pendingPix.credits).toBe(140);
    expect(fetchMock().mock.calls).toHaveLength(0); // não criou ordem nova em nenhum provider
  });

  it('buy-credits com PIX vivo trava TAMBÉM cartão/débito (usuário não troca de pack)', async () => {
    const { token, user } = await createUser();
    await createPendingPix(user.id, { expiresAt: new Date(Date.now() + 5 * 60 * 1000) });
    fetchMock().mockReset();
    const r = await api().post('/api/billing/buy-credits').set(authHeader(token))
      .send({ pack: 'p140', method: 'card' });
    expect(r.status).toBe(409);
    expect(r.body.pendingPix.qrCode).toBe('PIXVIVO123');
    expect(fetchMock().mock.calls).toHaveLength(0); // nem preferência MP abriu
  });

  it('PIX expirado >24h → auto-cancel (sweep) roda → pode comprar de novo (200)', async () => {
    const { token, user } = await createUser();
    const sub = await createPendingPix(user.id, { expiresAt: new Date(Date.now() - 25 * 60 * 60 * 1000) }); // órfão de ontem
    const cancelled = await cancelStalePendingPixes();
    expect(cancelled).toBeGreaterThanOrEqual(1);
    const dbSub = await prisma.subscription.findUnique({ where: { id: sub.id }, select: { status: true } });
    expect(dbSub?.status).toBe('CANCELLED'); // admin não vê PENDING eterno
    fetchMock().mockResolvedValueOnce(mpResponse({
      id: 'payNovo', status: 'pending',
      point_of_interaction: { transaction_data: { qr_code: 'PIXNOVO', qr_code_base64: 'AAAA' } },
    }));
    const r = await api().post('/api/billing/buy-credits').set(authHeader(token))
      .send({ pack: 'p140', method: 'pix' });
    expect(r.status).toBe(200);
    expect(r.body.qrCode).toBe('PIXNOVO');
  });

  it('DELETE /billing/pending/:id cancela o PIX pendente manualmente (e libera nova compra)', async () => {
    const { token, user } = await createUser();
    const sub = await createPendingPix(user.id, { expiresAt: new Date(Date.now() + 5 * 60 * 1000) });
    const other = await createUser(); // não é dono → 404 (ownership)
    const r403 = await api().delete(`/api/billing/pending/${sub.id}`).set(authHeader(other.token));
    expect(r403.status).toBe(404);

    const r = await api().delete(`/api/billing/pending/${sub.id}`).set(authHeader(token));
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('CANCELLED');
    const dbSub = await prisma.subscription.findUnique({ where: { id: sub.id }, select: { status: true } });
    expect(dbSub?.status).toBe('CANCELLED');

    // 2ª vez = idempotente-404 (já não é PENDING)
    const r2 = await api().delete(`/api/billing/pending/${sub.id}`).set(authHeader(token));
    expect(r2.status).toBe(404);

    // lock liberado: nova compra passa normal
    fetchMock().mockResolvedValueOnce(mpResponse({
      id: 'payPos', status: 'pending',
      point_of_interaction: { transaction_data: { qr_code: 'PIXPOS', qr_code_base64: 'AAAA' } },
    }));
    const rBuy = await api().post('/api/billing/buy-credits').set(authHeader(token))
      .send({ pack: 'p140', method: 'pix' });
    expect(rBuy.status).toBe(200);
  });

  it('GET /billing/pending-payment expõe o id do PIX pendente (p/ cancelar no app)', async () => {
    const { token, user } = await createUser();
    const sub = await createPendingPix(user.id, { expiresAt: new Date(Date.now() + 5 * 60 * 1000) });
    const r = await api().get('/api/billing/pending-payment').set(authHeader(token));
    expect(r.status).toBe(200);
    expect(r.body.hasPending).toBe(true);
    expect(r.body.id).toBe(sub.id);
  });
});
