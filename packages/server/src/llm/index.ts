/**
 * Seletor de provedor de IA. getLlm() devolve o adapter ativo conforme a config do BANCO
 * (painel admin · aba IA), com fallback p/ o .env. getModel() = modelo ativo.
 * Trocar em runtime: PATCH /admin/ai-config → refreshLlm(). Sem restart nem redeploy.
 */
import { AnthropicAdapter } from './anthropic';
import { OpenAIAdapter } from './openai';
import { GeminiAdapter } from './gemini';
import { getActiveConfig, loadAiConfig, resolveProviderConfig, type AiProviderName } from './ai-config';
import type { LlmProvider } from './types';

/** Modelo do provedor ativo (banco → env → default). Substitui o antigo `const MODEL`. */
export function getModel(): string {
  return getActiveConfig().model;
}

let _llm: LlmProvider | null = null;

function build(): LlmProvider {
  const p = getActiveConfig().provider;
  if (p === 'openai') return new OpenAIAdapter();
  if (p === 'gemini') return new GeminiAdapter();
  return new AnthropicAdapter();
}

export function getLlm(): LlmProvider {
  if (!_llm) {
    _llm = build();
    console.log(`[llm] provider ativo: ${_llm.name} | model: ${getModel()}`);
  }
  return _llm;
}

/** Boot: carrega a config do banco (sobrepõe o .env). Tolerante a DB indisponível (cai no .env). */
export async function initLlm(): Promise<void> {
  await loadAiConfig();
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
