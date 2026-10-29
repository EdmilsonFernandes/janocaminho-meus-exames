import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/utils/cfm', async (orig) => ({
  ...(await orig<typeof import('../src/utils/cfm')>()),
  lookupCfm: vi.fn(async () => null),
}));

import { prisma } from '../src/prisma';
import { api, authHeader, resetDb, createDoctor, createUser, createPatient, testCpf } from './helpers';
import { lookupCfm } from '../src/utils/cfm';
import { sendEmail } from '../src/utils/mailer';

let n = 0;
const mail = () => `kyc-reg-${n++}-${Date.now().toString(36)}@exemplo.com`;
const register = (over: Record<string, unknown> = {}) => api().post('/api/doctor/register')
  .send({ name: 'Dra Ana', cpf: testCpf(), crm: '23456', crmUf: 'SP', specialty: 'Clinico Geral', email: mail(), password: 'senha123', ...over });
const cfmAs = (situation: string) => vi.mocked(lookupCfm).mockResolvedValueOnce({ name: 'DRA ANA', specialty: null, crm: '23456-SP', uf: 'SP', situation, source: 'cfm' });

async function invite() {
  const { user } = await createUser();
  const patient = await createPatient(user.id);
  const token = `${Date.now().toString(16)}${'a'.repeat(24)}`;
  await prisma.appSetting.create({ data: { key: `doc_invite:${token}`, value: { status: 'pending', expiresAt: new Date(Date.now() + 86_400_000).toISOString(), patientId: patient.id, scopes: ['exams'], examIds: [] } } });
  return token;
}

describe('cadastro de médico + convite (spec §7, AUD-003)', () => {
  beforeEach(async () => {
    await resetDb();
    vi.mocked(lookupCfm).mockReset();
    vi.mocked(lookupCfm).mockResolvedValue(null);
    vi.mocked(sendEmail).mockClear();
  });

  it('CFM "Inativo" bloqueia o cadastro (antes /ativo/i deixava passar)', async () => {
    cfmAs('Inativo');
    expect((await register()).status).toBe(400);
  });

  it('CRM de conta NÃO aprovada, outro e-mail → 409 CRM_IN_USE_UNVERIFIED + audit + e-mail ao dono', async () => {
    await createDoctor({ crm: '23456-SP', verificationStatus: 'pending' });
    const r = await register();
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('CRM_IN_USE_UNVERIFIED');
    await vi.waitFor(async () => expect(await prisma.auditLog.count({ where: { action: 'DOCTOR_CRM_CONFLICT' } })).toBe(1));
    await vi.waitFor(() => expect(vi.mocked(sendEmail)).toHaveBeenCalledWith(expect.objectContaining({ subject: expect.stringContaining('CRM disputado') })));
  });

  it('CRM de conta aprovada, outro e-mail → 409 de sempre + audit do conflito', async () => {
    await createDoctor({ crm: '23456-SP' });
    const r = await register();
    expect(r.status).toBe(409);
    expect(r.body.code).toBeUndefined();
    await vi.waitFor(async () => expect(await prisma.auditLog.count({ where: { action: 'DOCTOR_CRM_CONFLICT' } })).toBe(1));
  });

  it('claim de placeholder herda pending, nunca legacy', async () => {
    await prisma.doctor.create({ data: { name: 'Pendente', crm: '34567-SP', crmUf: 'SP', email: 'placeholder-34567@exemplo.com', passwordHash: 'pending-invite', verificationStatus: 'legacy' } });
    expect((await register({ crm: '34567' })).status).toBe(201);
    expect((await prisma.doctor.findUnique({ where: { crm: '34567-SP' } }))?.verificationStatus).toBe('pending');
  });

  it('convite: UF inválida (PoC 000000-ZZ) → 422 CRM_INVALID', async () => {
    const token = await invite();
    const r = await api().post(`/api/public/doctor-invite/${token}/register`).send({ name: 'Médico Fake', crm: '000000', crmUf: 'ZZ', email: mail(), password: 'senha123' });
    expect(r.status).toBe(422);
    expect(r.body.code).toBe('CRM_INVALID');
  });

  it('convite: CFM inativo → 422 CRM_INACTIVE', async () => {
    const token = await invite();
    cfmAs('Cancelado');
    const r = await api().post(`/api/public/doctor-invite/${token}/register`).send({ name: 'Dra Ana', crm: '23456', crmUf: 'SP', email: mail(), password: 'senha123' });
    expect(r.status).toBe(422);
    expect(r.body.code).toBe('CRM_INACTIVE');
  });

  it('convite válido → 201, conta pending e o token NÃO abre dado de paciente', async () => {
    const token = await invite();
    const r = await api().post(`/api/public/doctor-invite/${token}/register`).send({ name: 'Dra Ana', crm: '45678', crmUf: 'SP', email: mail(), password: 'senha123' });
    expect(r.status).toBe(201);
    expect((await prisma.doctor.findUnique({ where: { crm: '45678-SP' } }))?.verificationStatus).toBe('pending');
    const g = await api().get('/api/doctor/patients').set(authHeader(r.body.token));
    expect(g.status).toBe(403);
    expect(g.body.code).toBe('VERIFICATION_REQUIRED');
  });
});

// Revisão final do KYC — I6b: o convite casava o placeholder por CRM OU e-mail e sobrescrevia crm/crmUf. Os placeholders
// criados pela busca de CRM do paciente têm e-mail PREVISÍVEL (pending-<crm>@invite.com) e qualquer paciente cria um
// token de convite: um médico do CRM B reivindicava o placeholder da Dra. A (com os shares dos pacientes dela) e o
// reescrevia para o CRM B. Agora: só por CRM, e o CRM de uma conta existente nunca muda.
describe('convite: reivindicar placeholder só por CRM e nunca reescrever o CRM (I6b)', () => {
  beforeEach(async () => {
    await resetDb();
    vi.mocked(lookupCfm).mockReset();
    vi.mocked(lookupCfm).mockResolvedValue(null);
  });

  const reg = (token: string, over: Record<string, unknown> = {}) => api().post(`/api/public/doctor-invite/${token}/register`)
    .send({ name: 'Dra Ana', crm: '23456', crmUf: 'SP', email: mail(), password: 'senha123', ...over });
  const placeholder = (crm = '55555-SP', over: Record<string, unknown> = {}) => prisma.doctor.create({
    data: { name: 'Dra Alice Placeholder', crm, crmUf: crm.split('-')[1], email: `pending-${crm.toLowerCase()}@invite.com`, passwordHash: 'pending-invite', verificationStatus: 'legacy', ...over } as any,
  });
  const inviteStatus = async (token: string) => ((await prisma.appSetting.findUniqueOrThrow({ where: { key: `doc_invite:${token}` } })).value as any).status;

  it('placeholder do MESMO CRM é reivindicado: dados e senha do médico, vira pending, CRM intacto, shares herdados + o do convite', async () => {
    const ph = await placeholder('55555-SP');
    const { user } = await createUser();
    const outro = await createPatient(user.id);
    await prisma.doctorShare.create({ data: { patientId: outro.id, doctorId: ph.id, scopes: ['exams'], active: true } });
    const token = await invite();
    const r = await reg(token, { crm: '55555', crmUf: 'SP', email: 'alice-real@exemplo.com', name: 'Dra Alice Real' });
    expect(r.status).toBe(201);
    expect(r.body.doctor.id).toBe(ph.id);
    const after = await prisma.doctor.findUniqueOrThrow({ where: { id: ph.id } });
    expect(after).toMatchObject({ crm: '55555-SP', crmUf: 'SP', email: 'alice-real@exemplo.com', name: 'Dra Alice Real', verificationStatus: 'pending' });
    expect(after.passwordHash).not.toBe('pending-invite');
    expect(await prisma.doctorShare.count({ where: { doctorId: ph.id } })).toBe(2);
    expect(await inviteStatus(token)).toBe('accepted');
  });

  it('placeholder de OUTRO CRM com o e-mail previsível NÃO é reivindicado nem muda de CRM → 409 EMAIL_IN_USE', async () => {
    const alice = await placeholder('55555-SP'); // e-mail pending-55555-sp@invite.com
    const token = await invite();
    const r = await reg(token, { crm: '88888', crmUf: 'SP', email: 'pending-55555-sp@invite.com', name: 'Dr Mallory' });
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ code: 'EMAIL_IN_USE', error: 'Este e-mail já está em uso. Fale com o suporte.' });
    expect(r.body.token).toBeUndefined();
    const after = await prisma.doctor.findUniqueOrThrow({ where: { id: alice.id } });
    expect(after).toMatchObject({ crm: '55555-SP', crmUf: 'SP', name: 'Dra Alice Placeholder', email: 'pending-55555-sp@invite.com', passwordHash: 'pending-invite', verificationStatus: 'legacy' });
    expect(await prisma.doctor.findUnique({ where: { crm: '88888-SP' } })).toBeNull();
    expect(await prisma.doctorShare.count()).toBe(0); // nada concedido
    expect(await inviteStatus(token)).toBe('pending'); // convite não foi consumido
  });

  it('placeholder do CRM certo, mas o e-mail informado já é de OUTRA conta → 409 EMAIL_IN_USE (e não 500 por unique)', async () => {
    const ph = await placeholder('55555-SP');
    await createDoctor({ crm: '66666-SP', email: 'ja-existe@exemplo.com' });
    const token = await invite();
    const r = await reg(token, { crm: '55555', crmUf: 'SP', email: 'ja-existe@exemplo.com' });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('EMAIL_IN_USE');
    expect((await prisma.doctor.findUniqueOrThrow({ where: { id: ph.id } })).passwordHash).toBe('pending-invite');
    expect(await inviteStatus(token)).toBe('pending');
  });

  it('médico REAL: mesmo CRM ou mesmo e-mail → 409 already_registered, sem tocar na conta', async () => {
    const { doctor } = await createDoctor({ crm: '66666-SP', email: 'real66@exemplo.com' });
    const antes = await prisma.doctor.findUniqueOrThrow({ where: { id: doctor.id } });
    const t1 = await invite();
    const porCrm = await reg(t1, { crm: '66666', crmUf: 'SP', email: mail() });
    expect(porCrm.status).toBe(409);
    expect(porCrm.body.error).toBe('already_registered');
    const t2 = await invite();
    const porEmail = await reg(t2, { crm: '77777', crmUf: 'SP', email: 'real66@exemplo.com' });
    expect(porEmail.status).toBe(409);
    expect(porEmail.body.error).toBe('already_registered');
    const depois = await prisma.doctor.findUniqueOrThrow({ where: { id: doctor.id } });
    expect(depois).toMatchObject({ crm: antes.crm, crmUf: antes.crmUf, name: antes.name, passwordHash: antes.passwordHash });
    expect(await prisma.doctor.findUnique({ where: { crm: '77777-SP' } })).toBeNull();
  });

  it('CRM em variantes ("55555-sp", "55.555-SP", UF só no sufixo) cai na MESMA chave canônica e reivindica o mesmo placeholder', async () => {
    const ph = await placeholder('55555-SP');
    const r = await reg(await invite(), { crm: '55.555-sp', crmUf: undefined, email: 'alice-var@exemplo.com' });
    expect(r.status).toBe(201);
    expect(r.body.doctor.id).toBe(ph.id);
    expect((await prisma.doctor.findUniqueOrThrow({ where: { id: ph.id } })).crm).toBe('55555-SP');
    expect(await prisma.doctor.count({ where: { crm: { contains: '55' } } })).toBe(1); // nenhuma chave paralela
  });

  it('conta nova nasce com a chave canônica "numero-UF" (CRM digitado em minúscula / com pontuação)', async () => {
    const r = await reg(await invite(), { crm: '116.739-sp', crmUf: undefined, email: mail() });
    expect(r.status).toBe(201);
    expect(r.body.doctor.crm).toBe('116739-SP');
    expect((await prisma.doctor.findUnique({ where: { crm: '116739-SP' } }))?.crmUf).toBe('SP');
  });
});
