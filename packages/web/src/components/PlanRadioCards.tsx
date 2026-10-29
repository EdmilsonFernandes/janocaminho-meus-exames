// Lucian UX/UI Prompt #015 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#015
// Plan radio cards — frame desliza pro plano escolhido (.55s spring), ponto pop no radio
// (.45s spring), preço ganha força só no selecionado (.35s). Setas ↑↓←→ navegam.
// Porte React/MUI (sx): cores mapeadas pro tema Dr. Exame (teal #20b2aa, paper/divider),
// radius 16 (cards do design system), Poppins títulos. Motion values do elemento preservados.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Box, Typography, alpha, useTheme } from '@mui/material';
import { tealText } from '../theme';

export interface PlanRadioOption {
  id: string;
  title: string;
  /** Pill ao lado do título (padrão `em` do #015) — ex.: "⭐ Mais vendido". */
  badge?: string;
  badgeTone?: 'accent' | 'amber';
  sub?: string;
  price: string;
  priceSub?: string;
  icon?: ReactNode;
}

/** #015 portado: radiogroup vertical com frame absoluto que desliza entre as opções. */
export const PlanRadioCards = ({ label, options, value, onChange, summaryLabel, summaryValue }: {
  label: string;
  options: PlanRadioOption[];
  value: string | null;
  onChange: (id: string) => void;
  summaryLabel?: string;
  summaryValue?: string;
}) => {
  const t = useTheme();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const optRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [box, setBox] = useState({ top: 0, height: 0 });
  const [ready, setReady] = useState(false); // 1ª posição sem animação (truque do double-rAF do elemento)

  const idx = Math.max(0, options.findIndex((o) => o.id === value));
  const accent = t.palette.mode === 'dark' ? '#5fc9c3' : '#20b2aa';
  const line2 = t.palette.mode === 'dark' ? 'rgba(255,255,255,.3)' : 'rgba(0,0,0,.25)';

  const place = () => {
    const el = optRefs.current[idx];
    if (!el || !rootRef.current) return;
    setBox({ top: el.offsetTop, height: el.offsetHeight });
  };

  const firstRun = useRef(true);
  useLayoutEffect(() => {
    place();
    // Só o posicionamento INICIAL pula a transição (double-rAF do elemento original);
    // trocas de opção precisam da animação .55s do frame.
    if (firstRun.current) {
      firstRun.current = false;
      setReady(false);
      const raf = requestAnimationFrame(() => requestAnimationFrame(() => setReady(true)));
      return () => cancelAnimationFrame(raf);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  // Reposiciona o frame se a opção mudar de altura (fonte carrega, texto quebra linha).
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => place());
    ro.observe(root);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  if (!options.length) return null;

  return (
    <Box ref={rootRef} sx={{ position: 'relative', width: '100%', maxWidth: 480, mx: 'auto' }}>
      <Box sx={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: '10px' }} role="radiogroup" aria-label={label}>
        {/* frame que desliza (u015-frame) */}
        <Box
          aria-hidden="true"
          sx={{
            position: 'absolute', left: 0, right: 0, top: box.top, height: box.height,
            borderRadius: '16px', pointerEvents: 'none', zIndex: 1,
            boxShadow: `0 0 0 2px ${accent}, 0 18px 36px -20px ${alpha(accent, 0.7)}`,
            background: `linear-gradient(135deg, ${alpha(accent, 0.09)}, transparent 70%)`,
            transition: ready ? 'top .55s cubic-bezier(.34,1.45,.64,1), height .55s cubic-bezier(.34,1.45,.64,1)' : 'none',
            '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
          }}
        />
        {options.map((o, i) => {
          const on = i === idx;
          const amber = o.badgeTone === 'amber';
          return (
            <Box
              key={o.id}
              ref={(el) => { optRefs.current[i] = el as HTMLButtonElement | null; }}
              component="button"
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              onClick={() => onChange(o.id)}
              onKeyDown={(e) => {
                const d = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
                if (!d) return;
                e.preventDefault();
                const n = (i + d + options.length) % options.length;
                onChange(options[n].id);
                optRefs.current[n]?.focus();
              }}
              sx={{
                position: 'relative', display: 'flex', alignItems: 'center', gap: '14px',
                width: '100%', minHeight: 44 + 32, px: { xs: '14px', sm: '18px' }, py: '16px',
                border: 0, borderRadius: '16px', cursor: 'pointer',
                background: (th) => th.palette.background.paper,
                color: 'text.primary', textAlign: 'left', fontFamily: 'inherit',
                boxShadow: (th) => `0 0 0 1px ${amber && on ? '#d97706' : th.palette.divider}`,
                transition: 'transform .4s cubic-bezier(.34,1.45,.64,1), box-shadow .3s cubic-bezier(.2,.8,.2,1)',
                '&:hover': { boxShadow: `0 0 0 1px ${line2}` },
                '&:active': { transform: 'scale(.98)' },
                '&:focus-visible': { outline: `2px solid ${accent}`, outlineOffset: 4 },
                '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
              }}
            >
              {/* radio dot (u015-dot): anel + ponto que dá pop */}
              <Box aria-hidden="true" sx={{
                position: 'relative', width: 24, height: 24, flex: 'none', borderRadius: '50%',
                boxShadow: `inset 0 0 0 2px ${on ? accent : line2}`,
                transition: 'box-shadow .3s cubic-bezier(.2,.8,.2,1)',
                '&::after': {
                  content: '""', position: 'absolute', inset: 5, borderRadius: '50%', background: accent,
                  transform: on ? 'scale(1)' : 'scale(0)',
                  transition: 'transform .45s cubic-bezier(.34,1.45,.64,1)',
                },
                '@media (prefers-reduced-motion: reduce)': { transition: 'none', '&::after': { transition: 'none' } },
              }} />
              {/* icon tile (u015-ic) */}
              {o.icon && (
                <Box aria-hidden="true" sx={{
                  width: 42, height: 42, flex: 'none', borderRadius: '13px',
                  display: 'grid', placeItems: 'center', color: '#fff',
                  background: amber
                    ? 'linear-gradient(140deg,#f59e0b,#b45309)'
                    : 'linear-gradient(135deg,#20b2aa,#178f89)',
                  '& svg': { width: 20, height: 20 },
                }}>
                  {o.icon}
                </Box>
              )}
              {/* txt (u015-txt) */}
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap' }}>
                  <Typography component="b" sx={{ fontFamily: '"Poppins",sans-serif', fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.3 }}>
                    {o.title}
                  </Typography>
                  {o.badge && (
                    <Box component="em" sx={{
                      fontStyle: 'normal', fontSize: 11, fontWeight: 700, px: '7px', py: '3px', borderRadius: 99,
                      bgcolor: amber ? 'rgba(217,119,6,.15)' : alpha(accent, 0.12),
                      color: amber ? (t.palette.mode === 'dark' ? '#fcd34d' : '#b45309') : tealText(t.palette.mode),
                    }}>
                      {o.badge}
                    </Box>
                  )}
                </Box>
                {o.sub && (
                  <Typography component="small" sx={{ display: 'block', mt: '3px', fontSize: 13, lineHeight: 1.4, color: 'text.secondary' }}>
                    {o.sub}
                  </Typography>
                )}
              </Box>
              {/* price (u015-price): só ganha força no selecionado */}
              <Box sx={{
                textAlign: 'right', flex: 'none', fontVariantNumeric: 'tabular-nums',
                color: on ? 'text.primary' : 'text.secondary',
                transition: 'color .35s cubic-bezier(.2,.8,.2,1)',
              }}>
                <Typography component="b" sx={{ display: 'block', fontFamily: '"Poppins",sans-serif', fontSize: 17, fontWeight: 700, letterSpacing: '-0.02em' }}>
                  {o.price}
                </Typography>
                {o.priceSub && (
                  <Typography component="small" sx={{ fontSize: 11.5, color: 'text.disabled' }}>
                    {o.priceSub}
                  </Typography>
                )}
              </Box>
            </Box>
          );
        })}
      </Box>
      {/* cta line (u015-cta): resumo da seleção, anunciado polidamente */}
      {(summaryLabel || summaryValue) && (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mt: '16px', px: '6px', fontSize: 14, color: 'text.secondary' }} aria-live="polite">
          <Typography component="span" sx={{ fontSize: 14, color: 'text.secondary' }}>{summaryLabel}</Typography>
          {summaryValue && (
            <Typography component="b" sx={{ fontSize: 14, fontWeight: 700, color: 'text.primary', fontVariantNumeric: 'tabular-nums' }}>
              {summaryValue}
            </Typography>
          )}
        </Box>
      )}
    </Box>
  );
};
