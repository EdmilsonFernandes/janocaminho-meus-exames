import Anthropic from '@anthropic-ai/sdk';
import { config, hasAnthropicKey } from '../config';

let _client: Anthropic | null = null;

/** Lança um erro claro (503) se a chave da IA não estiver configurada. */
export function assertAnthropicKey(): void {
  if (!hasAnthropicKey()) {
    const err = new Error(
      'ANTHROPIC_API_KEY não configurada. Defina-a em packages/server/.env para usar extração/IA.',
    );
    (err as any).status = 503;
    throw err;
  }
}

/** Singleton do cliente Anthropic (lê ANTHROPIC_API_KEY do ambiente). */
export function getAnthropic(): Anthropic {
  if (!_client) {
    assertAnthropicKey();
    _client = new Anthropic();
  }
  return _client;
}

/** Modelo padrão para extração + resumos (claude-opus-4-8). */
export const MODEL = config.extractionModel;

/** Modelo mais barato para turnos de chat de follow-up. */
export const CHAT_MODEL = config.extractionModel; // MVP: mesmo modelo; troque por claude-haiku-4-5 para economizar
