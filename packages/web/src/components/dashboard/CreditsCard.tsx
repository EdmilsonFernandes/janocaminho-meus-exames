import { Box, Button, CardContent, Typography } from '@mui/material';
import BoltIcon from '@mui/icons-material/Bolt';
import { AppCard } from '../AppCard';
import { RADIUS, tealText } from '../../theme';

// Card de créditos — superfície limpa (borda, sem malha de fundo). Dieta de movimento/primária
// (out/26): bolt estático e CTA text (gradiente só no HeroHealthCard).
// Número e unidade em linhas separadas (25/11/26): na coluna lateral do desktop o título
// "0 créditos" tinha ~110px e quebrava no meio da palavra ("crédi/tos").
export const CreditsCard = ({ credits, onClick }: { credits: number | null; onClick: () => void }) => {
  if (credits == null) return null;
  const reads = Math.floor(credits / 10);
  return (
    <AppCard sx={{ position: 'relative', overflow: 'hidden' }}>
      <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.75, py: 2, '&:last-child': { pb: 2 } }}>
        <Box sx={{
          width: 48, height: 48, borderRadius: RADIUS.tile,
          background: 'linear-gradient(135deg, rgba(32,178,170,.18), rgba(32,178,170,.08))',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <BoltIcon sx={{ color: 'primary.dark', fontSize: 26 }} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{
            fontWeight: 800, fontSize: 24, color: 'primary.dark', lineHeight: 1.1,
            fontVariantNumeric: 'tabular-nums', fontFamily: 'Poppins, sans-serif',
            whiteSpace: 'nowrap',
          }}>{credits.toLocaleString('pt-BR')}</Typography>
          <Typography sx={{ fontSize: 13, color: 'text.secondary', display: 'block', mt: 0.25, lineHeight: 1.35 }}>
            {credits === 1 ? 'crédito' : 'créditos'}{' '}
            <Box component="span" sx={{ whiteSpace: 'nowrap' }}>(≈{reads} {reads === 1 ? 'leitura' : 'leituras'})</Box>
          </Typography>
        </Box>
        <Button variant="text" onClick={onClick} sx={{
          borderRadius: RADIUS.button, textTransform: 'none', fontWeight: 800, fontSize: 14,
          minHeight: 44, px: 2, py: 1, flexShrink: 0,
          color: (t) => tealText(t.palette.mode),
          '&:hover': { bgcolor: 'rgba(32,178,170,.08)' },
        }}>Comprar</Button>
      </CardContent>
    </AppCard>
  );
};
