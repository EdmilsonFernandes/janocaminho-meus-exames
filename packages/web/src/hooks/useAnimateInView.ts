import { useEffect, useRef, useState, type RefObject } from 'react';

/**
 * Animações decorativas INFINITAS só rodam enquanto o elemento está no viewport
 * (perf 03/11: no dashboard, 6 animações infinitas rodavam fora da tela — mascote de
 * scan, anel do mapa do corpo, pulsos das conquistas — e custavam 40% dos quadros num
 * Android médio). Usar: `const [ref, inView] = useAnimateInView();` e aplicar
 * `animationPlayState: inView ? 'running' : 'paused'` (ou um atributo no root p/ CSS).
 * Sem IntersectionObserver (ambiente antigo/teste) → considera visível (nunca trava a UI).
 */
export function useAnimateInView<T extends HTMLElement = HTMLDivElement>(margin = '64px'): [RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => { for (const e of entries) setInView(e.isIntersecting); }, { rootMargin: margin });
    io.observe(el);
    return () => io.disconnect();
  }, [margin]);
  return [ref, inView];
}
