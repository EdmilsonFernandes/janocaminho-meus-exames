/**
 * Config do provedor de IA parametrizada no banco (admin editable) com fallback p/ o .env.
 * Padrão espelhado em utils/settings.ts: cache SÍNCRONO populado no boot + invalidado no PATCH.
 *
 * Resolução (banco → env → default):
 *   provider : linha ativa do banco → AI_PROVIDER (env) → 'anthropic'
 *   apiKey   : decryptPII(banco) → ANTHROPIC_AUTH_TOKEN/OPENAI_API_KEY/GEMINI_API_KEY (env)
 *   baseURL  : banco → env (relay Z.ai / OpenAI base). Gemini usa endpoint fixo.
 *   model    : banco → env (glm-4.6 / gpt-4o-mini / gemini-2.0-flash)
 *
 * getActiveConfig() é síncrono pq getLlm() (chamado em 7 pontos) precisa ser síncrono.
 */
import { config } from '../config';
import { prisma } from '../prisma';
import { decryptPII } from '../utils/crypto';

export type AiProviderName = 'anthropic' | 'openai' | 'gemini';

export interface AiProviderRuntime {
  provider: AiProviderName;
  apiKey: string;
  baseURL: string | undefined;
  model: string;
}

export interface AiConfigRow {
  provider: AiProviderName;
  active: boolean;
  baseURL: string | null;
  model: string | null;
  apiKeyEnc: string | null;
  apiKeyIv: string | null;
}

export const AI_PROVIDERS: AiProviderName[] = ['anthropic', 'openai', 'gemini'];

const isValid = (p: string): p is AiProviderName => (AI_PROVIDERS as string[]).includes(p);

// Defaults do .env (usados quando o banco está vazio OU a coluna está null).
const ENV_DEFAULTS: Record<AiProviderName, { key: string; baseURL: string; model: string }> = {
  anthropic: {
    key: process.env.ANTHROPIC_AUTH_TOKEN || config.anthropicApiKey, // relay Z.ai usa AUTH_TOKEN
    baseURL: process.env.ANTHROPIC_BASE_URL || 'https://api.z.ai/api/anthropic',
    model: config.extractionModel,
  },
  openai: { key: config.openaiApiKey, baseURL: config.openaiBaseURL, model: config.openaiModel },
  gemini: { key: config.geminiApiKey, baseURL: '', model: config.geminiModel }, // endpoint fixo no adapter
};

// --- cache síncrono (snapshot) ---
let _rows: AiConfigRow[] = [];
let _activeProvider: AiProviderName = isValid((config.aiProvider || 'anthropic').toLowerCase())
  ? (config.aiProvider.toLowerCase() as AiProviderName)
  : 'anthropic';

/** Resolve a config runtime de um provider específico: override → banco → env → default.
 *  Override (do body do admin) vence — usado no "testar conexão" e ao salvar. */
export function resolveProviderConfig(
  provider: AiProviderName,
  override?: { apiKey?: string; baseURL?: string; model?: string },
): AiProviderRuntime {
  const row = _rows.find((r) => r.provider === provider);
  const env = ENV_DEFAULTS[provider];
  const apiKey =
    override?.apiKey?.trim() ||
    (row?.apiKeyEnc && row?.apiKeyIv ? decryptPII(row.apiKeyEnc, row.apiKeyIv) : null) ||
    env.key;
  const baseURL = override?.baseURL?.trim() || row?.baseURL?.trim() || env.baseURL || undefined;
  const model = override?.model?.trim() || row?.model?.trim() || env.model;
  return { provider, apiKey, baseURL, model };
}

/** Snapshot da config ATIVA (síncrono). Resolve banco → env → default. */
export function getActiveConfig(): AiProviderRuntime {
  return resolveProviderConfig(_activeProvider);
}

export function getActiveProvider(): AiProviderName {
  return _activeProvider;
}

/** Lê o banco, descriptografa (lazy, só getActiveConfig decrypta), atualiza o cache. Boot + PATCH. */
export async function loadAiConfig(): Promise<void> {
  try {
    const dbRows = await prisma.aiProviderConfig.findMany();
    _rows = dbRows.map((r) => ({
      provider: isValid(r.provider) ? r.provider : 'anthropic',
      active: r.active,
      baseURL: r.baseURL,
      model: r.model,
      apiKeyEnc: r.apiKeyEnc,
      apiKeyIv: r.apiKeyIv,
    }));
    const active = dbRows.find((r) => r.active && isValid(r.provider));
    if (active) _activeProvider = active.provider as AiProviderName;
    console.log(`[llm] config do banco carregada — ativo: ${_activeProvider} · ${dbRows.length} provedor(es)`);
  } catch (e) {
    console.warn('[llm] loadAiConfig falhou (usando .env):', (e as Error).message);
  }
}

/** Snapshot p/ o GET admin — com a chave MASCARADA (nunca expõe a cheia). */
export function getConfigRows(): Array<{ provider: AiProviderName; active: boolean; baseURL: string | null; model: string | null; keyMasked: string | null }> {
  return _rows.map((r) => ({
    provider: r.provider,
    active: r.active,
    baseURL: r.baseURL,
    model: r.model,
    keyMasked: maskKey(r.apiKeyEnc, r.apiKeyIv),
  }));
}

/** •••• + últimos 4. null se não houver chave. Nunca devolve a chave completa. */
export function maskKey(enc: string | null, iv: string | null): string | null {
  const plain = enc && iv ? decryptPII(enc, iv) : null;
  if (!plain) return null;
  return plain.length <= 4 ? '••••' : '••••' + plain.slice(-4);
}
