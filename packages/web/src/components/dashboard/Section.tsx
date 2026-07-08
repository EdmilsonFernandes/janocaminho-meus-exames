import { ReactNode } from 'react';
import { Box, Stack, Typography } from '@mui/material';

// Seção do Dashboard — premium: sem overline uppercase (datado), usa divider sutil com ícone.
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
    <Box component="section" sx={{ mt: { xs: 2.5, sm: 3 }, ...sx }}>
      {(label || action) && (
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
          <Stack direction="row" alignItems="center" spacing={0.75} sx={{ flex: 1, minWidth: 0 }}>
            {icon && <Box sx={{ color: '#178f89', display: 'flex', '& svg': { fontSize: 18 } }}>{icon}</Box>}
            {label && (
              <Typography sx={{ fontSize: 13, fontWeight: 700, color: 'text.primary', fontFamily: 'Poppins, sans-serif' }}>
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
