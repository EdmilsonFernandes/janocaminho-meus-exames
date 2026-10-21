import { Stack, Typography } from '@mui/material';

const saudacao = () => { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; };

/**
 * Saudação do dashboard — LINHA DE TEXTO simples (fix #3 do diagnóstico visual):
 * sem card, sem gradiente, sem borda e sem chip "Sincronizado" (pulse infinito
 * violava a regra de animação). A saudação não disputa atenção com o hero.
 */
export const DashboardHeader = ({ firstName }: { firstName: string }) => (
  <Stack direction="row" alignItems="baseline" spacing={1.25} sx={{ mb: 1.5, px: 0.5, flexWrap: 'wrap', rowGap: 0.25 }}>
    <Typography component="h1" noWrap sx={{
      fontFamily: '"Poppins", sans-serif',
      fontWeight: 800,
      letterSpacing: '-0.02em',
      fontSize: { xs: '1.25rem', sm: '1.5rem' },
      lineHeight: 1.2,
      color: 'text.primary',
    }}>
      {saudacao()}, {firstName || 'tudo bem?'} 👋
    </Typography>
    <Typography component="p" noWrap sx={{ color: 'text.secondary', fontSize: { xs: 11.5, sm: 12.5 }, fontWeight: 500 }}>
      Educativo — não substitui o médico.
    </Typography>
  </Stack>
);
