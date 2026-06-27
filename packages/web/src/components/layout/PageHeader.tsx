import type { ReactNode } from 'react';
import { Stack, Typography, Box } from '@mui/material';

export interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  /** Cor de acento do ícone (hex ou token da paleta). Default 'primary.main'. */
  accent?: string;
}

/**
 * Cabeçalho de página padronizado: ícone em círculo tintado de teal (assinatura
 * do dashboard/relatório) + título Poppins + subtítulo + ações à direita.
 * Substitui a mistura de <Title>, Typography h5 solto e headers custom.
 * Dark-mode aware (tinta do círculo se ajusta ao modo).
 */
export const PageHeader = ({ title, subtitle, icon, actions, accent = 'primary.main' }: PageHeaderProps) => (
  <Stack direction="row" alignItems="center" gap={1.5} sx={{ mb: 2 }}>
    {icon && (
      <Box sx={{
        width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(32,178,170,0.16)' : 'rgba(32,178,170,0.10)',
        color: accent, '& svg': { fontSize: 22 },
      }}>
        {icon}
      </Box>
    )}
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Typography variant="h5" sx={{ fontWeight: 800, lineHeight: 1.2 }}>{title}</Typography>
      {subtitle && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>{subtitle}</Typography>}
    </Box>
    {actions && (
      <Stack direction="row" spacing={1} alignItems="center" sx={{ flexShrink: 0 }}>{actions}</Stack>
    )}
  </Stack>
);
