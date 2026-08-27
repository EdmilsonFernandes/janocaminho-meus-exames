import Anthropic from '@anthropic-ai/sdk';
import type { LlmProvider, LlmRequest, LlmStream, LlmResult } from './types';
import { getActiveConfig, type AiProviderRuntime } from './ai-config';
import { config } from '../config';

/**
 * Adapter Anthropic/Z.ai — credenciais do banco (getActiveConfig) ou explícitas (teste de conexão).
 * Passa apiKey/baseURL explícitos pro SDK (não depende de ler ANTHROPIC_AUTH_TOKEN do env).
 *
 * POOL DE CHAVES (failover de rate limit): o campo de chave aceita VÁRIAS chaves separadas por
 * vírgula/vírgula-final/quebra (ex.: "sk-a...,sk-b...,sk-c..."). Cada request faz round-robin entre
 * as chaves SAUDÁVEIS; se uma devolver 429/401/403/529 ANTES do 1º token, ela entra em cooldown
 * (429: até o horário de reset que o próprio Z.ai informa no erro) e a MESMA request já refaz com a
 * próxima chave. Se todas esgotarem, o erro da última sobe (rota reembolsa o crédito).
 */

/** Cooldown por processo — module-level p/ sobreviver a refreshLlm() (adapter reconstruído). */
const cooldowns = new Map<string, number>(); // keyId (últimos 8 chars) → desbloqueia em (epoch ms)

/** Id curto da chave (nunca logar a chave inteira). */
export function keyId(key: string): string {
  return key.length <= 8 ? '••' + key : key.slice(-8);
}

/** Observabilidade/testes: cooldowns ativos (keyId → desbloqueia em). */
export function cooldownsSnapshot(): Record<string, number> {
  const now = Date.now();
  return Object.fromEntries([...cooldowns.entries()].filter(([, until]) => until > now));
}

/** Limpa cooldowns (testes). */
export function clearCooldowns(): void {
  cooldowns.clear();
}

/** Divide o campo de chave em pool (vírgula, ponto-e-vírgula ou quebra de linha). */
export function splitKeys(raw: string): string[] {
  return raw.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
}

/** Extrai o "reset at 2026-08-28 05:28:02" (UTC) da mensagem de 429 do relay. null se não achar. */
export function parseResetAt(msg: string): number | null {
  const m = /reset at (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/.exec(msg);
  if (!m) return null;
  const t = Date.parse(`${m[1]}Z`); // relay fala UTC
  return Number.isNaN(t) ? null : t + 30_000; // +30s de folga pro relógio do servidor
}

/** Classifica o erro: vale trocar de chave (rotate) e por quanto tempo esfriar a atual. */
export function classifyError(e: unknown): { rotate: boolean; cooldownMs: number } {
  const status = (e as any)?.status;
  const msg = String((e as any)?.message ?? (e as any)?.error?.message ?? e ?? '');
  if (status === 429) {
    const reset = parseResetAt(msg);
    return { rotate: true, cooldownMs: reset ? Math.max(reset - Date.now(), 30_000) : 10 * 60_000 };
  }
  if (status === 401 || status === 403) return { rotate: true, cooldownMs: 60 * 60_000 }; // chave inválida
  if (status === 529 || status === 503) return { rotate: true, cooldownMs: 60_000 }; // overloaded
  return { rotate: false, cooldownMs: 0 };
}

export class AnthropicAdapter implements LlmProvider {
  name = 'anthropic';
  private keys: string[];
  private clients = new Map<string, Anthropic>();
  private cfg: AiProviderRuntime;

  constructor(opts?: Partial<AiProviderRuntime>) {
    const active = getActiveConfig();
    this.cfg = {
      provider: 'anthropic',
      apiKey: opts?.apiKey ?? active.apiKey,
      baseURL: opts?.baseURL ?? active.baseURL,
      model: opts?.model ?? active.model,
    };
    if (!this.cfg.apiKey) {
      const err = new Error('Chave da IA não configurada (Anthropic/Z.ai). Defina no painel admin (IA) ou no .env.');
      (err as any).status = 503;
      throw err;
    }
    this.keys = splitKeys(this.cfg.apiKey);
  }

  private clientFor(key: string): Anthropic {
    let c = this.clients.get(key);
    if (!c) {
      c = new Anthropic({ apiKey: key, ...(this.cfg.baseURL ? { baseURL: this.cfg.baseURL } : {}) });
      this.clients.set(key, c);
    }
    return c;
  }

  /** Ordem de tentativa: a 1ª chave da config é a PRINCIPAL — sempre volta sozinha quando o
   *  cooldown expira. Saudáveis na ordem da config; em cooldown por último (a que desbloqueia
   *  mais cedo primeiro — best effort). */
  private pickOrder(): string[] {
    const now = Date.now();
    const healthy = this.keys.filter((k) => (cooldowns.get(keyId(k)) ?? 0) <= now);
    const cooling = this.keys.filter((k) => !healthy.includes(k))
      .sort((a, b) => (cooldowns.get(keyId(a)) ?? 0) - (cooldowns.get(keyId(b)) ?? 0));
    return healthy.concat(cooling);
  }

  private toSystem(s?: string | string[]): string | undefined {
    if (!s) return undefined;
    return Array.isArray(s) ? s.filter(Boolean).join('\n\n') : s;
  }

  async stream(req: LlmRequest): Promise<LlmStream> {
    const order = this.pickOrder();
    let lastErr: unknown;
    for (const key of order) {
      try {
        return await this.attempt(this.clientFor(key), req);
      } catch (e) {
        lastErr = e;
        const c = classifyError(e);
        if (!c.rotate) throw e; // erro do request/modelo — trocar chave não resolve
        const until = Date.now() + c.cooldownMs;
        cooldowns.set(keyId(key), until);
        console.warn(`[llm] chave ••${keyId(key)} em cooldown até ${new Date(until).toISOString()} (${(e as any)?.status ?? '?'}) — alternando p/ backup`);
      }
    }
    throw lastErr;
  }

  /** Uma tentativa com UMA chave. Resolve só quando há evidência de sucesso (1º token OU final
   *  sem erro) — erro ANTES de qualquer token (429 etc.) rejeita na hora, permitindo o retry
   *  limpo com a próxima chave sem duplicar texto pro cliente. */
  private attempt(client: Anthropic, req: LlmRequest): Promise<LlmStream> {
    const system = this.toSystem(req.system);
    // Prompt caching OPT-IN (LLM_PROMPT_CACHE=true): cacheia o system (estável entre turnos/usuários
    // da mesma feature) → -70-90% tokens em chat/consolidated. Default OFF — o relay Z.ai pode não
    // suportar cache_control; habilitar só após testar contra o relay.
    const systemParam = system
      ? (config.llmPromptCache
        ? [{ type: 'text' as const, text: system, cache_control: { type: 'ephemeral' as const } }]
        : system)
      : undefined;
    return new Promise<LlmStream>((resolve, reject) => {
      const stream = client.messages.stream({
        model: req.model ?? this.cfg.model,
        max_tokens: req.maxTokens,
        ...(systemParam ? { system: systemParam } : {}),
        messages: req.messages as any,
      } as any, { signal: req.signal });

      let settled = false;
      let cb: ((delta: string) => void) | null = null;
      let buffered: string[] = []; // deltas entre o resolve e o onText() do caller

      const finalPromise = stream.finalMessage().then((f): LlmResult => {
        const text = (f.content as any[]).filter((b) => b.type === 'text').map((b) => b.text).join('');
        return { text, usage: f.usage, model: f.model, stopReason: f.stop_reason ? String(f.stop_reason) : undefined };
      });
      // Se o attempt rejeitar antes do caller existir, o finalPromise ficaria órfão → unhandledRejection.
      finalPromise.catch(() => {}); // marker: consumido aqui OU pelo handle.final() abaixo

      const handle: LlmStream = {
        onText(fn) { cb = fn; if (buffered.length) { const b = buffered; buffered = []; for (const d of b) fn(d); } },
        final: () => finalPromise,
      };

      const settle = (ok: boolean, err?: unknown) => {
        if (settled) return;
        settled = true;
        ok ? resolve(handle) : reject(err);
      };

      stream.on('text', (t: string) => {
        settle(true); // 1º token = a chave funcionou
        if (cb) cb(t); else buffered.push(t);
      });
      stream.on('error', (e: unknown) => settle(false, e));
      finalPromise.then(() => settle(true), (e: unknown) => settle(false, e));
    });
  }

  async complete(req: LlmRequest): Promise<LlmResult> {
    const s = await this.stream(req);
    const r = await s.final();
    if (!r) throw new Error('LLM: resposta vazia');
    return r;
  }
}
