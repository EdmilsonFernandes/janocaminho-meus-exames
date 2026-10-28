import { describe, it, expect, beforeEach, vi } from 'vitest';
import { api, authHeader, resetDb, createUser, createExam, getUserCredits , createItem } from './helpers';
import { prisma } from '../src/prisma';

// As rotas gravam o log com `void logAiUsage(...)` e respondem antes (o chat, depois de
// encerrar o SSE) — a linha pode chegar ao banco DEPOIS da resposta. Contar uma vez só
// derrubava o CI ("expected +0 to be 1"); espera o log aparecer (até 3s).
const waitLog = <T>(check: () => Promise<T>) => vi.waitFor(check, { timeout: 3000, interval: 25 });

// Regressão 09/10/2026: o painel admin "Usabilidade" lê ai_usage_logs — tabela que
// NUNCA era escrita (uso de IA aparecia 0 pra sempre) e premium com perk gerava
// relatório sem NENHUMA linha na carteira ("fiz IA e não vi nada").
describe('uso de IA visível: ai_usage_logs + carteira premium', () => {
  beforeEach(async () => { await resetDb(); });

  it('resumo de exame (1º grátis) registra uso SUMMARY com userId + modelo', async () => {
    const { user, patient, token } = await createUser({ credits: 100 });
    const exam = await createExam(patient.id);
    await createItem(exam.id, { valueNumeric: 14.2, refLow: 13, refHigh: 17 });
    await createItem(exam.id, { valueNumeric: 14.2, refLow: 13, refHigh: 17 });
    const r = await api().post('/api/analyses').set(authHeader(token)).send({ examId: exam.id });
    expect(r.status).toBe(201);
    const logs = await waitLog(async () => {
      const found = await prisma.aiUsageLog.findMany({ where: { userId: user.id, feature: 'SUMMARY' } });
      expect(found).toHaveLength(1);
      return found;
    });
    expect(logs[0].success).toBe(true);
    expect(logs[0].model).toBeTruthy();
  });

  it('consolidado de PREMIUM (perk): sem débito, mas gera linha "incluído no plano" na carteira + log de uso', async () => {
    const { user, patient, token } = await createUser({ credits: 100, premium: true });
    const _e = await createExam(patient.id);
    await createItem(_e.id, { valueNumeric: 14.2, refLow: 13, refHigh: 17 });
    const r = await api().post('/api/analyses/consolidated').set(authHeader(token)).send({ patientId: patient.id });
    expect(r.status).toBe(201);
    expect(await getUserCredits(user.id)).toBe(100); // perk consolidadoFree: zero débito
    const ledger = await prisma.creditTransaction.findFirst({ where: { userId: user.id, kind: 'ai_consolidated' } });
    expect(ledger?.delta).toBe(0); // …porém CONSTA no extrato (carteira não fica muda)
    expect(ledger?.label).toContain('incluído no plano');
    await waitLog(async () => expect(await prisma.aiUsageLog.count({ where: { userId: user.id, feature: 'CONSOLIDATED' } })).toBe(1));
  });

  it('consolidado de FREE cobra 20 e registra uso', async () => {
    const { user, patient, token } = await createUser({ credits: 100 });
    const _e = await createExam(patient.id);
    await createItem(_e.id, { valueNumeric: 14.2, refLow: 13, refHigh: 17 });
    const r = await api().post('/api/analyses/consolidated').set(authHeader(token)).send({ patientId: patient.id });
    expect(r.status).toBe(201);
    expect(await getUserCredits(user.id)).toBe(100 - 20);
    await waitLog(async () => expect(await prisma.aiUsageLog.count({ where: { userId: user.id, feature: 'CONSOLIDATED' } })).toBe(1));
  });

  it('chat registra uso CHAT (local-router ou IA)', async () => {
    const { user, patient, token } = await createUser({ credits: 20 });
    const r = await api().post('/api/chat').set(authHeader(token)).send({ message: 'o que significa glicose alta?', patientId: patient.id });
    expect(r.status).toBe(200);
    await waitLog(async () => expect(await prisma.aiUsageLog.count({ where: { userId: user.id, feature: 'CHAT' } })).toBeGreaterThanOrEqual(1));
  });
});
