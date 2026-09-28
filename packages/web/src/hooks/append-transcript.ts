/**
 * Junta a transcrição do ditado por voz no texto atual do input.
 *
 * Regras (erro de ASR em termo médico é esperado — por isso a transcrição
 * JAMAIS é enviada automática: ela só preenche o input p/ revisão):
 * - Prioriza o resultado FINAL; sem final, usa o PARCIAL (feedback ao vivo).
 * - Se já havia texto, anexa com um espaço entre (nunca cola colado).
 * - Nada novo (só espaços/vazio) → devolve `current` INTACTO (não mexe no que
 *   o usuário já digitou).
 */
export const appendTranscript = (current: string, partial: string, final: string): string => {
  const piece = (final || partial).trim();
  if (!piece) return current;
  const base = current.trim();
  return base ? `${base} ${piece}` : piece;
};
