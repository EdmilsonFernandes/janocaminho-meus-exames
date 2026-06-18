import { describe, it, expect, beforeEach } from 'vitest';
import { api, authHeader, resetDb, createUser, mintToken } from './helpers';
import { prisma } from '../src/prisma';

describe('auth + requireAuth', () => {
  beforeEach(async () => { await resetDb(); });

  it('GET /api/health responde ok (smoke)', async () => {
    const r = await api().get('/api/health');
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
  });

  it('register cria user (100 créditos) + paciente Titular e devolve token', async () => {
    const r = await api().post('/api/auth/register').send({
      name: 'Fulana da Silva',
      email: 'fulana@exemplo.com',
      password: 'senha123',
    });
    expect(r.status).toBe(201);
    expect(r.body.token).toBeTruthy();
    expect(r.body.user.email).toBe('fulana@exemplo.com');
    expect(r.body.patientId).toBeTruthy();

    const dbUser = await prisma.user.findUnique({ where: { email: 'fulana@exemplo.com' } });
    expect(dbUser?.credits).toBe(100);
    const titular = await prisma.patient.findFirst({ where: { ownerId: dbUser!.id } });
    expect(titular?.relationship).toBe('Titular');
  });

  it('register rejeita senha curta (400) e e-mail duplicado (409)', async () => {
    const shortPwd = await api().post('/api/auth/register')
      .send({ name: 'X', email: 'a@b.com', password: '123' });
    expect(shortPwd.status).toBe(400);

    await createUser({ email: 'dup@exemplo.com' });
    const dup = await api().post('/api/auth/register')
      .send({ name: 'X', email: 'dup@exemplo.com', password: 'senha123' });
    expect(dup.status).toBe(409);
  });

  it('login aceita {email,password} e {username,password}; rejeita senha errada', async () => {
    const { user } = await createUser({ email: 'login@exemplo.com', password: 'senha123' });

    const okEmail = await api().post('/api/auth/login').send({ email: 'login@exemplo.com', password: 'senha123' });
    expect(okEmail.status).toBe(200);
    expect(okEmail.body.token).toBeTruthy();
    expect(okEmail.body.user.id).toBe(user.id);

    const okUsername = await api().post('/api/auth/login').send({ username: 'login@exemplo.com', password: 'senha123' });
    expect(okUsername.status).toBe(200);

    const wrong = await api().post('/api/auth/login').send({ email: 'login@exemplo.com', password: 'errada' });
    expect(wrong.status).toBe(401);
  });

  it('GET /api/auth/me com token válido devolve o user', async () => {
    const { user, token } = await createUser();
    const r = await api().get('/api/auth/me').set(authHeader(token));
    expect(r.status).toBe(200);
    expect(r.body.user.id).toBe(user.id);
  });

  it('requireAuth bloqueia sem token, com token inválido e com user inexistente', async () => {
    // sem token
    const noToken = await api().get('/api/exams');
    expect(noToken.status).toBe(401);

    // token malformado
    const bad = await api().get('/api/exams').set('Authorization', 'Bearer nao-eum-jwt');
    expect(bad.status).toBe(401);

    // user não existe no DB (token mintado de um id inventado)
    const orphan = mintToken('cuida-nao-existe');
    const r = await api().get('/api/exams').set(authHeader(orphan));
    expect(r.status).toBe(401);
  });
});
