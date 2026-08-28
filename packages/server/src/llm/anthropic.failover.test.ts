import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnthropicAdapter, splitKeys, parseResetAt, classifyError, keyId, clearCooldowns, cooldownsSnapshot } from './anthropic';

/**
 * Failover multi-chave do AnthropicAdapter (Z.ai): 429 ANTES do 1º token → cooldown da chave
 * + retry imediato com a próxima da config. A 1ª chave é a PRINCIPAL e volta sozinha quando o
 * cooldown expira. Trava essas invariantes.
 */

// Registry de comportamento por chave — o mock do SDK consulta isso (hoisted: roda antes do vi.mock).
const { registry } = vi.hoisted(() => ({
  registry: { mode: new Map<string, 'ok' | 'rate' | 'bad400'>(), calls: new Map<string, number>(), lastParams: null as any },
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class FakeAnthropic {
    apiKey: string;
    constructor(opts: { apiKey: string }) { this.apiKey = opts.apiKey; }
    messages = {
      stream: (params: any) => {
        const key = this.apiKey;
        registry.calls.set(key, (registry.calls.get(key) ?? 0) + 1);
        registry.lastParams = params;
        const mode = registry.mode.get(key) ?? 'ok';
        const listeners: Record<string, Array<(v: unknown) => void>> = {};
        let finalReject!: (e: unknown) => void;
        let finalResolve!: (v: unknown) => void;
        const finalPromise = new Promise((res, rej) => { finalResolve = res; finalReject = rej; });
        const s: any = {
          on(ev: string, cb: (v: unknown) => void) { (listeners[ev] ||= []).push(cb); return s; },
          finalMessage: () => finalPromise,
        };
        queueMicrotask(() => {
          if (mode === 'rate') {
            const err: any = new Error('429 {"type":"error","error":{"type":"rate_limit_error","message":"[1308][Usage limit reached for 5 hour. Your limit will reset at 2999-01-01 00:00:00]"}}');
            err.status = 429;
            (listeners.error ?? []).forEach((cb) => cb(err));
            finalReject(err);
          } else if (mode === 'bad400') {
            const err: any = new Error('400 invalid request');
            err.status = 400;
            (listeners.error ?? []).forEach((cb) => cb(err));
            finalReject(err);
          } else {
            (listeners.text ?? []).forEach((cb) => cb('PONG'));
            finalResolve({ content: [{ type: 'text', text: 'PONG' }], usage: {}, model: 'glm-5.3-test' });
          }
        });
        return s;
      },
    };
  },
}));

// vi.mock é hoisted: o SDK já vem mockado quando o import estático acima avalia.

const KEY_A = 'sk-primary-AAAAAAAA';
const KEY_B = 'sk-backup-BBBBBBBB';

beforeEach(() => {
  clearCooldowns();
  registry.mode.clear();
  registry.calls.clear();
  registry.lastParams = null;
});

describe('splitKeys (pool no campo único de chave)', () => {
  it('divide por vírgula, ponto-e-vírgula e quebra de linha, com trim', () => {
    expect(splitKeys(' a , b ;\n c ')).toEqual(['a', 'b', 'c']);
  });
  it('chave única vira pool de 1 (comportamento antigo preservado)', () => {
    expect(splitKeys('sk-uma-so')).toEqual(['sk-uma-so']);
  });
  it('ignora vazios (vírgula dupla, espaço)', () => {
    expect(splitKeys('a,, ,b')).toEqual(['a', 'b']);
  });
});

describe('parseResetAt (horário de reset que o Z.ai manda no 429)', () => {
  it('extrai o timestamp UTC + 30s de folga', () => {
    const t = parseResetAt('Usage limit reached for 5 hour. Your limit will reset at 2026-08-28 05:28:02][xxx]')!;
    expect(t).toBe(Date.parse('2026-08-28T05:28:02Z') + 30_000);
  });
  it('null quando não há data no erro', () => {
    expect(parseResetAt('qualquer outro erro')).toBeNull();
  });
});

describe('classifyError (quando trocar de chave e por quanto tempo)', () => {
  it('429 com reset → cooldown até o reset do relay', () => {
    const fakeNow = Date.now();
    const c = classifyError({ status: 429, message: 'limit will reset at 2999-01-01 00:00:00' });
    expect(c.rotate).toBe(true);
    expect(c.cooldownMs).toBeGreaterThan(60_000);
  });
  it('429 sem reset → 10 min de cooldown', () => {
    const c = classifyError({ status: 429, message: 'rate limited' });
    expect(c.rotate).toBe(true);
    expect(c.cooldownMs).toBe(10 * 60_000);
  });
  it('401/403 (chave inválida) → 60 min', () => {
    expect(classifyError({ status: 401, message: 'x' }).cooldownMs).toBe(60 * 60_000);
    expect(classifyError({ status: 403, message: 'x' }).cooldownMs).toBe(60 * 60_000);
  });
  it('400 (erro de request) → NÃO troca de chave', () => {
    expect(classifyError({ status: 400, message: 'x' }).rotate).toBe(false);
  });
  it('529/503 (overloaded) → troca com cooldown curto', () => {
    expect(classifyError({ status: 529, message: 'x' })).toMatchObject({ rotate: true, cooldownMs: 60_000 });
  });
});

describe('AnthropicAdapter failover', () => {
  const req = { messages: [{ role: 'user', content: 'ping' }], maxTokens: 10 };

  it('429 na principal → mesma request já resolve com o backup', async () => {
    registry.mode.set(KEY_A, 'rate');
    registry.mode.set(KEY_B, 'ok');
    const adapter = new AnthropicAdapter({ apiKey: `${KEY_A},${KEY_B}` });
    const r = await adapter.complete(req);
    expect(r.text).toBe('PONG');
    expect(registry.calls.get(KEY_A)).toBe(1); // tentou a principal...
    expect(registry.calls.get(KEY_B)).toBe(1); // ...falhou, resolveu com o backup
    // principal entrou em cooldown
    expect(cooldownsSnapshot()[keyId(KEY_A)]).toBeGreaterThan(Date.now());
  });

  it('backup continua atendendo enquanto a principal esfria (ela NÃO é retentada)', async () => {
    registry.mode.set(KEY_A, 'rate');
    registry.mode.set(KEY_B, 'ok');
    const adapter = new AnthropicAdapter({ apiKey: `${KEY_A},${KEY_B}` });
    await adapter.complete(req);
    await adapter.complete(req);
    expect(registry.calls.get(KEY_A)).toBe(1);
    expect(registry.calls.get(KEY_B)).toBe(2);
  });

  it('a PRINCIPAL volta sozinha depois que o cooldown expira', async () => {
    registry.mode.set(KEY_A, 'ok'); // relay liberou de novo
    registry.mode.set(KEY_B, 'ok');
    const adapter = new AnthropicAdapter({ apiKey: `${KEY_A},${KEY_B}` });
    await adapter.complete(req);
    expect(registry.calls.get(KEY_A)).toBe(1); // saudável de novo → é a principal, volta a atender
    expect(registry.calls.get(KEY_B)).toBeUndefined();
  });

  it('erro que NÃO é de chave (400) sobe direto — não queima os backups', async () => {
    registry.mode.set(KEY_A, 'bad400');
    registry.mode.set(KEY_B, 'ok');
    const adapter = new AnthropicAdapter({ apiKey: `${KEY_A},${KEY_B}` });
    await expect(adapter.complete(req)).rejects.toThrow('400');
    expect(registry.calls.get(KEY_B)).toBeUndefined(); // backup nem foi chamado
  });

  it('TODAS em 429 → lança o erro (rota reembolsa o crédito)', async () => {
    registry.mode.set(KEY_A, 'rate');
    registry.mode.set(KEY_B, 'rate');
    const adapter = new AnthropicAdapter({ apiKey: `${KEY_A},${KEY_B}` });
    await expect(adapter.complete(req)).rejects.toThrow('429');
    expect(registry.calls.get(KEY_A)).toBe(1);
    expect(registry.calls.get(KEY_B)).toBe(1); // tentou as duas antes de desistir
  });

  it('glm-5.x: pede thinking DISABLED (velocidade + orçamento); glm-4.6: NÃO envia o param', async () => {
    registry.mode.set(KEY_A, 'ok');

    const a5 = new AnthropicAdapter({ apiKey: KEY_A, model: 'glm-5.3' });
    await a5.complete(req);
    expect(registry.lastParams.thinking).toEqual({ type: 'disabled' });

    const a4 = new AnthropicAdapter({ apiKey: KEY_A, model: 'glm-4.6' });
    await a4.complete(req);
    expect(registry.lastParams.thinking).toBeUndefined(); // param era documentado como quebrado no relay p/ 4.x
  });
});
