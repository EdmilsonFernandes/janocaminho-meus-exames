import { describe, it, expect, beforeEach } from 'vitest';
import { api, resetDb, authHeader, createUser } from './helpers';
import { prisma } from '../src/prisma';

describe('Sistema de indicação (referral)', () => {
  beforeEach(async () => { await resetDb(); });

  it('gera referralCode único no cadastro', async () => {
    const r = await api().post('/api/auth/register').send({ name: 'Edmilson Silva', email: 'edm@t.com', password: 'senha123' });
    expect(r.status).toBe(201);
    const user = await prisma.user.findUnique({ where: { email: 'edm@t.com' } });
    expect(user?.referralCode).toBeTruthy();
    expect(user?.referralCode).toMatch(/EDMILSON-[A-Z0-9]{4}/);
    expect(user?.referredBy).toBeNull();
  });

  it('cadastro COM código de indicação válido → bônus pra ambos', async () => {
    // 1. cria o indicador
    await api().post('/api/auth/register').send({ name: 'Indicador Um', email: 'ind@t.com', password: 'senha123' });
    const ind = await prisma.user.findUnique({ where: { email: 'ind@t.com' } });
    expect(ind?.referralCode).toBeTruthy();
    // simula verificação de e-mail do indicador (necessário p/ código válido)
    await prisma.user.update({ where: { id: ind!.id }, data: { emailVerified: true } });
    const creditsAntes = ind!.credits;

    // 2. novo usuário com o código
    const r2 = await api().post('/api/auth/register').send({ name: 'Convidado Dois', email: 'conv@t.com', password: 'senha123', referral: ind!.referralCode });
    expect(r2.status).toBe(201);
    expect(r2.body.referralBonus).toBe(true);

    const conv = await prisma.user.findUnique({ where: { email: 'conv@t.com' } });
    expect(conv?.referredBy).toBe(ind!.referralCode);
    expect(conv?.credits).toBeGreaterThan(60); // 60 base + 30 bônus

    const indDepois = await prisma.user.findUnique({ where: { email: 'ind@t.com' } });
    expect(indDepois?.credits).toBe(creditsAntes + 30); // indicador ganhou 30
  });

  it('cadastro com código INVÁLIDO → rejeita', async () => {
    const r = await api().post('/api/auth/register').send({ name: 'Teste', email: 't@t.com', password: 'senha123', referral: 'CODIGO-INEXISTENTE' });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/inválido/i);
  });

  it('GET /referrals/stats → contagem e créditos', async () => {
    // indicador
    await api().post('/api/auth/register').send({ name: 'Indic', email: 'ind2@t.com', password: 'senha123' });
    const ind = await prisma.user.findUnique({ where: { email: 'ind2@t.com' } });
    await prisma.user.update({ where: { id: ind!.id }, data: { emailVerified: true } });

    // 2 convidados
    await api().post('/api/auth/register').send({ name: 'C1', email: 'c1@t.com', password: 'senha123', referral: ind!.referralCode });
    await api().post('/api/auth/register').send({ name: 'C2', email: 'c2@t.com', password: 'senha123', referral: ind!.referralCode });

    // login do indicador (email já verificado no passo anterior)
    const login = await api().post('/api/auth/login').send({ email: 'ind2@t.com', password: 'senha123' });
    const r = await api().get('/api/auth/referrals/stats').set(authHeader(login.body.token));
    expect(r.status).toBe(200);
    expect(r.body.count).toBe(2);
    expect(r.body.creditsEarned).toBe(60);
    expect(r.body.friends.length).toBe(2);
  });

  it('cadastro SEM código → sem bônus, referredBy null', async () => {
    const r = await api().post('/api/auth/register').send({ name: 'Solo', email: 'solo@t.com', password: 'senha123' });
    expect(r.status).toBe(201);
    expect(r.body.referralBonus).toBeFalsy();
    const user = await prisma.user.findUnique({ where: { email: 'solo@t.com' } });
    expect(user?.referredBy).toBeNull();
  });
});
