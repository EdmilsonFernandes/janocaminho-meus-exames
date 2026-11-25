import { describe, it, expect, vi } from 'vitest';
import { FallbackProvider } from './index';
import type { LlmProvider, LlmRequest, LlmStream, LlmResult } from './types';

/** Failover ENTRE provedores (getLlm): ativo esgota (429/401/529) → mesma request tenta o
 *  provedor backup com chave configurada. Erro de request (400) sobe direto. */

const err = (status: number) => {
  const e: any = new Error(`${status} fail`);
  e.status = status;
  return e;
};

/** Provider fake: resolve 'ok-<name>' ou rejeita com o status dado. */
function fake(name: string, mode: 'ok' | 'rate' | 'bad'): LlmProvider {
  return {
    name,
    stream: vi.fn(async (): Promise<LlmStream> => {
      if (mode === 'rate') throw err(429);
      if (mode === 'bad') throw err(400);
      return { onText() {}, final: async (): Promise<LlmResult> => ({ text: `ok-${name}` }) };
    }),
    complete: vi.fn(async (): Promise<LlmResult> => {
      if (mode === 'rate') throw err(429);
      if (mode === 'bad') throw err(400);
      return { text: `ok-${name}` };
    }),
  };
}

const req: LlmRequest = { messages: [{ role: 'user', content: 'ping' }], maxTokens: 10 };

describe('FallbackProvider (failover entre provedores)', () => {
  it('ativo em 429 → a MESMA request resolve no backup', async () => {
    const primary = fake('anthropic', 'rate');
    const backup = fake('gemini', 'ok');
    const r = await new FallbackProvider(primary, [backup]).complete(req);
    expect(r.text).toBe('ok-gemini');
    expect(primary.stream).toHaveBeenCalledTimes(1);
    expect(backup.stream).toHaveBeenCalledTimes(1);
  });

  it('ativo saudável → backup NEM é chamado', async () => {
    const primary = fake('anthropic', 'ok');
    const backup = fake('gemini', 'ok');
    const r = await new FallbackProvider(primary, [backup]).complete(req);
    expect(r.text).toBe('ok-anthropic');
    expect(backup.stream).not.toHaveBeenCalled();
  });

  it('erro de request (400) sobe direto — não queima o backup', async () => {
    const primary = fake('anthropic', 'bad');
    const backup = fake('gemini', 'ok');
    await expect(new FallbackProvider(primary, [backup]).complete(req)).rejects.toThrow('400');
    expect(backup.stream).not.toHaveBeenCalled();
  });

  it('ativo E backup em 429 → lança (rota reembolsa o crédito)', async () => {
    const primary = fake('anthropic', 'rate');
    const backup = fake('gemini', 'rate');
    await expect(new FallbackProvider(primary, [backup]).complete(req)).rejects.toThrow('429');
    expect(backup.stream).toHaveBeenCalledTimes(1);
  });

  it('sem backups configurados → erro do ativo sobe direto', async () => {
    const primary = fake('anthropic', 'rate');
    await expect(new FallbackProvider(primary, []).complete(req)).rejects.toThrow('429');
  });

  it('primário em 429 entra em cooldown → próxima request vai DIRETO ao backup', async () => {
    const primary = fake('gemini', 'rate');
    const backup = fake('anthropic', 'ok');
    const fp = new FallbackProvider(primary, [backup]);
    await fp.complete(req);
    const r = await fp.complete(req);
    expect(r.text).toBe('ok-anthropic');
    expect(primary.stream).toHaveBeenCalledTimes(1); // 2ª request não bate no esgotado
  });

  it('stream também alterna no 429 (chat)', async () => {
    const primary = fake('gemini', 'rate');
    const backup = fake('anthropic', 'ok');
    const s = await new FallbackProvider(primary, [backup]).stream(req);
    expect((await s.final()).text).toBe('ok-anthropic');
  });
});

describe('GeminiAdapter — erro HTTP carrega status (senão o failover não reconhece)', () => {
  it('429 da API → erro com status 429', async () => {
    const { GeminiAdapter } = await import('./gemini');
    const orig = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => new Response('{"error":{"code":429}}', { status: 429 })) as any;
    try {
      const g = new GeminiAdapter({ apiKey: 'k', model: 'gemini-2.5-flash' });
      await expect(g.stream(req)).rejects.toMatchObject({ status: 429 });
    } finally {
      globalThis.fetch = orig;
    }
  });
});

describe('GeminiAdapter — pool de chaves (cota por projeto Google)', () => {
  it('1ª chave em 429 → a MESMA request usa a 2ª; a esgotada esfria', async () => {
    const { GeminiAdapter } = await import('./gemini');
    const orig = globalThis.fetch;
    const used: string[] = [];
    globalThis.fetch = vi.fn(async (url: any) => {
      const k = new URL(String(url)).searchParams.get('key')!;
      used.push(k);
      if (k === 'chave-esgotada-AAAA') return new Response('{"error":{"code":429}}', { status: 429 });
      const sse = 'data: {"candidates":[{"content":{"parts":[{"text":"oi"}]},"finishReason":"STOP"}]}\n\n';
      return new Response(sse, { status: 200 });
    }) as any;
    try {
      const g = new GeminiAdapter({ apiKey: 'chave-esgotada-AAAA, chave-boa-BBBBBBBB', model: 'gemini-3.5-flash' });
      const r = await g.complete(req);
      expect(r.text).toBe('oi');
      expect(used).toEqual(['chave-esgotada-AAAA', 'chave-boa-BBBBBBBB']);
      used.length = 0;
      await g.complete(req);
      expect(used).toEqual(['chave-boa-BBBBBBBB']); // esgotada em cooldown → nem tenta
    } finally {
      globalThis.fetch = orig;
    }
  });
});
