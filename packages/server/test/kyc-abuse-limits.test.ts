// Revisão final do KYC — I5: cota paga sem freio. Cada conta descartável (CPF sintético válido, e-mail de catch-all, CRM
// qualquer) abria 1 sessão PAGA no UaiID e gastava 1 consulta do consultaCRM (100/mês); /api/doctor/register nem estava sob
// o limiter de cadastro e POST /api/doctor/verification só tinha o geral (120/min/IP).
//  (a) POST /api/doctor/register entra no limiter de cadastro (8/h/IP);
//  (b) POST /api/doctor/verification tem limiter próprio (10/h/IP — só POST conta, o polling do portal é GET);
//  (c) teto por médico no handler: 5 sessões em 24 h (429 KYC_ATTEMPT_LIMIT, o mesmo formato que o portal já trata).
//
// Os limiters usam `skip: () => NODE_ENV !== 'production'` avaliado a CADA request; (a)/(b) ligam NODE_ENV=production
// só durante o teste (precedente: medication-prices.test.ts) e batem em rotas que respondem 400/401 antes de qualquer I/O.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../src/utils/uaiid', async (orig) => ({
  ...(await orig<typeof import('../src/utils/uaiid')>()),
  createUaiidVerification: vi.fn(),
  getUaiidVerification: vi.fn(),
}));
vi.mock('../src/utils/cfm', async (orig) => ({
  ...(await orig<typeof import('../src/utils/cfm')>()),
  lookupCfm: vi.fn(async () => ({ name: 'DRA MARIA SOUZA', specialty: null, crm: '12345-SP', uf: 'SP', situation: 'Ativo', source: 'cfm' as const })),
}));

import { prisma } from '../src/prisma';
import { api, authHeader, resetDb, createDoctor } from './helpers';
import { createUaiidVerification } from '../src/utils/uaiid';

const HOUR = 3_600_000;
let seq = 71000;
const crm = () => `${seq++}-SP`;

describe('(a)/(b) limiters de cadastro e de abertura de sessão KYC (só valem em produção)', () => {
  let prevEnv: string | undefined;
  beforeEach(async () => {
    await resetDb();
    prevEnv = process.env.NODE_ENV;
    (process.env as any).NODE_ENV = 'production';
  });
  afterEach(() => { (process.env as any).NODE_ENV = prevEnv; });

  it('POST /api/doctor/register: a 9ª tentativa do mesmo IP na hora → 429 RATE_LIMITED (as 8 primeiras chegam à validação)', async () => {
    for (let i = 0; i < 8; i++) expect((await api().post('/api/doctor/register').send({})).status).toBe(400);
    const r = await api().post('/api/doctor/register').send({});
    expect(r.status).toBe(429);
    expect(r.body.code).toBe('RATE_LIMITED');
    expect(typeof r.body.error).toBe('string');
  });

  it('POST /api/doctor/verification: o 11º POST do mesmo IP na hora → 429 RATE_LIMITED; GET (polling do portal) nunca conta', async () => {
    for (let i = 0; i < 15; i++) expect((await api().get('/api/doctor/verification')).status).toBe(401); // GETs não gastam a cota
    for (let i = 0; i < 10; i++) expect((await api().post('/api/doctor/verification')).status).toBe(401); // chegam ao handler (sem token)
    const r = await api().post('/api/doctor/verification');
    expect(r.status).toBe(429);
    expect(r.body.code).toBe('RATE_LIMITED');
    expect(typeof r.body.error).toBe('string');
    expect((await api().get('/api/doctor/verification')).status).toBe(401); // GET segue passando
  });
});

describe('(c) teto por médico: 5 sessões KYC em 24 h', () => {
  beforeEach(async () => {
    await resetDb();
    vi.mocked(createUaiidVerification).mockReset();
  });

  const attempts = (doctorId: string, agesH: number[], tag: string) => prisma.doctorVerification.createMany({
    data: agesH.map((h, i) => ({ doctorId, crm: '1-SP', providerId: `${tag}-${i}`, status: 'rejected', createdAt: new Date(Date.now() - h * HOUR) })),
  });
  const post = (token: string) => api().post('/api/doctor/verification').set(authHeader(token));
  const created = { verificationId: 'v-lim', verifyUrl: 'https://uaiid.com.br/verify/lim', expiresAt: new Date('2026-10-30T12:00:00Z'), reused: false };

  it('5 tentativas nas últimas 24 h → 429 KYC_ATTEMPT_LIMIT com as horas até a mais antiga sair da janela; o UaiID nem é chamado', async () => {
    const { doctor, token } = await createDoctor({ crm: crm(), verificationStatus: 'rejected' });
    await attempts(doctor.id, [20.5, 12, 8, 3, 1], 'lim-a'); // a mais antiga (20,5 h) sai em 3,5 h → 4
    const r = await post(token);
    expect(r.status).toBe(429);
    expect(r.body).toMatchObject({ code: 'KYC_ATTEMPT_LIMIT', retryAfterHours: 4 });
    expect(typeof r.body.error).toBe('string');
    expect(vi.mocked(createUaiidVerification)).not.toHaveBeenCalled();
    expect(await prisma.doctorVerification.count({ where: { doctorId: doctor.id } })).toBe(5); // nada novo
  });

  it('retryAfterHours nunca é menor que 1 (a mais antiga sai em poucos minutos)', async () => {
    const { doctor, token } = await createDoctor({ crm: crm(), verificationStatus: 'rejected' });
    await attempts(doctor.id, [23.9, 10, 6, 4, 2], 'lim-b');
    const r = await post(token);
    expect(r.status).toBe(429);
    expect(r.body.retryAfterHours).toBe(1);
  });

  it('4 tentativas na janela ainda deixam abrir a 5ª; tentativas com mais de 24 h não contam', async () => {
    const { doctor, token } = await createDoctor({ crm: crm(), verificationStatus: 'rejected' });
    await attempts(doctor.id, [30, 26, 25, 24.5, 5, 4, 3, 2], 'lim-c'); // 4 fora da janela + 4 dentro
    vi.mocked(createUaiidVerification).mockResolvedValue({ ...created });
    const r = await post(token);
    expect(r.status).toBe(201);
    expect(vi.mocked(createUaiidVerification)).toHaveBeenCalledTimes(1);
  });

  it('o teto é POR MÉDICO: as tentativas de outro médico não contam', async () => {
    const a = await createDoctor({ crm: crm(), verificationStatus: 'rejected' });
    const b = await createDoctor({ crm: crm(), verificationStatus: 'rejected' });
    await attempts(a.doctor.id, [10, 9, 8, 7, 6], 'lim-d');
    vi.mocked(createUaiidVerification).mockResolvedValue({ ...created, verificationId: 'v-lim-b' });
    expect((await post(a.token)).status).toBe(429);
    expect((await post(b.token)).status).toBe(201);
  });
});
