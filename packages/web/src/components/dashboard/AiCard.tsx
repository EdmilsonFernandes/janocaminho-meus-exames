import type { ReactNode } from 'react';
import { Box, Button, CardContent, Stack, Typography } from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { AppCard } from '../AppCard';

/**
 * Banner Hero da IA (Dr. Exame) — consultório de vidro translúcido com destaque premium.
 * Quando `tip` não é informado, exibe chamada explicativa de valor para o assistente conversacional.
 */
export const AiCard = ({ tip, onChat }: { tip: ReactNode; onChat: () => void }) => (
  <AppCard kind="tinted" tone="primary" tone2="secondary" sx={{ mt: 2, position: 'relative', overflow: 'hidden', borderRadius: '20px !important' }}>
    <AutoAwesomeIcon sx={{ position: 'absolute', right: -12, bottom: -20, fontSize: 140, color: '#20b2aa', opacity: 0.1, pointerEvents: 'none' }} />
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
              fontSize: 13.5,
              py: { xs: 1, sm: 1.1 },
              px: { xs: 2.5, sm: 3.5 },
              width: { xs: '100%', sm: 'auto' },
              background: 'linear-gradient(135deg,#20b2aa,#178f89)',
              boxShadow: '0 4px 14px rgba(32,178,170,.35)',
              transition: 'transform .15s ease, box-shadow .15s ease',
              '&:hover': { background: 'linear-gradient(135deg,#1ba39c,#137a74)', boxShadow: '0 6px 18px rgba(32,178,170,.45)', transform: 'translateY(-1px)' },
              '&:active': { transform: 'scale(.97)' }
            }}
          >
            Conversar com a IA
          </Button>
        </Box>
      </Stack>
    </CardContent>
  </AppCard>
);
