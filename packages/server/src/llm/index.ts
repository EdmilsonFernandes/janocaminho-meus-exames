/**
 * Seletor de provedor de IA. getLlm() devolve o adapter ativo conforme a config do BANCO
 * (painel admin · aba IA), com fallback p/ o .env. getModel() = modelo ativo.
 * Trocar em runtime: PATCH /admin/ai-config → refreshLlm(). Sem restart nem redeploy.
 */
import { AnthropicAdapter, classifyError } from './anthropic';
import { OpenAIAdapter } from './openai';
import { GeminiAdapter } from './gemini';
import { getActiveConfig, getChatProviderPref, loadAiConfig, resolveProviderConfig, seedAiModelsIfEmpty, AI_PROVIDERS, type AiProviderName } from './ai-config';
import type { LlmProvider, LlmRequest, LlmStream, LlmResult } from './types';

/** Modelo do provedor ativo (banco → env → default). Substitui o antigo `const MODEL`. */
export function getModel(): string {
  return getActiveConfig().model;
}

let _llm: LlmProvider | null = null;

function buildAdapter(p: AiProviderName, cfg = resolveProviderConfig(p)): LlmProvider {
  // cfg explícito: sem ele, o adapter defaultava o MODEL do provider ATIVO (bug latente
  // 17/11: backup gemini herdaria model "glm-5.3" e a primeira tentativa de failover falharia).
  if (p === 'openai') return new OpenAIAdapter(cfg);
  if (p === 'gemini') return new GeminiAdapter(cfg);
  return new AnthropicAdapter(cfg);
}

/** Failover ENTRE provedores: o ativo esgota (rate limit/auth/overloaded em todas as chaves do
 *  pool) → a MESMA request tenta os outros provedores que têm chave configurada (admin · IA).
 *  Só alterna em erro "de provedor" (429/401/403/529/503); erro de request (400 etc.) sobe direto.
 *  O stream só rejeita ANTES do 1º token, então o retry nunca duplica texto pro cliente. */
export class FallbackProvider implements LlmProvider {
  name: string;
  /** Primário em cooldown (429/401/503): as próximas requests vão direto ao backup até expirar,
   *  em vez de pagar a latência de bater no provedor esgotado a cada mensagem (caso 24/11:
   *  cota diária do Gemini estourada). Se os backups também falharem, o primário é a última tentativa. */
  private primaryDownUntil = 0;
  constructor(private primary: LlmProvider, private backups: LlmProvider[]) {
    this.name = primary.name;
  }
  private order(): LlmProvider[] {
    return Date.now() < this.primaryDownUntil ? [...this.backups, this.primary] : [this.primary, ...this.backups];
  }
  private async run<T>(label: string, fn: (p: LlmProvider) => Promise<T>): Promise<T> {
    let last: unknown;
    const list = this.order();
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      try {
        return await fn(p);
      } catch (e) {
        last = e;
        const c = classifyError(e);
        if (!c.rotate) throw e;
        if (p === this.primary) this.primaryDownUntil = Date.now() + Math.min(c.cooldownMs, 30 * 60_000);
        const rest = list.slice(i + 1).map((b) => b.name);
        if (rest.length) console.warn(`[llm] ${p.name} ${label} (${(e as any)?.status ?? '?'}) — failover p/ ${rest.join(' → ')}`);
      }
    }
    throw last;
  }
  async stream(req: LlmRequest): Promise<LlmStream> {
    // req.model vem do PROVIDER DE ORIGEM (ex.: glm-5.3) — o backup usaria o modelo
    // errado na própria API. Strip: cada adapter cai no model do próprio config.
    return this.run('esgotou', (p) => p.stream(p === this.primary ? req : { ...req, model: undefined }));
  }
  async complete(req: LlmRequest): Promise<LlmResult> {
    return this.run('falhou/vazio', (p) => this.attempt(p, req));
  }

  /** stream + final com REGRAS DE VAZIO (caso Dione 18/11): o relay às vezes devolve 200
   *  com corpo quase vazio (throttle mascarado) em vez de 429. Resposta sem texto =
   *  erro rotativo (503) → o complete() acima refaz a chamada no backup (ex.: Gemini). */
  private async attempt(p: LlmProvider, req: LlmRequest): Promise<LlmResult> {
    // backup não herda o model do primário (strip igual ao stream; cada adapter usa o próprio cfg)
    const s = await p.stream(p === this.primary ? req : { ...req, model: undefined });
    const r = await s.final();
    if (!r || !(r.text ?? '').trim()) {
      throw Object.assign(new Error(`LLM ${p.name}: resposta vazia (possível throttle)`), { status: 503 });
    }
    return r;
  }
}

function build(primaryProvider?: AiProviderName): LlmProvider {
  const active = getActiveConfig();
  const primaryName = primaryProvider ?? active.provider;
  const primary = buildAdapter(primaryName);
  const backups = AI_PROVIDERS.filter((p) => p !== primaryName)
    .map((p) => resolveProviderConfig(p))
    .filter((cfg) => !!cfg.apiKey)
    .map((cfg) => buildAdapter(cfg.provider, cfg));
  return backups.length ? new FallbackProvider(primary, backups) : primary;
}

export function getLlm(): LlmProvider {
  if (!_llm) {
    _llm = build();
    const fb = _llm instanceof FallbackProvider;
    console.log(`[llm] provider ativo: ${_llm.name} | model: ${getModel()}${fb ? ' | failover: ON' : ' | failover: off (só 1 provedor com chave)'}`);
  }
  return _llm;
}

let _chatLlm: LlmProvider | null = null;

/** LLM do CHAT (e afins conversacionais): primário = AppSetting aiRouting.chatProvider
 *  (ex.: gemini, free tier) — cai no ativo se não configurado. Backups = demais providers
 *  com chave (o GLM ativo entra como rede de segurança do chat). */
export function getChatLlm(): LlmProvider {
  if (!_chatLlm) {
    const pref = getChatProviderPref();
    _chatLlm = build(pref ?? undefined);
    const fb = _chatLlm instanceof FallbackProvider;
    console.log(`[llm] chat provider: ${_chatLlm.name}${pref ? ' (roteado)' : ' (= ativo)'}${fb ? ' | failover: ON' : ''}`);
  }
  return _chatLlm;
}

/** Boot: carrega a config do banco (sobrepõe o .env) + semeia o catálogo de modelos (1ª vez).
 *  Tolerante a DB indisponível (cai no .env). */
export async function initLlm(): Promise<void> {
  await loadAiConfig();
  await seedAiModelsIfEmpty();
  _llm = null; // reconstrói com a config do banco no próximo getLlm()
  _chatLlm = null;
  getLlm();
}

/** Admin salvou config → recarrega o cache e reconstrói o adapter em runtime. */
export async function refreshLlm(): Promise<void> {
  await loadAiConfig();
  _llm = null;
  _chatLlm = null;
  getLlm();
}

/** Teste de conexão (botão "Testar" do admin). Usa override → banco → env. NÃO persiste. */
export async function testLlmConnection(
  provider: AiProviderName,
  override?: { apiKey?: string; baseURL?: string; model?: string },
): Promise<{ ok: true; latencyMs: number; model: string; text: string } | { ok: false; error: string; latencyMs: number }> {
  const cfg = resolveProviderConfig(provider, override);
  const adapter =
    provider === 'openai' ? new OpenAIAdapter(cfg) : provider === 'gemini' ? new GeminiAdapter(cfg) : new AnthropicAdapter(cfg);
  const t0 = Date.now();
  try {
    const r = await adapter.complete({ system: 'Responda apenas com a palavra: PONG', messages: [{ role: 'user', content: 'ping' }], maxTokens: 10 });
    return { ok: true, latencyMs: Date.now() - t0, model: cfg.model, text: (r.text || '').trim().slice(0, 50) };
  } catch (e: any) {
    return { ok: false, error: (e?.message ?? String(e)).slice(0, 300), latencyMs: Date.now() - t0 };
  }
}

export type { LlmProvider, LlmRequest, LlmStream, LlmResult, LlmMessage, LlmRole } from './types';
