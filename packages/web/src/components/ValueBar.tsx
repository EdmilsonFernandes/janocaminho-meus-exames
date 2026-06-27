import { Box, Tooltip, Typography } from '@mui/material';

/**
 * Barra visual de posição: mostra o valor do paciente como uma bolinha
 * dentro (ou fora) da zona verde da faixa de referência. Intuitivo até sem ler números.
 */
export const ValueBar = ({ value, low, high }: { value: number | null; low: number | null; high: number | null }) => {
  if (value == null || low == null || high == null || high <= low) return null;
  const out = value < low || value > high;
  const range = high - low;
  const pad = Math.max(range * 0.5, range * 0.25);
  const min = Math.min(low - pad, value);
  const max = Math.max(high + pad, value);
  const span = Math.max(max - min, range * 0.001);
  const pct = (v: number) => `${Math.max(0, Math.min(100, ((v - min) / span) * 100))}%`;

  return (
    <Tooltip title={`Referência: ${low} a ${high}`} arrow>
      <Box sx={{ width: '100%', maxWidth: 220, mt: 0.5 }}>
        <Box sx={{ position: 'relative', height: 16, borderRadius: 8, background: (t) => t.palette.mode === 'dark' ? '#2a3636' : '#eaeef5' }}>
          {/* zona normal (verde) */}
          <Box
            sx={{
              position: 'absolute',
              left: pct(low),
              width: `calc(${pct(high)} - ${pct(low)})`,
              top: 0, bottom: 0,
              background: 'rgba(46,125,50,.28)',
              borderRadius: 8,
            }}
          />
          {/* marcador do valor */}
          <Box
            sx={{
              position: 'absolute',
              left: pct(value),
              top: '50%',
              transform: 'translate(-50%,-50%)',
              width: 16, height: 16, borderRadius: '50%',
              bgcolor: out ? 'error.main' : 'success.main',
              border: '3px solid #fff',
              boxShadow: '0 1px 3px rgba(0,0,0,.25)',
            }}
          />
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.25 }}>
          <Typography variant="caption" sx={{ color: 'success.dark', fontWeight: 600 }}>▲ {low}</Typography>
          <Typography variant="caption" sx={{ color: 'success.dark', fontWeight: 600 }}>{high} ▲</Typography>
        </Box>
      </Box>
    </Tooltip>
  );
};
