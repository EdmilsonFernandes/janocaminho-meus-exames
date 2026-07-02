import { config } from '../config';
import type { LlmProvider, LlmRequest, LlmStream, LlmResult } from './types';

const sysText = (s?: string | string[]): string | undefined =>
  s ? (Array.isArray(s) ? s.filter(Boolean).join('\n\n') : s) : undefined;

/**
 * Adapter OpenAI (compatível com qualquer endpoint /chat/completions: OpenAI, Azure, OpenRouter,
 * Together, etc.). Sem SDK — fetch direto (stream SSE). system vira message role:'system'.
 */
export class OpenAIAdapter implements LlmProvider {
  name = 'openai';

  private check() {
    if (!config.openaiApiKey) {
      const err = new Error('OPENAI_API_KEY não configurada. Defina OPENAI_API_KEY (e OPENAI_BASE_URL/OPENAI_MODEL se preciso) no .env.');
      (err as any).status = 503;
      throw err;
    }
  }

  async stream(req: LlmRequest): Promise<LlmStream> {
    this.check();
    const system = sysText(req.system);
    const messages = [
      ...(system ? [{ role: 'system', content: system }] : []),
      ...req.messages.map((m) => ({ role: m.role, content: m.content })),
    ];
    const model = req.model ?? config.openaiModel;
    const r = await fetch(`${config.openaiBaseURL.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.openaiApiKey}` },
      body: JSON.stringify({ model, max_tokens: req.maxTokens, messages, stream: true, stream_options: { include_usage: true } }),
    });
    if (!r.ok || !r.body) {
      const detail = await r.text().catch(() => '');
      throw new Error(`OpenAI ${r.status}: ${detail.slice(0, 300)}`);
    }
    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    const cbs: ((d: string) => void)[] = [];
    let full = '';
    let usage: any;
    let stopReason: string | undefined;
    let buf = '';
    const consumed = (async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          const l = line.trim();
          if (!l.startsWith('data:')) continue;
          const data = l.slice(5).trim();
          if (!data || data === '[DONE]') continue;
          try {
            const j = JSON.parse(data);
            const choice = j.choices?.[0];
            const delta = choice?.delta?.content;
            if (delta) { full += delta; for (const cb of cbs) cb(delta); }
            if (choice?.finish_reason) stopReason = choice.finish_reason;
            if (j.usage) usage = j.usage;
          } catch { /* linha SSE parcial — ignora */ }
        }
      }
    })();
    return {
      onText(cb) { cbs.push(cb); },
      async final(): Promise<LlmResult> { await consumed; return { text: full, usage, model, stopReason }; },
    };
  }

  async complete(req: LlmRequest): Promise<LlmResult> {
    const s = await this.stream(req);
    return s.final();
  }
}
