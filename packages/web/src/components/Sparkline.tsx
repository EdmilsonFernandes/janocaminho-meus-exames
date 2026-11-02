/**
 * Sparkline — mini-gráfico de linha temporal com área em gradiente (ReUI chart-15)
 * e faixa de referência sombreada. Padrão ouro MyChart/Apple Health (PMC 2995657).
 *
 * Props: { points: {value, date?}[], refLow?, refHigh?, width?, height?, color? }
 */
import { useId } from 'react';

export const Sparkline = ({ points, refLow, refHigh, width = 80, height = 28, color }: {
  points: { value: number; date?: string | null }[];
  refLow?: number | null;
  refHigh?: number | null;
  width?: number;
  height?: number;
  color?: string;
}) => {
  const uid = useId().replace(/:/g, '');
  if (!points || points.length < 2) return null;
  const vals = points.map((p) => p.value).filter((v) => Number.isFinite(v));
  if (vals.length < 2) return null;

  const min = Math.min(...vals, refLow ?? Infinity);
  const max = Math.max(...vals, refHigh ?? -Infinity);
  const range = max - min || 1;
  const pad = range * 0.15;
  const vMin = min - pad;
  const vMax = max + pad;
  const vRange = vMax - vMin || 1;

  const xStep = width / (points.length - 1);
  const y = (v: number) => height - ((v - vMin) / vRange) * height;

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${i * xStep} ${y(p.value)}`).join(' ');
  const lastX = (points.length - 1) * xStep;
  const lastY = y(points[points.length - 1].value);
  const areaPath = `${path} L ${lastX} ${height} L 0 ${height} Z`;
  const isAbnormal = (refHigh != null && points[points.length - 1].value > refHigh) || (refLow != null && points[points.length - 1].value < refLow);
  const strokeColor = isAbnormal ? '#ef4444' : (color || '#178f89');

  // Zona verde (faixa de referência) — retângulo sombreado
  const refTop = refHigh != null ? y(refHigh) : 0;
  const refBot = refLow != null ? y(refLow) : height;
  const gradId = `spark-grad-${uid}`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={strokeColor} stopOpacity={0.28} />
          <stop offset="100%" stopColor={strokeColor} stopOpacity={0.0} />
        </linearGradient>
      </defs>
      {refLow != null && refHigh != null && (
        <rect x={0} y={Math.min(refTop, refBot)} width={width} height={Math.abs(refBot - refTop)} fill="rgba(5,150,105,.12)" rx={2} />
      )}
      <path d={areaPath} fill={`url(#${gradId})`} stroke="none" />
      <path d={path} fill="none" stroke={strokeColor} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r={3} fill={strokeColor} stroke="#fff" strokeWidth={1.5} />
    </svg>
  );
};
