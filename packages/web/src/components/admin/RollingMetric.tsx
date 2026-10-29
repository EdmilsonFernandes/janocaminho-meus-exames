// Lucian UX/UI Prompt #098 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#098
// "Live metric with rolling digits" — each digit rolls on its own column when the value changes;
// the trend line below morphs into the new shape. React port for the Dr. Exame admin (OverviewTab):
// mounted inside the existing KPI cards, driven by real /admin/metrics data (rolls on mount and on
// refresh). No fake live ticker — the element's tabs/pause belong to the demo, not to real data.
// Rolling is decorative: aria-live="off" and the final value is exposed via aria-label (role="img").
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useTheme } from '@mui/material/styles';
import './lucian-ux.css';
import './RollingMetric.css';

interface RollingMetricProps {
  /** Nome da métrica — só para o leitor de tela (o card já tem o caption visual). */
  label: string;
  /** Valor final formatado, ex.: "R$ 1.234,56" ou "62%". Dígitos rolam, símbolos ficam. */
  text: string;
  /** Série da tendência (mais antigo → mais recente). <2 pontos = sem linha. */
  series?: number[];
  /** Cor da linha/cabeça (default: teal da marca conforme o tema). */
  color?: string;
  /** Cor do contorno da cabeça = superfície do card (default: background.paper). */
  headStroke?: string;
  /** Altura do dígito em px (default 30 — o widget original usa 58 num card de 340px). */
  digitHeight?: number;
  /** Altura da linha de tendência em px (default 44 — original: 128 num box de 340px). */
  sparkHeight?: number;
}

const domain = (v: number[]): [number, number] => {
  const mn = Math.min(...v);
  const mx = Math.max(...v);
  const p = (mx - mn) * 0.35 || 1;
  return [mn - p, mx + p];
};

export const RollingMetric = ({
  label,
  text,
  series,
  color,
  headStroke,
  digitHeight = 30,
  sparkHeight = 44,
}: RollingMetricProps) => {
  const theme = useTheme();
  const uid = useMemo(() => `u098${Math.random().toString(36).slice(2, 7)}`, []);
  const hasSeries = !!series && series.length >= 2 && series.every((v) => Number.isFinite(v));

  const numRef = useRef<HTMLDivElement>(null);
  const spRef = useRef<HTMLDivElement>(null);
  const lnRef = useRef<SVGPathElement>(null);
  const arRef = useRef<SVGPathElement>(null);
  const hdRef = useRef<SVGCircleElement>(null);
  const shownRef = useRef('');
  const ysRef = useRef<number[] | null>(null);
  const twRef = useRef(0);
  const [w, setW] = useState(300);

  const vars = {
    '--ux-accent': color ?? (theme.palette.mode === 'dark' ? '#5fc9c3' : '#20b2aa'),
    '--ux-surface': headStroke ?? theme.palette.background.paper,
    '--ux-ink': theme.palette.text.primary,
    '--h': digitHeight,
    '--sh': sparkHeight,
  } as CSSProperties;

  // Dígitos rolantes — porta direta da função digits() do elemento: rebuild quando o "esqueleto"
  // (não-dígitos) muda, senão só atualiza --d da coluna que difere. Montagem rola do 0.
  useEffect(() => {
    const num = numRef.current;
    if (!num) return;
    const prev = shownRef.current;
    const same = !!prev && prev.replace(/\d/g, '0') === text.replace(/\d/g, '0');
    if (!same) {
      num.innerHTML = '';
      text.split('').forEach((ch, i) => {
        const s = document.createElement('span');
        if (/\d/.test(ch)) {
          s.className = 'u098-col';
          s.style.setProperty('--d', '0');
          s.style.setProperty('--i', String(i));
          s.innerHTML = '<span>0</span><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span><span>7</span><span>8</span><span>9</span>';
        } else {
          s.className = 'u098-sym' + (ch === '%' || ch === 'M' || ch === 'k' ? ' sm' : '');
          s.textContent = ch;
        }
        num.appendChild(s);
      });
      void num.offsetWidth; // reflow: garante que a coluna pinte no 0 antes de rolar
    }
    let j = 0;
    const cols = num.querySelectorAll<HTMLElement>('.u098-col');
    text.split('').forEach((ch) => {
      if (/\d/.test(ch)) cols[j++]?.style.setProperty('--d', ch);
    });
    shownRef.current = text;
    num.setAttribute('aria-label', `${label}: ${text}`);
  }, [text, label]);

  // Largura real do sparkline (o original é fixo 340px; aqui o card é fluido).
  useEffect(() => {
    const el = spRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const cw = entries[0]?.contentRect.width ?? 0;
      if (cw > 0) setW(cw);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasSeries]);

  // Linha de tendência — geometria do original (pad de domínio 35%, folga 8px) com morph de 600ms
  // cubic in-out quando a série muda (refresh), idêntico ao pick() do elemento.
  useEffect(() => {
    if (!hasSeries || !series || w < 20) return;
    const H = sparkHeight;
    const N = series.length;
    const STEP = (w - 16) / (N - 1);
    const dom = domain(series);
    const Y = (v: number) => 8 + (1 - (v - dom[0]) / (dom[1] - dom[0])) * (H - 16);
    const paint = (y: number[]) => {
      const p = y.map((v, i) => `${i ? 'L' : 'M'}${(i * STEP).toFixed(1)} ${v.toFixed(1)}`).join('');
      const n = y.length - 1;
      lnRef.current?.setAttribute('d', p);
      arRef.current?.setAttribute(
        'd',
        `${p}L${(n * STEP).toFixed(1)} ${(H + 4).toFixed(1)}L0 ${(H + 4).toFixed(1)}Z`
      );
      if (hdRef.current) {
        hdRef.current.setAttribute('cx', (n * STEP).toFixed(1));
        hdRef.current.setAttribute('cy', y[n].toFixed(1));
      }
    };
    const to = series.map(Y);
    const from = ysRef.current;
    if (!from || from.length !== to.length) {
      ysRef.current = to;
      paint(to);
      return;
    }
    const rm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (rm) {
      ysRef.current = to;
      paint(to);
      return;
    }
    if (twRef.current) cancelAnimationFrame(twRef.current);
    const t0 = performance.now();
    const step = (n: number) => {
      if (!spRef.current?.isConnected) return;
      const t = Math.min(1, (n - t0) / 600);
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      const ys = from.map((y, j) => y + (to[j] - y) * e);
      ysRef.current = ys;
      paint(ys);
      if (t < 1) twRef.current = requestAnimationFrame(step);
    };
    step(t0);
    return () => {
      if (twRef.current) cancelAnimationFrame(twRef.current);
    };
  }, [series, w, sparkHeight, hasSeries]);

  return (
    <div className="ux" style={vars}>
      <div className="u098-num" ref={numRef} role="img" aria-live="off" aria-label={`${label}: ${text}`} />
      {hasSeries && (
        <div className="u098-sp" ref={spRef} aria-hidden="true">
          <svg viewBox={`0 0 ${Math.round(w)} ${sparkHeight}`} preserveAspectRatio="none">
            <defs>
              <linearGradient id={uid} x1="0" y1="0" x2="0" y2="1">
                <stop className="u098-gd" offset="0" stopOpacity=".26" />
                <stop className="u098-gd" offset="1" stopOpacity="0" />
              </linearGradient>
            </defs>
            <g>
              <path className="u098-ar" ref={arRef} fill={`url(#${uid})`} />
              <path className="u098-ln" ref={lnRef} />
              <circle className="u098-hd" ref={hdRef} r={4.5} />
            </g>
          </svg>
        </div>
      )}
    </div>
  );
};
