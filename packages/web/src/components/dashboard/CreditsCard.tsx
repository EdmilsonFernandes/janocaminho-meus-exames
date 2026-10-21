import { Box, Button, CardContent, Typography } from '@mui/material';
import BoltIcon from '@mui/icons-material/Bolt';
import { AppCard } from '../AppCard';
import { RADIUS } from '../../theme';

// Card de créditos — mesh gradient bg sutil. Dieta de movimento/primária (out/26):
// bolt estático (sem glow/pulse infinitos) e CTA text (gradiente só no HeroHealthCard).
export const CreditsCard = ({ credits, onClick }: { credits: number | null; onClick: () => void }) => {
  if (credits == null) return null;
  return (
    <AppCard kind="tinted" tone="primary" sx={{
      mt: 2, mb: 2, position: 'relative', overflow: 'hidden',
      background: (t) => t.palette.mode === 'dark'
        ? `radial-gradient(ellipse at 10% 50%, rgba(32,178,170,.12), transparent 50%), radial-gradient(ellipse at 90% 50%, rgba(212,165,116,.06), transparent 50%), ${t.palette.background.paper}`
        : `radial-gradient(ellipse at 10% 50%, rgba(32,178,170,.07), transparent 50%), radial-gradient(ellipse at 90% 50%, rgba(212,165,116,.04), transparent 50%), #ffffff`,
    }}>
      <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.75, py: 2, '&:last-child': { pb: 2 } }}>
        <Box sx={{
          width: 50, height: 50, borderRadius: RADIUS.tile,
          background: 'linear-gradient(135deg, rgba(32,178,170,.18), rgba(32,178,170,.08))',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <BoltIcon sx={{ color: 'primary.dark', fontSize: 28 }} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{
            fontWeight: 800, fontSize: 28, color: 'primary.dark', lineHeight: 1,
            fontVariantNumeric: 'tabular-nums', fontFamily: 'Poppins, sans-serif',
          }}>{credits.toLocaleString('pt-BR')} {credits === 1 ? 'crédito' : 'créditos'}</Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>(≈{Math.floor(credits / 10)} {Math.floor(credits / 10) === 1 ? 'leitura' : 'leituras'})</Typography>
        </Box>
        <Button variant="text" color="primary" size="small" onClick={onClick} sx={{
          borderRadius: RADIUS.button, textTransform: 'none', fontWeight: 800,
          px: 2.5, py: 1.1, flexShrink: 0,
          '&:hover': { bgcolor: 'rgba(32,178,170,.08)' },
        }}>Comprar</Button>
      </CardContent>
    </AppCard>
  );
};
