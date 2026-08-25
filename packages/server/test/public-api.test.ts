import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { api, authHeader, resetDb, createUser, mpResponse } from './helpers';
import { prisma } from '../src/prisma';
import { hashKey } from '../src/middleware/apiKey';
import type { Mock } from 'vitest/mocks';

/**
 * E2E da API PÚBLICA v1 (Fase 1 + Fase 2):
 * F1: key lifecycle, auth x-api-key, catálogo, preços (stale honesto), interações D/X.
 * F2: solicitação de acesso → aprovação admin concede teste grátis → chave liberada →
 * saldo pré-pago (api_grant/api_pack − api_call) → 402 sem saldo → compra de pacote
 * via webhook MP (external_reference subId|calls|API credita CHAMADAS, não créditos IA).
 */

const fetchMock = () => globalThis.fetch as unknown as Mock;

async function createKey(token: string, name = 'Integração teste'): Promise<{ id: string; key: string }> {
  const r = await api().post('/api/public/v1/keys').set(authHeader(token)).send({ name });
  expect(r.status).toBe(201);
  return { id: r.body.id, key: r.body.key };
}

/** Fase 2: usuário com acesso aprovado E pacote teste creditado (mesmo efeito do admin/approve). */
async function approvedUser(): Promise<{ user: any; token: string }> {
  const { user, token } = await createUser({});
  const req = await prisma.apiAccessRequest.create({ data: { userId: user.id, company: 'Portal Teste', useCase: 'Comparador de preço no meu portal' } });
  await prisma.apiAccessRequest.update({ where: { id: req.id }, data: { status: 'approved', reviewedAt: new Date() } });
  await prisma.creditTransaction.create({ data: { userId: user.id, delta: 25, kind: 'api_grant', label: 'Pacote teste', refId: req.id } });
  return { user, token };
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

describe('API pública v1 — Fase 1 + 2', () => {
  beforeEach(async () => {
    await resetDb();
    fetchMock().mockReset();
    fetchMock().mockResolvedValue(mpResponse({})); // default seguro p/ qualquer fetch
  });

  it('sem key → 401; info pública funciona sem key', async () => {
    const noKey = await api().get('/api/public/v1/meds?q=losartana');
    expect(noKey.status).toBe(401);
    const info = await api().get('/api/public/v1/');
    expect(info.status).toBe(200);
    expect(info.body.docs).toBe('/api/docs');
    expect(info.body.freeTrial.calls).toBeGreaterThan(0);
    expect(info.body.packs.length).toBeGreaterThan(0);
  });

  it('key inválida/revogada → 401', async () => {
    const bad = await api().get('/api/public/v1/meds?q=a').set('x-api-key', 'dxk_live_naoexiste');
    expect(bad.status).toBe(401);
    const { token } = await approvedUser();
    const { id, key } = await createKey(token);
    await api().delete(`/api/public/v1/keys/${id}`).set(authHeader(token));
    const revoked = await api().get('/api/public/v1/meds?q=a').set('x-api-key', key);
    expect(revoked.status).toBe(401);
  });

  it('POST /keys devolve a chave UMA vez; GET lista só prefixo (nunca a chave)', async () => {
    const { token } = await approvedUser();
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
    const { token } = await approvedUser();
    for (let i = 0; i < 5; i++) await createKey(token, `k${i}`);
    const sixth = await api().post('/api/public/v1/keys').set(authHeader(token)).send({ name: 'sexta' });
    expect(sixth.status).toBe(429);
  });

  it('GET /meds busca catálogo com preço cacheado', async () => {
    await seedCatalogAndPrices();
    const { token } = await approvedUser();
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
    const { token } = await approvedUser();
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
    const { token } = await approvedUser();
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

  // ═══ FASE 2: solicitação de acesso → aprovação → saldo pré-pago → pacote via PIX ═══

  it('sem aprovação: POST /keys → 403 access_required; access-request destrava após aprovação', async () => {
    const requester = await createUser({});
    const blocked = await api().post('/api/public/v1/keys').set(authHeader(requester.token)).send({ name: 'sem acesso' });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error).toBe('access_required');

    // solicita (validação de caso de uso)
    const badReq = await api().post('/api/public/v1/access-request').set(authHeader(requester.token)).send({ company: 'X', useCase: 'curto' });
    expect(badReq.status).toBe(400);
    const req = await api().post('/api/public/v1/access-request').set(authHeader(requester.token)).send({ company: 'Portal Teste', useCase: 'Comparador de preços no meu portal de saúde' });
    expect(req.status).toBe(201);
    expect(req.body.status).toBe('pending');
    // duplicada pendente → 409
    expect((await api().post('/api/public/v1/access-request').set(authHeader(requester.token)).send({ company: 'Portal Teste', useCase: 'mesma integração do meu portal' })).status).toBe(409);

    // ADMIN aprova → concede teste grátis e libera chaves
    const admin = await createUser({});
    await prisma.user.update({ where: { id: admin.user.id }, data: { role: 'ADMIN' } });
    const approve = await api().post(`/api/admin/api-access/${req.body.id}/approve`).set(authHeader(admin.token)).send({});
    expect(approve.status).toBe(200);
    expect(approve.body.status).toBe('approved');
    // pacote teste creditado (25 default)
    const grant = await prisma.creditTransaction.findFirst({ where: { userId: requester.user.id, kind: 'api_grant' } });
    expect(grant?.delta).toBe(25);
    // quem pediu fica sabendo: notificação in-app criada (push do sistema é best-effort)
    const notif = await prisma.notification.findFirst({ where: { userId: requester.user.id, type: 'api_access' } });
    expect(notif?.title).toContain('aprovado');
    // agora cria a chave
    const { key } = await createKey(requester.token);
    expect(key).toMatch(/^dxk_live_/);
  });

  it('solicitar acesso notifica o SUPORTE (admins recebem notificação in-app)', async () => {
    const admin = await createUser({});
    await prisma.user.update({ where: { id: admin.user.id }, data: { role: 'ADMIN' } });
    const dev = await createUser({});
    const r = await api().post('/api/public/v1/access-request').set(authHeader(dev.token)).send({ company: 'Notifica Ltda', useCase: 'Vou integrar preço no meu portal de saúde' });
    expect(r.status).toBe(201);
    const notif = await prisma.notification.findFirst({ where: { userId: admin.user.id, type: 'api_access' } });
    expect(notif?.title).toContain('Notifica Ltda');
  });

  it('saldo pré-pago: chamada debita 1; saldo zero → 402 com pacotes', async () => {
    await seedCatalogAndPrices();
    const { user, token } = await approvedUser();
    // Isola o saldo: zera grants e deixa exatamente 2 chamadas.
    await prisma.creditTransaction.deleteMany({ where: { userId: user.id, kind: { in: ['api_grant', 'api_pack'] } } });
    await prisma.creditTransaction.create({ data: { userId: user.id, delta: 2, kind: 'api_pack', label: 'saldo de teste' } });
    const { key } = await createKey(token);
    expect((await api().get('/api/public/v1/meds?q=losartana').set('x-api-key', key)).status).toBe(200); // saldo 2→1
    expect((await api().get('/api/public/v1/meds?q=losartana').set('x-api-key', key)).status).toBe(200); // 1→0
    const out = await api().get('/api/public/v1/meds?q=losartana').set('x-api-key', key);
    expect(out.status).toBe(402);
    expect(out.body.error).toBe('payment_required');
    expect(out.body.packs.length).toBeGreaterThan(0);
    // GET /keys mostra o saldo
    const list = await api().get('/api/public/v1/keys').set(authHeader(token));
    expect(list.body.balance.calls).toBe(0);
  });

  it('compra de pacote API via PIX: webhook credita CHAMADAS (não créditos de IA)', async () => {
    const { user, token } = await approvedUser();
    const creditsBefore = (await prisma.user.findUnique({ where: { id: user.id }, select: { credits: true } }))!.credits;
    // cria a ordem (MP mockado: payment id fixo)
    fetchMock().mockResolvedValueOnce(mpResponse({
      id: 9001, status: 'pending',
      point_of_interaction: { transaction_data: { qr_code: 'pix-qr', qr_code_base64: 'AAAA' } },
    }));
    const buy = await api().post('/api/billing/buy-api-pack').set(authHeader(token)).send({ pack: 'api1k', method: 'pix' });
    expect(buy.status).toBe(200);
    expect(buy.body.calls).toBe(1000);
    // BUG DE PROD (reproduzido): o MP dispara WEBHOOK JÁ NA CRIAÇÃO do PIX (status pending).
    // Ele sobrescreve rawWebhook — se a tag da retomada morasse lá, o PIX sumia do radar.
    const subCreated = await prisma.subscription.findFirst({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } });
    fetchMock().mockResolvedValueOnce(mpResponse({ id: 9001, status: 'pending', external_reference: `${subCreated!.id}|1000|API` }));
    await api().post('/api/billing/webhook').send({ type: 'payment', data: { id: '9001' } });
    // RETOMADA (anti-dupla-ordem): 2ª compra PIX antes de expirar devolve o MESMO QR
    const buy2 = await api().post('/api/billing/buy-api-pack').set(authHeader(token)).send({ pack: 'api1k', method: 'pix' });
    expect(buy2.status).toBe(200);
    expect(buy2.body.resumed).toBe(true);
    expect(buy2.body.qrCode).toBe('pix-qr');
    const subs = await prisma.subscription.count({ where: { userId: user.id, periodDays: 0 } });
    expect(subs).toBe(1); // não criou ordem nova
    // pending-api-pack expõe a retomada pro painel
    const pend = await api().get('/api/billing/pending-api-pack').set(authHeader(token));
    expect(pend.body.hasPending).toBe(true);
    expect(pend.body.calls).toBe(1000);
    // webhook de aprovação: o MP devolve o payment com o external_reference da ordem
    const sub = await prisma.subscription.findFirst({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } });
    fetchMock().mockResolvedValueOnce(mpResponse({ id: 9001, status: 'approved', external_reference: `${sub!.id}|1000|API` }));
    const hook = await api().post('/api/billing/webhook').send({ type: 'payment', data: { id: '9001' } });
    expect(hook.status).toBe(200);
    // creditou 1000 CHAMADAS no ledger, e NÃO mexeu nos créditos de IA do app
    const pack = await prisma.creditTransaction.findFirst({ where: { userId: user.id, kind: 'api_pack' } });
    expect(pack?.delta).toBe(1000);
    const u = await prisma.user.findUnique({ where: { id: user.id }, select: { credits: true } });
    expect(u?.credits).toBe(creditsBefore);
    // aprovado → não há mais pendente
    const pend2 = await api().get('/api/billing/pending-api-pack').set(authHeader(token));
    expect(pend2.body.hasPending).toBe(false);
  });
});
