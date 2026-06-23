import { Box, Skeleton as MuiSkeleton } from '@mui/material';

/** Skeleton genérico pra loading states — mantém o layout (sem "pulo" visual). */
export const CardSkeleton = ({ lines = 3 }: { lines?: number }) => (
  <Box sx={{ p: 2, mb: 1 }}>
    <MuiSkeleton variant="text" sx={{ fontSize: '1.5rem', width: '60%' }} />
    {Array.from({ length: lines }).map((_, i) => (
      <MuiSkeleton key={i} variant="text" sx={{ fontSize: '1rem', width: i === lines - 1 ? '40%' : '90%' }} />
    ))}
  </Box>
);

export const ListSkeleton = ({ count = 4 }: { count?: number }) => (
  <Box>
    {Array.from({ length: count }).map((_, i) => (
      <Box key={i} sx={{ display: 'flex', gap: 1.5, p: 1.5, borderBottom: '1px solid #f0f0f0' }}>
        <MuiSkeleton variant="circular" width={48} height={48} />
        <Box sx={{ flex: 1 }}>
          <MuiSkeleton variant="text" sx={{ fontSize: '1rem', width: '50%' }} />
          <MuiSkeleton variant="text" sx={{ fontSize: '0.8rem', width: '80%' }} />
        </Box>
      </Box>
    ))}
  </Box>
);

export const ScoreSkeleton = () => (
  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 3 }}>
    <MuiSkeleton variant="circular" width={120} height={120} />
    <MuiSkeleton variant="text" sx={{ fontSize: '1.2rem', width: '40%', mt: 1 }} />
    <MuiSkeleton variant="text" sx={{ fontSize: '0.9rem', width: '60%' }} />
  </Box>
);
