import { useEffect, useState } from 'react';
import { Box, Card, CardContent, Typography, Button, Grid, Chip, Alert } from '@mui/material';
import CheckIcon from '@mui/icons-material/CheckCircle';
import StarIcon from '@mui/icons-material/Star';
import { Title, useNotify } from 'react-admin';
import { useSearchParams } from 'react-router-dom';
import { API_URL, token } from '../config';

interface Status { active: boolean; planExpiresAt: string | null; examsCount: number; freeExamLimit: number; }
interface PlanInfo { plans: { id: string; label: string; price: number; periodDays: number }[]; freeExamLimit: number; mercadoPagoEnabled: boolean; }

export const PlansPage = () => {
  const notify = useNotify();
  const [params] = useSearchParams();
  const [status, setStatus] = useState<Status | null>(null);
  const [plans, setPlans] = useState<PlanInfo | null>(null);
  const [loading, setLoading] = useState('');

  const load = async () => {
    const h = { Authorization: `Bearer ${token()}` };
    const [s, p] = await Promise.all([
      fetch(`${API_URL}/billing/status`, { headers: h }),
      fetch(`${API_URL}/billing/plans`),
    ]);
    if (s.ok) setStatus(await s.json());
    if (p.ok) setPlans(await p.json());
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  useEffect(() => {
    if (params.get('status') === 'success') notify('Pagamento aprovado! Seu plano está ativo. 🎉', { type: 'success' });
    if (params.get('status') === 'failure') notify('Pagamento não concluído.', { type: 'error' });
  }, [params, notify]);

  const subscribe = async (planId: string) => {
    setLoading(planId);
    try {
      const r = await fetch(`${API_URL}/billing/checkout`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ plan: planId }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Falha');
      if (d.init_point) window.location.href = d.init_point; // vai pro checkout do Mercado Pago
    } catch (e: any) {
      notify(e.message, { type: 'error' });
    } finally { setLoading(''); }
  };

  const fmt = (d: string) => new Date(d).toLocaleDateString('pt-BR');

  return (
    <Box sx={{ maxWidth: 820, mx: 'auto', p: { xs: 1, md: 2 } }}>
      <Title title="Planos" />
      {status?.active && (
        <Alert severity="success" sx={{ mb: 2 }} icon={<CheckIcon />}>
          Plano <strong>Premium ativo</strong> até {status.planExpiresAt ? fmt(status.planExpiresAt) : '—'}. Obrigado! 🩺
        </Alert>
      )}
      {status && !status.active && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Você usou <strong>{Math.min(status.examsCount, status.freeExamLimit)}/{status.freeExamLimit}</strong> exames gratuitos.
          Assine para enviar exames ilimitados + comparativo + chat + tudo.
        </Alert>
      )}

      <Grid container spacing={2}>
        {plans?.plans.map((plan) => {
          const annual = plan.id === 'annual';
          return (
            <Grid size={{ xs: 12, md: 6 }} key={plan.id}>
              <Card sx={{ border: annual ? '2px solid #0b5cab' : '1px solid #ddd', position: 'relative' }}>
                {annual && <Chip color="primary" label="MAIS VANTAJOSO" size="small" sx={{ position: 'absolute', top: 12, right: 12 }} />}
                <CardContent>
                  <Typography variant="h5">{annual ? <StarIcon sx={{ verticalAlign: 'middle', color: '#0b5cab' }} /> : null} Premium {plan.label}</Typography>
                  <Typography variant="h3" sx={{ my: 1 }}>R$ {plan.price.toFixed(2).replace('.', ',')}</Typography>
                  <Typography color="text.secondary">{annual ? '/ ano (economize ~38%)' : '/ mês'}</Typography>
                  <Box component="ul" sx={{ pl: 2, mt: 2, mb: 2, lineHeight: 1.8 }}>
                    <li>Exames ilimitados</li>
                    <li>Comparativo anterior × atual</li>
                    <li>Tendências e Score de saúde</li>
                    <li>Dr. Exame (voz) e Imprimir/PDF</li>
                    <li>Chat com a IA</li>
                    <li>Dependentes (familiares)</li>
                  </Box>
                  <Button variant={annual ? 'contained' : 'outlined'} size="large" fullWidth disabled={!plans.mercadoPagoEnabled || !!loading}
                    onClick={() => subscribe(plan.id)}>
                    {loading === plan.id ? 'Abrindo Mercado Pago…' : (plans.mercadoPagoEnabled ? 'Assinar' : 'Em breve')}
                  </Button>
                </CardContent>
              </Card>
            </Grid>
          );
        })}
      </Grid>
      {!plans?.mercadoPagoEnabled && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
          (Em ambiente de teste os pagamentos estão desativados. Em produção usamos o mesmo Mercado Pago da sua loja.)
        </Typography>
      )}
    </Box>
  );
};
