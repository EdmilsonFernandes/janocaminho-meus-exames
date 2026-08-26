import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { api, authHeader, resetDb, createUser, mpResponse } from './helpers';
import { prisma } from '../src/prisma';
import type { Mock } from 'vitest/mocks';

/**
 * E2E da API pública v1.2 (Fases 1-4 da expansão B2B — ver marketing/api-b2b-expansao.md):
 *  - /meds/normalize: texto sujo → chave canônica (alias marca→genérico, includePrices)
 *  - /exams/interpret: valor×faixa → flag/tone/label determinístico (grau, LDL contexto)
 *  - /exams/extract: custo PESADO (20 chamadas), 402 sem saldo, 503 sem IA → REEMBOLSO
 */

const fetchMock = () => globalThis.fetch as unknown as Mock;

async function approvedUser(): Promise<{ user: any; token: string }> {
  const { user, token } = await createUser({});
  const req = await prisma.apiAccessRequest.create({ data: { userId: user.id, company: 'Lab Teste', useCase: 'Digitar laudos no meu portal' } });
  await prisma.apiAccessRequest.update({ where: { id: req.id }, data: { status: 'approved', reviewedAt: new Date() } });
  await prisma.creditTransaction.create({ data: { userId: user.id, delta: 25, kind: 'api_grant', label: 'Pacote teste', refId: req.id } });
  return { user, token };
}

async function createKey(token: string): Promise<string> {
  const r = await api().post('/api/public/v1/keys').set(authHeader(token)).send({ name: 'v2 teste' });
  expect(r.status).toBe(201);
  return r.body.key as string;
}

async function balanceOf(userId: string): Promise<number> {
  const agg = await prisma.creditTransaction.aggregate({ where: { userId, kind: { in: ['api_grant', 'api_pack', 'api_call'] } }, _sum: { delta: true } });
  return agg._sum.delta ?? 0;
}

describe('API pública v1.2 — /meds/normalize', () => {
  beforeEach(async () => { await resetDb(); fetchMock().mockReset(); fetchMock().mockResolvedValue(mpResponse({})); });

  it('texto sujo → chave canônica completa (Dorflex)', async () => {
    const { token } = await approvedUser();
    const key = await createKey(token);
    const r = await api().post('/api/public/v1/meds/normalize').set('x-api-key', key).send({ text: 'Dorflex Analgésico e Relaxante Muscular 10 comprimidos', packQty: 10 });
    expect(r.status).toBe(200);
    expect(r.body.activeIngredient).toBe('DORFLEX ANALGESICO E RELAXANTE');
    expect(r.body.medicationKey).toBe('DORFLEX ANALGESICO E RELAXANTE|10MG|CP|10');
    expect(r.body.comparable).toBe(true);
    expect(r.body.dosage.value).toBe(10);
  });

  it('marca → canônico via alias (Levoid → LEVOTIROXINA)', async () => {
    const { token } = await approvedUser();
    const key = await createKey(token);
    const r = await api().post('/api/public/v1/meds/normalize').set('x-api-key', key).send({ text: 'Levoid 75mcg' });
    expect(r.status).toBe(200);
    expect(r.body.brandResolved).toEqual({ from: 'LEVOID', to: 'LEVOTIROXINA' });
    expect(r.body.activeIngredient).toBe('LEVOTIROXINA');
  });

  it('includePrices traz o snapshot do ingrediente', async () => {
    const { token } = await approvedUser();
    const key = await createKey(token);
    await prisma.medicationPriceSnapshot.create({
      data: { medicationKey: 'LEVOTIROXINA|75MCG|CP|30', locationKey: 'BR', lowestPriceCents: 989, averagePriceCents: 1290, offersCount: 3, provider: 'vtex', collectedAt: new Date(), expiresAt: new Date(Date.now() + 3600_000) },
    });
    const r = await api().post('/api/public/v1/meds/normalize').set('x-api-key', key).send({ text: 'Levoid 75mcg', includePrices: true });
    expect(r.status).toBe(200);
    expect(r.body.prices).toMatchObject({ lowestPriceCents: 989, offersCount: 3 });
  });

  it('texto curto → 400; sem key → 401', async () => {
    const no = await api().post('/api/public/v1/meds/normalize').send({ text: 'losartana 50mg' });
    expect(no.status).toBe(401);
    const { token } = await approvedUser();
    const key = await createKey(token);
    const r = await api().post('/api/public/v1/meds/normalize').set('x-api-key', key).send({ text: 'a' });
    expect(r.status).toBe(400);
  });
});

describe('API pública v1.2 — /exams/interpret', () => {
  beforeEach(async () => { await resetDb(); fetchMock().mockReset(); fetchMock().mockResolvedValue(mpResponse({})); });

  it('direção + grau + resumo (TSH 4,4 = acima; hemoglobina normal; ácido úrico muito alto)', async () => {
    const { token } = await approvedUser();
    const key = await createKey(token);
    const r = await api().post('/api/public/v1/exams/interpret').set('x-api-key', key).send({
      items: [
        { name: 'TSH', value: 4.4, refLow: 0.4, refHigh: 4.0 }, // 10% além → atenção
        { name: 'Hemoglobina', value: 14, refLow: 12, refHigh: 16 },
        { name: 'Ácido Úrico', value: 12, refLow: 3.5, refHigh: 7.2 }, // >20% além → crítico
      ],
    });
    expect(r.status).toBe(200);
    const items = r.body.items;
    expect(items[0]).toMatchObject({ flag: 'HIGH', tone: 'atencao', label: 'Acima da referência' });
    expect(items[1]).toMatchObject({ flag: 'NORMAL', tone: 'normal' });
    expect(items[2]).toMatchObject({ flag: 'HIGH', tone: 'critico', label: 'Muito acima da referência' });
    expect(r.body.summary).toEqual({ total: 3, altered: 2, critical: 1 });
    expect(r.body.disclaimer).toMatch(/nunca diagnóstico/i);
  });

  it('sem faixa: LDL → contexto clínico; demais → referência não informada (nunca inventa)', async () => {
    const { token } = await approvedUser();
    const key = await createKey(token);
    const r = await api().post('/api/public/v1/exams/interpret').set('x-api-key', key).send({
      items: [{ name: 'LDL', value: 190 }, { name: 'Creatinina', value: 1.0 }],
    });
    expect(r.status).toBe(200);
    expect(r.body.items[0]).toMatchObject({ flag: 'UNKNOWN', tone: 'contexto' });
    expect(r.body.items[0].label).toMatch(/contexto clínico/);
    expect(r.body.items[1]).toMatchObject({ flag: 'UNKNOWN', tone: 'neutro' });
    expect(r.body.items[1].label).toMatch(/Referência não informada/);
  });

  it('items ausente → 400', async () => {
    const { token } = await approvedUser();
    const key = await createKey(token);
    const r = await api().post('/api/public/v1/exams/interpret').set('x-api-key', key).send({});
    expect(r.status).toBe(400);
  });
});

describe('API pública v1.2 — /exams/extract (custo pesado + reembolso)', () => {
  beforeEach(async () => { await resetDb(); fetchMock().mockReset(); fetchMock().mockResolvedValue(mpResponse({})); });

  it('IA indisponível/falhando → 502/503 E SALDO INTACTO (reembolso automático)', async () => {
    const { user, token } = await approvedUser();
    const key = await createKey(token);
    const r = await api().post('/api/public/v1/exams/extract').set('x-api-key', key).send({
      text: 'HEMOGRAMA COMPLETO\nHEMOGLOBINA 14,0 g/dL (12,0-16,0)\nHEMATÓCRITO 42% (36-46)\nLEUCÓCITOS 7.000/mm3 (4.000-10.000)\nTSH 7,32 µUI/mL (0,4-4,0)',
    });
    // 503 = sem chave IA (CI); 502 = IA configurada mas fetch mockado falha (local).
    expect([502, 503]).toContain(r.status);
    expect(r.body.message).toMatch(/não foi cobrado/i);
    expect(await balanceOf(user.id)).toBe(25); // não cobrou
  });

  it('saldo insuficiente p/ custo → 402 com custo e pacotes', async () => {
    const { user, token } = await createUser({});
    await prisma.apiAccessRequest.create({ data: { userId: user.id, company: 'X', useCase: 'Y', status: 'approved', reviewedAt: new Date() } });
    await prisma.creditTransaction.create({ data: { userId: user.id, delta: 5, kind: 'api_grant', label: 'curto' } });
    const kr = await api().post('/api/public/v1/keys').set(authHeader(token)).send({ name: 'k' });
    const r = await api().post('/api/public/v1/exams/extract').set('x-api-key', kr.body.key).send({ text: 'x'.repeat(80) });
    expect(r.status).toBe(402);
    expect(r.body.cost).toBeGreaterThanOrEqual(20);
    expect(r.body.packs.length).toBeGreaterThan(0);
  });

  it('payload inválido (texto curto) → 400 sem cobrança', async () => {
    const { user, token } = await approvedUser();
    const key = await createKey(token);
    const r = await api().post('/api/public/v1/exams/extract').set('x-api-key', key).send({ text: 'curto' });
    expect(r.status).toBe(400);
    expect(await balanceOf(user.id)).toBe(25);
  });
});
