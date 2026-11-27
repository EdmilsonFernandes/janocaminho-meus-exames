import { describe, it, expect, vi, afterEach } from 'vitest';
import { GeminiAdapter } from './gemini';

/** Limite de espera pelo 1º texto (27/11): modelo principal mudo → a MESMA pergunta é respondida
 *  pelo degrau reserva (flash → flash-lite), em vez de a pessoa esperar o erro do provedor. */

const sse = (text: string) => new Response(
  new ReadableStream({
    start(c) {
      c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }] })}\n\n`));
      c.close();
    },
  }),
  { status: 200 },
);

/** fetch que nunca responde — só termina quando a tentativa é cancelada. */
const hang = (init?: RequestInit) => new Promise<Response>((_, reject) => {
  init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
});

const modelOf = (url: unknown) => String(url).match(/models\/([^:]+):/)?.[1] ?? '';
const base = { messages: [{ role: 'user', content: 'oi' }], maxTokens: 50 };

afterEach(() => { vi.unstubAllGlobals(); });

describe('GeminiAdapter — limite de espera pelo 1º texto', () => {
  it('principal mudo → o reserva responde, e o texto chega a quem registrou depois', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn((url: unknown, init?: RequestInit) => {
      calls.push(modelOf(url));
      return modelOf(url) === 'gemini-9.1-flash' ? hang(init) : Promise.resolve(sse('resposta do reserva'));
    }));
    const t0 = Date.now();
    const s = await new GeminiAdapter({ apiKey: 'k1', model: 'gemini-9.1-flash' }).stream({ ...base, firstTokenDeadlineMs: 60 });
    let seen = '';
    s.onText((d) => { seen += d; });
    const r = await s.final();
    expect(r.model).toBe('gemini-9.1-flash-lite');
    expect(r.text).toBe('resposta do reserva');
    expect(seen).toBe('resposta do reserva');
    expect(calls).toEqual(['gemini-9.1-flash', 'gemini-9.1-flash-lite']);
    expect(Date.now() - t0).toBeLessThan(2000);
  });

  it('depois de um engasgo, a próxima pergunta já começa pelo reserva', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn((url: unknown, init?: RequestInit) => {
      calls.push(modelOf(url));
      return modelOf(url) === 'gemini-9.2-flash' ? hang(init) : Promise.resolve(sse('ok'));
    }));
    const a = new GeminiAdapter({ apiKey: 'k1', model: 'gemini-9.2-flash' });
    await (await a.stream({ ...base, firstTokenDeadlineMs: 40 })).final();
    calls.length = 0;
    const r = await (await a.stream({ ...base, firstTokenDeadlineMs: 40 })).final();
    expect(calls).toEqual(['gemini-9.2-flash-lite']);
    expect(r.text).toBe('ok');
  });

  it('principal termina sem texto → reserva', async () => {
    vi.stubGlobal('fetch', vi.fn((url: unknown) => Promise.resolve(
      modelOf(url) === 'gemini-9.3-flash' ? new Response('data: {"candidates":[{"finishReason":"MAX_TOKENS"}]}\n\n', { status: 200 }) : sse('do reserva'),
    )));
    const r = await (await new GeminiAdapter({ apiKey: 'k1', model: 'gemini-9.3-flash' }).stream({ ...base, firstTokenDeadlineMs: 500 })).final();
    expect(r.model).toBe('gemini-9.3-flash-lite');
    expect(r.text).toBe('do reserva');
  });

  it('sem o campo, nada muda: o principal responde no tempo dele', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: unknown) => {
      calls.push(modelOf(url));
      await new Promise((r) => setTimeout(r, 120));
      return sse('do principal');
    }));
    const r = await (await new GeminiAdapter({ apiKey: 'k1', model: 'gemini-9.4-flash' }).stream(base)).final();
    expect(r.model).toBe('gemini-9.4-flash');
    expect(calls).toEqual(['gemini-9.4-flash']);
  });

  it('quem chamou cancela → o erro sobe (não vira troca de degrau)', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn((url: unknown, init?: RequestInit) => { calls.push(modelOf(url)); return hang(init); }));
    const ac = new AbortController();
    setTimeout(() => ac.abort(new Error('desistiu')), 30);
    await expect(new GeminiAdapter({ apiKey: 'k1', model: 'gemini-9.5-flash' }).stream({ ...base, signal: ac.signal, firstTokenDeadlineMs: 5000 })).rejects.toBeTruthy();
    expect(calls).toEqual(['gemini-9.5-flash']);
  });
});
