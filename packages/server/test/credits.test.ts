import { describe, it, expect, beforeEach } from 'vitest';
import { api, authHeader, resetDb, createUser, createExam, getUserCredits } from './helpers';
import { chargeCredits, CREDIT_COSTS } from '../src/utils/credits';
import { prisma } from '../src/prisma';

// espera o pós-resposta (chat debita créditos DEPOIS de encerrar o SSE)
const flush = (ms = 80) => new Promise((r) => setTimeout(r, ms));

describe('créditos: débito atômico + cache (não cobrar 2x)', () => {
  beforeEach(async () => { await resetDb(); });

  it('chargeCredits: false se saldo insuficiente, true + decrementa se suficiente', async () => {
    const poor = await createUser({ credits: 5 });
    expect(await chargeCredits(poor.user.id, 10)).toBe(false);
    expect(await getUserCredits(poor.user.id)).toBe(5); // intocado

    const rich = await createUser({ credits: 20 });
    expect(await chargeCredits(rich.user.id, 10)).toBe(true);
    expect(await getUserCredits(rich.user.id)).toBe(10);
  });

  it('POST /analyses: PRIMEIRO summary é grátis; 2º sem force → cache, não cobra', async () => {
    const { user, patient, token } = await createUser({ credits: 100 });
    const exam = await createExam(patient.id);

    // 1ª leitura é SEMPRE grátis (pesquisa ago/2026: a 1ª interpretação virou commodity)
    const r1 = await api().post('/api/analyses').set(authHeader(token)).send({ examId: exam.id });
    expect(r1.status).toBe(201);
    expect(await getUserCredits(user.id)).toBe(100);

    // 2ª chamada sem force → devolve o existente (cache), NÃO cobra
    const r2 = await api().post('/api/analyses').set(authHeader(token)).send({ examId: exam.id });
    expect(r2.status).toBe(200);
    expect(await getUserCredits(user.id)).toBe(100);
  });

  it('POST /analyses com force=true REGENERA e cobra (o 1º grátis foi consumido)', async () => {
    const { user, patient, token } = await createUser({ credits: 100 });
    const exam = await createExam(patient.id);
    await api().post('/api/analyses').set(authHeader(token)).send({ examId: exam.id });        // grátis (1º)
    await api().post('/api/analyses').set(authHeader(token)).send({ examId: exam.id, force: true }); // cobra 10
    expect(await getUserCredits(user.id)).toBe(100 - CREDIT_COSTS.summary);
  });

  it('POST /analyses: saldo insuficiente a partir do 2º summary → 402 insufficient_credits', async () => {
    const { user, patient, token } = await createUser({ credits: 100 });
    const exam = await createExam(patient.id);
    await api().post('/api/analyses').set(authHeader(token)).send({ examId: exam.id }); // 1º grátis
    // Esvazia o saldo: o PRÓXIMO summary custa e não há crédito
    await prisma.user.update({ where: { id: user.id }, data: { credits: 5 } });
    const r = await api().post('/api/analyses').set(authHeader(token)).send({ examId: exam.id, force: true });
    expect(r.status).toBe(402);
    expect(r.body.error).toBe('insufficient_credits');
  });

  it('POST /analyses/consolidated cobra 20 e usa cache de 1h', async () => {
    const { user, patient, token } = await createUser({ credits: 100 });
    await createExam(patient.id); // precisa de ≥1 exame extraído

    const r1 = await api().post('/api/analyses/consolidated').set(authHeader(token)).send({ patientId: patient.id });
    expect(r1.status).toBe(201);
    expect(await getUserCredits(user.id)).toBe(100 - CREDIT_COSTS.consolidated);

    // 2ª dentro de 1h → cache, não cobra
    const r2 = await api().post('/api/analyses/consolidated').set(authHeader(token)).send({ patientId: patient.id });
    expect(r2.status).toBe(200);
    expect(await getUserCredits(user.id)).toBe(100 - CREDIT_COSTS.consolidated);
  });

  it('POST /chat cobra 2 créditos por mensagem; 402 se insuficiente', async () => {
    const { user, patient, token } = await createUser({ credits: 10 });

    const ok = await api().post('/api/chat').set(authHeader(token)).send({ message: 'oi', patientId: patient.id });
    expect(ok.status).toBe(200);
    await flush();
    expect(await getUserCredits(user.id)).toBe(10 - CREDIT_COSTS.chat);
    const turns = await prisma.aiAnalysis.count({ where: { patientId: patient.id, type: 'CHAT' } });
    expect(turns).toBe(1);

    // sem créditos suficientes p/ outra (7 < 3? não; 7>=3). Cenário isolado:
    const poor = await createUser({ credits: 1 });
    const fail = await api().post('/api/chat').set(authHeader(poor.token)).send({ message: 'oi', patientId: poor.patient.id });
    expect(fail.status).toBe(402);
  });

  it('POST /chat valida mensagem (400) e paciente (403)', async () => {
    const { patient, token } = await createUser();
    const noMsg = await api().post('/api/chat').set(authHeader(token)).send({ patientId: patient.id });
    expect(noMsg.status).toBe(400);

    const badPatient = await api().post('/api/chat').set(authHeader(token)).send({ message: 'oi', patientId: 'cuida-alheio' });
    expect(badPatient.status).toBe(403);
  });
});
