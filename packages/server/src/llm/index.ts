/**
 * Seletor de provedor de IA. getLlm() devolve o adapter ativo conforme AI_PROVIDER (env).
 * Default = anthropic (Z.ai/GLM). Pra trocar: AI_PROVIDER=openai|gemini + a chave no .env.
 * MODEL = modelo do provider ativo (mantém `import { MODEL }` nos 7 pontos sem mudar).
 */
import { config } from '../config';
import { AnthropicAdapter } from './anthropic';
import { OpenAIAdapter } from './openai';
import { GeminiAdapter } from './gemini';
import type { LlmProvider } from './types';

export const MODEL =
  config.aiProvider === 'openai' ? config.openaiModel :
  config.aiProvider === 'gemini' ? config.geminiModel :
  config.extractionModel; // anthropic (Z.ai/GLM)

let _llm: LlmProvider | null = null;

export function getLlm(): LlmProvider {
  if (_llm) return _llm;
  const p = (config.aiProvider || 'anthropic').toLowerCase();
  if (p === 'openai') _llm = new OpenAIAdapter();
  else if (p === 'gemini') _llm = new GeminiAdapter();
  else _llm = new AnthropicAdapter();
  console.log(`[llm] provider ativo: ${_llm!.name} | model: ${MODEL}`);
  return _llm!;
}

export type { LlmProvider, LlmRequest, LlmStream, LlmResult, LlmMessage, LlmRole } from './types';
