import { Box, useTheme } from '@mui/material';
import { alpha } from '@mui/material/styles';
import type { Tone } from '../../utils/panoramaPresenter';
import { toneColor } from './tone';

/**
 * TrendSpark — linha de tendência discreta (a "dica de movimento" do mock).
 *
 * SVG simples com cor por TEMA e por tom (o `Sparkline` de components/ usa cor fixa e quebra no
 * modo escuro). É decoração: carrega `aria-hidden` — o número e a pílula é que dizem o estado.
 * Com menos de 2 pontos não desenha (sem série não existe tendência).
 *
 * - `tile`:   presa ao pé do azulejo, com máscara que some para cima.
 * - `inline`: no corpo do cartão, com altura própria (cartão de número do modo história).
 */
export const TrendSpark = ({ points, tone, variant = 'tile', height }: { points: number[]; tone: Tone; variant?: 'tile' | 'inline'; height?: number }) => {
  const theme = useTheme();
  if (!points || points.length < 2) return null;
  const color = toneColor(theme, tone);
  const W = 300, H = 60, L = 2, R = 2, T = 8;
  const lo = Math.min(...points), hi = Math.max(...points), range = hi - lo || 1;
  const x = (i: number) => L + (W - L - R) * (i / (points.length - 1));
  const y = (v: number) => T + (H - T - 10) * (1 - (v - lo) / range);
  const line = points.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const area = `${line} ${x(points.length - 1).toFixed(1)} ${H} ${x(0).toFixed(1)} ${H}Z`;
  const lastX = x(points.length - 1), lastY = y(points[points.length - 1]);
  const tile = variant === 'tile';
  return (
    <Box
      aria-hidden
      sx={{
        position: 'relative', left: tile ? 0 : 'auto', right: tile ? 0 : 'auto', bottom: tile ? 0 : 'auto',
        height: tile ? { xs: 56, md: 70 } : height ?? 84,
        opacity: tile ? { xs: 0.75, md: 0.4 } : 0.9, pointerEvents: 'none',
        ...(tile ? {
          maskImage: 'linear-gradient(to top, #000 38%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to top, #000 38%, transparent 100%)',
        } : {}),
      }}
    >
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height="100%" style={{ display: 'block' }}>
        <path d={area} fill={color} opacity={0.1} />
        <path d={line} fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {/* Ponto final em HTML para continuar redondo com preserveAspectRatio="none". */}
      <Box sx={{
        position: 'absolute', width: 9, height: 9, borderRadius: '50%',
        left: `calc(${((lastX / W) * 100).toFixed(2)}% - 4px)`, bottom: `${(((H - lastY) / H) * 100).toFixed(2)}%`,
        bgcolor: 'background.paper', border: `3px solid ${color}`, boxShadow: `0 0 0 1px ${alpha(color, 0.25)}`,
      }} />
    </Box>
  );
};
