import type { ReactNode } from 'react';
import { Card, CardContent, Box, Typography, Chip } from '@mui/material';
import { alpha } from '@mui/material/styles';

/**
 * Card de seção do relatório — sempre ABERTO (o relatório é pra ler/imprimir,
 * não pra colapsar como a análise inline do exame). Mesmo vocabulário premium
 * do dashboard: borda + fundo tinted no `accent`, ícone em círculo tintado,
 * título Poppins, chip de contagem. Substitui o antigo <Section> de texto flat.
 */
export const ReportSectionCard = ({ icon, title, accent, count, children }: {
  icon: ReactNode; title: string; accent: string; count?: number; children: ReactNode;
}) => (
  <Card sx={{ overflow: 'hidden', background: alpha(accent, 0.04), border: '1px solid', borderColor: alpha(accent, 0.2), borderLeft: `4px solid ${accent}` }}>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 2, py: 1.5 }}>
      <Box sx={{ width: 38, height: 38, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: alpha(accent, 0.12), color: accent, '& svg': { fontSize: 20 } }}>{icon}</Box>
      <Typography sx={{ fontWeight: 800, fontFamily: '"Poppins",sans-serif', flex: 1, fontSize: '1.02rem', minWidth: 0 }}>{title}</Typography>
      {count != null && <Chip size="small" label={count} sx={{ bgcolor: alpha(accent, 0.13), color: accent, fontWeight: 700, height: 22, flexShrink: 0 }} />}
    </Box>
    <CardContent sx={{ pt: 0.5, pb: 2, px: 2, '&:last-child': { pb: 2 } }}>{children}</CardContent>
  </Card>
);
