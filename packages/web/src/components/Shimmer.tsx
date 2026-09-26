import { Box, type BoxProps } from '@mui/material';

/**
 * Shimmer — skeleton com varredura de luz (o "feel" de app nativo premium) em vez do
 * placeholder estático do MUI. O sweep é um tint teal da marca (visível nos dois modos).
 * prefers-reduced-motion: varredura desliga (bloco cinza permanece — não pisca).
 */
export const Shimmer = ({ w = '100%', h = 16, r = 8, sx, ...rest }: { w?: number | string; h?: number; r?: number; sx?: BoxProps['sx'] }) => (
  <Box
    aria-hidden="true"
    sx={{
      width: w, height: h, borderRadius: r,
      position: 'relative', overflow: 'hidden',
      bgcolor: 'action.selected',
      '&::after': {
        content: '""', position: 'absolute', inset: 0,
        background: 'linear-gradient(100deg, transparent 25%, rgba(95,201,195,.28) 50%, transparent 75%)',
        transform: 'translateX(-100%)',
        animation: 'dxShimmerSweep 1.5s ease-in-out infinite',
      },
      '@keyframes dxShimmerSweep': { '100%': { transform: 'translateX(100%)' } },
      '@media (prefers-reduced-motion: reduce)': { '&::after': { animation: 'none' } },
      ...sx,
    }}
    {...rest}
  />
);

/** Card de tile em shimmer — mesmo footprint visual do IndicatorTile (label/valor/sub + badge). */
export const TileShimmer = () => (
  <Box sx={{ p: 2, height: '100%', borderRadius: '20px', bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.25 }}>
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Shimmer w="58%" h={10} r={5} />
      <Shimmer w="42%" h={24} r={8} sx={{ mt: 1 }} />
      <Shimmer w="78%" h={10} r={5} sx={{ mt: 1 }} />
    </Box>
    <Shimmer w={42} h={42} r={12} />
  </Box>
);
