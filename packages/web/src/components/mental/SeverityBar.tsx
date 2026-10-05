import { useEffect, useState } from 'react';
import { Box, Typography } from '@mui/material';
import type { ScreeningType } from '@meus-exames/shared';

/** Faixas validadas (limites inclusivos) — espelham PHQ9_BANDS/GAD7_BANDS do shared.
 *  Cor = régua contínua verde → vermelho (tom fixo, legível em claro/escuro). */
export const MENTAL_BANDS: Record<ScreeningType, { from: number; to: number; short: string; color: string }[]> = {
  phq9: [
    { from: 0, to: 4, short: 'mínima', color: '#22c55e' },
    { from: 5, to: 9, short: 'leve', color: '#a3c447' },
    { from: 10, to: 14, short: 'moderada', color: '#f59e0b' },
    { from: 15, to: 19, short: 'mod. grave', color: '#f97316' },
    { from: 20, to: 27, short: 'grave', color: '#ef4444' },
  ],
  gad7: [
    { from: 0, to: 4, short: 'mínima', color: '#22c55e' },
    { from: 5, to: 9, short: 'leve', color: '#a3c447' },
    { from: 10, to: 14, short: 'moderada', color: '#f59e0b' },
    { from: 15, to: 21, short: 'grave', color: '#ef4444' },
  ],
};

export const bandOf = (type: ScreeningType, score: number) =>
  MENTAL_BANDS[type].find((b) => score >= b.from && score <= b.to) ?? MENTAL_BANDS[type][MENTAL_BANDS[type].length - 1];

const REDUCED = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

/** Régua segmentada de severidade com marcador do score. Cada segmento tem largura
 *  proporcional ao nº de pontos da faixa → o marcador cai no lugar certo da escala.
 *  `compact` = dashboard (sem rótulos). Marcador desliza do 0 até o score no mount. */
export const SeverityBar = ({ type, score, compact = false }: { type: ScreeningType; score: number; compact?: boolean }) => {
  const bands = MENTAL_BANDS[type];
  const max = bands[bands.length - 1].to;
  const target = ((Math.min(Math.max(score, 0), max) + 0.5) / (max + 1)) * 100;
  const [pct, setPct] = useState(REDUCED ? target : 0);
  useEffect(() => {
    if (REDUCED) { setPct(target); return; }
    const t = setTimeout(() => setPct(target), 60);
    return () => clearTimeout(t);
  }, [target]);
  const cur = bandOf(type, score);
  const h = compact ? 6 : 8;

  return (
    <Box role="img" aria-label={`Score ${score} de ${max}, faixa ${cur.short}`}>
      <Box sx={{ position: 'relative', py: compact ? '4px' : '5px' }}>
        <Box sx={{ display: 'flex', gap: '3px', height: h }}>
          {bands.map((b) => {
            const on = b === cur;
            return (
              <Box key={b.short} sx={{
                flex: b.to - b.from + 1, borderRadius: 99, bgcolor: b.color,
                opacity: on ? 1 : 0.22, transition: 'opacity .4s ease',
              }} />
            );
          })}
        </Box>
        <Box sx={{
          position: 'absolute', top: '50%', left: `${pct}%`,
          width: compact ? 14 : 18, height: compact ? 14 : 18, borderRadius: '50%',
          transform: 'translate(-50%, -50%)',
          bgcolor: 'background.paper', border: `3px solid ${cur.color}`,
          boxShadow: `0 0 0 4px ${cur.color}29, 0 2px 6px rgba(0,0,0,.18)`,
          transition: REDUCED ? 'none' : 'left .9s cubic-bezier(.22,1,.36,1)',
        }} />
      </Box>
      {!compact && (
        <Box sx={{ display: 'flex', gap: '3px', mt: 0.5 }}>
          {bands.map((b) => (
            <Typography key={b.short} sx={{
              flex: b.to - b.from + 1, textAlign: 'center', fontSize: 10.5, lineHeight: 1.3,
              fontWeight: b === cur ? 800 : 500,
              color: b === cur ? 'text.primary' : 'text.disabled',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {b.short}
            </Typography>
          ))}
        </Box>
      )}
    </Box>
  );
};
