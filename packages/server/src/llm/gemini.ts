import type { LlmProvider, LlmRequest, LlmStream, LlmResult } from './types';
import { getActiveConfig, type AiProviderRuntime } from './ai-config';
import { splitKeys, keyId, classifyError } from './anthropic';

/** POOL DE CHAVES (caso 24/11: cota diária de UMA chave estourou e o chat parou): o campo aceita
 *  várias chaves separadas por vírgula/quebra de linha — de contas/projetos Google diferentes,
 *  já que a cota do free tier é POR PROJETO. A 1ª é a principal; 429/401/403/503 antes do
 *  1º token põe a chave em cooldown e a MESMA request tenta a próxima. Module-level p/
 *  sobreviver a refreshLlm(). */
const geminiCooldowns = new Map<string, number>();

const sysText = (s?: string | string[]): string | undefined =>
  s ? (Array.isArray(s) ? s.filter(Boolean).join('\n\n') : s) : undefined;

/** Adapter Google Gemini (generativelanguage API). Sem SDK — fetch direto (stream SSE).
 *  Credenciais do banco (getActiveConfig) ou explícitas (teste). */
export class GeminiAdapter implements LlmProvider {
  name = 'gemini';
  private cfg: AiProviderRuntime;

  constructor(opts?: Partial<AiProviderRuntime>) {
    const active = getActiveConfig();
    this.cfg = {
      provider: 'gemini',
      apiKey: opts?.apiKey ?? active.apiKey,
      baseURL: '', // Gemini usa endpoint fixo (key na query)
      model: opts?.model ?? active.model,
    };
  }

  private check() {
    if (!this.cfg.apiKey) {
      const err = new Error('Chave da IA não configurada (Gemini). Defina no painel admin (IA) ou no .env.');
      (err as any).status = 503;
      throw err;
    }
  }

  private pickOrder(): string[] {
    const now = Date.now();
    const keys = splitKeys(this.cfg.apiKey);
    const healthy = keys.filter((k) => (geminiCooldowns.get(keyId(k)) ?? 0) <= now);
    const cooling = keys.filter((k) => !healthy.includes(k))
      .sort((a, b) => (geminiCooldowns.get(keyId(a)) ?? 0) - (geminiCooldowns.get(keyId(b)) ?? 0));
    return healthy.concat(cooling);
  }

  async stream(req: LlmRequest): Promise<LlmStream> {
    this.check();
    let last: unknown;
    for (const key of this.pickOrder()) {
      try {
        return await this.streamWith(key, req);
      } catch (e) {
        last = e;
        const c = classifyError(e);
        if (!c.rotate || req.signal?.aborted) throw e;
        // cota diária do free tier não informa reset → 10 min de esfriamento (classifyError) e retenta
        geminiCooldowns.set(keyId(key), Date.now() + c.cooldownMs);
        console.warn(`[llm] gemini chave ••${keyId(key)} em cooldown (${(e as any)?.status}) — tentando a próxima`);
      }
    }
    throw last;
  }

  private async streamWith(key: string, req: LlmRequest): Promise<LlmStream> {
    const system = sysText(req.system);
    const model = req.model ?? this.cfg.model;
    // Gemini usa role 'model' (não 'assistant')
    const contents = req.messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
    const body: any = {
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      contents,
      generationConfig: {
        maxOutputTokens: req.maxTokens,
        // 2.5 é "pensante": sem isto, o raciocínio CONTA no maxOutputTokens e corta a
        // resposta no meio (caso real 18/11: chat com 900 tokens truncava em MAX_TOKENS).
        // Chat de paciente (e extração JSON via fallback) não precisam de raciocínio.
        thinkingConfig: { thinkingBudget: 0 },
      },
    };
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`;
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: req.signal });
    if (!r.ok || !r.body) {
      const detail = await r.text().catch(() => '');
      // status no erro: sem ele o classifyError não reconhece 429/401/503 e o FallbackProvider
      // NÃO alterna p/ o backup (caso 24/11: cota do Gemini estourou e o chat morreu sem cair no GLM).
      throw Object.assign(new Error(`Gemini ${r.status}: ${detail.slice(0, 300)}`), { status: r.status });
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
