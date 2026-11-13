import { describe, it, expect, beforeEach } from 'vitest';
import { api, authHeader, createUser, resetDb } from './helpers';
import { prisma } from '../src/prisma';

describe('registro de aplicações do Radar Hormonal', () => {
  beforeEach(async () => { await resetDb(); });

  const post = (token: string, body: Record<string, unknown>) => api().post('/api/hormone-doses').set(authHeader(token)).send(body);

  it('exige login', async () => {
    expect((await api().get('/api/hormone-doses')).status).toBe(401);
  });

  it('registra, lista da mais recente para a mais antiga e apaga', async () => {
    const { token } = await createUser();
    const old = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const a = await post(token, { compoundId: 'test_cyp', doseMg: 200, takenAt: old });
    const b = await post(token, { compoundId: 'test_cyp', doseMg: 200.004 });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(b.body.doseMg).toBe(200);

    const list = await api().get('/api/hormone-doses').set(authHeader(token));
    expect(list.status).toBe(200);
    expect(list.body.items.map((i: { id: string }) => i.id)).toEqual([b.body.id, a.body.id]);
    expect(list.body.items[0]).not.toHaveProperty('ownerId');

    const del = await api().delete(`/api/hormone-doses/${a.body.id}`).set(authHeader(token));
    expect(del.status).toBe(200);
    expect(await prisma.hormoneDose.count()).toBe(1);
  });

  it.each([
    ['composto fora do catálogo', { compoundId: 'cocaina', doseMg: 100 }],
    ['composto herdado do protótipo do objeto', { compoundId: 'toString', doseMg: 100 }],
    ['dose zero', { compoundId: 'test_cyp', doseMg: 0 }],
    ['dose absurda', { compoundId: 'test_cyp', doseMg: 50_000 }],
    ['dose não numérica', { compoundId: 'test_cyp', doseMg: 'muito' }],
    ['data no futuro', { compoundId: 'test_cyp', doseMg: 100, takenAt: new Date(Date.now() + 5 * 86_400_000).toISOString() }],
    ['data antiga demais', { compoundId: 'test_cyp', doseMg: 100, takenAt: '2019-01-01T12:00:00Z' }],
    ['data inválida', { compoundId: 'test_cyp', doseMg: 100, takenAt: 'ontem' }],
  ])('recusa %s', async (_name, body) => {
    const { token } = await createUser();
    expect((await post(token, body)).status).toBe(400);
    expect(await prisma.hormoneDose.count()).toBe(0);
  });

  it('um usuário não lê, não grava nem apaga registro de outro', async () => {
    const owner = await createUser();
    const other = await createUser();
    const mine = await post(owner.token, { compoundId: 'nand_dec', doseMg: 250 });
    expect(mine.status).toBe(201);

    const theirs = await api().get('/api/hormone-doses').set(authHeader(other.token));
    expect(theirs.body.items).toEqual([]);

    const peek = await api().get(`/api/hormone-doses?patientId=${mine.body.patientId}`).set(authHeader(other.token));
    expect(peek.status).toBe(404);

    const write = await post(other.token, { patientId: mine.body.patientId, compoundId: 'nand_dec', doseMg: 250 });
    expect(write.status).toBe(404);

    const del = await api().delete(`/api/hormone-doses/${mine.body.id}`).set(authHeader(other.token));
    expect(del.status).toBe(404);
    expect(await prisma.hormoneDose.count()).toBe(1);
  });
});
