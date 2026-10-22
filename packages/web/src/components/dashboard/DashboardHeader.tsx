import { Box, Stack, Typography } from '@mui/material';
import { tealText } from '../../theme';

const saudacao = () => { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; };

/**
 * Saudação do dashboard — LINHA DE TEXTO simples (fix #3 do diagnóstico visual):
 * sem card, sem gradiente, sem borda e sem chip "Sincronizado" (pulse infinito
 * violava a regra de animação). A saudação não disputa atenção com o hero.
 *
 * Polish v2: nome do usuário em TEAL (tealText — token AA do DS; #20b2aa cru dá
 * 2,66:1 sobre papel no light), 👋 e subtítulo "Vamos ver como você está hoje".
 * O aviso educativo (LGPD/ANVISA) continua — só desceu uma linha.
 */
export const DashboardHeader = ({ firstName }: { firstName: string }) => (
  <Stack sx={{ mb: 1.5, px: 0.5 }}>
    <Typography component="h1" noWrap sx={{
      fontFamily: '"Poppins", sans-serif',
      fontWeight: 800,
      letterSpacing: '-0.02em',
      fontSize: { xs: '1.25rem', sm: '1.5rem' },
      lineHeight: 1.2,
      color: 'text.primary',
    }}>
      {saudacao()},{' '}
      <Box component="span" sx={{ color: (t) => tealText(t.palette.mode) }}>
        {firstName || 'tudo bem?'}
      </Box>{' '}👋
    </Typography>
    <Typography component="p" sx={{ color: 'text.secondary', fontSize: { xs: 12.5, sm: 13 }, fontWeight: 600, mt: 0.25 }}>
      Vamos ver como você está hoje
    </Typography>
    <Typography component="p" sx={{ color: 'text.secondary', fontSize: { xs: 11.5, sm: 12.5 }, fontWeight: 500, mt: 0.25, opacity: 0.85 }}>
      Educativo — não substitui o médico.
    </Typography>
  </Stack>
);
