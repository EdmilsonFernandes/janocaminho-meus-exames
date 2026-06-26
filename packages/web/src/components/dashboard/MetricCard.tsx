import type { ReactNode } from 'react';
import { Box, Card, CardContent, Grid, Typography } from '@mui/material';

// Card de métrica padronizado: ícone (tintado) + número grande + label. Uniforme.
export const MetricCard = ({ label, value, color, icon, onClick }: { label: string; value: ReactNode; color: string; icon: ReactNode; onClick: () => void }) => (
  <Grid size={{ xs: 6, md: 3 }}>
    <Card onClick={onClick} sx={{ height: '100%', cursor: 'pointer', borderRadius: 6, transition: 'all .15s', '&:hover': { transform: 'translateY(-2px)', boxShadow: 6, borderColor: color } }}>
      <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        <Box sx={{ width: 36, height: 36, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', color, bgcolor: 'action.hover', mb: 0.5, '& svg': { fontSize: 20 } }}>{icon}</Box>
        <Typography variant="h4" sx={{ fontWeight: 800, color, lineHeight: 1.1, fontSize: { xs: 28, md: 32 } }}>{value}</Typography>
        <Typography variant="caption" color="text.secondary">{label}</Typography>
      </CardContent>
    </Card>
  </Grid>
);
