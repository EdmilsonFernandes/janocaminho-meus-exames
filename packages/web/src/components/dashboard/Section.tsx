import { ReactNode } from 'react';
import { Box, Stack, Typography } from '@mui/material';
import { tealText } from '../../theme';

// Seção do Dashboard — premium: sem overline uppercase (datado), usa divider sutil com ícone.
// 25/11/26: o rótulo era 13px, ABAIXO do título dos próprios cards (15–16px) — a hierarquia ficava
// invertida. Agora o título de seção é o segundo nível da página, logo abaixo do herói.
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
    <Box component="section" sx={{ mt: { xs: 3, sm: 3.5 }, ...sx }}>
      {(label || action) && (
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ flex: 1, minWidth: 0 }}>
            {icon && <Box sx={{ color: (t) => tealText(t.palette.mode), display: 'flex', '& svg': { fontSize: 20 } }}>{icon}</Box>}
            {label && (
              <Typography sx={{ fontSize: { xs: 17, sm: 18 }, lineHeight: 1.25, fontWeight: 700, color: 'text.primary', fontFamily: 'Poppins, sans-serif' }}>
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
