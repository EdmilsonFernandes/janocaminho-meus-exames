// Economia de token do chat (24/11/26) — E2E da rota com a IA simulada (setup.ts mocka streamChat):
//  1. cache: mesma pergunta + mesmos dados NÃO chama a IA de novo e não cobra;
//  2. contexto enxuto: o bloco repetido sai do prompt sem perder nenhum valor;
//  3. IA indisponível: a pessoa recebe os dados dos exames e o crédito volta;
//  4. kill-switch (AppSetting chatEconomy) desliga cada peça sem deploy.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { api, authHeader, resetDb, createUser, createExam, createItem, getUserCredits } from './helpers';
import { prisma } from '../src/prisma';
import { streamChat } from '../src/analysis/chat';
import { loadSettings, saveSettings } from '../src/utils/settings';
import { CREDIT_COSTS } from '../src/utils/credits';
import { questionKey, dataFingerprint } from '../src/analysis/chat-cache';
import { buildOfflineAnswer } from '../src/analysis/chat-offline';

const llm = vi.mocked(streamChat);
// Um dos botões de sugestão do app — a pergunta mais repetida em produção.
const CHIP = 'Faça um resumo geral dos meus exames mais recentes e destaque o que precisa de atenção.';

async function patientWithExams() {
  const u = await createUser({ credits: 100 });
  const older = await createExam(u.patient.id, { title: 'Tireoide', performedAt: new Date('2026-03-10T12:00:00Z') });
  await createItem(older.id, { name: 'TSH', nameCanonical: 'TSH', valueNumeric: 11, unit: 'mUI/L', refLow: 0.4, refHigh: 4, flag: 'HIGH', isAbnormal: true });
  const newer = await createExam(u.patient.id, { title: 'Check-up', performedAt: new Date('2026-09-20T12:00:00Z') });
  await createItem(newer.id, { name: 'TSH', nameCanonical: 'TSH', valueNumeric: 7.2, unit: 'mUI/L', refLow: 0.4, refHigh: 4, flag: 'HIGH', isAbnormal: true });
  await createItem(newer.id, { name: 'Glicose', nameCanonical: 'GLICOSE', valueNumeric: 92, unit: 'mg/dL', refLow: 70, refHigh: 99, flag: 'NORMAL' });
  return { ...u, newer };
}
// A rota grava o turno no banco DEPOIS de fechar o stream: a resposta HTTP chega antes da linha
// existir. Sem esperar, a pergunta seguinte (ou a leitura do turno) corre contra a gravação —
// passou local e quebrou no CI (24/11). Cada pergunta só "termina" quando o turno dela está salvo.
const turnCount = (patientId: string) => prisma.aiAnalysis.count({ where: { patientId, type: 'CHAT' } });
const ask = async (token: string, patientId: string, message = CHIP) => {
  const before = await turnCount(patientId);
  const r = await api().post('/api/chat').set(authHeader(token)).send({ message, patientId });
  await vi.waitFor(async () => expect(await turnCount(patientId)).toBeGreaterThan(before), { timeout: 5000, interval: 25 });
  return r;
};
const lastTurn = (patientId: string) =>
  prisma.aiAnalysis.findFirst({ where: { patientId, type: 'CHAT' }, orderBy: { createdAt: 'desc' } });

describe('chat: cache de resposta (mesma pergunta + mesmos dados)', () => {
  beforeEach(async () => { await resetDb(); await loadSettings(); llm.mockClear(); });

  it('2ª pergunta igual NÃO chama a IA, devolve a mesma resposta e não cobra', async () => {
    const { user, patient, token } = await patientWithExams();
    const first = await ask(token, patient.id);
    expect(first.status).toBe(200);
    expect(llm).toHaveBeenCalledTimes(1);
    expect(await getUserCredits(user.id)).toBe(100 - CREDIT_COSTS.chat);

    const second = await ask(token, patient.id);
    expect(second.status).toBe(200);
    expect(llm).toHaveBeenCalledTimes(1); // IA NÃO foi chamada de novo
    expect(second.text).toContain('Resposta de teste do Dr. Exame.');
    expect(second.text).toContain('"model":"cache"');
    expect(await getUserCredits(user.id)).toBe(100 - CREDIT_COSTS.chat); // sem 2º débito
    expect((await lastTurn(patient.id))?.modelUsed).toBe('cache');
  });

  it('pergunta com as mesmas palavras em outra ordem também reaproveita', async () => {
    const { patient, token } = await patientWithExams();
    // >55 caracteres de propósito: abaixo disso o pré-roteador pode responder sozinho.
    await ask(token, patient.id, 'Meu TSH está melhorando ou piorando com o passar do tempo nos exames?');
    await ask(token, patient.id, 'Nos exames, com o passar do tempo, meu TSH está piorando ou melhorando?');
    expect(llm).toHaveBeenCalledTimes(1);
  });

  it('exame novo muda os dados → a IA é chamada de novo', async () => {
    const { patient, token, newer } = await patientWithExams();
    await ask(token, patient.id);
    await createItem(newer.id, { name: 'Colesterol LDL', nameCanonical: 'LDL', valueNumeric: 160, unit: 'mg/dL', refLow: 0, refHigh: 130, flag: 'HIGH', isAbnormal: true });
    await ask(token, patient.id);
    expect(llm).toHaveBeenCalledTimes(2);
  });

  it('nunca cruza pacientes: outra pessoa com a mesma pergunta chama a IA', async () => {
    const a = await patientWithExams();
    const b = await patientWithExams();
    await ask(a.token, a.patient.id);
    await ask(b.token, b.patient.id);
    expect(llm).toHaveBeenCalledTimes(2);
  });

  it('resposta com mais de 7 dias não serve mais', async () => {
    const { patient, token } = await patientWithExams();
    await ask(token, patient.id);
    await prisma.aiAnalysis.updateMany({ where: { patientId: patient.id, type: 'CHAT' }, data: { createdAt: new Date(Date.now() - 8 * 86_400_000) } });
    await ask(token, patient.id);
    expect(llm).toHaveBeenCalledTimes(2);
  });

  it('kill-switch: chatEconomy.cache=0 → sempre chama a IA', async () => {
    const { patient, token } = await patientWithExams();
    await saveSettings('chatEconomy', { cache: 0 });
    await ask(token, patient.id);
    await ask(token, patient.id);
    expect(llm).toHaveBeenCalledTimes(2);
  });
});

describe('chat: contexto enxuto', () => {
  beforeEach(async () => { await resetDb(); await loadSettings(); llm.mockClear(); });
  const contextOf = () => String((llm.mock.calls.at(-1)![0] as any).contextText);

  it('tira o bloco repetido e mantém TODOS os valores (atual + linha do tempo com marca)', async () => {
    const { patient, token } = await patientWithExams();
    await ask(token, patient.id);
    const slim = contextOf();
    expect(slim).not.toContain('TODOS os itens');
    expect(slim).toContain('títulos e datas');
    expect(slim).toContain('VALORES ATUAIS');
    expect(slim).toMatch(/TSH: 7[.,]2 mUI\/L \(ref 0[.,]4-4\) \[acima\]/); // atual, com faixa
    expect(slim).toMatch(/TSH: 7[.,]2 mUI\/L \(20\/09\/2026\) \[acima\]\s+→\s+11 mUI\/L \(10\/03\/2026\) \[acima\]/); // histórico com marca
    expect(slim).toContain('Glicose: 92 mg/dL');
  });

  it('é MENOR que o completo, e o kill-switch (slimContext=0) volta ao completo', async () => {
    const { patient, token } = await patientWithExams();
    await ask(token, patient.id);
    const slim = contextOf();
    await saveSettings('chatEconomy', { slimContext: 0, cache: 0 });
    await ask(token, patient.id);
    const full = contextOf();
    expect(full).toContain('TODOS os itens');
    expect(slim.length).toBeLessThan(full.length);
  });

  it('item que repete a chave no mesmo dia (ex.: % e absoluto) não some no modo enxuto', async () => {
    const { patient, token, newer } = await patientWithExams();
    await createItem(newer.id, { name: 'Neutrófilos', nameCanonical: 'NEUTROFILOS', valueNumeric: 55, unit: '%', refLow: 40, refHigh: 70, flag: 'NORMAL' });
    await createItem(newer.id, { name: 'Neutrófilos (absoluto)', nameCanonical: 'NEUTROFILOS', valueNumeric: 3300, unit: '/mm³', refLow: 1700, refHigh: 7000, flag: 'NORMAL' });
    await ask(token, patient.id);
    const slim = contextOf();
    expect(slim).toContain('55 %');
    expect(slim).toContain('3300 /mm³');
  });
});

describe('chat: IA indisponível → resposta com os dados dos exames', () => {
  beforeEach(async () => { await resetDb(); await loadSettings(); llm.mockClear(); });

  it('rota: resposta offline devolve o crédito, grava como "offline" e NÃO vira fonte do cache', async () => {
    const { user, patient, token } = await patientWithExams();
    llm.mockImplementationOnce(async ({ res, offlineAnswer }: any) => {
      const text = offlineAnswer();
      res.setHeader('Content-Type', 'text/event-stream');
      res.write(`data: ${JSON.stringify({ type: 'delta', delta: text })}\n\n`);
      res.end();
      return { text, model: 'offline', sources: [], offline: true };
    });
    const r = await ask(token, patient.id);
    expect(r.status).toBe(200);
    expect(r.text).toContain('TSH');
    await vi.waitFor(async () => expect(await getUserCredits(user.id)).toBe(100)); // crédito devolvido
    expect((await lastTurn(patient.id))?.modelUsed).toBe('offline');

    await ask(token, patient.id); // IA voltou: precisa responder de verdade, não repetir o offline
    expect(llm).toHaveBeenCalledTimes(2);
    expect((await lastTurn(patient.id))?.modelUsed).toBe('glm-4.6');
  });

  it('texto sem IA: lista o que está fora da faixa, sem interpretar', () => {
    const exams = [
      { title: 'Check-up', performedAt: new Date('2026-09-20T12:00:00Z'), items: [
        { name: 'TSH', nameCanonical: 'TSH', valueNumeric: 7.2, unit: 'mUI/L', refLow: 0.4, refHigh: 4 },
        { name: 'Glicose', nameCanonical: 'GLICOSE', valueNumeric: 92, unit: 'mg/dL', refLow: 70, refHigh: 99 },
      ] },
      { title: 'Tireoide', performedAt: new Date('2026-03-10T12:00:00Z'), items: [
        { name: 'TSH', nameCanonical: 'TSH', valueNumeric: 11, unit: 'mUI/L', refLow: 0.4, refHigh: 4 },
      ] },
    ];
    const geral = buildOfflineAnswer(CHIP, exams);
    expect(geral).toContain('TSH: **7,2 mUI/L**');
    expect(geral).toContain('acima da faixa');
    expect(geral).not.toContain('Glicose'); // na faixa → não entra na lista de fora da faixa
    expect(geral).not.toContain('11'); // só o MAIS RECENTE de cada item
    expect(geral).toContain('crédito desta pergunta foi devolvido');
    expect(geral).not.toMatch(/normal|grave|preocup|tudo bem/i); // fatos, sem leitura clínica

    const focado = buildOfflineAnswer('como está meu TSH?', exams);
    expect(focado).toContain('20/09/2026');
    expect(focado).toContain('10/03/2026'); // pergunta sobre um item → traz o histórico dele
    expect(buildOfflineAnswer('oi', [])).toContain('Ainda não há exames');
  });
});

describe('chave da pergunta e impressão digital dos dados', () => {
  it('ordem e palavras de ligação não mudam a chave; palavra de sentido muda', () => {
    expect(questionKey('Meu TSH está alto demais nos exames?')).toBe(questionKey('nos exames o TSH esta demais alto'));
    expect(questionKey('Meu colesterol LDL está alto demais?')).not.toBe(questionKey('Meu colesterol LDL está baixo demais?'));
  });
  it('não cacheia pergunta curta, que aponta para a conversa ou que depende do dia', () => {
    expect(questionKey('e o TSH?')).toBeNull();
    expect(questionKey('e isso que você falou do colesterol é grave mesmo?')).toBeNull();
    expect(questionKey('como foi minha atividade física e meus passos hoje?')).toBeNull();
  });
  it('qualquer valor diferente muda a impressão digital', () => {
    expect(dataFingerprint(['TSH 7,2', 'med'])).toBe(dataFingerprint(['TSH 7,2', 'med']));
    expect(dataFingerprint(['TSH 7,2', 'med'])).not.toBe(dataFingerprint(['TSH 7,3', 'med']));
    expect(dataFingerprint(['a', 'b'])).not.toBe(dataFingerprint(['ab', '']));
  });
});
