import { useEffect, useRef, useState } from 'react';

/** Solver de cubic-bezier CSS (Newton–Raphson + bisseção) — replica no rAF a MESMA
 *  curva de easing usada no CSS do design system, sem dependência externa. */
const cubicBezier = (x1: number, y1: number, x2: number, y2: number) => {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sampleX = (u: number) => ((ax * u + bx) * u + cx) * u;
  const sampleY = (u: number) => ((ay * u + by) * u + cy) * u;
  const dX = (u: number) => (3 * ax * u + 2 * bx) * u + cx;
  return (t: number) => {
    let u = t;
    for (let i = 0; i < 8; i++) {
      const x = sampleX(u) - t;
      if (Math.abs(x) < 1e-5) return sampleY(u);
      const d = dX(u);
      if (Math.abs(d) < 1e-6) break;
      u -= x / d;
    }
    let lo = 0, hi = 1;
    for (let i = 0; i < 20; i++) {
      const x = sampleX(u);
      if (Math.abs(x - t) < 1e-5) break;
      if (x < t) lo = u; else hi = u;
      u = (lo + hi) / 2;
    }
    return sampleY(u);
  };
};
/** ease-out exponencial — a curva cubic-bezier(.16,1,.3,1) do motion system. */
const easeOutExpo = cubicBezier(0.16, 1, 0.3, 1);

/** Count-up hook — anima do valor exibido até o alvo (na 1ª vez, 0 → alvo) em ~800ms
 *  easeOutExpo, via rAF, cancelável. Recomeça do valor atual quando o alvo muda (drag
 *  de slider não "pisca" voltando a zero).
 *  prefers-reduced-motion: mostra o valor final direto, sem animar.
 *  Retorna número "cru" (pode ser fracionário no meio do caminho) — arredondar/formatar
 *  quem exibe (ver <CountUp/> em components/motion). */
export const useCountUp = (target: number | null, duration = 800) => {
  const [value, setValue] = useState(0);
  const shownRef = useRef(0); // último valor pintado na tela (não o alvo)
  useEffect(() => {
    if (target == null) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      shownRef.current = target;
      setValue(target);
      return;
    }
    const from = shownRef.current;
    if (from === target) return;
    let start: number | null = null;
    let raf: number;
    const step = (ts: number) => {
      if (start == null) start = ts;
      const p = Math.min((ts - start) / duration, 1);
      const v = from + (target - from) * easeOutExpo(p);
      shownRef.current = v;
      setValue(v);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return target == null ? null : value;
};
