// Protocolo do Radar Hormonal no servidor (25/11/26): app e web passam a ver o MESMO protocolo.
import { describe, it, expect, beforeEach } from 'vitest';
import { api, authHeader, createUser, resetDb } from './helpers';
import { prisma } from '../src/prisma';
import { cleanProtocol } from '../src/routes/hormone-dose.routes';

const item = (over: Record<string, unknown> = {}) => ({ uid: '1', compoundId: 'sustanon', unit: 'ml', amount: 1, conc: 250, freqDays: 7, startWeek: 1, endWeek: 12, ...over });
const body = (over: Record<string, unknown> = {}) => ({ protocol: [item(), item({ uid: '2', compoundId: 'test_cyp', conc: 200, freqDays: 3.5 })], weeks: 12, startDate: '2026-10-01', variationPct: 0, ...over });

describe('cleanProtocol', () => {
  it('aceita protocolo válido e descarta campos estranhos', () => {
    const out = cleanProtocol({ ...body(), lixo: 'x', protocol: [{ ...item(), extra: '<script>' }] })!;
    expect(out.protocol).toEqual([item()]);
    expect(out).not.toHaveProperty('lixo');
    expect(out.startDate).toBe('2026-10-01');
  });
  it.each([
    ['vazio', { ...body(), protocol: [] }],
    ['não é lista', { ...body(), protocol: 'x' }],
    ['composto fora do catálogo', { ...body(), protocol: [item({ compoundId: 'inventado' })] }],
    ['unidade inválida', { ...body(), protocol: [item({ unit: 'litros' })] }],
    ['intervalo absurdo', { ...body(), protocol: [item({ freqDays: 0 })] }],
    ['quantidade não numérica', { ...body(), protocol: [item({ amount: 'muito' })] }],
    ['itens demais', { ...body(), protocol: Array.from({ length: 13 }, (_, i) => item({ uid: String(i) })) }],
    ['nulo', null],
  ])('recusa %s', (_n, raw) => { expect(cleanProtocol(raw)).toBeNull(); });
  it('data de início fora do formato vira vazia; semanas e variação caem no padrão', () => {
    const out = cleanProtocol(body({ startDate: 'ontem', weeks: 'x', variationPct: -5 }))!;
    expect(out).toMatchObject({ startDate: '', weeks: 12, variationPct: 0 });
  });
});

describe('GET/PUT /api/hormone-doses/protocol', () => {
  beforeEach(async () => { await resetDb(); });

  it('exige login; sem nada salvo devolve data null', async () => {
    expect((await api().get('/api/hormone-doses/protocol')).status).toBe(401);
    const { token } = await createUser();
    const r = await api().get('/api/hormone-doses/protocol').set(authHeader(token));
    expect(r.status).toBe(200);
    expect(r.body.data).toBeNull();
  });

  it('salva e devolve o mesmo protocolo (o que se monta num aparelho aparece no outro)', async () => {
    const { token } = await createUser();
    const put = await api().put('/api/hormone-doses/protocol').set(authHeader(token)).send({ data: body() });
    expect(put.status).toBe(200);
    const get = await api().get('/api/hormone-doses/protocol').set(authHeader(token));
    expect(get.body.data.protocol.map((p: { compoundId: string }) => p.compoundId)).toEqual(['sustanon', 'test_cyp']);
    expect(get.body.data.startDate).toBe('2026-10-01');
    expect(get.body.updatedAt).toBeTruthy();

    // salvar de novo substitui (uma linha por paciente)
    await api().put('/api/hormone-doses/protocol').set(authHeader(token)).send({ data: body({ protocol: [item({ compoundId: 'test_enan' })] }) });
    expect(await prisma.hormoneProtocol.count()).toBe(1);
    const again = await api().get('/api/hormone-doses/protocol').set(authHeader(token));
    expect(again.body.data.protocol).toHaveLength(1);
  });

  it('protocolo inválido → 400 e nada gravado', async () => {
    const { token } = await createUser();
    const r = await api().put('/api/hormone-doses/protocol').set(authHeader(token)).send({ data: { protocol: [item({ compoundId: 'inventado' })] } });
    expect(r.status).toBe(400);
    expect(await prisma.hormoneProtocol.count()).toBe(0);
  });

  it('um usuário não lê nem grava o protocolo de outro', async () => {
    const owner = await createUser();
    const other = await createUser();
    const saved = await api().put('/api/hormone-doses/protocol').set(authHeader(owner.token)).send({ data: body() });
    const pid = saved.body.patientId;
    expect((await api().get(`/api/hormone-doses/protocol?patientId=${pid}`).set(authHeader(other.token))).status).toBe(404);
    expect((await api().put('/api/hormone-doses/protocol').set(authHeader(other.token)).send({ patientId: pid, data: body() })).status).toBe(404);
    expect((await api().get('/api/hormone-doses/protocol').set(authHeader(other.token))).body.data).toBeNull();
  });
});
