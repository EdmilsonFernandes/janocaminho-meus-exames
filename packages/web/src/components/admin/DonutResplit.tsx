// Lucian UX/UI Prompt #097 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#097
// "Donut that re-splits" — hover focuses a slice, click removes/re-includes it while the ring
// re-splits and the center total rolls along. React port for the Dr. Exame admin (FinanceiroTab):
// real payment data via props, theme colors via --ux-* custom properties, legend rows at 44px.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useTheme } from '@mui/material/styles';
import './lucian-ux.css';
import './DonutResplit.css';

export interface DonutSlice {
  label: string;
  value: number;
}

/** Tons harmônicos teal→cobre (identidade Dr. Exame), último neutro p/ "sem registro". */
export const DONUT_PALETTE = ['#20b2aa', '#d4a574', '#178f89', '#5fc9c3', '#94a3b8'];

export const fmtBRL = (v: number): string => `R$ ${Math.round(v).toLocaleString('pt-BR')}`;
export const fmtBRLFull = (v: number): string =>
  `R$ ${Number(v ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface DonutResplitProps {
  slices: DonutSlice[];
  palette?: string[];
  title?: string;
  question?: string;
  centerTitle?: string;
  /** Legenda do centro quando todas as fatias estão incluídas (ex.: "12 pagamento(s)"). */
  allCaption?: string;
  formatValue?: (v: number) => string;
  /** Valor compacto da legenda lateral. */
  formatCompact?: (v: number) => string;
}

export const DonutResplit = ({
  slices,
  palette = DONUT_PALETTE,
  title = 'Receita da página',
  question = 'Para onde foi a receita?',
  centerTitle = 'Total na página',
  allCaption = '',
  formatValue = fmtBRL,
  formatCompact = (v) => (v >= 1000 ? `R$ ${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : fmtBRL(v)),
}: DonutResplitProps) => {
  const theme = useTheme();
  const rm = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    []
  );

  const rootRef = useRef<HTMLDivElement>(null);
  const centerRef = useRef<HTMLDivElement>(null);
  const cbRef = useRef<HTMLElement>(null);
  const segRefs = useRef<(SVGCircleElement | null)[]>([]);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const [on, setOn] = useState<boolean[]>(() => slices.map(() => true));
  const [act, setAct] = useState(-1);
  const [cs, setCs] = useState(centerTitle);
  const [cp, setCp] = useState('');

  const actRef = useRef(act);
  const onRef = useRef(on);
  const frRef = useRef<number[]>(slices.map(() => 0));
  const shownTotalRef = useRef(0);
  const cntRef = useRef(0);
  const twRef = useRef(0);
  const rollRafRef = useRef(0);
  const firstMorphRef = useRef(true);

  const R = 80;
  const C = 2 * Math.PI * R;
  const GAP = 3;
  const grand = useMemo(() => slices.reduce((s, d) => s + d.value, 0), [slices]);
  const totalOn = (onNow: boolean[]) => slices.reduce((s, d, i) => s + (onNow[i] ? d.value : 0), 0);

  // --ux-* tokens mapeados no tema MUI (light/dark via useTheme; troca de tema reflui na hora)
  const vars = {
    '--ux-surface': theme.palette.background.paper,
    '--ux-surface-2': theme.palette.action.hover,
    '--ux-surface-3': theme.palette.action.selected,
    '--ux-ink': theme.palette.text.primary,
    '--ux-ink-2': theme.palette.text.secondary,
    '--ux-ink-3': theme.palette.text.disabled,
    '--ux-line': theme.palette.divider,
    '--ux-accent': theme.palette.mode === 'dark' ? '#5fc9c3' : '#20b2aa',
    '--ux-shadow-strong': theme.palette.mode === 'dark' ? 'rgba(0,0,0,.72)' : 'rgba(40,30,80,.3)',
    '--ux-spring': 'cubic-bezier(.34,1.45,.64,1)',
    '--ux-ease': 'cubic-bezier(.2,.8,.2,1)',
  } as CSSProperties;

  const paint = () => {
    let acc = 0;
    const fr = frRef.current;
    segRefs.current.forEach((c, i) => {
      if (!c) return;
      const len = fr[i] * C;
      const vis = Math.max(0, len - GAP);
      c.setAttribute('stroke-dasharray', `${vis.toFixed(2)} ${C.toFixed(2)}`);
      c.setAttribute('stroke-dashoffset', (-acc - GAP / 2).toFixed(2));
      const mid = ((acc + len / 2) / C) * Math.PI * 2;
      c.style.transform =
        i === actRef.current && onRef.current[i]
          ? `translate(${(Math.cos(mid) * 7).toFixed(2)}px,${(Math.sin(mid) * 7).toFixed(2)}px)`
          : '';
      acc += len;
    });
  };

  const rollTotal = (to: number) => {
    const from = shownTotalRef.current;
    const t0 = performance.now();
    const dur = rm ? 1 : 600;
    const my = ++cntRef.current;
    const step = (n: number) => {
      if (!rootRef.current?.isConnected || my !== cntRef.current || actRef.current >= 0) return;
      const k = Math.min(1, (n - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      shownTotalRef.current = from + (to - from) * e;
      if (cbRef.current) cbRef.current.textContent = formatValue(shownTotalRef.current);
      if (k < 1) rollRafRef.current = requestAnimationFrame(step);
    };
    rollRafRef.current = requestAnimationFrame(step);
  };

  const label = (onNow: boolean[], actNow: number) => {
    const c = centerRef.current;
    if (!c) return;
    c.classList.remove('sw');
    void c.offsetWidth;
    c.classList.add('sw');
    const t = totalOn(onNow);
    if (actNow >= 0 && onNow[actNow]) {
      cntRef.current++; // cancela roll em curso
      setCs(slices[actNow].label);
      if (cbRef.current) cbRef.current.textContent = formatValue(slices[actNow].value);
      setCp(`${Math.round((slices[actNow].value / t) * 100)}% do total`);
    } else {
      const n = onNow.filter(Boolean).length;
      setCs(n === slices.length ? centerTitle : `${n} de ${slices.length} incluídas`);
      setCp(n === slices.length ? allCaption : `de ${formatValue(grand)} no total`);
      rollTotal(t);
    }
  };

  const morph = (onNow: boolean[], stagger: boolean) => {
    if (twRef.current) cancelAnimationFrame(twRef.current);
    onRef.current = onNow;
    const t = totalOn(onNow);
    const to = slices.map((d, i) => (onNow[i] && t ? d.value / t : 0));
    const from = frRef.current.slice();
    const t0 = performance.now();
    const dur = rm ? 1 : stagger ? 1100 : 600;
    const step = (n: number) => {
      if (!rootRef.current?.isConnected) return;
      const k = Math.min(1, (n - t0) / dur);
      frRef.current = from.map((v, i) => {
        const kk = stagger ? Math.max(0, Math.min(1, (k - i * 0.1) / 0.6)) : k;
        const e = kk < 0.5 ? 4 * kk * kk * kk : 1 - Math.pow(-2 * kk + 2, 3) / 2;
        return v + (to[i] - v) * e;
      });
      paint();
      if (k < 1) twRef.current = requestAnimationFrame(step);
    };
    step(t0);
  };

  const focus = (i: number) => {
    if (i === actRef.current) return;
    actRef.current = i;
    setAct(i);
  };

  const toggle = (i: number) => {
    if (on[i] && on.filter(Boolean).length === 1) {
      itemRefs.current[i]?.animate(
        [
          { transform: 'translateX(0)' },
          { transform: 'translateX(-5px)' },
          { transform: 'translateX(4px)' },
          { transform: 'none' },
        ],
        { duration: 300 }
      );
      return;
    }
    const next = on.map((v, k) => (k === i ? !v : v));
    actRef.current = next[i] ? i : -1;
    setAct(actRef.current);
    setOn(next);
  };

  const onKey = on.join(',');
  const actKey = act;

  // Entrada (stagger) e re-split a cada toggle — espelha o script original.
  useEffect(() => {
    morph(on, !rm && firstMorphRef.current);
    firstMorphRef.current = false;
    label(on, actRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onKey]);

  // Hover/focus: destaca fatia e troca o centro.
  useEffect(() => {
    paint();
    label(on, act);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actKey]);

  // Cleanup: cancela rAFs do morph e do roll (StrictMode/desmonte).
  useEffect(
    () => () => {
      if (twRef.current) cancelAnimationFrame(twRef.current);
      if (rollRafRef.current) cancelAnimationFrame(rollRafRef.current);
    },
    []
  );

  return (
    <div
      ref={rootRef}
      className={`ux u097${act >= 0 && on[act] ? ' has' : ''}`}
      style={vars}
    >
      <div className="u097-h">
        <small>{title}</small>
        <b>{question}</b>
      </div>
      <div className="u097-dn">
        <svg viewBox="0 0 216 216" aria-hidden="true" onPointerLeave={() => focus(-1)}>
          <circle className="u097-trk" cx={108} cy={108} r={80} />
          {slices.map((s, i) => (
            <circle
              key={s.label}
              ref={(el) => {
                segRefs.current[i] = el;
              }}
              className={`u097-sg${act === i && on[i] ? ' on' : ''}`}
              cx={108}
              cy={108}
              r={R}
              stroke={palette[i % palette.length]}
              onPointerEnter={() => focus(i)}
              onClick={() => toggle(i)}
            />
          ))}
        </svg>
        <div className="u097-c" ref={centerRef} aria-live="polite">
          <small>{cs}</small>
          <b ref={cbRef} />
          <span>{cp}</span>
        </div>
      </div>
      <div
        className="u097-lg"
        role="group"
        aria-label="Categorias de receita — clique para incluir ou excluir"
        onPointerLeave={(e) => {
          if (!e.currentTarget.contains(document.activeElement)) focus(-1);
        }}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) focus(-1);
        }}
      >
        {slices.map((s, i) => (
          <button
            key={s.label}
            type="button"
            ref={(el) => {
              itemRefs.current[i] = el;
            }}
            className={`u097-it${act === i ? ' on' : ''}`}
            style={{ '--c': palette[i % palette.length] } as CSSProperties}
            aria-pressed={on[i]}
            aria-label={`${s.label}: ${formatValue(s.value)}${on[i] ? ', incluída' : ', excluída'}`}
            onPointerEnter={() => focus(i)}
            onFocus={() => focus(i)}
            onClick={() => toggle(i)}
          >
            <i aria-hidden="true" />
            <span>{s.label}</span>
            <small>{formatCompact(s.value)}</small>
          </button>
        ))}
      </div>
    </div>
  );
};
