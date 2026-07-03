import Anthropic from '@anthropic-ai/sdk';
import type { LlmProvider, LlmRequest, LlmStream, LlmResult } from './types';
import { getActiveConfig, type AiProviderRuntime } from './ai-config';

/** Adapter Anthropic/Z.ai — credenciais do banco (getActiveConfig) ou explícitas (teste de conexão).
 *  Passa apiKey/baseURL explícitos pro SDK (não depende de ler ANTHROPIC_AUTH_TOKEN do env). */
export class AnthropicAdapter implements LlmProvider {
  name = 'anthropic';
  private client: Anthropic;
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
    this.client = new Anthropic({
      apiKey: this.cfg.apiKey,
      ...(this.cfg.baseURL ? { baseURL: this.cfg.baseURL } : {}),
    });
  }

  private toSystem(s?: string | string[]): string | undefined {
    if (!s) return undefined;
    return Array.isArray(s) ? s.filter(Boolean).join('\n\n') : s;
  }

  async stream(req: LlmRequest): Promise<LlmStream> {
    const system = this.toSystem(req.system);
    const stream = this.client.messages.stream({
      model: req.model ?? this.cfg.model,
      max_tokens: req.maxTokens,
      ...(system ? { system } : {}),
      messages: req.messages as any,
    } as any);
    const finalPromise = stream.finalMessage().then((f): LlmResult => {
      const text = (f.content as any[]).filter((b) => b.type === 'text').map((b) => b.text).join('');
      return { text, usage: f.usage, model: f.model, stopReason: f.stop_reason ? String(f.stop_reason) : undefined };
    });
    return {
      onText(cb) { stream.on('text', cb); },
      final: () => finalPromise,
    };
  }

  async complete(req: LlmRequest): Promise<LlmResult> {
    const s = await this.stream(req);
    const r = await s.final();
    if (!r) throw new Error('LLM: resposta vazia');
    return r;
  }
}
