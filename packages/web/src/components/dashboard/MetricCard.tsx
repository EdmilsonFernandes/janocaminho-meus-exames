import type { ReactNode } from 'react';
import { Box, Card, CardContent, Grid, Typography } from '@mui/material';

// Card de métrica padronizado e CENTRALIZADO: ícone em círculo tintado + número + label.
// Uniforme nos 4 (mesmo tamanho, alinhamento e padding) — alinhado aos olhos.
export const MetricCard = ({ label, value, color, icon, onClick }: { label: string; value: ReactNode; color: string; icon: ReactNode; onClick: () => void }) => (
  <Grid size={{ xs: 6, md: 3 }}>
    <Card onClick={onClick} sx={{ height: '100%', cursor: 'pointer', transition: 'all .15s', '&:hover': { transform: 'translateY(-2px)', boxShadow: 6, borderColor: color } }}>
      <CardContent sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 0.5, py: 1.75, '&:last-child': { pb: 1.75 } }}>
        <Box sx={{ width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color, bgcolor: 'action.hover', '& svg': { fontSize: 22 } }}>{icon}</Box>
        <Typography sx={{ fontWeight: 800, color, fontSize: { xs: 24, sm: 30 }, lineHeight: 1.1, mt: 0.25 }}>{value}</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.2 }}>{label}</Typography>
      </CardContent>
    </Card>
  </Grid>
);
