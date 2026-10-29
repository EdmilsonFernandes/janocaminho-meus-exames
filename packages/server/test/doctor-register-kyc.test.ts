import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/utils/cfm', async (orig) => ({
  ...(await orig<typeof import('../src/utils/cfm')>()),
  lookupCfm: vi.fn(async () => null),
}));

import { prisma } from '../src/prisma';
import { api, authHeader, resetDb, createDoctor, createUser, createPatient, testCpf } from './helpers';
import { lookupCfm } from '../src/utils/cfm';
import { sendEmail } from '../src/utils/mailer';
import { resetCrmConflictAlertThrottleForTests } from '../src/routes/doctor.routes';

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
    resetCrmConflictAlertThrottleForTests();
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

  // 2ª rodada (m5): o e-mail de um placeholder é dado digitado por PACIENTE (ou o endereço previsível), não prova nada — antes
  // ele bloqueava o médico de verdade com 409 EMAIL_IN_USE. Agora o placeholder SOLTA o e-mail (volta ao neutro) e o cadastro
  // do CRM B segue; o placeholder NÃO é reivindicado, não muda de CRM, de nome nem de senha (continua da Dra. A).
  it('placeholder de OUTRO CRM com o e-mail previsível NÃO é reivindicado nem muda de CRM: o e-mail é solto e o médico do CRM B se cadastra', async () => {
    const alice = await placeholder('55555-SP'); // e-mail pending-55555-sp@invite.com
    const token = await invite();
    const r = await reg(token, { crm: '88888', crmUf: 'SP', email: 'pending-55555-sp@invite.com', name: 'Dr Mallory' });
    expect(r.status).toBe(201);
    expect(r.body.doctor.crm).toBe('88888-SP');
    const after = await prisma.doctor.findUniqueOrThrow({ where: { id: alice.id } });
    expect(after).toMatchObject({ crm: '55555-SP', crmUf: 'SP', name: 'Dra Alice Placeholder', email: `pending-${alice.id}@invite.com`, passwordHash: 'pending-invite', verificationStatus: 'legacy' });
    expect(await prisma.doctor.findUnique({ where: { crm: '88888-SP' } })).toMatchObject({ email: 'pending-55555-sp@invite.com', name: 'Dr Mallory', verificationStatus: 'pending' });
    expect(await prisma.doctorShare.count({ where: { doctorId: alice.id } })).toBe(0); // a Dra. A não ganhou nada
    expect(await inviteStatus(token)).toBe('accepted');
  });

  it('e-mail digitado por um PACIENTE no compartilhamento (fluxo real) não trava o médico de verdade: ele se cadastra por convite e o placeholder segue com o CRM dele', async () => {
    const { token: tokenPaciente } = await createUser({ credits: 100 });
    const share = await api().post('/api/doctor-shares').set(authHeader(tokenPaciente)).send({ doctorName: 'Dra Helena', doctorCrm: '44444', doctorUf: 'SP', doctorEmail: 'helena.real@exemplo.com', scopes: ['exams'] });
    expect(share.status).toBe(201);
    const ph = await prisma.doctor.findUniqueOrThrow({ where: { crm: '44444-SP' } });
    expect(ph.email).toBe('helena.real@exemplo.com'); // o que o paciente digitou
    const r = await reg(await invite(), { crm: '66667', crmUf: 'SP', email: 'helena.real@exemplo.com', name: 'Dra Helena Real' }); // CRM diferente (o paciente errou o número)
    expect(r.status).toBe(201);
    expect(await prisma.doctor.findUniqueOrThrow({ where: { id: ph.id } })).toMatchObject({ crm: '44444-SP', passwordHash: 'pending-invite', email: `pending-${ph.id}@invite.com` });
    expect(await prisma.doctor.findUnique({ where: { crm: '66667-SP' } })).toMatchObject({ email: 'helena.real@exemplo.com' });
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

// Revisão final do KYC — I7: o cadastro PRINCIPAL não validava nem canonizava CRM/UF (só o convite): "000000-ZZ" passava,
// e "116739-sp" / "116739-SP-RJ" geravam chaves distintas, burlando CRM_IN_USE_UNVERIFIED e o agrupamento das tentativas.
describe('cadastro principal: CRM canônico "numero-UF" (I7)', () => {
  beforeEach(async () => {
    await resetDb();
    vi.mocked(lookupCfm).mockReset();
    vi.mocked(lookupCfm).mockResolvedValue(null);
    vi.mocked(sendEmail).mockClear();
  });

  it('a UF vem do crmUf OU do sufixo do CRM (qualquer caixa); a chave gravada é sempre "numero-UF"', async () => {
    expect((await register({ crm: '116739', crmUf: 'sp' })).status).toBe(201);          // crmUf explícito, minúsculo
    expect((await register({ crm: '222222-rj', crmUf: undefined })).status).toBe(201);  // sufixo, minúsculo
    expect((await register({ crm: '33.333-MG', crmUf: undefined })).status).toBe(201);  // pontuação no número
    expect(await prisma.doctor.findUnique({ where: { crm: '116739-SP' } })).toMatchObject({ crmUf: 'SP' });
    expect(await prisma.doctor.findUnique({ where: { crm: '222222-RJ' } })).toMatchObject({ crmUf: 'RJ' });
    expect(await prisma.doctor.findUnique({ where: { crm: '33333-MG' } })).toMatchObject({ crmUf: 'MG' });
    expect(await prisma.doctor.count()).toBe(3); // nenhuma chave paralela
    // a consulta ao CFM usa o número e a UF canônicos
    expect(vi.mocked(lookupCfm)).toHaveBeenCalledWith('116739', 'SP');
    expect(vi.mocked(lookupCfm)).toHaveBeenCalledWith('222222', 'RJ');
  });

  it.each([
    ['sem UF em lugar nenhum', { crm: '116739', crmUf: undefined }],
    ['UF fora de BR_UFS (PoC 000000-ZZ)', { crm: '000000', crmUf: 'ZZ' }],
    ['UF inválida no sufixo', { crm: '116739-ZZ', crmUf: undefined }],
    ['número sem dígitos', { crm: 'ABC-SP', crmUf: undefined }],
    ['número curto demais', { crm: '12-SP', crmUf: undefined }],
    ['número longo demais', { crm: '12345678-SP', crmUf: undefined }],
  ])('%s → 422 CRM_INVALID e nenhuma conta nem consulta ao CFM', async (_nome, over) => {
    const r = await register(over);
    expect(r.status).toBe(422);
    expect(r.body.code).toBe('CRM_INVALID');
    expect(await prisma.doctor.count()).toBe(0);
    expect(vi.mocked(lookupCfm)).not.toHaveBeenCalled();
  });

  it('variantes do MESMO CRM colidem na chave canônica: "116739-sp", "116.739" + UF e "116739-SP" não geram contas paralelas', async () => {
    expect((await register({ crm: '116739-SP', crmUf: undefined })).status).toBe(201);
    for (const variante of [{ crm: '116739-sp', crmUf: undefined }, { crm: '116.739', crmUf: 'sp' }, { crm: '116739-SP-RJ', crmUf: 'SP' }]) {
      const r = await register(variante); // outro e-mail
      expect(r.status, JSON.stringify(variante)).toBe(409);
      expect(r.body.code).toBe('CRM_IN_USE_UNVERIFIED'); // antes: chave diferente => cadastro paralelo passava
    }
    expect(await prisma.doctor.count()).toBe(1);
  });

  it('placeholder de OUTRO CRM com o e-mail previsível NÃO é reivindicado pelo cadastro principal: o e-mail é solto (m5) e o cadastro do CRM B segue', async () => {
    const alice = await prisma.doctor.create({ data: { name: 'Dra Alice Placeholder', crm: '55555-SP', crmUf: 'SP', email: 'pending-55555-sp@invite.com', passwordHash: 'pending-invite' } });
    const r = await register({ crm: '88888', crmUf: 'SP', email: 'pending-55555-sp@invite.com', name: 'Dr Mallory' });
    expect(r.status).toBe(201);
    expect(await prisma.doctor.findUniqueOrThrow({ where: { id: alice.id } })).toMatchObject({ name: 'Dra Alice Placeholder', crm: '55555-SP', crmUf: 'SP', passwordHash: 'pending-invite', email: `pending-${alice.id}@invite.com` });
    expect(await prisma.doctor.findUnique({ where: { crm: '88888-SP' } })).toMatchObject({ email: 'pending-55555-sp@invite.com', name: 'Dr Mallory', emailVerified: false });
  });

  it('e-mail digitado por PACIENTE num placeholder de outro CRM não trava o médico (fluxo real do compartilhamento); com o CRM certo o claim leva o e-mail junto', async () => {
    const { token: tokenPaciente } = await createUser({ credits: 100 });
    await api().post('/api/doctor-shares').set(authHeader(tokenPaciente)).send({ doctorName: 'Dra Helena', doctorCrm: '44444', doctorUf: 'SP', doctorEmail: 'helena.real@exemplo.com', scopes: ['exams'] });
    const ph = await prisma.doctor.findUniqueOrThrow({ where: { crm: '44444-SP' } });
    const r1 = await register({ crm: '66667', crmUf: 'SP', email: 'helena.real@exemplo.com', name: 'Dra Helena Real' }); // o paciente errou o CRM
    expect(r1.status).toBe(201);
    expect((await prisma.doctor.findUniqueOrThrow({ where: { id: ph.id } })).email).toBe(`pending-${ph.id}@invite.com`);
    const r2 = await register({ crm: '44444', crmUf: 'SP', email: 'outra.helena@exemplo.com', name: 'Dra Helena' }); // o CRM certo reivindica o placeholder
    expect(r2.status).toBe(201);
    expect(await prisma.doctor.findUniqueOrThrow({ where: { id: ph.id } })).toMatchObject({ crm: '44444-SP', email: 'outra.helena@exemplo.com', verificationStatus: 'pending' });
  });

  it('e-mail de conta REAL continua barrado (409 EMAIL_IN_USE) e a conta real não é tocada', async () => {
    const { doctor } = await createDoctor({ crm: '66666-SP', email: 'ja-tem-conta@exemplo.com' });
    const antes = await prisma.doctor.findUniqueOrThrow({ where: { id: doctor.id } });
    const r = await register({ crm: '77777', crmUf: 'SP', email: 'ja-tem-conta@exemplo.com' });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('EMAIL_IN_USE');
    expect(await prisma.doctor.findUnique({ where: { crm: '77777-SP' } })).toBeNull();
    const depois = await prisma.doctor.findUniqueOrThrow({ where: { id: doctor.id } });
    expect(depois).toMatchObject({ crm: antes.crm, name: antes.name, email: antes.email, passwordHash: antes.passwordHash });
  });

  it('o claim do placeholder funciona pela chave canônica (CRM digitado em variante)', async () => {
    const ph = await prisma.doctor.create({ data: { name: 'Pendente', crm: '34567-SP', crmUf: 'SP', email: 'placeholder-34567@exemplo.com', passwordHash: 'pending-invite' } });
    const r = await register({ crm: '34.567-sp', crmUf: undefined });
    expect(r.status).toBe(201);
    const d = await prisma.doctor.findUniqueOrThrow({ where: { id: ph.id } });
    expect(d).toMatchObject({ crm: '34567-SP', verificationStatus: 'pending' });
    expect(d.passwordHash).not.toBe('pending-invite');
    expect(await prisma.doctor.count()).toBe(1);
  });
});

// Revisão final do KYC — M10: cada cadastro conflitante mandava e-mail ao dono + linha de audit, sem limite (120/min/IP):
// dava p/ esgotar a cota do SMTP e quebrar os e-mails de OTP. O E-MAIL agora é no máximo 1 por hora por chave de CRM; a
// linha de audit continua em TODOS os conflitos.
describe('alerta ao dono de CRM disputado: 1 e-mail/hora por CRM (M10)', () => {
  beforeEach(async () => {
    await resetDb();
    resetCrmConflictAlertThrottleForTests();
    vi.mocked(lookupCfm).mockReset();
    vi.mocked(lookupCfm).mockResolvedValue(null);
    vi.mocked(sendEmail).mockClear();
  });
  const disputeMails = () => vi.mocked(sendEmail).mock.calls.map(([m]) => m).filter((m) => m.subject.includes('CRM disputado'));
  const conflictAudits = () => prisma.auditLog.count({ where: { action: 'DOCTOR_CRM_CONFLICT' } });
  const settle = () => new Promise((r) => setTimeout(r, 150));

  it('vários cadastros conflitantes no mesmo CRM: todos 409 + audit, mas 1 e-mail; outro CRM tem o seu; passada 1 h, alerta de novo', async () => {
    await createDoctor({ crm: '23456-SP', verificationStatus: 'pending' });
    await createDoctor({ crm: '45678-SP', verificationStatus: 'pending' });
    vi.mocked(sendEmail).mockClear(); // o createDoctor também manda e-mails (OTP)

    for (let i = 0; i < 4; i++) {
      const r = await register({ crm: '23456', crmUf: 'SP' });
      expect(r.status).toBe(409);
      expect(r.body.code).toBe('CRM_IN_USE_UNVERIFIED'); // o cadastrante sempre recebe a resposta
    }
    await vi.waitFor(async () => expect(await conflictAudits()).toBe(4)); // audit em TODOS
    await vi.waitFor(() => expect(disputeMails()).toHaveLength(1));
    await settle();
    expect(disputeMails()).toHaveLength(1); // e só 1 e-mail ao dono

    expect((await register({ crm: '45678', crmUf: 'SP' })).status).toBe(409); // outro CRM: janela própria
    await vi.waitFor(() => expect(disputeMails()).toHaveLength(2));

    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date(Date.now() + 61 * 60_000)); // passou 1 h
      expect((await register({ crm: '23456', crmUf: 'SP' })).status).toBe(409);
      await settle();
      expect(disputeMails()).toHaveLength(3); // janela venceu → alerta de novo
      expect((await register({ crm: '23456', crmUf: 'SP' })).status).toBe(409);
      await settle();
      expect(disputeMails()).toHaveLength(3); // e a nova janela também limita
    } finally { vi.useRealTimers(); }
  });
});
