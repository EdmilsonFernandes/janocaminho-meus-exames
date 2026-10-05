import { useEffect, useState } from 'react';
import { EASE } from '../motion';

/**
 * Fade-in do conteúdo quando o carregamento termina (padrão premium: a troca seca
 * skeleton→dados "estala"; revelar com fade de ~1s parece carregamento elegante).
 * Revela UMA vez (primeira carga ok); re-loads seguintes mantêm visível — sem piscar.
 * Uso: const reveal = useReveal(isLoading); <Box sx={{ ...reveal, ... }}>...</Box>
 */
export function useReveal(loading: boolean, ms = 900) {
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    if (loading || revealed) return;
    const raf = requestAnimationFrame(() => setRevealed(true));
    return () => cancelAnimationFrame(raf);
  }, [loading, revealed]);
  return {
    opacity: revealed ? 1 : 0,
    transition: `opacity ${ms}ms ${EASE}`,
  } as const;
}
