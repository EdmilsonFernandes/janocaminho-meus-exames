import { Box, Skeleton, Stack } from '@mui/material';

/**
 * Placeholder de página (skeleton) — usado como fallback de Suspense e de loaders de página.
 * Feel nativo (graymold em vez de spinner girando) — percepção de velocidade premium.
 */
export const PageSkeleton = ({ cards = 3 }: { cards?: number }) => (
  <Box sx={{ p: { xs: 1.5, md: 3 }, maxWidth: 980, mx: 'auto' }}>
    {/* topbar skeleton */}
    <Skeleton variant="rectangular" height={52} sx={{ borderRadius: 2, mb: 2 }} />
    <Stack spacing={2}>
      {Array.from({ length: cards }).map((_, i) => (
        <Skeleton key={i} variant="rectangular" height={i === 0 ? 140 : 96} sx={{ borderRadius: 3 }} />
      ))}
    </Stack>
  </Box>
);
