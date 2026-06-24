import { describe, it, expect, beforeEach } from 'vitest';
import { api, authHeader, resetDb, createUser, createExam, createItem, getUserCredits } from './helpers';
import { tryLocalAnswer } from '../src/analysis/chat-router';
import { prisma } from '../src/prisma';
import { CREDIT_COSTS } from '../src/utils/credits';

// espera o pós-resposta (a rota persiste/cria após encerrar o SSE)
const flush = (ms = 80) => new Promise((r) => setTimeout(r, ms));

describe('chat-router: tryLocalAnswer (unit)', () => {
  let ctx: { user: any; patient: any; token: string };

  beforeEach(async () => {
    await resetDb();
    ctx = await createUser({ credits: 100 });
    const exam = await createExam(ctx.patient.id, { title: 'Hemograma + Tireoide' });
    await createItem(exam.id, { name: 'TSH', nameCanonical: 'TSH', valueNumeric: 7.32, valueText: '7,32', unit: 'µUI/mL', refLow: 0.4, refHigh: 4.0, flag: 'HIGH', isAbnormal: true });
    await createItem(exam.id, { name: 'HEMOGLOBINA', nameCanonical: 'HEMOGLOBINA', valueNumeric: 14, valueText: '14,0', unit: 'g/dL', refLow: 12, refHigh: 16, flag: 'NORMAL', isAbnormal: false });
  });

  it('responde "último TSH" com o valor + status (sem chamar IA)', async () => {
    const r = await tryLocalAnswer({ message: 'qual foi meu último TSH?', userId: ctx.user.id, patientId: ctx.patient.id });
    expect(r.answered).toBe(true);
    expect(r.text).toMatch(/7,32/);
    expect(r.text).toMatch(/TSH/);
    expect(r.text).toMatch(/acima/i);
  });

  it('escalona pra IA (answered=false) em pergunta interpretativa', async () => {
    const r = await tryLocalAnswer({ message: 'o que significa TSH alto?', userId: ctx.user.id, patientId: ctx.patient.id });
    expect(r.answered).toBe(false);
  });

  it('responde hemoglobina via sinônimo "HGB"', async () => {
    const r = await tryLocalAnswer({ message: 'meu HGB atual', userId: ctx.user.id, patientId: ctx.patient.id });
    expect(r.answered).toBe(true);
    expect(r.text).toMatch(/14/);
  });

  it('conta exames ("quantos exames tenho")', async () => {
    const r = await tryLocalAnswer({ message: 'quantos exames eu tenho?', userId: ctx.user.id, patientId: ctx.patient.id });
    expect(r.answered).toBe(true);
    expect(r.text).toContain('**1**');
  });

  it('lista exames ("quais são meus exames")', async () => {
    const r = await tryLocalAnswer({ message: 'quais são meus exames?', userId: ctx.user.id, patientId: ctx.patient.id });
    expect(r.answered).toBe(true);
    expect(r.text).toMatch(/Hemograma \+ Tireoide/);
  });

  it('NÃO responde localmente pergunta ANALÍTICA com "exames" → vai pra IA (usar valores)', async () => {
    // antes estas batiam em LIST_EXAMS e o router devolvia SÓ a lista de títulos, sem análise.
    const r = await tryLocalAnswer({ message: 'liste os valores fora da faixa de referência nos meus exames', userId: ctx.user.id, patientId: ctx.patient.id });
    expect(r.answered).toBe(false);
  });

  it('resumo / comparar / evolução / atenção → IA (analítico, mesmo contendo "exames")', async () => {
    for (const msg of ['faça um resumo geral dos meus exames', 'compare meus dois exames mais recentes', 'como meus exames evoluíram', 'há resultado que precise de atenção médica?']) {
      const r = await tryLocalAnswer({ message: msg, userId: ctx.user.id, patientId: ctx.patient.id });
      expect(r.answered).toBe(false);
    }
  });

  it('NÃO responde conversa fiada ("oi, tudo bem?")', async () => {
    const r = await tryLocalAnswer({ message: 'oi, tudo bem?', userId: ctx.user.id, patientId: ctx.patient.id });
    expect(r.answered).toBe(false);
  });

  it('marcador conhecido mas ausente no perfil → responde que não achou', async () => {
    const r = await tryLocalAnswer({ message: 'qual minha última creatinina?', userId: ctx.user.id, patientId: ctx.patient.id });
    expect(r.answered).toBe(true);
    expect(r.text).toMatch(/não encontrei/i);
    expect(r.text).toMatch(/Creatinina/i);
  });
});

describe('chat-router: integração POST /api/chat', () => {
  beforeEach(async () => { await resetDb(); });

  it('pergunta factual → 200, resposta local, IA NÃO chamada, 0 crédito', async () => {
    const { user, patient, token } = await createUser({ credits: 100 });
    const exam = await createExam(patient.id);
    await createItem(exam.id, { name: 'TSH', nameCanonical: 'TSH', valueNumeric: 7.32, valueText: '7,32', unit: 'µUI/mL', refLow: 0.4, refHigh: 4.0, flag: 'HIGH', isAbnormal: true });

    const r = await api().post('/api/chat').set(authHeader(token)).send({ message: 'qual foi meu último TSH?', patientId: patient.id });
    expect(r.status).toBe(200);
    expect(r.text).toMatch(/7,32/);
    expect(await getUserCredits(user.id)).toBe(100); // grátis → prova que a IA (que cobra) não rodou

    await flush();
    const turn = await prisma.aiAnalysis.findFirst({ where: { patientId: patient.id, type: 'CHAT' } });
    expect(turn?.modelUsed).toBe('local-router');
  });

  it('pergunta interpretativa → cai pra IA e debita chat', async () => {
    const { user, patient, token } = await createUser({ credits: 100 });
    const exam = await createExam(patient.id);
    await createItem(exam.id, { name: 'TSH', nameCanonical: 'TSH', valueNumeric: 7.32, valueText: '7,32', refLow: 0.4, refHigh: 4.0, flag: 'HIGH', isAbnormal: true });

    const r = await api().post('/api/chat').set(authHeader(token)).send({ message: 'o que pode significar TSH alto?', patientId: patient.id });
    expect(r.status).toBe(200);
    await flush();
    expect(await getUserCredits(user.id)).toBe(100 - CREDIT_COSTS.chat); // IA rodou → debitou

    const turn = await prisma.aiAnalysis.findFirst({ where: { patientId: patient.id, type: 'CHAT' } });
    expect(turn?.modelUsed).not.toBe('local-router'); // foi pra IA de verdade
  });
});
