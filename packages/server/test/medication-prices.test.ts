import { describe, it, expect, beforeEach } from 'vitest';
import { api, authHeader, resetDb, createUser } from './helpers';
import { prisma } from '../src/prisma';
import { parseDosage, parseActiveIngredient, parsePackQty, buildNormalizedMedication, isKeyComplete } from '../src/pricing/normalize';
import { processMedicationPrice, runPriceWorkerTick, relevanceFilter } from '../src/pricing/worker';
import { ProviderRegistry, type MedicationPriceProvider } from '../src/pricing/provider';

// ---------------------------------------------------------------------------
// UNIT — normalização (a chave da comparação honesta)
// ---------------------------------------------------------------------------
describe('pricing normalize (unit)', () => {
  it('parseDosage: "5mg", "50 mcg", "0,25 mg", "5 mL"', () => {
    expect(parseDosage('5mg')).toEqual({ value: 5, unit: 'MG' });
    expect(parseDosage('50 mcg')).toEqual({ value: 50, unit: 'MCG' });
    expect(parseDosage('0,25 mg')).toEqual({ value: 0.25, unit: 'MG' });
    expect(parseDosage('Losartana')).toBeNull();
  });

  it('parseActiveIngredient tira dose/apresentação do nome', () => {
    expect(parseActiveIngredient('Losartana Potassica 50mg 30 comprimidos')).toBe('LOSARTANA POTASSICA');
    expect(parseActiveIngredient('Marevan 5 mg')).toBe('MAREVAN'); // marca fica — enrichment do dicionário resolve no match
  });

  it('parsePackQty acha embalagem no texto', () => {
    expect(parsePackQty('cx 30')).toBe(30);
    expect(parsePackQty('30 comprimidos')).toBe(30);
  });

  it('chave comparável: Marca A cx30 === Genérico 30 comprimidos (mesma dose)', () => {
    const a = buildNormalizedMedication({ name: 'Losartana Potassica', dosage: '50 mg', notes: 'cx 30' });
    const b = buildNormalizedMedication({ name: 'Losartana Potassica 50mg', dosage: '', notes: '30 comprimidos' });
    expect(a.medicationKey).toBe('LOSARTANA POTASSICA|50MG|CP|30');
    expect(a.medicationKey).toBe(b.medicationKey); // ← cache global bate
    expect(isKeyComplete(a.medicationKey)).toBe(true);
  });

  it('sem embalagem → chave incompleta (insufficient_data honesto)', () => {
    const k = buildNormalizedMedication({ name: 'Losartana', dosage: '50 mg' });
    expect(isKeyComplete(k.medicationKey)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// E2E — worker assíncrono + cache + rotas (provider FAKE determinístico)
// ---------------------------------------------------------------------------
const fakeProvider: MedicationPriceProvider = {
  name: 'fake-test',
  async search(n) {
    if (n.activeIngredient.includes('SEM')) return []; // cenário no_results
    return [
      { pharmacy: 'Farmácia A', productName: `${n.activeIngredient} genérico`, priceCents: 1890, url: 'https://exemplo.com/a' },
      { pharmacy: 'Farmácia B', productName: `${n.activeIngredient} similar`, priceCents: 2140, url: 'https://exemplo.com/b' },
    ];
  },
};

const itR = (n: string, f: () => Promise<void>) => it(n, { retry: 2 }, f);

describe('relevanceFilter (unit — bug "baristar")', () => {
  const mk = (name: string, price = 1000): any => ({ pharmacy: 'X', productName: name, priceCents: price, url: name });

  it('procurou BARISTAR → vizinho temático (Gastrol) fora; Baristar fica', () => {
    const out = relevanceFilter(
      [mk('Gastrol Digest Lac 10.000UI Sabor Baunilha', 5999), mk('Baristar Medley Com 30 Cápsulas', 6215), mk('Suplemento Vitamínico Baristar 30 Cápsulas', 7721)],
      { activeIngredient: 'BARISTAR' },
    );
    expect(out.map((o) => o.productName).every((n) => n.toUpperCase().includes('BARISTAR'))).toBe(true);
    expect(out.length).toBe(2);
  });

  it('multi-palavra casa pela MAIS distintiva (ACIDO FOLICO → FOLICO, não ACIDO)', () => {
    const out = relevanceFilter([mk('Ácido Clorídrico Tal'), mk('Fólico 5mg Genérico')], { activeIngredient: 'ACIDO FOLICO' });
    expect(out.length).toBe(1);
    expect(out[0].productName).toContain('Fólico');
  });

  it('nada casa → mantém original (marca sem genérico no nome não vira no_results)', () => {
    const out = relevanceFilter([mk('Cozaar 50mg')], { activeIngredient: 'LOSARTANA' });
    expect(out.length).toBe(1);
    expect(out[0].productName).toBe('Cozaar 50mg');
  });

  it('mesma farmácia + mesmo preço → distinct (1 linha)', () => {
    const out = relevanceFilter(
      [mk('Losartana 50mg 30cp Genérico', 989), mk('Losartana Potássica 50mg 30 Comp', 989), mk('Losartana 50mg 30cp', 1050)],
      { activeIngredient: 'LOSARTANA' },
    );
    expect(out.length).toBe(2); // 989 duplicado vira 1; 1050 (outro preço) fica
  });
});

describe('medication prices (E2E)', () => {
  beforeEach(async () => {
    await resetDb();
    ProviderRegistry.setOverride(fakeProvider);
  });

  itR('cadastro NÃO espera preço (201 imediato, status queued) → worker processa → card tem resumo', async () => {
    const { patient, token } = await createUser();
    const created = await api().post('/api/medications').set(authHeader(token)).send({ patientId: patient.id, name: 'Losartana Potassica', dosage: '50 mg', notes: 'cx 30' });
    expect(created.status).toBe(201);
    expect(created.body.priceStatus).toBe('queued');

    const tick = await runPriceWorkerTick(); // worker assíncrono (fora do fluxo do request)
    expect(tick.processed).toBeGreaterThanOrEqual(1);

    const list = await api().get(`/api/medications?patientId=${patient.id}`).set(authHeader(token));
    expect(list.body[0].priceStatus).toBe('available');
    expect(list.body[0].priceSummary?.lowestPriceCents).toBe(1890);
    expect(list.body[0].priceSummary?.offersCount).toBe(2);

    const prices = await api().get(`/api/medications/${created.body.id}/prices`).set(authHeader(token));
    expect(prices.status).toBe(200);
    expect(prices.body.snapshot.offers.length).toBe(2);
    expect(prices.body.snapshot.offers[0].priceCents).toBe(1890); // ordenado asc
  });

  itR('CACHE GLOBAL: 2º remédio igual NÃO consulta provider de novo (snapshot reusado)', async () => {
    const { patient, token } = await createUser();
    const m1 = await api().post('/api/medications').set(authHeader(token)).send({ patientId: patient.id, name: 'Losartana Potassica', dosage: '50 mg', notes: 'cx 30' });
    const m2 = await api().post('/api/medications').set(authHeader(token)).send({ patientId: patient.id, name: 'Losartana Potassica 50mg 30 comprimidos' });
    await runPriceWorkerTick();
    const snaps = await prisma.medicationPriceSnapshot.count();
    expect(snaps).toBe(1); // mesma chave → 1 snapshot pros dois
    expect((m1.body.priceStatus)).toBe('queued'); // criação nunca espera
    expect(m2.body).toBeTruthy();
  });

  itR('SEM embalagem → default pack=30 (não fica insufficient_data); PATCH muda pack → re-enfileira', async () => {
    const { patient, token } = await createUser();
    const created = await api().post('/api/medications').set(authHeader(token)).send({ patientId: patient.id, name: 'Losartana Potassica', dosage: '50 mg' });
    await runPriceWorkerTick();
    let med = await prisma.medication.findUnique({ where: { id: created.body.id } });
    // DEFAULT pack=30 (fix 2026-08-24: sem isto ficava insufficient_data com key |?)
    expect(med?.priceStatus).toBe('available');
    expect(med?.packQty).toBe(30);

    // usuário MUDA a embalagem contextual → re-enfileira
    const patched = await api().patch(`/api/medications/${created.body.id}`).set(authHeader(token)).send({ packQty: 60 });
    expect(patched.body.priceStatus).toBe('queued');
    expect(patched.body.packQty).toBe(60);
    await runPriceWorkerTick();
    med = await prisma.medication.findUnique({ where: { id: created.body.id } });
    expect(med?.priceStatus).toBe('available');
    expect(med?.packQty).toBe(60);
  });

  itR('provider sem ofertas → no_results (honesto, nunca inventa preço)', async () => {
    const { patient, token } = await createUser();
    await api().post('/api/medications').set(authHeader(token)).send({ patientId: patient.id, name: 'SEM PRECO Remedio Raro', dosage: '10 mg', notes: 'cx 10' });
    await runPriceWorkerTick();
    const list = await api().get(`/api/medications?patientId=${patient.id}`).set(authHeader(token));
    expect(list.body[0].priceStatus).toBe('no_results');
    expect(list.body[0].priceSummary).toBeNull();
  });

  itR('KILL-SWITCH (PRICE_PROVIDERS_OFF=1): volta pra not_requested — sem erro, card limpo', async () => {
    const prev = process.env.PRICE_PROVIDERS_OFF;
    process.env.PRICE_PROVIDERS_OFF = '1';
    try {
      const { patient, token } = await createUser();
      await api().post('/api/medications').set(authHeader(token)).send({ patientId: patient.id, name: 'Losartana Potassica', dosage: '50 mg', notes: 'cx 30' });
      await runPriceWorkerTick();
      const list = await api().get(`/api/medications?patientId=${patient.id}`).set(authHeader(token));
      expect(list.body[0].priceStatus).toBe('not_requested');
      expect(list.body[0].priceSummary).toBeNull();
    } finally {
      if (prev === undefined) delete process.env.PRICE_PROVIDERS_OFF; else process.env.PRICE_PROVIDERS_OFF = prev;
    }
  });

  itR('worker-tick é 404 em produção (rota só dev/teste)', async () => {
    const prev = process.env.NODE_ENV;
    (process.env as any).NODE_ENV = 'production';
    try {
      const { token } = await createUser();
      const r = await api().post('/api/medications/worker-tick').set(authHeader(token));
      expect(r.status).toBe(404);
    } finally { (process.env as any).NODE_ENV = prev; }
  });
});
