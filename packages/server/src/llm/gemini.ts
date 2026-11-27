import { SLOW_MODEL, type LlmProvider, type LlmRequest, type LlmStream, type LlmResult } from './types';
import { getActiveConfig, type AiProviderRuntime } from './ai-config';
import { splitKeys, keyId, classifyError } from './anthropic';

/** POOL DE CHAVES (caso 24/11: cota diária de UMA chave estourou e o chat parou): o campo aceita
 *  várias chaves separadas por vírgula/quebra de linha — de contas/projetos Google diferentes,
 *  já que a cota do free tier é POR PROJETO. A 1ª é a principal; 429/401/403/503 antes do
 *  1º token põe a chave em cooldown e a MESMA request tenta a próxima. Module-level p/
 *  sobreviver a refreshLlm(). */
const geminiCooldowns = new Map<string, number>();
/** Modelos que recusaram `thinkingBudget: 0` (400) — aprendido em runtime, por processo. */
const rejectsNoThinking = new Set<string>();

/** Degraus de modelo: "gemini-X-flash" ganha "gemini-X-flash-lite" como 2º degrau automático
 *  (mesma família, mais barato e com cota própria). Outros modelos ficam com um degrau só. */
export function modelTiers(model: string): string[] {
  return /^gemini-[\d.]+-flash$/.test(model) ? [model, `${model}-lite`] : [model];
}

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

  /** Tentativas na ordem: modelo principal em TODAS as chaves, depois o degrau "lite" em todas.
   *  Dentro de cada degrau: saudáveis na ordem da config; em cooldown por último. O cooldown é
   *  por (chave, modelo) — a cota do free tier é por projeto E por modelo (medido 24/11: chave
   *  esgotada no flash ainda respondia no flash-lite). */
  private attempts(model: string): { key: string; model: string }[] {
    const now = Date.now();
    const keys = splitKeys(this.cfg.apiKey);
    const cd = (k: string, m: string) => geminiCooldowns.get(`${keyId(k)}|${m}`) ?? 0;
    // Degrau cujo MODELO está sobrecarregado (503 recente) vai para o fim: a próxima pergunta
    // começa pelo que está respondendo, em vez de esperar o 503 de novo.
    const busy = (m: string) => (geminiCooldowns.get(`*|${m}`) ?? 0) > now;
    const tiers = modelTiers(model);
    return [...tiers.filter((m) => !busy(m)), ...tiers.filter(busy)].flatMap((m) => {
      const healthy = keys.filter((k) => cd(k, m) <= now);
      const cooling = keys.filter((k) => !healthy.includes(k)).sort((a, b) => cd(a, m) - cd(b, m));
      return healthy.concat(cooling).map((key) => ({ key, model: m }));
    });
  }

  async stream(req: LlmRequest): Promise<LlmStream> {
    this.check();
    const primary = req.model ?? this.cfg.model;
    let last: unknown;
    // 503/529 = o MODELO está sobrecarregado (não a chave): repetir o mesmo modelo nas outras
    // chaves só gasta tempo — cada 503 levou ~20s no teste ao vivo e o chat espera 35s pelo
    // 1º token. Modelo sobrecarregado → pula direto para o próximo degrau.
    const overloaded = new Set<string>();
    const list = this.attempts(primary);
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (overloaded.has(a.model)) continue;
      // LIMITE DE ESPERA (27/11: "o Gemini está demorando"): o modelo principal, quando engasga,
      // leva ~20 s para devolver o 503 — ou fica mudo. Com um degrau reserva pela frente, espera-se
      // só `firstTokenDeadlineMs` pelo 1º texto; passou, a tentativa é abandonada e o reserva
      // responde. Só vale para o modelo principal: o reserva e o modelo único esperam o que precisar.
      const hasReserve = list.slice(i + 1).some((b) => b.model !== a.model && !overloaded.has(b.model));
      const deadline = a.model === primary && hasReserve ? req.firstTokenDeadlineMs : undefined;
      try {
        return await this.streamWith(a.key, a.model, req, deadline);
      } catch (e) {
        if (req.signal?.aborted) throw e;
        const status = (e as any)?.status;
        // Degrau lite inexistente/fechado p/ este projeto (404/400) não é erro da REQUEST: só pula.
        if (a.model !== primary && (status === 404 || status === 400)) continue;
        last = e;
        const c = classifyError(e);
        if (!c.rotate) throw e;
        if (status === 503 || status === 529) {
          // sobrecarga é do modelo, não da chave: esfria o MODELO (todas as chaves) por 1 min
          // Lento (sem 1º texto no limite) esfria por 3 min: as próximas perguntas começam direto
          // no reserva, sem pagar a espera de novo a cada mensagem.
          const slow = (e as any)?.code === SLOW_MODEL;
          overloaded.add(a.model);
          geminiCooldowns.set(`*|${a.model}`, Date.now() + (slow ? 3 * 60_000 : c.cooldownMs));
          console.warn(`[llm] gemini ${a.model} ${slow ? 'lento (sem resposta no limite)' : `sobrecarregado (${status})`} — indo para o próximo degrau`);
          continue;
        }
        // cota diária do free tier não informa reset → 10 min de esfriamento (classifyError) e retenta
        geminiCooldowns.set(`${keyId(a.key)}|${a.model}`, Date.now() + c.cooldownMs);
        console.warn(`[llm] gemini ${a.model} chave ••${keyId(a.key)} em cooldown (${status}) — tentando a próxima`);
      }
    }
    throw last;
  }

  private async streamWith(key: string, model: string, req: LlmRequest, firstTokenDeadlineMs?: number): Promise<LlmStream> {
    // Sinal PRÓPRIO da tentativa: o limite de espera corta só ESTA chamada; o cancelamento de
    // quem chamou (pessoa desistiu, tempo total) continua valendo por cima.
    const ac = new AbortController();
    const onOuterAbort = () => ac.abort((req.signal as any)?.reason);
    if (req.signal?.aborted) onOuterAbort();
    else req.signal?.addEventListener('abort', onOuterAbort, { once: true });
    let timedOut = false;
    const timer = firstTokenDeadlineMs
      ? setTimeout(() => { timedOut = true; ac.abort(); }, firstTokenDeadlineMs)
      : undefined;
    const slowError = () => Object.assign(
      new Error(`Gemini ${model}: sem resposta em ${firstTokenDeadlineMs} ms`), { status: 503, code: SLOW_MODEL });
    try {
      return await this.openStream(key, model, req, ac.signal, firstTokenDeadlineMs != null, () => timedOut, slowError);
    } catch (e) {
      if (timedOut && !req.signal?.aborted) throw slowError();
      throw e;
    } finally {
      if (timer) clearTimeout(timer);
      // Com o stream entregue, o ouvinte segue necessário (cancelar no meio da resposta); ele é
      // `once` e o sinal de quem chamou morre junto com a requisição.
    }
  }

  private async openStream(
    key: string, model: string, req: LlmRequest, signal: AbortSignal,
    waitFirstText: boolean, timedOut: () => boolean, slowError: () => Error,
  ): Promise<LlmStream> {
    const system = sysText(req.system);
    // Gemini usa role 'model' (não 'assistant')
    const contents = req.messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`;
    // thinkingBudget:0 — os modelos "pensantes" (2.5-flash, 3.5-flash) CONTAM o raciocínio no
    // maxOutputTokens e cortam a resposta no meio sem isto (caso real 18/11; medido de novo 24/11:
    // 3.5-flash sem o parâmetro devolve vazio com MAX_TOKENS). Chat de paciente não precisa de raciocínio.
    const post = (noThinking: boolean) => fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        contents,
        generationConfig: { maxOutputTokens: req.maxTokens, ...(noThinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}) },
      }),
    });
    let r = await post(!rejectsNoThinking.has(model));
    // …mas nem todo modelo aceita o parâmetro: o gemini-3.5-flash-lite devolve 400 INVALID_ARGUMENT
    // (medido 24/11) — e ele é justamente o degrau que cobre o 503 do flash. Recusou → refaz UMA vez
    // sem o parâmetro e lembra do modelo, para as próximas já saírem certas na 1ª tentativa.
    if (r.status === 400 && !rejectsNoThinking.has(model)) {
      const retry = await post(false);
      if (retry.ok) { rejectsNoThinking.add(model); r = retry; }
    }
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
    // Avisa quando chega o 1º texto (true) ou quando o stream acaba/quebra sem nenhum (false).
    let settleFirst: (got: boolean) => void = () => {};
    const firstText = new Promise<boolean>((resolve) => { settleFirst = resolve; });
    const consumed = (async () => {
     try {
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
            if (delta) { full += delta; settleFirst(true); for (const cb of cbs) cb(delta); }
            const fr = j.candidates?.[0]?.finishReason;
            if (fr) stopReason = fr;
            if (j.usageMetadata) usage = j.usageMetadata;
          } catch { /* linha SSE parcial */ }
        }
      }
     } finally { settleFirst(false); }
    })();
    if (waitFirstText) {
      consumed.catch(() => { /* o erro é relançado logo abaixo, por quem espera */ });
      const got = await firstText;
      if (!got) {
        if (timedOut() && !req.signal?.aborted) throw slowError();
        await consumed; // stream quebrou (ou quem chamou cancelou): sobe o erro real
        // Terminou sem UMA palavra (visto ao vivo no 3.5-flash): trata como sobrecarga → reserva.
        throw Object.assign(new Error(`Gemini ${model}: resposta vazia`), { status: 503 });
      }
    }
    return {
      // Quem registra depois do 1º texto (caso do limite de espera) recebe o que já chegou.
      onText(cb) { if (full) cb(full); cbs.push(cb); },
      async final(): Promise<LlmResult> { await consumed; return { text: full, usage, model, stopReason }; },
    };
  }

  async complete(req: LlmRequest): Promise<LlmResult> {
    const s = await this.stream(req);
    return s.final();
  }
}
