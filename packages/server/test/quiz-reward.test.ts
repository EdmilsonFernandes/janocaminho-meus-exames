// Quiz de boas-vindas recompensado (billing): 1x por USUÁRIO — o próprio ledger
// (kind='quiz') é a guarda anti-farm, atômica no $transaction.
// RESUMÍVEL (05/10): a recompensa exige participação COMPLETA (quiz-answer até o total);
// abandono no meio não paga — retoma de onde parou via quiz-state.
import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../src/prisma';
import { resetDb, createUser, api, authHeader, getUserCredits } from './helpers';

const QUIZ_ID = 'onboarding-2026-10';
const TOTAL = 3; // nº de perguntas dono do conteúdo (front) — mesmo valor do GoalQuiz

/** Responde o quiz inteiro (ou até `upTo`) via POST /quiz-answer. */
async function answerQuiz(token: string, upTo: number) {
  for (let i = 0; i < upTo; i++) {
    const r = await api().post('/api/billing/quiz-answer').set(authHeader(token)).send({ quizId: QUIZ_ID, index: i, answer: `a${i}`, total: TOTAL });
    if (r.status !== 200) throw new Error(`quiz-answer ${i} falhou ${r.status} ${JSON.stringify(r.body)}`);
  }
}

describe('GET /api/billing/quiz-state', () => {
  beforeEach(resetDb);

  it('sem participação → null + recompensa corrente', async () => {
    const u = await createUser();
    const r = await api().get('/api/billing/quiz-state').set(authHeader(u.token));
    expect(r.status).toBe(200);
    expect(r.body.participation).toBeNull();
    expect(Number(r.body.reward)).toBeGreaterThan(0);
  });

  it('exige autenticação', async () => {
    const r = await api().get('/api/billing/quiz-state');
    expect(r.status).toBe(401);
  });
});

describe('POST /api/billing/quiz-answer (participação persistida)', () => {
  beforeEach(resetDb);

  it('abandona no meio → quiz-state devolve onde parou; completar marca completedAt', async () => {
    const u = await createUser();
    // Responde 2 de 3 e "sai do app"
    await answerQuiz(u.token, 2);

    const s1 = await api().get('/api/billing/quiz-state').set(authHeader(u.token));
    expect(s1.body.participation.currentIndex).toBe(2);
    expect(s1.body.participation.completedAt).toBeNull();
    expect(s1.body.participation.answers).toMatchObject({ '0': 'a0', '1': 'a1' });

    // Retoma: responde a última → completa
    const last = await api().post('/api/billing/quiz-answer').set(authHeader(u.token)).send({ quizId: QUIZ_ID, index: 2, answer: 'a2', total: TOTAL });
    expect(last.status).toBe(200);
    expect(last.body.completed).toBe(true);
    expect(last.body.completedAt).toBeTruthy();

    const s2 = await api().get('/api/billing/quiz-state').set(authHeader(u.token));
    expect(s2.body.participation.currentIndex).toBe(TOTAL);
    expect(s2.body.participation.completedAt).toBeTruthy();
  });

  it('responder de novo após completa é idempotente (não regrava)', async () => {
    const u = await createUser();
    await answerQuiz(u.token, TOTAL);
    const again = await api().post('/api/billing/quiz-answer').set(authHeader(u.token)).send({ quizId: QUIZ_ID, index: 0, answer: 'outro', total: TOTAL });
    expect(again.body.completed).toBe(true);
    const s = await api().get('/api/billing/quiz-state').set(authHeader(u.token));
    expect(s.body.participation.answers).toMatchObject({ '0': 'a0' }); // resposta original preservada
  });

  it('valida entrada (quizId/index/total)', async () => {
    const u = await createUser();
    expect((await api().post('/api/billing/quiz-answer').set(authHeader(u.token)).send({ quizId: 'x y!', index: 0, answer: 'a' })).status).toBe(400);
    expect((await api().post('/api/billing/quiz-answer').set(authHeader(u.token)).send({ quizId: QUIZ_ID, index: -1, answer: 'a' })).status).toBe(400);
    expect((await api().post('/api/billing/quiz-answer').set(authHeader(u.token)).send({ quizId: QUIZ_ID, index: 3, answer: 'a', total: TOTAL })).status).toBe(400);
    expect((await api().post('/api/billing/quiz-answer').set(authHeader(u.token)).send({ quizId: QUIZ_ID, index: 0, answer: 'a', total: 'muitas' })).status).toBe(400);
  });

  it('exige autenticação', async () => {
    const r = await api().post('/api/billing/quiz-answer').send({ quizId: QUIZ_ID, index: 0, answer: 'a', total: TOTAL });
    expect(r.status).toBe(401);
  });
});

describe('POST /api/billing/quiz-reward (só credita completo)', () => {
  beforeEach(resetDb);

  it('INCOMPLETO não credita (incomplete: true) — completar credita 1x', async () => {
    const u = await createUser({ credits: 100 });
    await answerQuiz(u.token, 2); // abandona no meio

    const r1 = await api().post('/api/billing/quiz-reward').set(authHeader(u.token));
    expect(r1.status).toBe(200);
    expect(r1.body.ok).toBe(false);
    expect(r1.body.incomplete).toBe(true);
    expect(await getUserCredits(u.user.id)).toBe(100); // nada creditado

    await answerQuiz(u.token, TOTAL); // retoma e completa
    const r2 = await api().post('/api/billing/quiz-reward').set(authHeader(u.token));
    expect(r2.status).toBe(200);
    expect(r2.body.ok).toBe(true);
    expect(Number(r2.body.amount)).toBeGreaterThan(0);
    expect(await getUserCredits(u.user.id)).toBe(100 + Number(r2.body.amount));

    // Segunda tentativa: NÃO paga de novo (mesma resposta de sucesso, sem crédito).
    const r3 = await api().post('/api/billing/quiz-reward').set(authHeader(u.token));
    expect(r3.status).toBe(200);
    expect(r3.body.ok).toBe(false);
    expect(r3.body.already).toBe(true);
    expect(await getUserCredits(u.user.id)).toBe(100 + Number(r2.body.amount));

    // Extrato: exatamente 1 lançamento quiz com delta positivo.
    const txs = await prisma.creditTransaction.findMany({ where: { userId: u.user.id, kind: 'quiz' } });
    expect(txs).toHaveLength(1);
    expect(txs[0].delta).toBe(Number(r2.body.amount));
  });

  it('usuários diferentes recebem cada um a sua recompensa (completando o quiz)', async () => {
    const a = await createUser({ credits: 0 });
    const b = await createUser({ credits: 0 });
    await answerQuiz(a.token, TOTAL);
    await answerQuiz(b.token, TOTAL);
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
