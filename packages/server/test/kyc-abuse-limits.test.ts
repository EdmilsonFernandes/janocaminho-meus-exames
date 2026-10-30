// Revisão final do KYC — I5: cota paga sem freio. Cada conta descartável (CPF sintético válido, e-mail de catch-all, CRM
// qualquer) abria 1 sessão PAGA no UaiID e gastava 1 consulta do consultaCRM (100/mês); /api/doctor/register nem estava sob
// o limiter de cadastro e POST /api/doctor/verification só tinha o geral (120/min/IP).
//  (a) POST /api/doctor/register tem balde PRÓPRIO (15/h/IP, só sucesso conta); o cadastro por convite também (10/h/IP);
//  (b) POST /api/doctor/verification tem limiter próprio (30/h/IP — só POST conta, o polling do portal é GET);
//  (c) teto por médico no handler: 5 sessões em 24 h (429 KYC_ATTEMPT_LIMIT, o mesmo formato que o portal já trata);
//  (d) 2ª rodada: teto GLOBAL diário de sessões (KYC_DAILY_SESSION_CAP, padrão 100) + e-mail ao dono — a proteção do dinheiro.
//
// Os limiters usam `skip: () => NODE_ENV !== 'production'` avaliado a CADA request; os testes de limiter ligam
// NODE_ENV=production só durante o teste (precedente: medication-prices.test.ts) e usam um IP DIFERENTE por teste
// (X-Forwarded-For; `trust proxy` = 1) para os baldes — e o geral de 120/min — não vazarem de um teste para o outro.
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
import { api, authHeader, resetDb, createDoctor, createUser, testCpf } from './helpers';
import { createUaiidVerification } from '../src/utils/uaiid';
import { sendEmail } from '../src/utils/mailer';
import { resetKycDailyCapAlertForTests } from '../src/routes/doctor-verification.routes';

const HOUR = 3_600_000;
let seq = 71000;
const crm = () => `${seq++}-SP`;
const settle = () => new Promise((r) => setTimeout(r, 150));

describe('(a)/(b) limiters de cadastro e de abertura de sessão KYC (só valem em produção)', () => {
  let prevEnv: string | undefined;
  beforeEach(async () => {
    await resetDb();
    prevEnv = process.env.NODE_ENV;
    (process.env as any).NODE_ENV = 'production';
  });
  afterEach(() => { (process.env as any).NODE_ENV = prevEnv; });

  /** IP de cliente simulado (`trust proxy` = 1 → req.ip é o último valor de X-Forwarded-For). */
  const xff = (ip: string) => ({ 'X-Forwarded-For': ip });

  it('POST /api/doctor/verification: 30/h/IP — o 31º POST → 429 RATE_LIMITED; GET (polling do portal) nunca conta', async () => {
    const ip = '10.77.0.1';
    for (let i = 0; i < 5; i++) expect((await api().get('/api/doctor/verification').set(xff(ip))).status).toBe(401); // GETs não gastam a cota
    for (let i = 0; i < 30; i++) expect((await api().post('/api/doctor/verification').set(xff(ip))).status).toBe(401); // chegam ao handler (sem token)
    const r = await api().post('/api/doctor/verification').set(xff(ip));
    expect(r.status).toBe(429);
    expect(r.body.code).toBe('RATE_LIMITED');
    expect(typeof r.body.error).toBe('string');
    expect((await api().get('/api/doctor/verification').set(xff(ip))).status).toBe(401); // GET segue passando
    expect((await api().post('/api/doctor/verification').set(xff('10.77.0.9'))).status).toBe(401); // outro IP não é afetado
  });

  // 2ª rodada (Important #7): o cadastro do médico dividia o balde de 8/h com o cadastro de paciente e o lookup de CRM —
  // uma clínica com 3 médicos atrás do mesmo IP estourava no 9º pedido, e os erros de validação também gastavam.
  it('cadastro do MÉDICO tem balde PRÓPRIO (15/h): o lookup de CRM esgotar o signupLimiter não o afeta, erro de validação não gasta, o 16º sucesso → 429', async () => {
    const ip = '10.77.0.2';
    const lookup = () => api().get('/api/doctor/crm?crm=12345&uf=SP').set(xff(ip));
    const valido = (i: number) => ({ name: 'Dra Limite', cpf: testCpf(), crm: `${52000 + i}-SP`, specialty: 'Clinico Geral', email: `lim-reg-${i}-${Date.now().toString(36)}@exemplo.com`, password: 'senha123' });
    const registrar = (body: Record<string, unknown>) => api().post('/api/doctor/register').set(xff(ip)).send(body);

    // /doctor/crm e /auth/register seguem no signupLimiter (8/h): o 9º lookup é barrado…
    for (let i = 0; i < 8; i++) expect((await lookup()).status).toBe(200);
    const nono = await lookup();
    expect(nono.status).toBe(429);
    expect(nono.body.code).toBe('RATE_LIMITED');
    // …e o cadastro de médico, do MESMO IP, não divide esse balde:
    for (let i = 0; i < 16; i++) expect((await registrar({})).status).toBe(400); // validação: não é 429 e não gasta o balde
    for (let i = 0; i < 15; i++) expect((await registrar(valido(i))).status, `cadastro ${i + 1}`).toBe(201);
    const r = await registrar(valido(15));
    expect(r.status).toBe(429);
    expect(r.body.code).toBe('RATE_LIMITED');
    expect(typeof r.body.error).toBe('string');
    expect(await prisma.doctor.count()).toBe(15); // o 16º nem chegou ao handler
  });

  // O convite é grátis e ilimitado por paciente e devolve JWT de médico sem prova de e-mail: sem limite próprio era uma fazenda
  // de contas. Aqui só o que dá certo conta (10/h/IP).
  it('cadastro por CONVITE: 10/h/IP, só sucesso conta — falhas (CRM inválido) não gastam; o 11º → 429', async () => {
    const ip = '10.77.0.3';
    const { user } = await createUser();
    const patient = await prisma.patient.findFirstOrThrow({ where: { ownerId: user.id } });
    const tokens = Array.from({ length: 11 }, (_, i) => `${Date.now().toString(16)}${String(i).padStart(2, '0')}${'c'.repeat(22)}`);
    for (const t of tokens) {
      await prisma.appSetting.create({ data: { key: `doc_invite:${t}`, value: { status: 'pending', expiresAt: new Date(Date.now() + 86_400_000).toISOString(), patientId: patient.id, ownerId: user.id, scopes: ['exams'], examIds: [] } } });
    }
    const registrar = (t: string, body: Record<string, unknown>) => api().post(`/api/public/doctor-invite/${t}/register`).set(xff(ip)).send(body);
    const invalido = { name: 'Dr Fake', crm: '000000', crmUf: 'ZZ', email: 'fake@exemplo.com', password: 'senha123' };
    for (let i = 0; i < 12; i++) expect((await registrar(tokens[0], invalido)).status).toBe(422); // não é 429 e não gasta

    for (let i = 0; i < 10; i++) {
      const r = await registrar(tokens[i], { name: `Dr Convite ${i}`, crm: `${53000 + i}`, crmUf: 'SP', email: `convite-lim-${i}-${Date.now().toString(36)}@exemplo.com`, password: 'senha123' });
      expect(r.status, `convite ${i + 1}`).toBe(201);
    }
    const r = await registrar(tokens[10], { name: 'Dr Convite 10', crm: '53010', crmUf: 'SP', email: `convite-lim-10-${Date.now().toString(36)}@exemplo.com`, password: 'senha123' });
    expect(r.status).toBe(429);
    expect(r.body.code).toBe('RATE_LIMITED');
    expect(await prisma.doctor.count({ where: { crm: '53010-SP' } })).toBe(0);
  });
});

describe('(c) teto por médico: 5 sessões KYC em 24 h', () => {
  beforeEach(async () => {
    await resetDb();
    vi.mocked(createUaiidVerification).mockReset();
  });

  // tentativas JÁ DECIDIDAS (decision gravada): uma tentativa final sem decisão é "segurada" e barra o POST (409 IN_REVIEW — m4)
  const attempts = (doctorId: string, agesH: number[], tag: string) => prisma.doctorVerification.createMany({
    data: agesH.map((h, i) => ({ doctorId, crm: '1-SP', providerId: `${tag}-${i}`, status: 'rejected', decision: 'rejected', decidedBy: 'auto', createdAt: new Date(Date.now() - h * HOUR) })),
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

// 2ª rodada (Important #4): o teto por médico e os limiters por IP não impedem N contas descartáveis de abrirem N sessões
// COBRADAS. O teto GLOBAL diário é o que protege o dinheiro: conta as tentativas de TODAS as contas nas últimas 24 h.
describe('(d) teto GLOBAL diário de sessões UaiID (KYC_DAILY_SESSION_CAP)', () => {
  beforeEach(async () => {
    await resetDb();
    vi.mocked(createUaiidVerification).mockReset();
    vi.mocked(sendEmail).mockClear();
    resetKycDailyCapAlertForTests();
    process.env.KYC_DAILY_SESSION_CAP = '3';
  });
  afterEach(() => { delete process.env.KYC_DAILY_SESSION_CAP; });

  /** Sessões de OUTRAS contas (doctorId nulo = conta apagada/qualquer): só contam no total global. */
  const sessoes = (n: number, ageH: number, tag: string) => prisma.doctorVerification.createMany({
    data: Array.from({ length: n }, (_, i) => ({ doctorId: null, crm: '1-SP', providerId: `${tag}-${i}`, status: 'rejected', createdAt: new Date(Date.now() - ageH * HOUR) })),
  });
  const post = (token: string) => api().post('/api/doctor/verification').set(authHeader(token));
  const created = { verificationId: 'v-cap', verifyUrl: 'https://uaiid.com.br/verify/cap', expiresAt: new Date('2026-10-30T12:00:00Z'), reused: false };
  const capMails = () => vi.mocked(sendEmail).mock.calls.map(([m]) => m).filter((m) => m.subject.includes('limite diário'));

  it('no teto (3 sessões nas últimas 24 h, de QUALQUER conta) → 503 KYC_UNAVAILABLE sem chamar o UaiID; 1 e-mail ao dono e no máximo 1 a cada 6 h', async () => {
    await sessoes(3, 1, 'cap-a');
    const { doctor, token } = await createDoctor({ crm: crm(), verificationStatus: 'pending' });
    const r = await post(token);
    expect(r.status).toBe(503);
    expect(r.body.code).toBe('KYC_UNAVAILABLE');
    expect(vi.mocked(createUaiidVerification)).not.toHaveBeenCalled();
    expect(await prisma.doctorVerification.count({ where: { doctorId: doctor.id } })).toBe(0);
    expect((await prisma.doctor.findUniqueOrThrow({ where: { id: doctor.id } })).verificationStatus).toBe('pending'); // nada mudou

    await vi.waitFor(() => expect(capMails()).toHaveLength(1));
    expect(capMails()[0].html).toContain('limite diário: 3');
    expect(capMails()[0].html).toContain('KYC_DAILY_SESSION_CAP');
    expect((await post(token)).status).toBe(503);
    await settle();
    expect(capMails()).toHaveLength(1); // 2º pedido na janela de 6 h: nenhum e-mail novo

    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date(Date.now() + 6 * HOUR + 60_000)); // passou a janela do alerta (e as sessões semeadas ainda estão em 24 h)
      expect((await post(token)).status).toBe(503);
      await settle();
      expect(capMails()).toHaveLength(2);
    } finally { vi.useRealTimers(); }
  });

  it('abaixo do teto → 201; sessões com mais de 24 h não contam; ao chegar no teto o próximo é barrado', async () => {
    await sessoes(2, 1, 'cap-b');
    await sessoes(5, 25, 'cap-old'); // fora da janela
    const a = await createDoctor({ crm: crm(), verificationStatus: 'pending' });
    const b = await createDoctor({ crm: crm(), verificationStatus: 'pending' });
    vi.mocked(createUaiidVerification).mockResolvedValue({ ...created });
    expect((await post(a.token)).status).toBe(201); // 2 + a nova = 3 = teto
    expect((await post(b.token)).status).toBe(503);
    expect(vi.mocked(createUaiidVerification)).toHaveBeenCalledTimes(1);
  });

  it('padrão 100 quando a env falta ou é inválida; subir a env libera na hora', async () => {
    await sessoes(100, 1, 'cap-c');
    const { token } = await createDoctor({ crm: crm(), verificationStatus: 'pending' });
    for (const ruim of ['', 'abc', '0', '-5']) {
      process.env.KYC_DAILY_SESSION_CAP = ruim;
      expect((await post(token)).status, `env=${JSON.stringify(ruim)}`).toBe(503); // cai no padrão 100 e já há 100
    }
    delete process.env.KYC_DAILY_SESSION_CAP;
    expect((await post(token)).status).toBe(503);
    process.env.KYC_DAILY_SESSION_CAP = '101';
    vi.mocked(createUaiidVerification).mockResolvedValue({ ...created, verificationId: 'v-cap-2' });
    expect((await post(token)).status).toBe(201);
  });
});
