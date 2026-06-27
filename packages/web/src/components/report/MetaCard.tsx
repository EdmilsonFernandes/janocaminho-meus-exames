import { Box, Stack, Typography, Chip } from '@mui/material';

/** Meta de saúde: analito + prazo (chip) + descrição. Acento azul-alvo. */
export const MetaCard = ({ m }: { m: { analito: string; meta: string; prazo?: string | null } }) => (
  <Box sx={{ p: 1.5, height: '100%', borderRadius: '12px', bgcolor: '#0288d10d', border: '1px solid', borderColor: '#0288d133' }}>
    <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1} sx={{ mb: 0.5 }}>
      <Typography sx={{ fontWeight: 700, color: '#01579b', wordBreak: 'break-word' }}>🎯 {m.analito}</Typography>
      {m.prazo && <Chip size="small" label={m.prazo} sx={{ bgcolor: '#0288d122', color: '#0288d1', fontWeight: 700, height: 22, flexShrink: 0 }} />}
    </Stack>
    <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.5, wordBreak: 'break-word' }}>{m.meta}</Typography>
  </Box>
);
