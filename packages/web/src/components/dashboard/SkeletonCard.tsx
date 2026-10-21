import { Box, Skeleton, type BoxProps } from '@mui/material';
import { RADIUS } from '../../theme';

/**
 * SkeletonCard — skeleton de CARD inteiro no tom da marca (teal), pra telas cujo
 * conteúdo ainda carrega. Diferente do `Shimmer` (blocos soltos) e do `TileShimmer`
 * (footprint do IndicatorTile), este cobre cards de conteúdo: sweep de luz corre da
 * esquerda pra direita sobre o card inteiro, os blocos internos ficam estáticos.
 *
 * - Fundo do card: rgba(32,178,170,.06) (tint teal #20b2aa da marca, legível nos dois modos).
 * - Sweep: linear-gradient(90deg, transparent → rgba(32,178,170,.12) → transparent),
 *   background-size 200%, 1.5s infinite — animado por TRANSFORM no overlay (::after
 *   transladado), pintura zero por frame, GPU-friendly.
 * - prefers-reduced-motion: sweep DESLIGA (card estático, nunca pisca).
 * - Blocos internos = MUI Skeleton `animation={false}` com a cor da marca: o único
 *   movimento é o sweep único do card (dieta de movimento do "Consultório de Vidro").
 * - Floor 12px: nenhum bloco menor que 12px de altura.
 */

/** Bloco estático tintado de teal (o movimento mora só no sweep do card). */
const Bar = ({ w = '100%', h = 12, r = 6, circle = false, sx }: { w?: number | string; h?: number; r?: number; circle?: boolean; sx?: BoxProps['sx'] }) => (
  <Skeleton
    variant={circle ? 'circular' : 'rounded'}
    animation={false}
    width={w}
    height={h}
    sx={{
      bgcolor: 'rgba(32,178,170,.10)',
      ...(circle ? {} : { borderRadius: `${r}px` }),
      ...sx,
    }}
  />
);

const CARD_SX: BoxProps['sx'] = {
  position: 'relative',
  overflow: 'hidden',
  borderRadius: RADIUS.card,
  bgcolor: 'rgba(32,178,170,.06)',
  border: '1px solid',
  borderColor: 'divider',
  p: { xs: 2, sm: 2.25 },
  '&::after': {
    content: '""',
    position: 'absolute',
    inset: 0,
    background: 'linear-gradient(90deg, transparent, rgba(32,178,170,.12), transparent)',
    backgroundSize: '200% 100%',
    transform: 'translateX(-100%)',
    animation: 'dxCardShimmer 1.5s ease-in-out infinite',
    pointerEvents: 'none',
  },
  '@keyframes dxCardShimmer': {
    '100%': { transform: 'translateX(100%)' },
  },
  // Reduced-motion: sem varredura — só o fundo estático.
  '@media (prefers-reduced-motion: reduce)': {
    '&::after': { animation: 'none', opacity: 0 },
  },
};

export type SkeletonCardVariant = 'content' | 'list';

/**
 * @param variant 'content' (default) — card de conteúdo: cabeçalho com avatar,
 *   parágrafos e 2 ações no rodapé. 'list' — card de itens: 2 linhas com marcador
 *   redondo (footprint de "o que mudou" / listas de marcadores).
 */
export const SkeletonCard = ({ variant = 'content', sx, ...rest }: { variant?: SkeletonCardVariant } & BoxProps) => (
  <Box role="status" aria-label="Carregando conteúdo" sx={{ ...CARD_SX, ...sx }} {...rest}>
    {variant === 'content' ? (
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
          <Bar w={34} h={34} circle />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Bar w="46%" h={12} />
            <Bar w="30%" h={12} sx={{ marginTop: '6px' }} />
          </Box>
        </Box>
        <Box sx={{ mt: 2 }}>
          <Bar w="100%" h={12} />
          <Bar w="92%" h={12} sx={{ marginTop: '8px' }} />
          <Bar w="64%" h={12} sx={{ marginTop: '8px' }} />
        </Box>
        <Box sx={{ display: 'flex', gap: 1, mt: 2.25 }}>
          <Bar w={112} h={30} r={10} />
          <Bar w={86} h={30} r={10} />
        </Box>
      </Box>
    ) : (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {[0, 1].map((i) => (
          <Box key={i} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.25 }}>
            <Bar w={26} h={26} circle sx={{ marginTop: '2px' }} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Bar w={i === 0 ? '58%' : '44%'} h={12} />
              <Bar w="100%" h={12} sx={{ marginTop: '6px' }} />
              <Bar w="76%" h={12} sx={{ marginTop: '6px' }} />
            </Box>
          </Box>
        ))}
      </Box>
    )}
  </Box>
);
