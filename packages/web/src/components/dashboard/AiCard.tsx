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
    // Gradiente mesh animado — hue shift sutil (10s loop)
    background: (t) => t.palette.mode === 'dark'
      ? `radial-gradient(ellipse at 30% 20%, rgba(32,178,170,.16), transparent 55%), radial-gradient(ellipse at 85% 80%, rgba(99,102,241,.08), transparent 50%), ${t.palette.background.paper}`
      : `radial-gradient(ellipse at 30% 20%, rgba(32,178,170,.10), transparent 55%), radial-gradient(ellipse at 85% 80%, rgba(99,102,241,.05), transparent 50%), #ffffff`,
    border: (t) => `1px solid ${t.palette.mode === 'dark' ? 'rgba(32,178,170,.2)' : 'rgba(32,178,170,.15)'}`,
    transition: 'box-shadow .3s ease',
    '&:hover': { boxShadow: '0 8px 28px rgba(32,178,170,.12)' },
  }}>
    {/* Rotating backdrop icon — quase imperceptível mas dá vida */}
    <AutoAwesomeIcon sx={{
      position: 'absolute', right: -10, bottom: -16, fontSize: 120,
      color: '#20b2aa', opacity: 0.07, pointerEvents: 'none',
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
