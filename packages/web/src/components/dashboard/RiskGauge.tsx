import { useEffect, useState } from 'react';
import { Box, Typography } from '@mui/material';

/**
 * Gauge semicircular animado — o "tchan" visual da Leitura de Risco.
 * Arco sobe de 0 até o nível (low/moderate/high) ao montar (stroke-dasharray c/ transition).
 * Cores consistentes c/ RiskCard (green/amber/red). `none` = estado "sem risco" (verde, baixo).
 */
const LEVEL_POS: Record<string, number> = { low: 30, moderate: 64, high: 93 }; // % do arco
const LEVEL_COLOR: Record<string, string> = { low: '#16a34a', moderate: '#f59e0b', high: '#dc2626' };
const LEVEL_LABEL: Record<string, string> = { low: 'Baixo', moderate: 'Moderado', high: 'Atenção' };

export const RiskGauge = ({ level, none }: { level: 'low' | 'moderate' | 'high'; none?: boolean }) => {
  const target = none ? LEVEL_POS.low : LEVEL_POS[level] ?? LEVEL_POS.low;
  const color = none ? '#16a34a' : LEVEL_COLOR[level] ?? '#16a34a';
  const label = none ? 'Sem risco' : LEVEL_LABEL[level] ?? 'Baixo';
  const [pct, setPct] = useState(0);
  useEffect(() => { const t = setTimeout(() => setPct(target), 150); return () => clearTimeout(t); }, [target]);

  const r = 52;
  const circ = Math.PI * r; // comprimento do arco (semicírculo)
  const dash = (circ * pct) / 100;
  const arc = `M 8 60 A ${r} ${r} 0 0 1 112 60`;

  return (
    <Box sx={{ position: 'relative', width: 124, height: 74, mx: 'auto', my: 0.5 }} role="img" aria-label={`Risco ${label}`}>
      <svg width="124" height="64" viewBox="0 0 120 64" style={{ overflow: 'visible' }}>
        <path d={arc} fill="none" stroke="rgba(128,128,128,0.18)" strokeWidth="11" strokeLinecap="round" />
        <path
          d={arc} fill="none" stroke={color} strokeWidth="11" strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          style={{ transition: 'stroke-dasharray 1.1s cubic-bezier(.4,0,.2,1)' }}
        />
      </svg>
      <Box sx={{ position: 'absolute', top: 30, left: 0, right: 0, textAlign: 'center' }}>
        <Typography sx={{ fontWeight: 900, fontSize: 15, color, lineHeight: 1, fontFamily: '"Poppins",sans-serif' }}>{label}</Typography>
        <Typography sx={{ fontSize: 10, color: 'text.secondary', fontWeight: 700, mt: 0.25 }}>leitura de risco</Typography>
      </Box>
    </Box>
  );
};
