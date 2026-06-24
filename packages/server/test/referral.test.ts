import { describe, it, expect, beforeEach } from 'vitest';
import { api, resetDb, authHeader } from './helpers';
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

  it('cadastro COM código → bônus só DEPOIS de verificar e-mail', async () => {
    // 1. cria + ativa o indicador
    await api().post('/api/auth/register').send({ name: 'Indicador Um', email: 'ind@t.com', password: 'senha123' });
    const ind = await prisma.user.findUnique({ where: { email: 'ind@t.com' } });
    await prisma.user.update({ where: { id: ind!.id }, data: { emailVerified: true } });
    const creditsIndicadorAntes = ind!.credits;

    // 2. convidado se cadastra com o código (SEM verificar e-mail ainda)
    const r2 = await api().post('/api/auth/register').send({ name: 'Convidado Dois', email: 'conv@t.com', password: 'senha123', referral: ind!.referralCode });
    expect(r2.status).toBe(201);

    // 3. NENHUM bônus ainda (antes de verificar) — conta recém-criada fica com 0 créditos;
    //    signup + bônus de indicação só vem DEPOIS de verificar o e-mail (anti-farm).
    const convAntes = await prisma.user.findUnique({ where: { email: 'conv@t.com' } });
    const indAntes = await prisma.user.findUnique({ where: { email: 'ind@t.com' } });
    expect(convAntes?.credits).toBe(0); // 0 antes do verify (bônus deferido)
    expect(indAntes?.credits).toBe(creditsIndicadorAntes); // indicador sem bônus ainda

    // 4. convidado verifica e-mail → bônus pra AMBOS
    const otp = (await import('../src/auth/otp')).issueOtp('conv@t.com');
    const verify = await api().post('/api/auth/verify-email').send({ email: 'conv@t.com', code: otp });
    expect(verify.status).toBe(200);

    const convDepois = await prisma.user.findUnique({ where: { email: 'conv@t.com' } });
    const indDepois = await prisma.user.findUnique({ where: { email: 'ind@t.com' } });
    expect(convDepois?.credits).toBe(60 + 30); // signup + bônus de indicação
    expect(indDepois?.credits).toBe(creditsIndicadorAntes + 30); // indicador ganhou 30
  });

  it('cadastro com código INVÁLIDO → rejeita', async () => {
    const r = await api().post('/api/auth/register').send({ name: 'Teste User', email: 't@t.com', password: 'senha123', referral: 'CODIGO-INEXISTENTE' });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/inválido/i);
  });

  it('cadastro SEM código → sem bônus, referredBy null', async () => {
    const r = await api().post('/api/auth/register').send({ name: 'Solo User', email: 'solo@t.com', password: 'senha123' });
    expect(r.status).toBe(201);
    const user = await prisma.user.findUnique({ where: { email: 'solo@t.com' } });
    expect(user?.referredBy).toBeNull();
  });
});
