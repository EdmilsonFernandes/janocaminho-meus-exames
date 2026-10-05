import { describe, it, expect, beforeEach } from 'vitest';
import { api, resetDb, testCpf } from './helpers';
import { prisma } from '../src/prisma';
import { REFERRAL_BONUS } from '../src/routes/auth.routes';
import { getSettings, saveSettings } from '../src/utils/settings';

describe('Sistema de indicação (referral)', () => {
  beforeEach(async () => { await resetDb(); });

  it('gera referralCode único no cadastro', async () => {
    const r = await api().post('/api/auth/register').send({ name: 'Edmilson Silva', cpf: testCpf(), email: 'edm@t.com', password: 'senha123' });
    expect(r.status).toBe(201);
    const user = await prisma.user.findUnique({ where: { email: 'edm@t.com' } });
    expect(user?.referralCode).toBeTruthy();
    expect(user?.referralCode).toMatch(/EDMILSON-[A-Z0-9]{4}/);
    expect(user?.referredBy).toBeNull();
  });

  it('cadastro COM código → bônus só DEPOIS de verificar e-mail', async () => {
    // 1. cria + ativa o indicador
    await api().post('/api/auth/register').send({ name: 'Indicador Um', cpf: testCpf(), email: 'ind@t.com', password: 'senha123' });
    const ind = await prisma.user.findUnique({ where: { email: 'ind@t.com' } });
    await prisma.user.update({ where: { id: ind!.id }, data: { emailVerified: true } });
    const creditsIndicadorAntes = ind!.credits;

    // 2. convidado se cadastra com o código (SEM verificar e-mail ainda)
    const r2 = await api().post('/api/auth/register').send({ name: 'Convidado Dois', cpf: testCpf(), email: 'conv@t.com', password: 'senha123', referral: ind!.referralCode });
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
    expect(convDepois?.credits).toBe(REFERRAL_BONUS); // só bônus de indicação (signup removido — créditos vêm no 1º exame)
    expect(indDepois?.credits).toBe(creditsIndicadorAntes + REFERRAL_BONUS); // indicador ganhou o bônus
  });

  it('cadastro com código INVÁLIDO → rejeita', async () => {
    const r = await api().post('/api/auth/register').send({ name: 'Teste User', cpf: testCpf(), email: 't@t.com', password: 'senha123', referral: 'CODIGO-INEXISTENTE' });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/inválido/i);
  });

  it('cadastro SEM código → sem bônus, referredBy null', async () => {
    const r = await api().post('/api/auth/register').send({ name: 'Solo User', cpf: testCpf(), email: 'solo@t.com', password: 'senha123' });
    expect(r.status).toBe(201);
    const user = await prisma.user.findUnique({ where: { email: 'solo@t.com' } });
    expect(user?.referredBy).toBeNull();
  });
});

// DOIS LADOS (05/10): /api/public/config expõe os valores de COPY por lado
// (referral.newUser/recommender) — defaults = REFERRAL_BONUS, editáveis no admin
// (AppSetting referral) SEM mudar o crédito real pago em verify-email.
describe('Referral dois lados (copy do servidor)', () => {
  beforeEach(async () => { await resetDb(); });

  it('GET /public/config devolve { newUser, recommender, shareMessage } — defaults = bônus real', async () => {
    const r = await api().get('/api/public/config');
    expect(r.status).toBe(200);
    expect(r.body.referral).toMatchObject({ newUser: REFERRAL_BONUS, recommender: REFERRAL_BONUS });
    expect(r.body.referral.shareMessage).toBe('');
    // Campos planos legados permanecem (landing/card antigos não quebram).
    expect(r.body.referralBonus).toBe(REFERRAL_BONUS);
    expect(typeof r.body.shareMessage).toBe('string');
  });

  it('admin edita os DOIS lados independentemente (AppSetting referral) → endpoint reflete', async () => {
    await saveSettings('referral', { newUser: 20, recommender: 25, shareMessage: 'Bora! {code} {link}' });
    const r = await api().get('/api/public/config');
    expect(r.body.referral).toMatchObject({ newUser: 20, recommender: 25, shareMessage: 'Bora! {code} {link}' });
    // Crédito REAL não muda: continua REFERRAL_BONUS no cadastro+verify.
    await api().post('/api/auth/register').send({ name: 'Indicador Dois Lados', cpf: testCpf(), email: 'ind2@t.com', password: 'senha123' });
    const ind = await prisma.user.findUnique({ where: { email: 'ind2@t.com' } });
    await prisma.user.update({ where: { id: ind!.id }, data: { emailVerified: true } });
    await api().post('/api/auth/register').send({ name: 'Convidado Dois Lados', cpf: testCpf(), email: 'conv2@t.com', password: 'senha123', referral: ind!.referralCode });
    const otp = (await import('../src/auth/otp')).issueOtp('conv2@t.com');
    await api().post('/api/auth/verify-email').send({ email: 'conv2@t.com', code: otp });
    const conv = await prisma.user.findUnique({ where: { email: 'conv2@t.com' } });
    const indDepois = await prisma.user.findUnique({ where: { email: 'ind2@t.com' } });
    expect(conv?.credits).toBe(REFERRAL_BONUS); // pagou o BÔNUS REAL, não o valor de copy 20
    expect(indDepois?.credits).toBe(ind!.credits + REFERRAL_BONUS);
  });

  it('valor de copy inválido/ausente no AppSetting → cai pro default (bônus real)', async () => {
    await saveSettings('referral', { newUser: 0, recommender: -5 });
    const r = await api().get('/api/public/config');
    expect(r.body.referral.newUser).toBe(REFERRAL_BONUS);
    expect(r.body.referral.recommender).toBe(REFERRAL_BONUS);
  });
});

// Campo manual "Já tenho um código" (voz/papel): a validação de FORMATO vive no front
// (feedback instantâneo), mas o server segue guardando a porta — só código de usuário
// ATIVO entra (e-mail verificado), else 400.
describe('Validação do código manual no cadastro', () => {
  beforeEach(async () => { await resetDb(); });

  it('código de usuário NÃO verificado → rejeita (mesma regra do deep link)', async () => {
    await api().post('/api/auth/register').send({ name: 'Pendente Um', cpf: testCpf(), email: 'pend@t.com', password: 'senha123' });
    const pend = await prisma.user.findUnique({ where: { email: 'pend@t.com' } });
    // pend.referralCode existe mas emailVerified=false → deep link OU campo manual: 400.
    const r = await api().post('/api/auth/register').send({ name: 'Tentativa Codigo', cpf: testCpf(), email: 'tent@t.com', password: 'senha123', referral: pend!.referralCode });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/inválido/i);
  });

  it('código com formato aceito + dono ativo → aplica (referredBy gravado)', async () => {
    await api().post('/api/auth/register').send({ name: 'Ativo Um', cpf: testCpf(), email: 'atv@t.com', password: 'senha123' });
    const atv = await prisma.user.findUnique({ where: { email: 'atv@t.com' } });
    await prisma.user.update({ where: { id: atv!.id }, data: { emailVerified: true } });
    const r = await api().post('/api/auth/register').send({ name: 'Manual Dois', cpf: testCpf(), email: 'man@t.com', password: 'senha123', referral: atv!.referralCode });
    expect(r.status).toBe(201);
    expect(r.body.referralBonus).toBe(true);
    const man = await prisma.user.findUnique({ where: { email: 'man@t.com' } });
    expect(man?.referredBy).toBe(atv!.referralCode);
  });
});
