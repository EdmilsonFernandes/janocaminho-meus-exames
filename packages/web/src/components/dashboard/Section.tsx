import { ReactNode } from 'react';
import { Box, Stack, Typography } from '@mui/material';

// Seção nomeada do Dashboard — header overline (label + ícone + action opcional) + conteúdo.
// Dá o agrupamento visual ("organização") e ritmo vertical consistente entre blocos.
// Combinada com Grid2 responsivo nos filhos, entrega o layout "Clínico Premium".
export const Section = ({
  label,
  icon,
  action,
  children,
  sx,
}: {
  label?: string;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  sx?: object;
}) => {
  return (
    <Box component="section" sx={{ mt: { xs: 3.5, sm: 4 }, ...sx }}>
      {(label || action) && (
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.25, px: 0.5 }}>
          <Stack direction="row" alignItems="center" spacing={0.75}>
            {icon && <Box sx={{ color: 'primary.main', display: 'flex', '& svg': { fontSize: 18 } }}>{icon}</Box>}
            {label && (
              <Typography variant="overline" sx={{ lineHeight: 1, letterSpacing: '0.12em', fontWeight: 700, color: 'text.secondary' }}>
                {label}
              </Typography>
            )}
          </Stack>
          {action}
        </Stack>
      )}
      {children}
    </Box>
  );
};
