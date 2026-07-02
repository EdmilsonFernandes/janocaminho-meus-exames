import Anthropic from '@anthropic-ai/sdk';
import { config, hasAnthropicKey } from '../config';
import type { LlmProvider, LlmRequest, LlmStream, LlmResult } from './types';

/** Adapter Anthropic/Z.ai — encapsula o @anthropic-ai/sdk EXISTENTE (lê ANTHROPIC_* do env). */
export class AnthropicAdapter implements LlmProvider {
  name = 'anthropic';
  private client: Anthropic;

  constructor() {
    if (!hasAnthropicKey()) {
      const err = new Error('ANTHROPIC_API_KEY/AUTH_TOKEN não configurada. Defina em packages/server/.env (ou troque AI_PROVIDER).');
      (err as any).status = 503;
      throw err;
    }
    this.client = new Anthropic();
  }

  private toSystem(s?: string | string[]): string | undefined {
    if (!s) return undefined;
    return Array.isArray(s) ? s.filter(Boolean).join('\n\n') : s;
  }

  async stream(req: LlmRequest): Promise<LlmStream> {
    const system = this.toSystem(req.system);
    const stream = this.client.messages.stream({
      model: req.model ?? config.extractionModel,
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
