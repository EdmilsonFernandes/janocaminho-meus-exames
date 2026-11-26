import { useId, type ReactNode } from 'react';
import { useTheme } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { useLocale, useTranslate } from 'react-admin';
import { SEM } from '../../tokens';

/**
 * Gráficos do modo história — SVG puro, sem biblioteca, com cor por tema.
 *
 * O eixo X é categórico (os últimos pontos, espaçados por igual): por isso NÃO levam a linha
 * "hoje" e a idade do último dado vai NA LEGENDA, logo abaixo (regra do design system para
 * gráfico que não é tempo de verdade). Cada gráfico é `role="img"` com um resumo em texto, e o
 * cartão repete a leitura em palavras — a curva nunca é o único jeito de entender.
 */
const W = 320, H = 180;
const BRAND = '#20b2aa';
const FONT = 'Inter, "Segoe UI", sans-serif';
const HEAD = 'Poppins, Inter, sans-serif';

const useChartColors = () => {
  const theme = useTheme();
  const dark = theme.palette.mode === 'dark';
  return {
    dark,
    stroke: dark ? '#5fc9c3' : '#178f89',
    strong: SEM.tealDeep[dark ? 'dark' : 'light'],
    muted: theme.palette.text.secondary,
    axis: alpha('#0f766e', 0.18),
    paper: theme.palette.background.paper,
    band: alpha(dark ? SEM.ok.dark : '#047857', 0.13),
    barsIdle: alpha(BRAND, 0.30),
  };
};

const useNum = () => {
  const locale = useLocale();
  return (v: number, dec = 1) => new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'pt-BR', { maximumFractionDigits: dec }).format(v);
};

export const StoryLine = ({ points, ref, unit, x, ariaLabel }: {
  points: number[];
  /** Faixa de referência [mín, máx] quando o dado traz uma; senão o gráfico sai sem faixa. */
  ref: [number, number] | null;
  unit: string;
  /** Rótulos do primeiro e do último ponto. */
  x: [string, string];
  ariaLabel: string;
}) => {
  const translate = useTranslate();
  const num = useNum();
  const c = useChartColors();
  const gradId = useId().replace(/:/g, '');
  const L = 10, R = 12, T = 18, B = 30;
  let lo = Math.min(...points), hi = Math.max(...points);
  if (ref) { lo = Math.min(lo, ref[0]); hi = Math.max(hi, ref[1]); }
  const pad = (hi - lo) * 0.18 || Math.max(1, Math.abs(hi) * 0.1 || 1);
  lo -= pad; hi += pad;
  const px = (i: number) => L + (W - L - R) * (i / (points.length - 1));
  const py = (v: number) => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
  const d = points.map((v, i) => `${i ? 'L' : 'M'}${px(i).toFixed(1)} ${py(v).toFixed(1)}`).join(' ');
  const lastX = px(points.length - 1), lastY = py(points[points.length - 1]);
  const last = points[points.length - 1];
  const unitSp = unit ? ` ${unit}` : '';

  let band: ReactNode = null;
  let bandLabel: ReactNode = null;
  if (ref) {
    const y0 = py(Math.min(hi, ref[1])), y1 = py(Math.max(lo, ref[0]));
    band = <rect x={L} y={y0} width={W - L - R} height={Math.max(0, y1 - y0)} rx={6} fill={c.band} />;
    // Rótulo da faixa no lado onde a linha NÃO passa (em cima se a linha está embaixo, e vice-versa).
    const meanY = points.reduce((s, v) => s + py(v), 0) / points.length;
    const labelY = y1 - y0 < 16 ? Math.max(11, y0 - 4) : meanY < (y0 + y1) / 2 ? y1 - 6 : y0 + 13;
    bandLabel = (
      <text x={L + 6} y={labelY} fontFamily={FONT} fontSize={11} fill={c.muted}>
        {translate('panorama.chart.range', { low: num(ref[0]), high: num(ref[1]), unit: unitSp })}
      </text>
    );
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={ariaLabel} style={{ display: 'block' }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={BRAND} stopOpacity={0.28} />
          <stop offset="1" stopColor={BRAND} stopOpacity={0} />
        </linearGradient>
      </defs>
      {band}
      {bandLabel}
      <line x1={L} y1={H - B} x2={W - R} y2={H - B} stroke={c.axis} />
      <path d={`${d} ${lastX.toFixed(1)} ${H - B} ${px(0).toFixed(1)} ${H - B}Z`} fill={`url(#${gradId})`} />
      <path d={d} fill="none" stroke={c.stroke} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
      {points.slice(0, -1).map((v, i) => (
        <circle key={i} cx={px(i)} cy={py(v)} r={3} fill={c.paper} stroke={c.stroke} strokeWidth={2} />
      ))}
      <circle cx={lastX} cy={lastY} r={7} fill={c.paper} stroke={BRAND} strokeWidth={4} />
      <text x={lastX} y={Math.max(13, lastY - 13)} textAnchor="end" fontFamily={HEAD} fontSize={13} fontWeight={800} fill={c.strong}>
        {num(last, 2)}{unitSp}
      </text>
      <text x={L} y={H - 9} fontFamily={FONT} fontSize={11} fill={c.muted}>{x[0]}</text>
      <text x={lastX} y={H - 9} textAnchor="end" fontFamily={FONT} fontSize={11} fill={c.muted}>{x[1]}</text>
    </svg>
  );
};

export const StoryBars = ({ values, labels, ariaLabel }: { values: number[]; labels: string[]; ariaLabel: string }) => {
  const num = useNum();
  const c = useChartColors();
  const L = 8, R = 8, T = 22, B = 28;
  const n = values.length;
  const gw = (W - L - R) / n;
  const hi = Math.max(...values) * 1.15 || 1;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={ariaLabel} style={{ display: 'block' }}>
      <line x1={L} y1={H - B} x2={W - R} y2={H - B} stroke={c.axis} />
      {values.map((v, i) => {
        const h = (H - T - B) * (v / hi);
        const bx = L + i * gw + gw * 0.22, bw = gw * 0.56, by = H - B - h;
        const isLast = i === n - 1;
        // Com muitas barras o rótulo de data não cabe: mostra uma sim, uma não — e sempre a última.
        const showLabel = n < 6 || i % 2 === 0 || isLast;
        return (
          <g key={i}>
            <rect x={bx} y={by} width={bw} height={h} rx={6} fill={isLast ? c.stroke : c.barsIdle} />
            <text x={bx + bw / 2} y={by - 6} textAnchor="middle" fontFamily={HEAD} fontSize={13} fontWeight={800} fill={isLast ? c.strong : c.muted}>
              {num(v, 1)}
            </text>
            {showLabel && (
              <text x={bx + bw / 2} y={H - 9} textAnchor="middle" fontFamily={FONT} fontSize={11} fill={c.muted}>{labels[i]}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
};
