import { describe, it, expect, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { api, authHeader, resetDb, createUser, createPatient, getUserCredits, testCpf, mintToken } from './helpers';
import { prisma } from '../src/prisma';

const EXTRA_COST = 50;
const FREE_LIMIT = 4; // titular + 3

async function fillToLimit(ownerId: string) {
  // createUser já criou o titular (1); adiciona mais 3 p/ chegar a 4
  for (let i = 0; i < FREE_LIMIT - 1; i++) await createPatient(ownerId);
}

async function createAdmin() {
  const passwordHash = await bcrypt.hash('senha123', 10);
  const u = await prisma.user.create({ data: { email: `admin-${Date.now().toString(36)}@exemplo.com`, name: 'Admin Teste', passwordHash, role: 'ADMIN', credits: 0, emailVerified: true } });
  return { id: u.id, token: mintToken(u.id) };
}

describe('pacientes: CRUD + limite de dependentes', () => {
  beforeEach(async () => { await resetDb(); });

  it('POST /patients cria dependente e GET /patients lista do usuário', async () => {
    const { user, token } = await createUser();
    const r = await api().post('/api/patients').set(authHeader(token))
      .send({ fullName: 'Maria da Silva', cpf: testCpf(), relationship: 'Mãe' });
    expect(r.status).toBe(201);
    expect(r.body.fullName).toBe('Maria da Silva');

    const list = await api().get('/api/patients').set(authHeader(token));
    expect(list.body.length).toBeGreaterThanOrEqual(2); // titular + mãe
    expect(list.body.every((p: any) => p.ownerId === user.id)).toBe(true);
  });

  // 13/10 (caso "Claiza"): dependente invisível no admin = falso mistério de usuário
  // sumido. Agora o GET /admin/users traz `dependents` e o cadastro notifica o dono
  // por e-mail (fire-and-forget — nunca pode travar a resposta da criação).
  it('dependente criado aparece em GET /admin/users (dependents) e a resposta não espera o e-mail', async () => {
    const { user, token } = await createUser();
    const r = await api().post('/api/patients').set(authHeader(token))
      .send({ fullName: 'Claiza Beretta', cpf: testCpf(), relationship: 'Esposa' });
    expect(r.status).toBe(201);

    const admin = await createAdmin();
    const list = await api().get(`/api/admin/users?q=${encodeURIComponent(user.email)}`).set(authHeader(admin.token));
    expect(list.status).toBe(200);
    const row = (list.body.users as any[]).find((u) => u.email === user.email);
    expect(row.dependents).toHaveLength(1);
    expect(row.dependents[0].fullName).toBe('Claiza Beretta');
    expect(row.dependents[0].relationship).toBe('Esposa');
    // titular (patients[0]) NÃO vaza pra lista de dependentes
    expect(row.dependents.some((d: any) => d.relationship === 'Titular')).toBe(false);
  });

  it('5º dependente custa 50 créditos (não-premium com saldo)', async () => {
    const { user, token } = await createUser({ credits: 100 });
    await fillToLimit(user.id);
    expect(await prisma.patient.count({ where: { ownerId: user.id } })).toBe(FREE_LIMIT);

    const r = await api().post('/api/patients').set(authHeader(token)).send({ fullName: 'Quinto', cpf: testCpf() });
    expect(r.status).toBe(201);
    expect(await getUserCredits(user.id)).toBe(100 - EXTRA_COST);
  });

  it('5º dependente SEM créditos suficientes → 402 dependent_limit', async () => {
    const { user, token } = await createUser({ credits: 30 });
    await fillToLimit(user.id);
    const r = await api().post('/api/patients').set(authHeader(token)).send({ fullName: 'Quinto', cpf: testCpf() });
    expect(r.status).toBe(402);
    expect(r.body.error).toBe('dependent_limit');
  });

  it('premium adiciona 5º dependente SEM custar créditos', async () => {
    const { user, token } = await createUser({ credits: 100, premium: true });
    await fillToLimit(user.id);
    const r = await api().post('/api/patients').set(authHeader(token)).send({ fullName: 'Quinto Premium', cpf: testCpf() });
    expect(r.status).toBe(201);
    expect(await getUserCredits(user.id)).toBe(100); // intocado
  });

  it('PUT /patients/:id atualiza perfil clínico; DELETE titular único é bloqueado', async () => {
    const { patient, token } = await createUser();
    const upd = await api().put(`/api/patients/${patient.id}`).set(authHeader(token))
      .send({ clinicalProfile: 'Hipotireoidismo; usa levotiroxina.' });
    expect(upd.status).toBe(200);
    expect(upd.body.clinicalProfile).toContain('levotiroxina');
    expect(upd.body.cpfEncrypted).toBeFalsy();
    expect(upd.body.cpfLast4).toBeUndefined();
    expect(upd.body.cpfMasked).toBeTruthy();

    // titular é o único paciente → não pode excluir
    const del = await api().delete(`/api/patients/${patient.id}`).set(authHeader(token));
    expect(del.status).toBe(400);
  });

  it('bloqueia troca de nome/CPF quando identidade esta travada', async () => {
    const { patient, token } = await createUser();
    const nameChange = await api().put(`/api/patients/${patient.id}`).set(authHeader(token))
      .send({ fullName: 'Outro Nome' });
    expect(nameChange.status).toBe(409);

    const cpfChange = await api().put(`/api/patients/${patient.id}`).set(authHeader(token))
      .send({ cpf: testCpf() });
    expect(cpfChange.status).toBe(409);
  });

  it('DELETE remove dependente (quando há titular)', async () => {
    const { user, token } = await createUser();
    const dep = await createPatient(user.id, { fullName: 'Filha' });
    const r = await api().delete(`/api/patients/${dep.id}`).set(authHeader(token));
    expect(r.status).toBe(200);
    expect(await prisma.patient.findUnique({ where: { id: dep.id } })).toBeNull();
  });

  it('GET /patients/:id NÃO permite ler paciente de OUTRO usuário (IDOR → 403)', async () => {
    const a = await createUser({ email: 'a@t.com' });
    const b = await createUser({ email: 'b@t.com' });
    const bPatient = await prisma.patient.findFirst({ where: { ownerId: b.user.id } });
    // A tenta ler paciente de B → 403 (não vaza PII)
    const denied = await api().get(`/api/patients/${bPatient!.id}`).set(authHeader(a.token));
    expect(denied.status).toBe(403);
    // A lê o próprio → 200
    const aPatient = await prisma.patient.findFirst({ where: { ownerId: a.user.id } });
    const ok = await api().get(`/api/patients/${aPatient!.id}`).set(authHeader(a.token));
    expect(ok.status).toBe(200);
  });
});
