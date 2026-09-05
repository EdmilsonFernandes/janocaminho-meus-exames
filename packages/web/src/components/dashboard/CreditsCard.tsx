import { Box, Button, CardContent, Typography } from '@mui/material';
import BoltIcon from '@mui/icons-material/Bolt';
import { AppCard } from '../AppCard';

// Card de créditos — premium: mesh gradient bg, animated bolt, shimmer CTA.
export const CreditsCard = ({ credits, onClick }: { credits: number | null; onClick: () => void }) => {
  if (credits == null) return null;
  return (
    <AppCard kind="tinted" tone="primary" sx={{
      mt: 2, mb: 2, position: 'relative', overflow: 'hidden',
      borderRadius: '20px !important',
      background: (t) => t.palette.mode === 'dark'
        ? `radial-gradient(ellipse at 10% 50%, rgba(32,178,170,.12), transparent 50%), radial-gradient(ellipse at 90% 50%, rgba(212,165,116,.06), transparent 50%), ${t.palette.background.paper}`
        : `radial-gradient(ellipse at 10% 50%, rgba(32,178,170,.07), transparent 50%), radial-gradient(ellipse at 90% 50%, rgba(212,165,116,.04), transparent 50%), #ffffff`,
    }}>
      <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.75, py: 2, '&:last-child': { pb: 2 } }}>
        <Box sx={{
          width: 50, height: 50, borderRadius: '14px',
          background: 'linear-gradient(135deg, rgba(32,178,170,.16), rgba(32,178,170,.08))',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <BoltIcon sx={{
            color: 'primary.dark', fontSize: 28,
            animation: 'dxBoltPulse 2s ease-in-out infinite',
            '@keyframes dxBoltPulse': {
              '0%, 100%': { transform: 'scale(1)', opacity: 0.85 },
              '50%': { transform: 'scale(1.15)', opacity: 1 },
            },
          }} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{
            fontWeight: 800, fontSize: 28, color: 'primary.dark', lineHeight: 1,
            fontVariantNumeric: 'tabular-nums', fontFamily: 'Poppins, sans-serif',
          }}>{credits.toLocaleString('pt-BR')}</Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>créditos disponíveis</Typography>
        </Box>
        <Button variant="contained" color="primary" size="small" onClick={onClick} sx={{
          borderRadius: '999px', textTransform: 'none', fontWeight: 700,
          py: 1.1, flexShrink: 0, position: 'relative', overflow: 'hidden',
          // Shimmer sweep
          '&::after': {
            content: '""', position: 'absolute', inset: 0,
            background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,.2) 50%, transparent 60%)',
            transform: 'translateX(-100%)',
            transition: 'transform .4s ease',
          },
          '&:hover::after': { transform: 'translateX(100%)' },
        }}>Comprar</Button>
      </CardContent>
    </AppCard>
  );
};
