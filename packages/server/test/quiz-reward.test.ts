// Quiz de boas-vindas recompensado (billing/quiz-reward): 1x por USUÁRIO — o próprio
// ledger (kind='quiz') é a guarda anti-farm, atômica no $transaction.
import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../src/prisma';
import { resetDb, createUser, api, authHeader, getUserCredits } from './helpers';

describe('POST /api/billing/quiz-reward', () => {
  beforeEach(resetDb);

  it('credita a recompensa exatamente 1x por usuário (anti-farm via ledger)', async () => {
    const u = await createUser({ credits: 100 });

    const r1 = await api().post('/api/billing/quiz-reward').set(authHeader(u.token));
    expect(r1.status).toBe(200);
    expect(r1.body.ok).toBe(true);
    expect(Number(r1.body.amount)).toBeGreaterThan(0);
    expect(await getUserCredits(u.user.id)).toBe(100 + Number(r1.body.amount));

    // Segunda tentativa: NÃO paga de novo (mesma resposta de sucesso, sem crédito).
    const r2 = await api().post('/api/billing/quiz-reward').set(authHeader(u.token));
    expect(r2.status).toBe(200);
    expect(r2.body.ok).toBe(false);
    expect(r2.body.already).toBe(true);
    expect(await getUserCredits(u.user.id)).toBe(100 + Number(r1.body.amount));

    // Extrato: exatamente 1 lançamento quiz com delta positivo.
    const txs = await prisma.creditTransaction.findMany({ where: { userId: u.user.id, kind: 'quiz' } });
    expect(txs).toHaveLength(1);
    expect(txs[0].delta).toBe(Number(r1.body.amount));
  });

  it('usuários diferentes recebem cada um a sua recompensa', async () => {
    const a = await createUser({ credits: 0 });
    const b = await createUser({ credits: 0 });
    const ra = await api().post('/api/billing/quiz-reward').set(authHeader(a.token));
    const rb = await api().post('/api/billing/quiz-reward').set(authHeader(b.token));
    expect(ra.body.ok).toBe(true);
    expect(rb.body.ok).toBe(true);
    expect(await getUserCredits(a.user.id)).toBe(Number(ra.body.amount));
    expect(await getUserCredits(b.user.id)).toBe(Number(rb.body.amount));
  });

  it('exige autenticação', async () => {
    const r = await api().post('/api/billing/quiz-reward');
    expect(r.status).toBe(401);
  });
});
