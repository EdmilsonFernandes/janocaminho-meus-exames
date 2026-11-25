// streamChat REAL (o setup.ts mocka o módulo; aqui desfazemos) com todos os provedores caindo
// antes do 1º token: com offlineAnswer a pessoa recebe os dados; sem ele, o erro de sempre.
import { describe, it, expect, vi } from 'vitest';

vi.unmock('../src/analysis/chat');
vi.mock('../src/llm', () => ({
  getModel: () => 'fake',
  getChatLlm: () => ({
    name: 'fake',
    stream: async () => { throw Object.assign(new Error('Gemini 429: quota'), { status: 429 }); },
  }),
}));

import { streamChat } from '../src/analysis/chat';

function fakeRes() {
  const chunks: string[] = [];
  let ended = false;
  const res: any = { setHeader() {}, flushHeaders() {}, write(s: string) { chunks.push(s); return true; }, end() { ended = true; } };
  return { res, chunks, isEnded: () => ended };
}

describe('streamChat com a IA fora do ar', () => {
  it('com offlineAnswer: devolve os dados dos exames em vez do erro', async () => {
    const { res, chunks, isEnded } = fakeRes();
    const out = await streamChat({ res, contextText: 'ctx', history: [], message: 'como estão meus exames?', offlineAnswer: () => 'DADOS DOS EXAMES' });
    expect(out.offline).toBe(true);
    expect(out.model).toBe('offline');
    expect(out.text).toBe('DADOS DOS EXAMES');
    const sse = chunks.join('');
    expect(sse).toContain('DADOS DOS EXAMES');
    expect(sse).toContain('"model":"offline"');
    expect(sse).not.toContain('"type":"error"');
    expect(isEnded()).toBe(true);
  });

  it('sem offlineAnswer: mantém o erro + exceção (a rota reembolsa)', async () => {
    const { res, chunks } = fakeRes();
    await expect(streamChat({ res, contextText: 'ctx', history: [], message: 'oi' })).rejects.toThrow('429');
    expect(chunks.join('')).toContain('"type":"error"');
  });
});
