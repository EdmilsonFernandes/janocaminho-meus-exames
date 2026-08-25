import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { api, authHeader, resetDb, createUser } from './helpers';
import { prisma } from '../src/prisma';
import { hashKey } from '../src/middleware/apiKey';

/**
 * E2E da API PÚBLICA v1 (Fase 1 — monetização por API):
 * key lifecycle (cria 1x/mostra prefixo/revoga), auth por x-api-key, busca de catálogo,
 * preços por snapshot (com stale honesto), interações D/X com alias, e cota mensal
 * (ledger kind api_call — o mesmo motor de créditos do app).
 */

async function createKey(token: string, name = 'Integração teste'): Promise<{ id: string; key: string }> {
  const r = await api().post('/api/public/v1/keys').set(authHeader(token)).send({ name });
  expect(r.status).toBe(201);
  return { id: r.body.id, key: r.body.key };
}

async function seedCatalogAndPrices() {
  await prisma.medicationCatalogEntry.create({
    data: {
      name: 'Losartana Potássica', activeIngredient: 'LOSARTANA POTASSICA', brands: ['Cozaar'], doses: ['50 mg'],
      photoUrl: null, priceCents: 989, productName: 'Losartana Potássica 50mg 30cp Genérico',
      productUrl: 'https://exemplo.com', pharmacy: 'Pague Menos', ean: '7891058001231', offersCount: 3,
    },
  });
  const snap = await prisma.medicationPriceSnapshot.create({
    data: {
      medicationKey: 'LOSARTANA POTASSICA|50MG|CP|30', locationKey: 'BR',
      lowestPriceCents: 989, averagePriceCents: 1290, offersCount: 3, provider: 'vtex',
      collectedAt: new Date(), expiresAt: new Date(Date.now() + 2 * 3600_000),
    },
  });
  await prisma.medicationPriceOffer.create({
    data: { snapshotId: snap.id, pharmacy: 'Pague Menos', productName: 'Losartana 50mg 30cp', priceCents: 989, url: 'https://exemplo.com/1', ean: '7891058001231' },
  });
}

async function seedInteractions() {
  await prisma.interactionRule.create({
    data: {
      // Canon do dicionário: "losartana" vira LOSARTAN (alias) — a regra usa o canônico.
      drugA: 'LOSARTAN', drugB: 'VARFARINA', severity: 'D',
      effect: 'Aumento do efeito anticoagulante', recommendation: 'Monitorar INR', source: 'base curada',
    },
  });
  await prisma.interactionRule.create({
    data: {
      drugA: 'DIPIRIDAMOL', drugB: 'VARFARINA', severity: 'B',
      effect: 'Risco hemorrágico leve', recommendation: 'Observação', source: 'base curada',
    },
  });
}

describe('API pública v1 — Fase 1', () => {
  beforeEach(async () => { await resetDb(); });

  it('sem key → 401; info pública funciona sem key', async () => {
    const noKey = await api().get('/api/public/v1/meds?q=losartana');
    expect(noKey.status).toBe(401);
    const info = await api().get('/api/public/v1/');
    expect(info.status).toBe(200);
    expect(info.body.docs).toBe('/api/docs');
    expect(info.body.tier.monthlyCalls).toBeGreaterThan(0);
  });

  it('key inválida/revogada → 401', async () => {
    const bad = await api().get('/api/public/v1/meds?q=a').set('x-api-key', 'dxk_live_naoexiste');
    expect(bad.status).toBe(401);
    const { token } = await createUser({});
    const { id, key } = await createKey(token);
    await api().delete(`/api/public/v1/keys/${id}`).set(authHeader(token));
    const revoked = await api().get('/api/public/v1/meds?q=a').set('x-api-key', key);
    expect(revoked.status).toBe(401);
  });

  it('POST /keys devolve a chave UMA vez; GET lista só prefixo (nunca a chave)', async () => {
    const { token } = await createUser({});
    const { id, key } = await createKey(token, 'Portal X');
    expect(key).toMatch(/^dxk_live_[0-9a-f]{48}$/);
    // hash guardado, não a chave
    const row = await prisma.apiKey.findUnique({ where: { id } });
    expect(row?.keyHash).toBe(hashKey(key));
    expect(row?.keyHash).not.toBe(key);
    const list = await api().get('/api/public/v1/keys').set(authHeader(token));
    expect(list.status).toBe(200);
    expect(list.body.keys[0].prefix).toMatch(/^dxk_/);
    expect(JSON.stringify(list.body)).not.toContain(key);
  });

  it('máx. 5 chaves ativas por usuário', async () => {
    const { token } = await createUser({});
    for (let i = 0; i < 5; i++) await createKey(token, `k${i}`);
    const sixth = await api().post('/api/public/v1/keys').set(authHeader(token)).send({ name: 'sexta' });
    expect(sixth.status).toBe(429);
  });

  it('GET /meds busca catálogo com preço cacheado', async () => {
    await seedCatalogAndPrices();
    const { token } = await createUser({});
    const { key } = await createKey(token);
    const r = await api().get('/api/public/v1/meds?q=losartana').set('x-api-key', key);
    expect(r.status).toBe(200);
    expect(r.body.count).toBe(1);
    expect(r.body.results[0].activeIngredient).toBe('LOSARTANA POTASSICA');
    expect(r.body.results[0].bestPriceCents).toBe(989);
    // sem termo/curto → 400
    expect((await api().get('/api/public/v1/meds').set('x-api-key', key)).status).toBe(400);
    expect((await api().get('/api/public/v1/meds?q=l').set('x-api-key', key)).status).toBe(400);
  });

  it('GET /meds/prices devolve snapshot com ofertas; 404 quando não tem', async () => {
    await seedCatalogAndPrices();
    const { token } = await createUser({});
    const { key } = await createKey(token);
    const r = await api().get('/api/public/v1/meds/prices?ingredient=losartana%20potassica&dose=50&unit=MG').set('x-api-key', key);
    expect(r.status).toBe(200);
    expect(r.body.medicationKey).toBe('LOSARTANA POTASSICA|50MG|CP|30');
    expect(r.body.stale).toBe(false); // coleta agora
    expect(r.body.offers[0].priceCents).toBe(989);
    const nf = await api().get('/api/public/v1/meds/prices?ingredient=sildenafil').set('x-api-key', key);
    expect(nf.status).toBe(404);
  });

  it('GET /meds/interactions: D/X por default (alias resolvido), ?all=1 inclui B', async () => {
    await seedInteractions();
    const { token } = await createUser({});
    const { key } = await createKey(token);
    // LEVOID (alias de LEVOTIROXINA) garante que alias não quebra o par losartana+varfarina
    const r = await api().get('/api/public/v1/meds/interactions?drugs=losartana,varfarina,levoid').set('x-api-key', key);
    expect(r.status).toBe(200);
    expect(r.body.count).toBe(1); // só a D
    expect(r.body.interactions[0].severity).toBe('D');
    const all = await api().get('/api/public/v1/meds/interactions?drugs=dipiridamol,varfarina&all=1').set('x-api-key', key);
    expect(all.body.count).toBe(1);
    expect(all.body.interactions[0].severity).toBe('B');
  });

  it('cota mensal: estoura o freeMonthly → 429 com quota_exceeded', async () => {
    await seedCatalogAndPrices();
    const { user, token } = await createUser({});
    const { key } = await createKey(token);
    // Enche o ledger com 100 chamadas "já feitas" neste mês
    await prisma.creditTransaction.createMany({
      data: Array.from({ length: 100 }, (_, i) => ({
        userId: user.id, delta: 0, kind: 'api_call', label: `GET /test ${i}`,
      })),
    });
    const r = await api().get('/api/public/v1/meds?q=losartana').set('x-api-key', key);
    expect(r.status).toBe(429);
    expect(r.body.error).toBe('quota_exceeded');
  });
});
