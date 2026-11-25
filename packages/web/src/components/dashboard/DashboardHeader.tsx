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
 *
 * 25/11/26: subtítulo 14px e aviso 13px sem opacidade (eram 12,5px e 12px a 85% — público 40+).
 * `subtitle` troca a linha de baixo do nome quando a Home mostra um exame antigo: prometer
 * "como você está hoje" sobre um exame de meses atrás é dado velho parecendo atual.
 */
export const DashboardHeader = ({ firstName, subtitle }: { firstName: string; subtitle?: string }) => (
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
    <Typography component="p" sx={{ color: 'text.secondary', fontSize: 14, fontWeight: 600, mt: 0.5 }}>
      {subtitle ?? 'Vamos ver como você está hoje'}
    </Typography>
    <Typography component="p" sx={{ color: 'text.secondary', fontSize: 13, fontWeight: 500, mt: 0.25 }}>
      Educativo — não substitui o médico.
    </Typography>
  </Stack>
);
