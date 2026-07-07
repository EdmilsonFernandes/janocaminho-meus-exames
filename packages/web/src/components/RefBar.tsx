/**
 * RefBar — barra horizontal estilo Apple Health mostrando a posição do valor do paciente
 * em relação à faixa de referência. Zona verde = faixa normal, marcador = valor do paciente.
 *
 * Premium visual: o paciente vê INSTANTANEAMENTE se está no verde (ok), amber (borderline)
 * ou vermelho (alterado), sem precisar interpretar números.
 *
 * Props: { value, refLow, refHigh, unit?, width? }
 */
import { Box, Typography } from '@mui/material';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export const RefBar = ({ value, refLow, refHigh, unit }: { value: number | null; refLow: number | null; refHigh: number | null; unit?: string | null }) => {
  if (value == null || refLow == null || refHigh == null || refHigh <= refLow) return null;

  // Calcula range visual: estende 20% além dos limites pra mostrar valores fora
  const range = refHigh - refLow;
  const visLo = refLow - range * 0.3;
  const visHi = refHigh + range * 0.3;
  const visRange = visHi - visLo;

  // Posições em % (0-100)
  const greenStart = ((refLow - visLo) / visRange) * 100;
  const greenWidth = ((refHigh - refLow) / visRange) * 100;
  const markerPos = clamp(((value - visLo) / visRange) * 100, 0, 100);

  // Cor do marcador: verde (normal), amber (borderline ±10%), vermelho (alterado)
  const margin = range * 0.1;
  const isHigh = value > refHigh;
  const isLow = value < refLow;
  const isBorderline = !isHigh && !isLow && (value >= refHigh - margin || value <= refLow + margin);
  const markerColor = isHigh || isLow ? '#ef4444' : isBorderline ? '#f59e0b' : '#059669';

  return (
    <Box sx={{ mt: 0.5, mb: 0.25 }}>
      {/* Barra */}
      <Box sx={{ position: 'relative', height: 8, borderRadius: 99, bgcolor: 'rgba(239,68,68,.12)', overflow: 'visible' }}>
        {/* Zona verde (faixa de referência) */}
        <Box sx={{ position: 'absolute', left: `${greenStart}%`, width: `${greenWidth}%`, top: 0, bottom: 0, borderRadius: 99, bgcolor: 'rgba(5,150,105,.18)' }} />
        {/* Zona amber (borderline) — bordas da zona verde */}
        <Box sx={{ position: 'absolute', left: `${greenStart}%`, width: `${Math.min(margin / visRange * 100, 10)}%`, top: 0, bottom: 0, borderRadius: '99px 0 0 99px', bgcolor: 'rgba(245,158,11,.15)' }} />
        <Box sx={{ position: 'absolute', left: `${greenStart + greenWidth - Math.min(margin / visRange * 100, 10)}%`, width: `${Math.min(margin / visRange * 100, 10)}%`, top: 0, bottom: 0, borderRadius: '0 99px 99px 0', bgcolor: 'rgba(245,158,11,.15)' }} />
        {/* Marcador (posição do paciente) */}
        <Box sx={{
          position: 'absolute', left: `${markerPos}%`, top: '50%',
          transform: 'translate(-50%, -50%)',
          width: 16, height: 16, borderRadius: '50%',
          bgcolor: markerColor, border: '2.5px solid #fff',
          boxShadow: '0 2px 6px rgba(0,0,0,.2)',
          zIndex: 2,
        }} />
      </Box>
      {/* Labels */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.25 }}>
        <Typography variant="caption" sx={{ fontSize: 10, color: 'text.secondary' }}>{refLow}{unit ? ` ${unit}` : ''}</Typography>
        <Typography variant="caption" sx={{ fontSize: 10, color: 'text.secondary' }}>{refHigh}{unit ? ` ${unit}` : ''}</Typography>
      </Box>
    </Box>
  );
};
