import type { ReactNode } from 'react';
import { Box, Button, CardContent, Stack, Typography } from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { AppCard } from '../AppCard';
import { tealText, RADIUS } from '../../theme';

/**
 * Banner Hero da IA (Dr. Exame) — mesh radial teal/cobre, hierarquia visual forte.
 * Dieta de movimento (out/26): sem sparkles infinitos, sem rotação do backdrop.
 */
export const AiCard = ({ tip, onChat }: { tip: ReactNode; onChat: () => void }) => (
  <AppCard kind="tinted" tone="primary" tone2="secondary" sx={{
    mt: 2, position: 'relative', overflow: 'hidden', borderRadius: RADIUS.hero,
    background: (t) => t.palette.mode === 'dark'
      ? `radial-gradient(ellipse at 25% 20%, rgba(32,178,170,.22), transparent 55%), radial-gradient(ellipse at 85% 80%, rgba(212,165,116,.14), transparent 50%), radial-gradient(ellipse at 70% 20%, rgba(99,102,241,.10), transparent 45%), ${t.palette.background.paper}`
      : `radial-gradient(ellipse at 25% 20%, rgba(32,178,170,.14), transparent 55%), radial-gradient(ellipse at 85% 80%, rgba(212,165,116,.08), transparent 50%), radial-gradient(ellipse at 70% 20%, rgba(99,102,241,.06), transparent 45%), #ffffff`,
    border: (t) => `1px solid ${t.palette.mode === 'dark' ? 'rgba(32,178,170,.28)' : 'rgba(32,178,170,.20)'}`,
    boxShadow: '0 4px 20px rgba(32,178,170,.06), 0 1px 3px rgba(0,0,0,.02)',
    transition: 'box-shadow .3s ease, transform .2s ease',
    '&:hover': { boxShadow: '0 8px 30px rgba(32,178,170,.18)', transform: 'translateY(-1px)' },
  }}>
    {/* Backdrop icon — estático (dieta de movimento) */}
    <AutoAwesomeIcon sx={{
      position: 'absolute', right: -10, bottom: -16, fontSize: 130,
      color: '#20b2aa', opacity: 0.08, pointerEvents: 'none',
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
        {/* CTA de IA em TEXT-BUTTON (fix porta de IA): o CTA gradiente "Tirar dúvida
            com IA" vive APENAS no hero do dashboard — aqui é ação secundária discreta. */}
        <Box sx={{ pt: tip ? 0 : 0.5 }}>
          <Button
            variant="text"
            size="small"
            startIcon={<AutoAwesomeIcon />}
            onClick={onChat}
            sx={{
              textTransform: 'none',
              fontWeight: 800,
              fontSize: 14,
              px: 1.5,
              minHeight: 44,
              alignSelf: 'flex-start',
              color: (t) => tealText(t.palette.mode),
              '&:hover': { bgcolor: 'rgba(32,178,170,.08)' },
            }}
          >
            Conversar com a IA
          </Button>
        </Box>
      </Stack>
    </CardContent>
  </AppCard>
);
