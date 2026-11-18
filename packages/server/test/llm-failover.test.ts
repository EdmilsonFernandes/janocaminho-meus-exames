import { describe, it, expect, vi } from 'vitest';
import { FallbackProvider } from '../src/llm';
import type { LlmProvider, LlmRequest, LlmStream, LlmResult } from '../src/llm/types';

/** Regressão 17/11 — a estratégia GLM↔Gemini depende de 2 garantias do FallbackProvider:
 *  (1) backup recebe req.model=undefined (model do GLM não pode vazar pro Gemini);
 *  (2) erro "rotativo" (429/5xx) cai pro backup; erro de request (400) sobe direto. */
function fake(name: string, opts: { failWith?: any; empty?: boolean; capture?: (req: LlmRequest) => void } = {}): LlmProvider {
  const res: LlmResult = { text: opts.empty ? '' : `resposta de ${name}` };
  const stream: LlmStream = { onDelta: () => stream, final: async () => res };
  return {
    name,
    stream: async (req: LlmRequest) => {
      opts.capture?.(req);
      if (opts.failWith) throw opts.failWith;
      return stream;
    },
    complete: async (req: LlmRequest) => {
      opts.capture?.(req);
      if (opts.failWith) throw opts.failWith;
      return res;
    },
  };
}

const rotativo = Object.assign(new Error('rate limit'), { status: 429 });

describe('FallbackProvider — failover GLM↔Gemini (regressão 17/11)', () => {
  it('429 no primário → responde com o backup', async () => {
    const fb = new FallbackProvider(fake('glm', { failWith: rotativo }), [fake('gemini')]);
    const r = await fb.complete({ messages: [{ role: 'user', content: 'oi' }] } as LlmRequest);
    expect(r.text).toBe('resposta de gemini');
  });

  it('backup NÃO herda o model do primário (cada adapter usa o próprio config)', async () => {
    let seen: LlmRequest | undefined;
    const fb = new FallbackProvider(fake('glm', { failWith: rotativo }), [fake('gemini', { capture: (r) => { seen = r; } })]);
    await fb.complete({ model: 'glm-5.3', messages: [{ role: 'user', content: 'oi' }] } as LlmRequest);
    expect(seen?.model).toBeUndefined();
  });

  it('primário saudável → backup nem é chamado', async () => {
    const backup = vi.fn();
    const fb = new FallbackProvider(fake('glm', {}), [fake('gemini', { capture: backup })]);
    const r = await fb.complete({ model: 'glm-5.3', messages: [{ role: 'user', content: 'oi' }] } as LlmRequest);
    expect(r.text).toBe('resposta de glm');
    expect(backup).not.toHaveBeenCalled();
  });

  it('erro de request (400) sobe direto — não gasta o backup à toa', async () => {
    const backup = vi.fn();
    const fb = new FallbackProvider(fake('glm', { failWith: Object.assign(new Error('bad request'), { status: 400 }) }), [fake('gemini', { capture: backup })]);
    await expect(fb.complete({ messages: [] } as LlmRequest)).rejects.toThrow('bad request');
    expect(backup).not.toHaveBeenCalled();
  });

  it('todos caem → sobe o último erro (sem sucesso fantasma)', async () => {
    const fb = new FallbackProvider(fake('glm', { failWith: rotativo }), [fake('gemini', { failWith: Object.assign(new Error('quota'), { status: 429 }) })]);
    await expect(fb.complete({ messages: [{ role: 'user', content: 'oi' }] } as LlmRequest)).rejects.toThrow('quota');
  });

  it('resposta VAZIA do primário (throttle mascarado do relay) → rotaciona pro backup (caso Dione 18/11)', async () => {
    const fb = new FallbackProvider(fake('glm', { empty: true }), [fake('gemini')]);
    const r = await fb.complete({ model: 'glm-5.3', messages: [{ role: 'user', content: 'exame com 1700 tokens de texto' }] } as LlmRequest);
    expect(r.text).toBe('resposta de gemini');
  });

  it('primário e backup VAZIOS → sobe erro de vazio (não devolve mentira)', async () => {
    const fb = new FallbackProvider(fake('glm', { empty: true }), [fake('gemini', { empty: true })]);
    await expect(fb.complete({ messages: [{ role: 'user', content: 'oi' }] } as LlmRequest)).rejects.toThrow('vazia');
  });
});
