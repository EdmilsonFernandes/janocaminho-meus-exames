import { describe, it, expect, beforeEach } from 'vitest';
import { api, authHeader, resetDb, createUser, getUserCredits } from './helpers';
import { prisma } from '../src/prisma';

describe('doctor-share: custo por escopo ao compartilhar (na criação)', () => {
  beforeEach(async () => { await resetDb(); });

  it('criar share cobra a soma dos escopos (exams+evolution = 10) e registra no extrato', async () => {
    const { user, token } = await createUser({ credits: 100 });
    const r = await api().post('/api/doctor-shares').set(authHeader(token))
      .send({ doctorName: 'Dra Teste', doctorCrm: '12345-SP', scopes: ['exams', 'evolution'] });
    expect(r.status).toBe(201);
    expect(r.body.chargedCredits).toBe(10);
    expect(await getUserCredits(user.id)).toBe(90); // 100 - 10
    // creditsCharged gravado (pro extrato)
    const share = await prisma.doctorShare.findFirst({ where: { patient: { ownerId: user.id } }, select: { creditsCharged: true } });
    expect(share?.creditsCharged).toBe(10);
    // extrato mostra o charge
    const ext = await api().get('/api/billing/credits/history').set(authHeader(token));
    const shareItem = ext.body.items.find((it: any) => it.label === 'Compartilhamento com médico');
    expect(shareItem).toBeTruthy();
    expect(shareItem.amount).toBe(-10);
  });

  it('reativar o MESMO médico (share já existe) NÃO cobra de novo', async () => {
    const { user, token } = await createUser({ credits: 100 });
    await api().post('/api/doctor-shares').set(authHeader(token))
      .send({ doctorName: 'Dra Teste', doctorCrm: '12345-SP', scopes: ['exams', 'evolution'] });
    expect(await getUserCredits(user.id)).toBe(90);

    // 2º POST, mesmo CRM → reativa (200), sem nova cobrança
    const r2 = await api().post('/api/doctor-shares').set(authHeader(token))
      .send({ doctorName: 'Dra Teste', doctorCrm: '12345-SP', scopes: ['exams'] });
    expect(r2.status).toBe(200);
    expect(await getUserCredits(user.id)).toBe(90); // saldo intacto
  });

  it('saldo insuficiente → 402 e não cria o share', async () => {
    const poor = await createUser({ credits: 5 });
    const fail = await api().post('/api/doctor-shares').set(authHeader(poor.token))
      .send({ doctorName: 'Dr Outro', doctorCrm: '99999-SP', scopes: ['exams', 'evolution', 'alerts', 'summary'] }); // 5+5+3+5 = 18
    expect(fail.status).toBe(402);
    expect(await getUserCredits(poor.user.id)).toBe(5); // nada debitado
  });
});
