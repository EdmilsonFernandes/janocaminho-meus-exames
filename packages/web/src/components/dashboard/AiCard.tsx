import type { ReactNode } from 'react';
import { Box, Button, CardContent, Stack, Typography } from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { AppCard } from '../AppCard';

/**
 * Banner Hero da IA (Dr. Exame) — premium: gradiente animado, shimmer no CTA,
 * ícone rotativo, hierarquia visual forte. A assinatura IA do dashboard.
 */
export const AiCard = ({ tip, onChat }: { tip: ReactNode; onChat: () => void }) => (
  <AppCard kind="tinted" tone="primary" tone2="secondary" sx={{
    mt: 2, position: 'relative', overflow: 'hidden', borderRadius: '20px !important',
    background: (t) => t.palette.mode === 'dark'
      ? `radial-gradient(ellipse at 25% 20%, rgba(32,178,170,.22), transparent 55%), radial-gradient(ellipse at 85% 80%, rgba(212,165,116,.14), transparent 50%), radial-gradient(ellipse at 70% 20%, rgba(99,102,241,.10), transparent 45%), ${t.palette.background.paper}`
      : `radial-gradient(ellipse at 25% 20%, rgba(32,178,170,.14), transparent 55%), radial-gradient(ellipse at 85% 80%, rgba(212,165,116,.08), transparent 50%), radial-gradient(ellipse at 70% 20%, rgba(99,102,241,.06), transparent 45%), #ffffff`,
    border: (t) => `1px solid ${t.palette.mode === 'dark' ? 'rgba(32,178,170,.28)' : 'rgba(32,178,170,.20)'}`,
    boxShadow: '0 4px 20px rgba(32,178,170,.06), 0 1px 3px rgba(0,0,0,.02)',
    transition: 'box-shadow .3s ease, transform .2s ease',
    '&:hover': { boxShadow: '0 8px 30px rgba(32,178,170,.18)', transform: 'translateY(-1px)' },
  }}>
    {/* Floating sparkle particles */}
    <Box sx={{
      position: 'absolute', top: 16, right: '25%', width: 6, height: 6, borderRadius: '50%',
      bgcolor: '#20b2aa', opacity: 0.6,
      animation: 'dxSparkleFloat1 4s ease-in-out infinite',
      '@keyframes dxSparkleFloat1': {
        '0%, 100%': { transform: 'translate(0, 0) scale(1)', opacity: 0.3 },
        '50%': { transform: 'translate(-10px, -8px) scale(1.4)', opacity: 0.8 },
      },
    }} />
    <Box sx={{
      position: 'absolute', bottom: 24, right: '40%', width: 4, height: 4, borderRadius: '50%',
      bgcolor: '#d4a574', opacity: 0.5,
      animation: 'dxSparkleFloat2 5s ease-in-out infinite 1s',
      '@keyframes dxSparkleFloat2': {
        '0%, 100%': { transform: 'translate(0, 0) scale(1)', opacity: 0.2 },
        '50%': { transform: 'translate(8px, -12px) scale(1.5)', opacity: 0.7 },
      },
    }} />
    <Box sx={{
      position: 'absolute', top: '45%', right: '12%', width: 5, height: 5, borderRadius: '50%',
      bgcolor: '#6366f1', opacity: 0.5,
      animation: 'dxSparkleFloat3 4.5s ease-in-out infinite 2s',
      '@keyframes dxSparkleFloat3': {
        '0%, 100%': { transform: 'translate(0, 0) scale(1)', opacity: 0.2 },
        '50%': { transform: 'translate(-6px, 10px) scale(1.3)', opacity: 0.75 },
      },
    }} />

    {/* Rotating backdrop icon */}
    <AutoAwesomeIcon sx={{
      position: 'absolute', right: -10, bottom: -16, fontSize: 130,
      color: '#20b2aa', opacity: 0.08, pointerEvents: 'none',
      animation: 'dxAiSpin 60s linear infinite',
      '@keyframes dxAiSpin': { from: { transform: 'rotate(0deg)' }, to: { transform: 'rotate(360deg)' } },
    }} />
    <CardContent sx={{ position: 'relative', p: { xs: 2.25, sm: 3 }, '&:last-child': { pb: { xs: 2.25, sm: 3 } } }}>
      <Stack spacing={1.25}>
        {tip ? (
          tip
        ) : (
          <Box>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography sx={{ fontFamily: 'Poppins, sans-serif', fontWeight: 800, fontSize: { xs: 15, sm: 17 }, color: 'text.primary', display: 'flex', alignItems: 'center', gap: 0.75 }}>
                ✨ Entenda seus exames com IA
              </Typography>
            </Stack>
            <Typography sx={{ fontSize: 13, color: 'text.secondary', mt: 0.5, lineHeight: 1.45, maxWidth: '640px' }}>
              Tire dúvidas clínicas, compare referências e receba orientações personalizadas sobre seus marcadores em segundos.
            </Typography>
          </Box>
        )}
        <Box sx={{ pt: tip ? 0 : 0.5 }}>
          <Button
            variant="contained"
            size="small"
            startIcon={<AutoAwesomeIcon />}
            onClick={onChat}
            sx={{
              borderRadius: '999px',
              textTransform: 'none',
              fontWeight: 800,
              fontSize: 14,
              py: { xs: 1, sm: 1.1 },
              px: { xs: 2.5, sm: 3.5 },
              width: { xs: '100%', sm: 'auto' },
              background: 'linear-gradient(135deg,#20b2aa,#178f89)',
              boxShadow: '0 4px 14px rgba(32,178,170,.35)',
              position: 'relative',
              overflow: 'hidden',
              transition: 'transform .15s ease, box-shadow .15s ease',
              // Shimmer sweep on hover
              '&::after': {
                content: '""', position: 'absolute', inset: 0,
                background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,.25) 50%, transparent 60%)',
                transform: 'translateX(-100%)',
                transition: 'transform .5s ease',
              },
              '&:hover': {
                background: 'linear-gradient(135deg,#1ba39c,#137a74)',
                boxShadow: '0 6px 20px rgba(32,178,170,.45)',
                transform: 'translateY(-1px)',
                '&::after': { transform: 'translateX(100%)' },
              },
              '&:active': { transform: 'scale(.97)' },
            }}
          >
            Conversar com a IA
          </Button>
        </Box>
      </Stack>
    </CardContent>
  </AppCard>
);
