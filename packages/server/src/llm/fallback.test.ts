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
});
