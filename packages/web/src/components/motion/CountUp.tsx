/**
 * CountUp — número que conta ao entrar na tela / ao mudar de valor.
 *
 * Escreve direto no texto do <span> a cada quadro, SEM estado do React: antes cada quadro
 * re-renderizava o componente (regra das skills animation-performance e do ReUI: nada de
 * setState por quadro). Anima do último valor exibido até o alvo (não volta a zero quando
 * o valor muda) e, com prefers-reduced-motion, mostra o valor final direto.
 * A formatação (pt-BR, decimais) é de quem usa.
 */
import { type CSSProperties, useLayoutEffect, useRef } from 'react';

interface CountUpProps {
  value: number | null;
  /** Formata o valor animado p/ exibição (ex.: toLocaleString pt-BR). */
  format?: (v: number) => string;
  duration?: number;
  className?: string;
  style?: CSSProperties;
}

/** ease-out exponencial: rápido no começo, assenta no fim. */
const easeOutExpo = (p: number) => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p));

export function CountUp({ value, format = String, duration = 800, className, style }: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef<number | null>(null); // último valor pintado
  const fmt = useRef(format);
  fmt.current = format;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || value == null) return;
    const from = shown.current ?? 0;
    const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || from === value) {
      shown.current = value;
      el.textContent = fmt.current(value);
      return;
    }
    let start: number | null = null;
    let raf = 0;
    const paint = (v: number) => { shown.current = v; el.textContent = fmt.current(v); };
    paint(from); // antes da 1ª pintura: não pisca o valor final
    const step = (ts: number) => {
      if (start == null) start = ts;
      const p = Math.min((ts - start) / duration, 1);
      paint(p >= 1 ? value : from + (value - from) * easeOutExpo(p));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return (
    <span ref={ref} className={className} style={style}>
      {value == null ? '—' : format(value)}
    </span>
  );
}
