import { config } from '../config';
import type { LlmProvider, LlmRequest, LlmStream, LlmResult } from './types';

const sysText = (s?: string | string[]): string | undefined =>
  s ? (Array.isArray(s) ? s.filter(Boolean).join('\n\n') : s) : undefined;

/** Adapter Google Gemini (generativelanguage API). Sem SDK — fetch direto (stream SSE). */
export class GeminiAdapter implements LlmProvider {
  name = 'gemini';

  private check() {
    if (!config.geminiApiKey) {
      const err = new Error('GEMINI_API_KEY não configurada. Defina GEMINI_API_KEY (e GEMINI_MODEL se preciso) no .env.');
      (err as any).status = 503;
      throw err;
    }
  }

  async stream(req: LlmRequest): Promise<LlmStream> {
    this.check();
    const system = sysText(req.system);
    const model = req.model ?? config.geminiModel;
    // Gemini usa role 'model' (não 'assistant')
    const contents = req.messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
    const body: any = {
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      contents,
      generationConfig: { maxOutputTokens: req.maxTokens },
    };
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(config.geminiApiKey)}`;
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok || !r.body) {
      const detail = await r.text().catch(() => '');
      throw new Error(`Gemini ${r.status}: ${detail.slice(0, 300)}`);
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
            const parts = j.candidates?.[0]?.content?.parts;
            const delta = Array.isArray(parts) ? parts.map((p: any) => p.text ?? '').join('') : '';
            if (delta) { full += delta; for (const cb of cbs) cb(delta); }
            const fr = j.candidates?.[0]?.finishReason;
            if (fr) stopReason = fr;
            if (j.usageMetadata) usage = j.usageMetadata;
          } catch { /* linha SSE parcial */ }
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
