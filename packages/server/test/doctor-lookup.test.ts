import { describe, it, expect, beforeEach } from 'vitest';
import { api, authHeader, resetDb, createUser, mpResponse } from './helpers';
import { prisma } from '../src/prisma';

// lookupCfm exige CONSULTA_CRM_KEY; o teste simula a resposta da API (sem rede real).
process.env.CONSULTA_CRM_KEY = 'test-key';

// Cobertura do fluxo de busca: conta real (base) → CFM (persiste) → manual; + specialties (base ∪ banco).
describe('GET /api/doctor/lookup + /specialties', () => {
  let t: Awaited<ReturnType<typeof createUser>>;
  beforeEach(async () => {
    await resetDb();
    t = await createUser();
    (globalThis.fetch as any).mockClear?.();
  });

  it('médico com conta REAL (claimada) → source=base (não consulta CFM)', async () => {
    await prisma.doctor.create({ data: { name: 'Dr. Real', crm: '12345-SP', crmUf: 'SP', specialty: 'Cardiologista', email: 'real@x.com', passwordHash: 'hash-real' } });
    const r = await api().get('/api/doctor/lookup?crm=12345&uf=SP').set(authHeader(t.token));
    expect(r.status).toBe(200);
    expect(r.body.source).toBe('base');
    expect(r.body.doctor.name).toBe('Dr. Real');
    expect(r.body.doctor.crm).toBe('12345-SP');
    expect(globalThis.fetch).not.toHaveBeenCalled(); // não precisou do CFM
  });

  it('fora do banco + CFM retorna → source=cfm E persiste o médico (pending-invite)', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce(mpResponse({ status: 'true', total: 1, item: [{ nome: 'Dr. CFM', profissao: 'Cardiologista', numero: '99999', uf: 'RJ', situacao: 'Regular' }] }));
    const r = await api().get('/api/doctor/lookup?crm=99999&uf=RJ').set(authHeader(t.token));
    expect(r.status).toBe(200);
    expect(r.body.source).toBe('cfm');
    expect(r.body.doctor.name).toBe('Dr. CFM');
    expect(r.body.doctor.crm).toBe('99999-RJ');
    expect(r.body.doctor.uf).toBe('RJ');
    // persistiu no banco como pending-invite
    const persisted = await prisma.doctor.findUnique({ where: { crm: '99999-RJ' } });
    expect(persisted).not.toBeNull();
    expect(persisted!.name).toBe('Dr. CFM');
    expect(persisted!.crmUf).toBe('RJ');
    expect(persisted!.passwordHash).toBe('pending-invite');
  });

  it('CFM sem resultado (fetch default → sem médico) → source=manual, doctor=null', async () => {
    const r = await api().get('/api/doctor/lookup?crm=11111&uf=MG').set(authHeader(t.token));
    expect(r.status).toBe(200);
    expect(r.body.source).toBe('manual');
    expect(r.body.doctor).toBeNull();
  });

  it('cadastro pending local (paciente já tinha digitado) serve como base quando CFM falha', async () => {
    await prisma.doctor.create({ data: { name: 'Dr. Digitado', crm: '22222-BA', crmUf: 'BA', specialty: 'Geriatra', email: 'pending-22222-ba@invite.com', passwordHash: 'pending-invite' } });
    // CFM retorna vazio (default) → cai no fallback do pending local
    const r = await api().get('/api/doctor/lookup?crm=22222&uf=BA').set(authHeader(t.token));
    expect(r.body.source).toBe('base');
    expect(r.body.doctor.name).toBe('Dr. Digitado');
  });

  it('validação: UF ausente → 400', async () => {
    const r = await api().get('/api/doctor/lookup?crm=12345').set(authHeader(t.token));
    expect(r.status).toBe(400);
  });

  it('sem auth → 401', async () => {
    const r = await api().get('/api/doctor/lookup?crm=12345&uf=SP');
    expect(r.status).toBe(401);
  });

  it('/specialties = base ∪ especialidades distintas do banco (auto-feed)', async () => {
    await prisma.doctor.create({ data: { name: 'A', crm: '1-SP', specialty: 'Genética Médica', email: 'a@x.com', passwordHash: 'x' } });
    await prisma.doctor.create({ data: { name: 'B', crm: '2-SP', specialty: 'Cardiologista', email: 'b@x.com', passwordHash: 'x' } });
    const r = await api().get('/api/doctor/specialties').set(authHeader(t.token));
    expect(r.status).toBe(200);
    expect(r.body.specialties).toContain('Genética Médica'); // veio do banco (não está na base)
    expect(r.body.specialties).toContain('Cardiologista'); // base (e banco)
    expect(r.body.specialties).toContain('Clinico Geral'); // base fixa
  });
});
