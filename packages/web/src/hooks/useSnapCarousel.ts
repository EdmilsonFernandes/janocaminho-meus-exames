import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';

/**
 * useSnapCarousel — vida num carrossel de scroll-snap (padrão ReUI "cycle auto"):
 *  - AUTO-AVANÇO a cada `intervalMs` (default 3s, dono 10/11), em LOOP (volta ao início);
 *  - PAUSA em hover/foco e com a aba oculta (ninguém perde card por estar olhando outro lugar);
 *  - prefers-reduced-motion → NADA automático (só o swipe/scroll manual);
 *  - DRAG com mouse na web (touch já é nativo): cursor grab/grabbing + inércia do snap.
 */
export function useSnapCarousel(ref: RefObject<HTMLElement | null>, opts?: { intervalMs?: number }) {
  const pausedRef = useRef(false);
  const dragRef = useRef<{ startX: number; startScroll: number } | null>(null);

  // Auto-avanço com pausas
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof window === 'undefined' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const intervalMs = opts?.intervalMs ?? 3000;
    let timer: number | undefined;

    const step = () => {
      if (pausedRef.current || document.hidden) return;
      const first = el.querySelector<HTMLElement>(':scope > *');
      const w = first ? first.getBoundingClientRect().width + 12 : el.clientWidth * 0.8;
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 6;
      el.scrollTo({ left: atEnd ? 0 : el.scrollLeft + w, behavior: 'smooth' });
    };
    const start = () => { window.clearInterval(timer); timer = window.setInterval(step, intervalMs); };
    const setPaused = (v: boolean) => () => { pausedRef.current = v; };

    el.addEventListener('pointerenter', setPaused(true));
    el.addEventListener('pointerleave', setPaused(false));
    el.addEventListener('focusin', setPaused(true));
    el.addEventListener('focusout', setPaused(false));
    const onVis = () => { pausedRef.current = document.hidden; };
    document.addEventListener('visibilitychange', onVis);
    start();
    return () => {
      window.clearInterval(timer);
      el.removeEventListener('pointerenter', setPaused(true));
      el.removeEventListener('pointerleave', setPaused(false));
      el.removeEventListener('focusin', setPaused(true));
      el.removeEventListener('focusout', setPaused(false));
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [ref, opts?.intervalMs]);

  // Drag com mouse (touch fica pro gesto nativo do navegador)
  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.pointerType === 'touch' || !ref.current) return;
    dragRef.current = { startX: e.clientX, startScroll: ref.current.scrollLeft };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    if (!dragRef.current || !ref.current) return;
    ref.current.scrollLeft = dragRef.current.startScroll - (e.clientX - dragRef.current.startX);
  };
  const onPointerUp = () => { dragRef.current = null; }; // snap mandatory recoloca no card

  return {
    dragHandlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
    dragSx: {
      cursor: { xs: 'default', sm: 'grab' },
      '&:active': { cursor: { xs: 'default', sm: 'grabbing' } },
      // evita arrastar IMAGENS/texto fantasma durante o drag
      userSelect: 'none',
      '& img': { pointerEvents: 'none' },
    } as const,
  };
}
