import { useEffect, useState } from 'react';
import { Stack, Box, Card, CardContent, Typography, Table, TableHead, TableRow, TableCell, TableBody } from '@mui/material';
import { API_URL, token } from '../../config';
import { TabLoader, SectionError } from './parts';

export const OverviewTab = () => {
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = async () => {
    setLoading(true); setError(false);
    try {
      const r = await fetch(`${API_URL}/admin/metrics`, { headers: { Authorization: `Bearer ${token()}` } });
      if (r.ok) setMetrics(await r.json()); else setError(true);
    } catch { setError(true); }
    setLoading(false);
  };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, []);

  if (loading) return <TabLoader />;
  if (error || !metrics) return <SectionError message="Não foi possível carregar as métricas." onRetry={() => void load()} />;

  return (
    <Stack spacing={2}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: '1fr 1fr 1fr' }, gap: 1.5 }}>
        {[
          { l: 'Signups', v: metrics.funnel.signups, c: '#0ea5e9' },
          { l: 'Premium ativos', v: metrics.funnel.premiumActive, c: '#20b2aa' },
          { l: 'Conversão free→pago', v: `${metrics.funnel.conversionPct}%`, c: '#8b5cf6' },
          { l: 'MRR (recorrente/mês)', v: `R$ ${(metrics.revenue.mrr ?? 0).toFixed(2).replace('.', ',')}`, c: '#10b981' },
          { l: 'Receita total aprovada', v: `R$ ${(metrics.revenue.total ?? 0).toFixed(2).replace('.', ',')}`, c: '#059669' },
          { l: 'Retenção no vencimento', v: `${metrics.churn.retentionPct}%`, c: '#f59e0b' },
        ].map((k) => (
          <Card key={k.l} sx={{ borderRadius: 3 }}><CardContent>
            <Typography variant="caption" color="text.secondary">{k.l}</Typography>
            <Typography variant="h5" sx={{ fontWeight: 800, color: k.c }}>{k.v}</Typography>
          </CardContent></Card>
        ))}
      </Box>

      <Card sx={{ borderRadius: 3 }}><CardContent>
        <Typography variant="h6" gutterBottom>🔻 Funil (conversão)</Typography>
        {[
          { l: 'Signups verificados', n: metrics.funnel.verified, pct: 100, c: '#0ea5e9' },
          { l: 'Free ativos', n: metrics.funnel.freeActive, pct: metrics.funnel.verified ? (metrics.funnel.freeActive / metrics.funnel.verified) * 100 : 0, c: '#94a3b8' },
          { l: 'Premium ativos', n: metrics.funnel.premiumActive, pct: metrics.funnel.verified ? (metrics.funnel.premiumActive / metrics.funnel.verified) * 100 : 0, c: '#20b2aa' },
        ].map((s) => (
          <Box key={s.l} sx={{ mb: 1.5 }}>
            <Stack direction="row" justifyContent="space-between"><Typography variant="body2">{s.l}</Typography><Typography variant="body2" sx={{ fontWeight: 700 }}>{s.n} ({Math.round(s.pct)}%)</Typography></Stack>
            <Box sx={{ height: 10, borderRadius: 99, bgcolor: '#eef2f7', mt: 0.5, overflow: 'hidden' }}>
              <Box sx={{ height: '100%', width: `${Math.max(2, s.pct)}%`, bgcolor: s.c, borderRadius: 99 }} />
            </Box>
          </Box>
        ))}
        <Typography variant="caption" color="text.secondary">{metrics.revenue.monthlyPayments} pagamento(s) mensal(is) • {metrics.revenue.creditPurchases} compra(s) de créditos avulsos</Typography>
      </CardContent></Card>

      <Card sx={{ borderRadius: 3 }}><CardContent>
        <Typography variant="h6" gutterBottom>🔁 Retenção no vencimento</Typography>
        <Stack direction="row" spacing={3} flexWrap="wrap" useFlexGap>
          <Box><Typography variant="caption" color="text.secondary">Já assinaram</Typography><Typography variant="h6" sx={{ fontWeight: 800 }}>{metrics.churn.everPremium}</Typography></Box>
          <Box><Typography variant="caption" color="text.secondary">Ainda ativos</Typography><Typography variant="h6" sx={{ fontWeight: 800, color: '#10b981' }}>{metrics.churn.stillActive}</Typography></Box>
          <Box><Typography variant="caption" color="text.secondary">Churn (venceu sem renovar)</Typography><Typography variant="h6" sx={{ fontWeight: 800, color: '#ef4444' }}>{metrics.churn.churned}</Typography></Box>
          <Box><Typography variant="caption" color="text.secondary">Renovações (2+ pagamentos)</Typography><Typography variant="h6" sx={{ fontWeight: 800 }}>{metrics.churn.renewals}</Typography></Box>
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>Taxa de retenção <strong>{metrics.churn.retentionPct}%</strong> — é o número que o nudge de vencimento ajuda a subir.</Typography>
      </CardContent></Card>

      <Card sx={{ borderRadius: 3 }}><CardContent>
        <Typography variant="h6" gutterBottom>📅 Cohort — conversão por mês de signup</Typography>
        <Table size="small">
          <TableHead><TableRow><TableCell>Mês</TableCell><TableCell align="right">Signups</TableCell><TableCell align="right">Virou Premium</TableCell><TableCell align="right">Conversão</TableCell></TableRow></TableHead>
          <TableBody>
            {(metrics.cohort ?? []).map((c: any) => (
              <TableRow key={c.month}><TableCell>{c.month}</TableCell><TableCell align="right">{c.signups}</TableCell><TableCell align="right">{c.converted}</TableCell><TableCell align="right">{c.signups ? Math.round((c.converted / c.signups) * 1000) / 10 : 0}%</TableCell></TableRow>
            ))}
            {(!metrics.cohort || metrics.cohort.length === 0) && <TableRow><TableCell colSpan={4} align="center">Sem dados ainda.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent></Card>

      <Card sx={{ borderRadius: 3 }}><CardContent>
        <Typography variant="h6" gutterBottom>💰 Receita aprovada por mês</Typography>
        <Table size="small">
          <TableHead><TableRow><TableCell>Mês</TableCell><TableCell align="right">Receita (R$)</TableCell></TableRow></TableHead>
          <TableBody>
            {(metrics.revenueByMonth ?? []).map((r: any) => (
              <TableRow key={r.month}><TableCell>{r.month}</TableCell><TableCell align="right">{(r.amount ?? 0).toFixed(2).replace('.', ',')}</TableCell></TableRow>
            ))}
            {(!metrics.revenueByMonth || metrics.revenueByMonth.length === 0) && <TableRow><TableCell colSpan={2} align="center">Sem receita ainda.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent></Card>
    </Stack>
  );
};
