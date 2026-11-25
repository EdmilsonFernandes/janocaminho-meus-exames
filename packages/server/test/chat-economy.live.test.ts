// Economia de token do chat — teste AO VIVO contra o Gemini de verdade.
//
// Só roda com a chave no ambiente (nunca no repositório, nunca no CI):
//   GEMINI_E2E_KEY=<chave> npm test --workspace packages/server -- test/chat-economy.live.test.ts
//   (opcional: GEMINI_E2E_MODEL, padrão gemini-3.5-flash)
//
// O que ele prova com a IA real, não com mock:
//  1. com o contexto ENXUTO a IA continua citando o valor mais recente certo (regressão do
//     "TSH 11 vs 7" — o motivo de o bloco completo existir);
//  2. o contexto enxuto gasta MENOS tokens de entrada que o completo, na mesma pergunta;
//  3. repetir a pergunta não chama a IA (cache) e a resposta é a mesma.
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { appendFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const KEY = process.env.GEMINI_E2E_KEY;
const MODEL = process.env.GEMINI_E2E_MODEL ?? 'gemini-3.5-flash';

vi.unmock('../src/analysis/chat'); // setup.ts mocka o streamChat; aqui é o de verdade
vi.mock('../src/llm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/llm')>();
  const { GeminiAdapter } = await import('../src/llm/gemini');
  const adapter = new GeminiAdapter({ apiKey: process.env.GEMINI_E2E_KEY ?? 'sem-chave', model: process.env.GEMINI_E2E_MODEL ?? 'gemini-3.5-flash' });
  return { ...actual, getChatLlm: () => adapter, getModel: () => process.env.GEMINI_E2E_MODEL ?? 'gemini-3.5-flash' };
});

import { api, authHeader, resetDb, createUser, createExam, createItem } from './helpers';
import { prisma } from '../src/prisma';
import { loadSettings, saveSettings } from '../src/utils/settings';

// Painel realista: 14 itens por exame, 4 exames → contexto do tamanho de um paciente de verdade.
const PANEL: [string, string, string, number, number, number[]][] = [
  // nome, canônico, unidade, refLow, refHigh, valores do mais antigo ao mais novo
  ['TSH', 'TSH', 'mUI/L', 0.4, 4, [11, 9.4, 8.1, 7.2]],
  ['T4 Livre', 'T4_LIVRE', 'ng/dL', 0.7, 1.8, [0.9, 1.0, 1.1, 1.1]],
  ['Glicose', 'GLICOSE', 'mg/dL', 70, 99, [95, 93, 94, 92]],
  ['Hemoglobina Glicada', 'HEMOGLOBINA_GLICADA', '%', 4, 5.6, [5.4, 5.4, 5.3, 5.3]],
  ['Colesterol Total', 'COLESTEROL_TOTAL', 'mg/dL', 0, 190, [228, 221, 232, 236]],
  ['Colesterol LDL', 'LDL', 'mg/dL', 0, 130, [151, 149, 158, 162]],
  ['Colesterol HDL', 'HDL', 'mg/dL', 40, 100, [48, 49, 47, 46]],
  ['Triglicerídeos', 'TRIGLICERIDEOS', 'mg/dL', 0, 150, [132, 128, 140, 138]],
  ['Hemoglobina', 'HEMOGLOBINA', 'g/dL', 13, 17, [14.6, 14.8, 14.5, 14.7]],
  ['Creatinina', 'CREATININA', 'mg/dL', 0.7, 1.3, [0.9, 0.9, 1.0, 0.9]],
  ['TGO', 'TGO', 'U/L', 5, 40, [22, 24, 21, 23]],
  ['TGP', 'TGP', 'U/L', 7, 56, [28, 30, 27, 29]],
  ['Vitamina D', 'VITAMINA_D', 'ng/mL', 30, 100, [24, 27, 31, 33]],
  ['Ferritina', 'FERRITINA', 'ng/mL', 30, 400, [88, 92, 85, 90]],
];
const DATES = ['2025-11-10', '2026-03-10', '2026-06-15', '2026-09-20'];

async function fixture() {
  const u = await createUser({ credits: 500 });
  for (let d = 0; d < DATES.length; d++) {
    const exam = await createExam(u.patient.id, { title: `Check-up ${DATES[d].slice(0, 7)}`, performedAt: new Date(`${DATES[d]}T12:00:00Z`) });
    for (const [name, canon, unit, lo, hi, vals] of PANEL) {
      const v = vals[d];
      const flag = v > hi ? 'HIGH' : v < lo ? 'LOW' : 'NORMAL';
      await createItem(exam.id, { name, nameCanonical: canon, valueNumeric: v, unit, refLow: lo, refHigh: hi, flag, isAbnormal: flag !== 'NORMAL', panel: 'Geral' });
    }
  }
  return u;
}

const Q_TSH = 'Olhando meus exames ao longo do tempo, meu TSH está melhorando ou piorando? Cite o valor mais recente e a data.';
const ask = (token: string, patientId: string, message: string) =>
  api().post('/api/chat').set(authHeader(token)).send({ message, patientId });
const turns = (patientId: string) =>
  prisma.aiAnalysis.findMany({ where: { patientId, type: 'CHAT' }, orderBy: { createdAt: 'asc' } });
const promptTokens = (t: { tokenUsage: unknown }) => Number((t.tokenUsage as any)?.promptTokenCount ?? 0);
// A rota grava o turno DEPOIS de fechar o stream → a resposta HTTP chega antes da linha no banco.
const waitTurns = (patientId: string, n: number) =>
  vi.waitFor(async () => { const t = await turns(patientId); expect(t.length).toBeGreaterThanOrEqual(n); return t; }, { timeout: 8000, interval: 100 });
// O vitest esconde o console dos testes que passam; os números medidos vão para um arquivo.
const METRICS = join(tmpdir(), 'chat-economy-live.txt');
const report = (line: string) => { appendFileSync(METRICS, `${line}\n`); console.log(line); };

describe.skipIf(!KEY)(`chat AO VIVO (${MODEL}) — economia de token sem perder a resposta certa`, () => {
  beforeAll(async () => {
    // setup.ts troca o fetch global por um falso; aqui a chamada precisa sair de verdade.
    globalThis.fetch = (globalThis as any).__realFetch;
    writeFileSync(METRICS, `modelo: ${MODEL}\n`);
    await resetDb(); await loadSettings();
  });

  it('contexto enxuto: cita o TSH mais recente (7,2) e gasta menos tokens que o completo', async () => {
    const u = await fixture();

    // enxuto (padrão), sem cache para medir as duas chamadas
    await saveSettings('chatEconomy', { cache: 0, slimContext: 1 });
    const slimRes = await ask(u.token, u.patient.id, Q_TSH);
    expect(slimRes.status).toBe(200);
    expect(slimRes.text).not.toContain('"type":"error"');

    // completo (como era antes)
    await saveSettings('chatEconomy', { cache: 0, slimContext: 0 });
    const fullRes = await ask(u.token, u.patient.id, Q_TSH);
    expect(fullRes.status).toBe(200);

    const [slim, full] = await waitTurns(u.patient.id, 2);
    // 1) resposta certa nos dois modos: valor MAIS RECENTE do TSH, não o antigo como "atual"
    for (const t of [slim, full]) {
      expect(t.modelUsed).toContain('gemini');
      expect(t.contentMd).toMatch(/7[,.]2/);
    }
    // 2) economia real medida pelo próprio provedor
    const s = promptTokens(slim); const f = promptTokens(full);
    report(`tokens de entrada — completo: ${f} · enxuto: ${s} · economia: ${f - s} (${Math.round((1 - s / f) * 100)}%)`);
    report(`resposta TSH (enxuto): ${slim.contentMd.replace(/\s+/g, ' ').slice(0, 500)}`);
    report(`resposta TSH (completo): ${full.contentMd.replace(/\s+/g, ' ').slice(0, 500)}`);
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThan(f);
  }, 120_000);

  it('lista o que está fora da faixa usando só o contexto enxuto', async () => {
    await resetDb(); await loadSettings();
    const u = await fixture();
    const r = await ask(u.token, u.patient.id, 'Liste os valores que estão fora da faixa de referência nos meus exames mais recentes.');
    expect(r.status).toBe(200);
    const [t] = await waitTurns(u.patient.id, 1);
    report(`fora da faixa (enxuto, ${promptTokens(t)} tokens de entrada): ${t.contentMd.replace(/\s+/g, ' ').slice(0, 700)}`);
    expect(t.contentMd).toMatch(/TSH/i);
    expect(t.contentMd).toMatch(/LDL/i);
    expect(t.contentMd).toMatch(/colesterol total/i);
    expect(t.contentMd).not.toMatch(/glicose[^.\n]*(acima|alta|elevad)/i); // glicose está na faixa
  }, 120_000);

  it('mesma pergunta de novo: vem do cache, sem chamar a IA', async () => {
    await resetDb(); await loadSettings(); // padrão: cache e enxuto ligados
    const u = await fixture();
    const first = await ask(u.token, u.patient.id, Q_TSH);
    expect(first.status).toBe(200);
    const second = await ask(u.token, u.patient.id, Q_TSH);
    expect(second.text).toContain('"model":"cache"');
    const [a, b] = await waitTurns(u.patient.id, 2);
    report(`cache: 1ª resposta ${a.modelUsed} (${promptTokens(a)} tokens de entrada) · 2ª resposta ${b.modelUsed} (0 tokens)`);
    expect(a.modelUsed).toContain('gemini');
    expect(b.modelUsed).toBe('cache');
    expect(b.contentMd).toBe(a.contentMd);
    expect(b.tokenUsage).toBeNull(); // nenhum token gasto na 2ª
  }, 120_000);
});
