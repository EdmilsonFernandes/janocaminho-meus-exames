import { Box, Card, CardContent, Grid, Stack, Typography } from '@mui/material';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

// Donut de distribuição dos valores (bons/alerta/alterados). Extração pura do JSX original.
const DONUT = [
  { key: 'bons', name: 'Dentro da faixa', color: '#059669' },
  { key: 'alerta', name: 'Abaixo do esperado', color: '#f59e0b' },
  { key: 'alterados', name: 'Acima do esperado', color: '#ef4444' },
  { key: 'semClassificacao', name: 'Sem faixa de referência', color: '#94a3b8' },
] as const;

export const DistributionCard = ({ buckets }: { buckets: { bons: number; alerta: number; alterados: number; semClassificacao?: number } }) => {
  const totalVals = buckets.bons + buckets.alerta + buckets.alterados;
  const donutData = DONUT.map((d) => ({ ...d, value: (buckets as any)[d.key] })).filter((d) => d.value > 0);
  return (
    <Grid container spacing={2} sx={{ mb: 2 }}>
      <Grid size={{ xs: 12 }}>
        <Card sx={{ height: '100%' }}><CardContent>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>Como estão seus resultados</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Resumo dos seus exames mais recentes.</Typography>
          {totalVals === 0 ? (
            <Typography color="text.secondary">Nenhum resultado ainda. Envie um exame pra começar.</Typography>
          ) : (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap' }}>
              <Box sx={{ width: 150, height: 150, position: 'relative', flexShrink: 0 }}>
                <ResponsiveContainer width={150} height={150}>
                  <PieChart>
                    <Pie data={donutData as any} dataKey="value" innerRadius={45} outerRadius={70} paddingAngle={2} stroke="none">
                      {donutData.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <Box sx={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <Typography sx={{ fontWeight: 800, fontSize: 24, lineHeight: 1 }}>{totalVals}</Typography>
                  <Typography variant="caption" color="text.secondary">resultados</Typography>
                </Box>
              </Box>
              <Stack spacing={1}>
                {donutData.map((d) => (
                  <Stack key={d.key} direction="row" alignItems="center" spacing={1}>
                    <Box sx={{ width: 14, height: 14, borderRadius: 1, bgcolor: d.color }} />
                    <Typography variant="body2"><strong>{d.value}</strong> {d.name}{totalVals ? ` (${Math.round((d.value / totalVals) * 100)}%)` : ''}</Typography>
                  </Stack>
                ))}
              </Stack>
            </Box>
          )}
        </CardContent></Card>
      </Grid>
    </Grid>
  );
};
