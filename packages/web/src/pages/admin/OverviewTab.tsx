import { useEffect, useState } from 'react';
import { Stack, Box, Card, CardContent, Typography, Table, TableHead, TableRow, TableCell, TableBody, TableContainer } from '@mui/material';
import { API_URL, token } from '../../config';
import { TabLoader, SectionError } from './parts';

/** "2026-08" → "Ago 2026" (evita datas quebrando no mobile). */
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const fmtMonth = (m: string): string => {
  if (!m) return '—';
  const [y, mo] = m.split('-');
  const idx = parseInt(mo, 10) - 1;
  return `${MESES[idx] ?? mo} ${y}`;
};

export const OverviewTab = () => {
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [decifre, setDecifre] = useState<{ today: number; week: number; total: number; uniqueIps: number } | null>(null);

  const load = async () => {
    setLoading(true); setError(false);
    try {
      const r = await fetch(`${API_URL}/admin/metrics`, { headers: { Authorization: `Bearer ${token()}` } });
      if (r.ok) setMetrics(await r.json()); else setError(true);
      // Funil anônimo da landing ("cole seu exame") — o dono "sente o calor" aqui.
      fetch(`${API_URL}/admin/decifre-stats`, { headers: { Authorization: `Bearer ${token()}` } })
        .then((r2) => (r2.ok ? r2.json() : null)).then(setDecifre).catch(() => {});
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
          { l: 'Conversão free→pago', v: `${metrics.funnel.conversionPct}%`, c: '#6366f1' },
          { l: 'MRR (recorrente/mês)', v: `R$ ${(metrics.revenue.mrr ?? 0).toFixed(2).replace('.', ',')}`, c: '#059669' },
          { l: 'Receita total aprovada', v: `R$ ${(metrics.revenue.total ?? 0).toFixed(2).replace('.', ',')}`, c: '#059669' },
          { l: 'Retenção no vencimento', v: `${metrics.churn.retentionPct}%`, c: '#f59e0b' },
        ].map((k) => (
          <Card key={k.l} sx={{ borderRadius: '12px' }}><CardContent>
            <Typography variant="caption" color="text.secondary">{k.l}</Typography>
            <Typography variant="h5" sx={{ fontWeight: 800, color: k.c }}>{k.v}</Typography>
          </CardContent></Card>
        ))}
      </Box>

      {/* Decifre anônimo (landing) — topo de funil público */}
      <Card sx={{ borderRadius: '12px' }}><CardContent>
        <Stack direction="row" spacing={2} useFlexGap flexWrap="wrap" alignItems="center">
          <Typography variant="h6" sx={{ fontSize: 16 }}>🔥 Decifre grátis (landing)</Typography>
          {decifre ? (
            <>
              <Typography variant="body2"><b>{decifre.today}</b> hoje</Typography>
              <Typography variant="body2"><b>{decifre.week}</b> nos 7d</Typography>
              <Typography variant="body2"><b>{decifre.total}</b> no total</Typography>
              <Typography variant="body2"><b>{decifre.uniqueIps}</b> pessoas diferentes</Typography>
            </>
          ) : (
            <Typography variant="body2" color="text.secondary">Sem decifrações ainda — a landing está pronta pro primeiro visitante colar um exame.</Typography>
          )}
        </Stack>
      </CardContent></Card>

      <Card sx={{ borderRadius: '12px' }}><CardContent>
        <Typography variant="h6" gutterBottom>🔻 Funil (conversão)</Typography>
        {[
          { l: 'Signups verificados', n: metrics.funnel.verified, pct: 100, c: '#0ea5e9' },
          { l: 'Free ativos', n: metrics.funnel.freeActive, pct: metrics.funnel.verified ? (metrics.funnel.freeActive / metrics.funnel.verified) * 100 : 0, c: '#94a3b8' },
          { l: 'Premium ativos', n: metrics.funnel.premiumActive, pct: metrics.funnel.verified ? (metrics.funnel.premiumActive / metrics.funnel.verified) * 100 : 0, c: '#20b2aa' },
        ].map((s) => (
          <Box key={s.l} sx={{ mb: 1.5 }}>
            <Stack direction="row" justifyContent="space-between"><Typography variant="body2">{s.l}</Typography><Typography variant="body2" sx={{ fontWeight: 700 }}>{s.n} ({Math.round(s.pct)}%)</Typography></Stack>
            <Box sx={{ height: 10, borderRadius: '999px', bgcolor: 'action.hover', mt: 0.5, overflow: 'hidden' }}>
              <Box sx={{ height: '100%', width: `${Math.max(2, s.pct)}%`, bgcolor: s.c, borderRadius: '999px' }} />
            </Box>
          </Box>
        ))}
        <Typography variant="caption" color="text.secondary">{metrics.revenue.monthlyPayments} pagamento(s) mensal(is) • {metrics.revenue.creditPurchases} compra(s) de créditos avulsos</Typography>
      </CardContent></Card>

      <Card sx={{ borderRadius: '12px' }}><CardContent>
        <Typography variant="h6" gutterBottom>🔁 Retenção no vencimento</Typography>
        <Stack direction="row" spacing={3} flexWrap="wrap" useFlexGap>
          <Box><Typography variant="caption" color="text.secondary">Já assinaram</Typography><Typography variant="h6" sx={{ fontWeight: 800 }}>{metrics.churn.everPremium}</Typography></Box>
          <Box><Typography variant="caption" color="text.secondary">Ainda ativos</Typography><Typography variant="h6" sx={{ fontWeight: 800, color: '#059669' }}>{metrics.churn.stillActive}</Typography></Box>
          <Box><Typography variant="caption" color="text.secondary">Churn (venceu sem renovar)</Typography><Typography variant="h6" sx={{ fontWeight: 800, color: '#ef4444' }}>{metrics.churn.churned}</Typography></Box>
          <Box><Typography variant="caption" color="text.secondary">Renovações (2+ pagamentos)</Typography><Typography variant="h6" sx={{ fontWeight: 800 }}>{metrics.churn.renewals}</Typography></Box>
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>Taxa de retenção <strong>{metrics.churn.retentionPct}%</strong> — é o número que o nudge de vencimento ajuda a subir.</Typography>
      </CardContent></Card>

      <Card sx={{ borderRadius: '16px', boxShadow: '0 1px 2px rgba(0,0,0,.03), 0 2px 8px rgba(0,0,0,.04), 0 8px 20px rgba(0,0,0,.03)' }}><CardContent>
        <Typography variant="h6" gutterBottom sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif' }}>📅 Cohort — conversão por mês</Typography>
        <TableContainer sx={{ overflowX: 'auto' }}>
        <Table size="small">
          <TableHead><TableRow><TableCell sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>Mês</TableCell><TableCell align="right" sx={{ fontWeight: 700 }}>Signups</TableCell><TableCell align="right" sx={{ fontWeight: 700 }}>Premium</TableCell><TableCell align="right" sx={{ fontWeight: 700 }}>Conv.</TableCell></TableRow></TableHead>
          <TableBody>
            {(metrics.cohort ?? []).map((c: any) => (
              <TableRow key={c.month} sx={{ '&:hover': { bgcolor: 'rgba(32,178,170,.04)' } }}>
                <TableCell sx={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{fmtMonth(c.month)}</TableCell>
                <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{c.signups}</TableCell>
                <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{c.converted}</TableCell>
                <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: c.converted > 0 ? 'success.main' : 'text.secondary' }}>
                  {c.signups ? Math.round((c.converted / c.signups) * 1000) / 10 : 0}%
                </TableCell>
              </TableRow>
            ))}
            {(!metrics.cohort || metrics.cohort.length === 0) && <TableRow><TableCell colSpan={4} align="center">Sem dados ainda.</TableCell></TableRow>}
          </TableBody>
        </Table>
        </TableContainer>
      </CardContent></Card>

      <Card sx={{ borderRadius: '16px', boxShadow: '0 1px 2px rgba(0,0,0,.03), 0 2px 8px rgba(0,0,0,.04), 0 8px 20px rgba(0,0,0,.03)' }}><CardContent>
        <Typography variant="h6" gutterBottom sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif' }}>💰 Receita aprovada por mês</Typography>
        <TableContainer sx={{ overflowX: 'auto' }}>
        <Table size="small">
          <TableHead><TableRow><TableCell sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>Mês</TableCell><TableCell align="right" sx={{ fontWeight: 700 }}>Receita</TableCell></TableRow></TableHead>
          <TableBody>
            {(metrics.revenueByMonth ?? []).map((r: any) => (
              <TableRow key={r.month} sx={{ '&:hover': { bgcolor: 'rgba(32,178,170,.04)' } }}>
                <TableCell sx={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{fmtMonth(r.month)}</TableCell>
                <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: 'success.dark' }}>
                  R$ {(r.amount ?? 0).toFixed(2).replace('.', ',')}
                </TableCell>
              </TableRow>
            ))}
            {(!metrics.revenueByMonth || metrics.revenueByMonth.length === 0) && <TableRow><TableCell colSpan={2} align="center">Sem receita ainda.</TableCell></TableRow>}
          </TableBody>
        </Table>
        </TableContainer>
      </CardContent></Card>
    </Stack>
  );
};
