import { describe, it, expect, beforeEach, vi } from 'vitest';
import { api, resetDb } from './helpers';
import { prisma } from '../src/prisma';

// Mocka google-auth-library: em vez de validar um JWT real no Google, decodifica o
// "credential" do teste como JSON (base64) e devolve como payload. Assim o /auth/google
// roda end-to-end sem rede. Isolado neste arquivo pra não afetar os outros testes de auth.
vi.mock('google-auth-library', () => ({
  OAuth2Client: class {
    constructor(_clientId: string) {}
    async verifyIdToken({ idToken }: { idToken: string; audience: string }) {
      const payload = JSON.parse(Buffer.from(idToken, 'base64').toString('utf-8'));
      return { getPayload: () => payload };
    }
  },
}));

const googleCredential = (payload: Record<string, unknown>) =>
  Buffer.from(JSON.stringify(payload)).toString('base64');

describe('POST /api/auth/google', () => {
  beforeEach(async () => { await resetDb(); });

  it('loga user ADMIN existente e devolve user.role + patientId (regressão do "perdi o admin")', async () => {
    // O bug: /auth/google devolvia só { token } → front não populava localStorage.user →
    // gate de admin (App.tsx lê user.role) não enxergava ADMIN. Agora tem que vir user+patientId.
    const admin = await prisma.user.create({
      data: { email: 'admin@exemplo.com', name: 'Admin Teste', passwordHash: 'google-oauth', credits: 10, emailVerified: true, role: 'ADMIN' },
    });
    const patient = await prisma.patient.create({ data: { ownerId: admin.id, fullName: 'Admin Teste', relationship: 'Titular' } });

    const r = await api().post('/api/auth/google').send({ credential: googleCredential({ email: 'admin@exemplo.com', name: 'Admin Teste' }) });

    expect(r.status).toBe(200);
    expect(r.body.token).toBeTruthy();
    expect(r.body.user).toMatchObject({ email: 'admin@exemplo.com', role: 'ADMIN' });
    expect(r.body.patientId).toBe(patient.id);
  });

  it('cria user novo (OWNER) e devolve user + isNew + patientId + créditos de boas-vindas', async () => {
    const r = await api().post('/api/auth/google').send({ credential: googleCredential({ email: 'novo@exemplo.com', name: 'Novo Usuário', picture: 'https://img/x.png' }) });

    expect(r.status).toBe(201);
    expect(r.body.isNew).toBe(true);
    expect(r.body.user).toMatchObject({ email: 'novo@exemplo.com', role: 'OWNER' });
    expect(r.body.patientId).toBeTruthy();

    const dbUser = await prisma.user.findUnique({ where: { email: 'novo@exemplo.com' } });
    expect(dbUser?.emailVerified).toBe(true);
    expect(dbUser?.credits).toBeGreaterThan(0); // bônus freeSignup aplicado
    const titular = await prisma.patient.findFirst({ where: { ownerId: dbUser!.id } });
    expect(titular?.relationship).toBe('Titular');
    expect(titular?.photoUrl).toBe('https://img/x.png');
  });

  it('400 se credential ausente; 403 se user bloqueado', async () => {
    const noCred = await api().post('/api/auth/google').send({});
    expect(noCred.status).toBe(400);

    await prisma.user.create({
      data: { email: 'bloq@exemplo.com', name: 'Bloqueado', passwordHash: 'x', credits: 0, emailVerified: true, role: 'OWNER', blocked: true },
    });
    const blocked = await api().post('/api/auth/google').send({ credential: googleCredential({ email: 'bloq@exemplo.com', name: 'Bloqueado' }) });
    expect(blocked.status).toBe(403);
  });
});
