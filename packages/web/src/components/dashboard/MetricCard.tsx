import type { ReactNode } from 'react';
import { Card, CardContent, Grid, Typography } from '@mui/material';

// Card de métrica/contador clicável. (Padronização visual = task #14; aqui extração do statCard original.)
export const MetricCard = ({ label, value, color, onClick }: { label: string; value: ReactNode; color: string; onClick: () => void }) => (
  <Grid size={{ xs: 6, md: 3 }}>
    <Card onClick={onClick} sx={{ height: '100%', cursor: 'pointer', transition: 'all .15s', '&:hover': { transform: 'translateY(-2px)', boxShadow: 6, borderColor: color } }}>
      <CardContent>
        <Typography variant="caption" color="text.secondary">{label}</Typography>
        <Typography variant="h3" sx={{ fontWeight: 800, color }}>{value}</Typography>
      </CardContent>
    </Card>
  </Grid>
);
