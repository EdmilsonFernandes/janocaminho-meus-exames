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

  // Auto-avanço com pausas.
  // O carrossel costuma aparecer DEPOIS que os dados chegam: no primeiro efeito o ref ainda está
  // vazio. Antes o efeito desistia ali e nunca mais rodava (o card não se movia sozinho). Agora o
  // relógio é ligado uma vez e procura o elemento a cada volta; a pausa é lida na hora
  // (ponteiro em cima, foco dentro, arrastando, aba oculta), sem depender de ouvintes presos a um
  // elemento que pode ainda não existir.
  useEffect(() => {
    if (typeof window === 'undefined' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const intervalMs = opts?.intervalMs ?? 3000;
    const step = () => {
      const el = ref.current;
      if (!el || document.hidden || pausedRef.current || dragRef.current) return;
      if (el.scrollWidth <= el.clientWidth + 6) return; // um card só: nada para girar
      // :hover só vale com mouse: no toque ele fica "preso" no último elemento tocado e travaria o giro.
      const hovering = !!window.matchMedia?.('(hover: hover)').matches && el.matches(':hover');
      if (hovering || el.contains(document.activeElement)) return;
      const first = el.querySelector<HTMLElement>(':scope > *');
      const gap = parseFloat(getComputedStyle(el).columnGap || '12') || 12;
      const w = first ? first.getBoundingClientRect().width + gap : el.clientWidth * 0.8;
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 6;
      el.scrollTo({ left: atEnd ? 0 : el.scrollLeft + w, behavior: 'smooth' });
    };
    const timer = window.setInterval(step, intervalMs);
    return () => window.clearInterval(timer);
  }, [ref, opts?.intervalMs]);

  // Toque: pausa enquanto o dedo está no carrossel e por um instante depois (não briga com o swipe).
  useEffect(() => {
    let release: number | undefined;
    const inside = (t: EventTarget | null) => !!ref.current && t instanceof Node && ref.current.contains(t);
    const down = (e: TouchEvent) => { if (inside(e.target)) { window.clearTimeout(release); pausedRef.current = true; } };
    const up = () => { if (pausedRef.current) { window.clearTimeout(release); release = window.setTimeout(() => { pausedRef.current = false; }, 4000); } };
    document.addEventListener('touchstart', down, { passive: true });
    document.addEventListener('touchend', up, { passive: true });
    document.addEventListener('touchcancel', up, { passive: true });
    return () => {
      window.clearTimeout(release);
      document.removeEventListener('touchstart', down);
      document.removeEventListener('touchend', up);
      document.removeEventListener('touchcancel', up);
    };
  }, [ref]);

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
