/**
 * Camada de abstração de LLM — isola o provedor de IA (Anthropic/Z.ai, OpenAI, Gemini)
 * pra que trocar seja só mudar .env (AI_PROVIDER), sem tocar nas features. As 7 chamadas
 * de IA do app (chat, extração, resumo, plano, nudges, explain) usam SÓ esta interface.
 *
 * Padrões cobertos (ver análise em plans/sorted-gliding-sunset.md):
 *  - stream → SSE (chat): onText(delta) + final()
 *  - stream → JSON/markdown (extração, resumo, plano, explain): final() → texto
 *  - complete → texto (nudges, non-stream)
 */

export type LlmRole = 'user' | 'assistant';

export interface LlmMessage {
  role: string; // 'user' | 'assistant' (string p/ flexibilidade dos callers; adapters validam/convertem)
  content: string;
}

export interface LlmRequest {
  system?: string | string[];
  messages: LlmMessage[];
  maxTokens: number;
  model?: string;
}

export interface LlmResult {
  text: string;
  usage?: any;
  model?: string;
  stopReason?: string;
}

/** Stream: registra callback de delta (chat/SSE) e resolve o texto final (todos). */
export interface LlmStream {
  onText(cb: (delta: string) => void): void;
  final(): Promise<LlmResult>;
}

export interface LlmProvider {
  name: string;
  stream(req: LlmRequest): Promise<LlmStream>;
  /** Atalho: stream sem onText (nudges). */
  complete(req: LlmRequest): Promise<LlmResult>;
}
