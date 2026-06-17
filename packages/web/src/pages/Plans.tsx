import { useEffect, useState } from 'react';
import { Box, Card, CardContent, Typography, Button, Grid, Chip, Alert, Stack, Divider } from '@mui/material';
import CheckIcon from '@mui/icons-material/CheckCircle';
import BoltIcon from '@mui/icons-material/Bolt';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import { Title, useNotify } from 'react-admin';
import { useSearchParams } from 'react-router-dom';
import { API_URL, token } from '../config';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { PixModal } from '../components/PixModal';

interface Status { active: boolean; planExpiresAt: string | null; examsCount: number; freeExamLimit: number; credits: number; tokensUsed: number; }
interface Pack { id: string; credits: number; price: number; label: string; popular: boolean; }
interface PlanInfo { plans: { id: string; label: string; price: number; periodDays: number }[]; creditPacks: Pack[]; freeExamLimit: number; mercadoPagoEnabled: boolean; }

export const PlansPage = () => {
  const notify = useNotify();
  const [params] = useSearchParams();
  const [status, setStatus] = useState<Status | null>(null);
  const [plans, setPlans] = useState<PlanInfo | null>(null);
  const [subLoading, setSubLoading] = useState(false);
  const [pixPack, setPixPack] = useState<string | null>(null);
  const [hist, setHist] = useState<any[]>([]);
  const [histPage, setHistPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [histLoading, setHistLoading] = useState(false);
  const [histTotal, setHistTotal] = useState(0);

  const loadHistory = async (page: number) => {
    setHistLoading(true);
    const h = { Authorization: `Bearer ${token()}` };
    const r = await fetch(`${API_URL}/billing/credits/history?page=${page}`, { headers: h });
    if (r.ok) {
      const d = await r.json();
      setHist(d.items ?? []);
      setHasMore(!!d.hasMore);
      setHistPage(page);
      setHistTotal(d.total ?? 0);
    }
    setHistLoading(false);
  };

  const load = async () => {
    const h = { Authorization: `Bearer ${token()}` };
    const [s, p] = await Promise.all([
      fetch(`${API_URL}/billing/status`, { headers: h }),
      fetch(`${API_URL}/billing/plans`),
    ]);
    if (s.ok) setStatus(await s.json());
    if (p.ok) setPlans(await p.json());
    void loadHistory(1);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  useEffect(() => {
    if (params.get('status') === 'success') notify('Pagamento aprovado! Plano ativo. 🎉', { type: 'success' });
    if (params.get('status') === 'failure') notify('Pagamento não concluído.', { type: 'error' });
  }, [params, notify]);

  const subscribe = async () => {
    setSubLoading(true);
    try {
      const r = await fetch(`${API_URL}/billing/checkout`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ plan: 'monthly' }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Falha');
      if (d.init_point) {
        if (Capacitor.isNativePlatform()) await Browser.open({ url: d.init_point });
        else window.location.href = d.init_point;
      }
    } catch (e: any) { notify(e.message, { type: 'error' }); }
    finally { setSubLoading(false); }
  };

  const fmt = (d: string) => new Date(d).toLocaleDateString('pt-BR');
  const packs = plans?.creditPacks ?? [];
  const mpOn = plans?.mercadoPagoEnabled ?? false;

  return (
    <Box sx={{ maxWidth: 860, mx: 'auto', p: { xs: 2, md: 3 } }}>
      <Title title="Planos e Créditos" />
      <Typography variant="h5" sx={{ fontWeight: 800, mb: 0.5 }}>💎 Planos e Créditos</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Use à vontade: assine o <strong>mensal</strong> (1.500 créditos de IA por mês) ou compre <strong>créditos avulsos</strong> via PIX.
      </Typography>

      {/* Saldo + consumo */}
      <Card sx={{ mb: 2, borderRadius: 4, background: 'linear-gradient(135deg,#20b2aa,#178f89)', color: '#fff' }}>
        <CardContent>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="space-between" flexWrap="wrap" useFlexGap>
            <Box>
              <Typography sx={{ opacity: 0.9, fontSize: 13 }}>Seus créditos</Typography>
              <Typography variant="h3" sx={{ fontWeight: 800, lineHeight: 1.1 }}>{status?.credits ?? 0}</Typography>
              {status?.active
                ? <Chip size="small" sx={{ mt: 1, bgcolor: 'rgba(255,255,255,.2)', color: '#fff', fontWeight: 700 }} label={`Premium ativo até ${status.planExpiresAt ? fmt(status.planExpiresAt) : '—'}`} />
                : <Typography variant="caption" sx={{ opacity: 0.9 }}>Sem assinatura — créditos custeiam a IA.</Typography>}
            </Box>
            <Box sx={{ textAlign: { xs: 'left', sm: 'right' } }}>
              <Typography variant="caption" sx={{ opacity: 0.85 }}>Ver extrato detalhado abaixo ↓</Typography>
            </Box>
          </Stack>
        </CardContent>
      </Card>

      {/* CONSUMO RECENTE */}
      {hist.length > 0 && (
        <Card sx={{ mb: 2, borderRadius: 4 }}><CardContent>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>Extrato de créditos</Typography>
          <Stack divider={<Divider />} spacing={0}>
            {hist.map((it) => {
              const credit = it.kind === 'credit';
              return (
                <Stack key={it.id} direction="row" justifyContent="space-between" alignItems="center" sx={{ py: 0.75 }}>
                  <Box sx={{ minWidth: 0, flex: 1, mr: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{it.label}</Typography>
                    <Typography variant="caption" color="text.secondary">{new Date(it.createdAt).toLocaleString('pt-BR')}{it.patient ? ` • ${it.patient}` : ''}</Typography>
                  </Box>
                  <Chip size="small" label={`${it.amount > 0 ? '+' : ''}${it.amount}`}
                    sx={{ fontWeight: 800, bgcolor: credit ? 'rgba(16,185,129,.14)' : 'rgba(239,68,68,.1)', color: credit ? 'success.main' : 'error.main' }} />
                </Stack>
              );
            })}
          </Stack>
          {histTotal > 7 && (
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 1.5 }}>
              <Button size="small" disabled={histPage <= 1 || histLoading} onClick={() => loadHistory(histPage - 1)}>← Anterior</Button>
              <Typography variant="caption" color="text.secondary">Pág. {histPage} de {Math.ceil(histTotal / 7)}</Typography>
              <Button size="small" disabled={!hasMore || histLoading} onClick={() => loadHistory(histPage + 1)}>Próxima →</Button>
            </Stack>
          )}
        </CardContent></Card>
      )}

      {/* PACOTES DE CRÉDITOS */}
      <Typography variant="h6" sx={{ mt: 1, mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}><BoltIcon color="secondary" /> Comprar créditos (PIX instantâneo)</Typography>
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {packs.map((p) => (
          <Grid size={{ xs: 12, sm: 4 }} key={p.id}>
            <Card sx={{ height: '100%', borderRadius: 4, border: p.popular ? '2px solid #20b2aa' : '1px solid #e2e8f0' }}>
              {p.popular && <Box sx={{ textAlign: 'center', pt: 1.5 }}><Chip color="primary" label="MAIS VENDIDO" size="small" /></Box>}
              <CardContent sx={{ textAlign: 'center', pt: p.popular ? 1 : 2 }}>
                <Typography sx={{ fontWeight: 800, fontSize: 28, color: 'primary.main' }}>{p.credits}</Typography>
                <Typography color="text.secondary">créditos</Typography>
                <Typography variant="h5" sx={{ my: 1, fontWeight: 800 }}>R$ {p.price.toFixed(2).replace('.', ',')}</Typography>
                <Button variant={p.popular ? 'contained' : 'outlined'} fullWidth disabled={!mpOn} onClick={() => setPixPack(p.id)}>Comprar via PIX</Button>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Divider sx={{ my: 2 }}><Chip label="ou assine" /></Divider>

      {/* PLANO MENSAL */}
      <Card sx={{ borderRadius: 4, background: 'linear-gradient(135deg,#ffffff,#f1fafa)', border: '2px solid #20b2aa' }}>
        <CardContent>
          <Typography variant="h6" sx={{ fontWeight: 800, color: '#178f89' }}>💎 Premium Mensal</Typography>
          <Typography color="text.secondary" sx={{ fontSize: 14, mt: 0.5 }}>
            1.500 créditos inclusos todo mês (renova sozinho). Cancele quando quiser.
          </Typography>
          <Box component="ul" sx={{ pl: 2.5, mt: 1.5, mb: 2, lineHeight: 1.8, fontSize: 14 }}>
            <li>1.500 créditos de IA por mês</li>
            <li>Exames + dependentes</li>
            <li>Relatório completo + impressão</li>
          </Box>
          <Divider sx={{ mb: 2 }} />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center" justifyContent="space-between" useFlexGap flexWrap="wrap">
            <Box>
              <Typography variant="h4" sx={{ fontWeight: 800, color: '#178f89', lineHeight: 1 }}>R$ 19,90</Typography>
              <Typography color="text.secondary" sx={{ fontSize: 13 }}>/mês · sem anual · sem fidelidade</Typography>
            </Box>
            <Button variant="contained" size="large" disabled={!mpOn || subLoading || !!status?.active} onClick={subscribe} sx={{ minWidth: 160 }}>
              {status?.active ? '✓ Ativo' : subLoading ? 'Abrindo…' : 'Assinar mensal'}
            </Button>
          </Stack>
        </CardContent>
      </Card>

      {!mpOn && (
        <Alert severity="info" sx={{ mt: 2 }} icon={<CheckIcon />}>
          Em ambiente de teste os pagamentos podem estar desativados. Em produção usamos o mesmo Mercado Pago da sua loja.
        </Alert>
      )}

      <PixModal packId={pixPack} onClose={() => setPixPack(null)} onApproved={() => { setPixPack(null); notify('Créditos adicionados! 🎉', { type: 'success' }); load(); }} />
    </Box>
  );
};
