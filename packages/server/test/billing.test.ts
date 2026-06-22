import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { api, authHeader, resetDb, createUser, getUserCredits, mpResponse } from './helpers';
import { prisma } from '../src/prisma';

const fetchMock = () => globalThis.fetch as unknown as Mock;

describe('billing: planos, webhook (idempotente), compra de créditos', () => {
  beforeEach(async () => {
    await resetDb();
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
    const sub = await prisma.subscription.create({
      data: { userId: user.id, amount: 19.9, periodDays: 30, status: 'PENDING' },
    });
    fetchMock().mockResolvedValueOnce(mpResponse({ status: 'approved', external_reference: sub.id }));

    const r = await api().post('/api/billing/webhook').send({ type: 'payment', data: { id: 'pay1' } });
    expect(r.status).toBe(200);

    const dbSub = await prisma.subscription.findUnique({ where: { id: sub.id } });
    expect(dbSub?.status).toBe('APPROVED');
    expect(await getUserCredits(user.id)).toBe(250);
    const u = await prisma.user.findUnique({ where: { id: user.id } });
    expect(u?.planExpiresAt).toBeTruthy();
    expect(u!.planExpiresAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it('webhook é idempotente: 2ª chamada NÃO credita de novo', async () => {
    const { user } = await createUser({ credits: 0 });
    const sub = await prisma.subscription.create({
      data: { userId: user.id, amount: 19.9, periodDays: 30, status: 'PENDING' },
    });
    const approved = mpResponse({ status: 'approved', external_reference: sub.id });
    fetchMock().mockResolvedValue(approved);

    await api().post('/api/billing/webhook').send({ type: 'payment', data: { id: 'pay1' } });
    await api().post('/api/billing/webhook').send({ type: 'payment', data: { id: 'pay1' } });
    expect(await getUserCredits(user.id)).toBe(250); // não virou 500
  });

  it('webhook de PACOTE (external_reference subId|credits) credita N créditos', async () => {
    const { user } = await createUser({ credits: 0 });
    const sub = await prisma.subscription.create({
      data: { userId: user.id, amount: 9.9, periodDays: 0, status: 'PENDING' },
    });
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
});
