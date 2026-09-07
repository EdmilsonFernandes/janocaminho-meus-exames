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
          background: 'linear-gradient(135deg, rgba(32,178,170,.18), rgba(32,178,170,.08))',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          position: 'relative',
        }}>
          {/* Bolt trail glow */}
          <Box sx={{
            position: 'absolute', inset: 4, borderRadius: '50%',
            background: 'rgba(32,178,170,.25)', filter: 'blur(8px)',
            animation: 'dxBoltGlow 2s ease-in-out infinite',
            '@keyframes dxBoltGlow': {
              '0%, 100%': { opacity: 0.3, transform: 'scale(0.9)' },
              '50%': { opacity: 0.8, transform: 'scale(1.2)' },
            },
          }} />
          <BoltIcon sx={{
            color: 'primary.dark', fontSize: 28, position: 'relative', zIndex: 1,
            animation: 'dxBoltPulse 2s ease-in-out infinite',
            '@keyframes dxBoltPulse': {
              '0%, 100%': { transform: 'scale(1)', opacity: 0.9 },
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
          borderRadius: '999px', textTransform: 'none', fontWeight: 800,
          px: 2.5, py: 1.1, flexShrink: 0, position: 'relative', overflow: 'hidden',
          background: 'linear-gradient(135deg, #20b2aa, #178f89)',
          boxShadow: '0 4px 14px rgba(32,178,170,.3)',
          // Continuous auto-shimmer
          '&::after': {
            content: '""', position: 'absolute', inset: 0,
            background: 'linear-gradient(105deg, transparent 35%, rgba(255,255,255,.35) 50%, transparent 65%)',
            backgroundSize: '200% 100%',
            animation: 'dxButtonAutoShimmer 3s ease-in-out infinite',
          },
          '@keyframes dxButtonAutoShimmer': {
            '0%': { backgroundPosition: '200% 0' },
            '100%': { backgroundPosition: '-200% 0' },
          },
          '&:hover': {
            background: 'linear-gradient(135deg, #1ba39c, #137a74)',
            boxShadow: '0 6px 20px rgba(32,178,170,.45)',
            transform: 'translateY(-1px)',
          },
        }}>Comprar</Button>
      </CardContent>
    </AppCard>
  );
};
