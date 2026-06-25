import { useEffect, useState } from 'react';
import { Card, CardContent, Typography, Stack, Box, TextField, Button, CircularProgress } from '@mui/material';
import { useNotify } from 'react-admin';
import { API_URL, token } from '../../config';
import { TabLoader, SectionError } from './parts';

const normConfig = (c: any) => ({
  creditCosts: { chat: 0, summary: 0, consolidated: 0, extraction: 0, ...(c?.creditCosts ?? {}) },
  uploadRules: { freeCost: 0, premiumFreeQuota: 0, premiumCost: 0, ...(c?.uploadRules ?? {}) },
  shares: { exams: 0, evolution: 0, alerts: 0, summary: 0, ...(c?.shares ?? {}) },
  grants: { freeSignup: 0, monthly: 0, freeExamLimit: 0, ...(c?.grants ?? {}) },
});

type PricingCat = keyof ReturnType<typeof normConfig>;

const PRICING_GROUPS: { cat: PricingCat; title: string; hint?: string; unit?: string; fields: [string, string][] }[] = [
  { cat: 'creditCosts', title: 'Custos de créditos (por ação de IA)', unit: 'créditos',
    hint: 'Edite e salve tudo de uma vez — persiste no banco (sobrevive a restart/redeploy, sem mexer em código).',
    fields: [['chat', '💬 Chat com IA (por pergunta)'], ['summary', '📄 Resumo de exame'], ['consolidated', '🧾 Relatório consolidado'], ['extraction', '📤 Upload de exame (0 = grátis)']] },
  { cat: 'uploadRules', title: 'Regras de envio de exame',
    hint: 'Free: créditos por envio. Premium: X envios grátis/mês por dependente, depois Y cada.',
    fields: [['freeCost', 'Free: créditos por envio'], ['premiumFreeQuota', 'Premium: envios grátis/mês'], ['premiumCost', 'Premium: créditos após a cota']] },
  { cat: 'shares', title: 'Custo de compartilhar com médico (por escopo)', unit: 'créditos',
    hint: 'Soma dos escopos selecionados ao criar um compartilhamento. Reativar/editar = grátis.',
    fields: [['exams', '📋 Exames'], ['evolution', '📈 Evolução'], ['alerts', '🚨 Alertas'], ['summary', '🤖 Resumos IA']] },
  { cat: 'grants', title: 'Créditos (cadastro / mensal / limite)',
    fields: [['freeSignup', '🆕 Créditos no cadastro (free)'], ['monthly', '💎 Créditos do plano mensal'], ['freeExamLimit', '📤 Limite de exames grátis (paywall)']] },
];

export const PricingTab = () => {
  const notify = useNotify();
  const [config, setConfig] = useState<any>(null);
  const [pricing, setPricing] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true); setError(false);
    try {
      const r = await fetch(`${API_URL}/admin/config`, { headers: { Authorization: `Bearer ${token()}` } });
      if (r.ok) setConfig(await r.json()); else setError(true);
    } catch { setError(true); }
    setLoading(false);
  };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, []);
  useEffect(() => { if (config) setPricing(normConfig(config)); /* eslint-disable-next-line */ }, [config]);

  const savePricing = async () => {
    if (!pricing) return;
    setSaving(true);
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` };
    const results = await Promise.all(PRICING_GROUPS.map(g =>
      fetch(`${API_URL}/admin/config/costs`, {
        method: 'PATCH', headers,
        body: JSON.stringify({ category: g.cat, ...Object.fromEntries(g.fields.map(([k]) => [k, Number(pricing[g.cat]?.[k] ?? 0)])) }),
      }).then(r => r.ok).catch(() => false)
    ));
    setSaving(false);
    if (results.every(Boolean)) { notify('Precificação salva!', { type: 'success' }); await load(); }
    else notify('Erro ao salvar (alguma seção pode ter falhado).', { type: 'error' });
  };

  if (loading) return <TabLoader />;
  if (error) return <SectionError message="Não foi possível carregar a configuração de preços." onRetry={() => void load()} />;
  if (!pricing) return <TabLoader />;
  const pricingDirty = !!(pricing && config && JSON.stringify(pricing) !== JSON.stringify(normConfig(config)));

  return (
    <Card sx={{ borderRadius: 4 }}>
      <CardContent>
        <Stack spacing={4}>
          {PRICING_GROUPS.map(g => (
            <Box key={g.cat}>
              <Typography variant="h6">{g.title}</Typography>
              {g.hint && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>{g.hint}</Typography>}
              <Stack spacing={2} sx={{ mt: g.hint ? 0 : 2 }}>
                {g.fields.map(([key, label]) => (
                  <Stack key={key} direction="row" spacing={2} alignItems="center" useFlexGap flexWrap="wrap">
                    <Typography sx={{ flex: 1, minWidth: 200 }}>{label}</Typography>
                    <TextField type="number" size="small" sx={{ width: 100 }}
                      value={pricing[g.cat]?.[key] ?? ''}
                      onChange={(e) => setPricing((prev: any) => prev ? { ...prev, [g.cat]: { ...prev[g.cat], [key]: e.target.value } } : prev)} />
                    {g.unit && <span style={{ fontSize: 13, color: '#888' }}>{g.unit}</span>}
                  </Stack>
                ))}
              </Stack>
            </Box>
          ))}
        </Stack>
        <Box sx={{ mt: 3, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Button variant="contained" onClick={() => void savePricing()} disabled={!pricingDirty || saving}
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}>
            {saving ? 'Salvando…' : 'Salvar tudo'}
          </Button>
          {pricingDirty
            ? <Typography variant="caption" color="warning.main">● alterações não salvas</Typography>
            : <Typography variant="caption" color="text.secondary">Tudo salvo.</Typography>}
        </Box>
      </CardContent>
    </Card>
  );
};
