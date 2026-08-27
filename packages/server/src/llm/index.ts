/**
 * Seletor de provedor de IA. getLlm() devolve o adapter ativo conforme a config do BANCO
 * (painel admin · aba IA), com fallback p/ o .env. getModel() = modelo ativo.
 * Trocar em runtime: PATCH /admin/ai-config → refreshLlm(). Sem restart nem redeploy.
 */
import { AnthropicAdapter, classifyError } from './anthropic';
import { OpenAIAdapter } from './openai';
import { GeminiAdapter } from './gemini';
import { getActiveConfig, loadAiConfig, resolveProviderConfig, seedAiModelsIfEmpty, AI_PROVIDERS, type AiProviderName } from './ai-config';
import type { LlmProvider, LlmRequest, LlmStream, LlmResult } from './types';

/** Modelo do provedor ativo (banco → env → default). Substitui o antigo `const MODEL`. */
export function getModel(): string {
  return getActiveConfig().model;
}

let _llm: LlmProvider | null = null;

function buildAdapter(p: AiProviderName): LlmProvider {
  if (p === 'openai') return new OpenAIAdapter();
  if (p === 'gemini') return new GeminiAdapter();
  return new AnthropicAdapter();
}

/** Failover ENTRE provedores: o ativo esgota (rate limit/auth/overloaded em todas as chaves do
 *  pool) → a MESMA request tenta os outros provedores que têm chave configurada (admin · IA).
 *  Só alterna em erro "de provedor" (429/401/403/529/503); erro de request (400 etc.) sobe direto.
 *  O stream só rejeita ANTES do 1º token, então o retry nunca duplica texto pro cliente. */
export class FallbackProvider implements LlmProvider {
  name: string;
  constructor(private primary: LlmProvider, private backups: LlmProvider[]) {
    this.name = primary.name;
  }
  async stream(req: LlmRequest): Promise<LlmStream> {
    try {
      return await this.primary.stream(req);
    } catch (e) {
      if (!classifyError(e).rotate || !this.backups.length) throw e;
      console.warn(`[llm] ${this.primary.name} esgotou (${(e as any)?.status ?? '?'}) — failover p/ ${this.backups.map((b) => b.name).join(' → ')}`);
      let last = e;
      for (const b of this.backups) {
        try {
          return await b.stream(req);
        } catch (e2) {
          last = e2;
          if (!classifyError(e2).rotate) throw e2;
        }
      }
      throw last;
    }
  }
  async complete(req: LlmRequest): Promise<LlmResult> {
    const s = await this.stream(req);
    const r = await s.final();
    if (!r) throw new Error('LLM: resposta vazia');
    return r;
  }
}

function build(): LlmProvider {
  const active = getActiveConfig();
  const primary = buildAdapter(active.provider);
  const backups = AI_PROVIDERS.filter((p) => p !== active.provider)
    .map((p) => resolveProviderConfig(p))
    .filter((cfg) => !!cfg.apiKey)
    .map((cfg) => buildAdapter(cfg.provider));
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

/** Boot: carrega a config do banco (sobrepõe o .env) + semeia o catálogo de modelos (1ª vez).
 *  Tolerante a DB indisponível (cai no .env). */
export async function initLlm(): Promise<void> {
  await loadAiConfig();
  await seedAiModelsIfEmpty();
  _llm = null; // reconstrói com a config do banco no próximo getLlm()
  getLlm();
}

/** Admin salvou config → recarrega o cache e reconstrói o adapter em runtime. */
export async function refreshLlm(): Promise<void> {
  await loadAiConfig();
  _llm = null;
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
