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
