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
  const [badges, setBadges] = useState<any[]>([]);
  const [savingBadges, setSavingBadges] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true); setError(false);
    try {
      const r = await fetch(`${API_URL}/admin/config`, { headers: { Authorization: `Bearer ${token()}` } });
      if (r.ok) { const c = await r.json(); setConfig(c); setBadges(Array.isArray(c?.badges) ? c.badges : []); } else setError(true);
    } catch { setError(true); }
    setLoading(false);
  };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, []);
  useEffect(() => { if (config) setPricing(normConfig(config)); /* eslint-disable-next-line */ }, [config]);

  const saveBadges = async () => {
    if (!badges.length) return;
    setSavingBadges(true);
    try {
      const r = await fetch(`${API_URL}/admin/config/costs`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ category: 'badges', value: badges }),
      });
      if (r.ok) { notify('Conquistas salvas!', { type: 'success' }); await load(); }
      else notify('Erro ao salvar conquistas.', { type: 'error' });
    } catch { notify('Erro de rede ao salvar.', { type: 'error' }); }
    setSavingBadges(false);
  };

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
    <>
    <Card sx={{ borderRadius: 4 }}>
      <CardContent>
        <Stack spacing={4}>
          {PRICING_GROUPS.map(g => (
            <Box key={g.cat}>
              <Typography variant="h6">{g.title}</Typography>
              {g.hint && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>{g.hint}</Typography>}
              <Stack spacing={2} sx={{ mt: g.hint ? 0 : 2 }}>
                {g.fields.map(([key, label]) => (
                  <Stack key={key} direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }} useFlexGap flexWrap="wrap">
                    <Typography sx={{ flex: { sm: 1 }, minWidth: { sm: 200 }, width: { xs: '100%' } }}>{label}</Typography>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ width: { xs: '100%', sm: 'auto' } }}>
                      <TextField type="number" size="small" sx={{ width: { xs: '100%', sm: 100 } }}
                        value={pricing[g.cat]?.[key] ?? ''}
                        onChange={(e) => setPricing((prev: any) => prev ? { ...prev, [g.cat]: { ...prev[g.cat], [key]: e.target.value } } : prev)} />
                      {g.unit && <span style={{ fontSize: 13, color: '#888', whiteSpace: 'nowrap' }}>{g.unit}</span>}
                    </Stack>
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

    {/* CONQUISTAS — editável: emoji, título, descrição, threshold, recompensa */}
    {badges.length > 0 && (
      <Card sx={{ borderRadius: 4, mt: 3 }}>
        <CardContent>
          <Typography variant="h6">🏆 Conquistas (gamificação)</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
            Edite nomes, valores e dificuldade. Salva tudo de uma vez no banco.
          </Typography>
          <Stack spacing={2}>
            {badges.map((b, i) => (
              <Stack key={b.id ?? i} direction={{ xs: 'column', sm: 'row' }} spacing={1.5} useFlexGap flexWrap="wrap" alignItems={{ xs: 'stretch', sm: 'center' }}
                sx={{ pb: 1.5, borderBottom: i < badges.length - 1 ? '1px solid #f0f0f0' : 'none' }}>
                <TextField label="Emoji" size="small" sx={{ width: { xs: '100%', sm: 70 } }} value={b.emoji ?? ''}
                  onChange={(e) => setBadges(prev => prev.map((x, j) => j === i ? { ...x, emoji: e.target.value } : x))} />
                <TextField label="Título" size="small" sx={{ flex: { sm: '1 1 140px' }, width: { xs: '100%', sm: 'auto' } }} value={b.title ?? ''}
                  onChange={(e) => setBadges(prev => prev.map((x, j) => j === i ? { ...x, title: e.target.value } : x))} />
                <TextField label="Descrição" size="small" sx={{ flex: { sm: '1 1 200px' }, width: { xs: '100%', sm: 'auto' } }} value={b.desc ?? ''}
                  onChange={(e) => setBadges(prev => prev.map((x, j) => j === i ? { ...x, desc: e.target.value } : x))} />
                <TextField label="Meta" type="number" size="small" sx={{ width: { xs: '100%', sm: 80 } }} value={b.threshold ?? 0}
                  onChange={(e) => setBadges(prev => prev.map((x, j) => j === i ? { ...x, threshold: Number(e.target.value) } : x))} />
                <TextField label="💎 Recompensa" type="number" size="small" sx={{ width: { xs: '100%', sm: 90 } }} value={b.reward ?? 0}
                  onChange={(e) => setBadges(prev => prev.map((x, j) => j === i ? { ...x, reward: Number(e.target.value) } : x))} />
              </Stack>
            ))}
          </Stack>
          <Box sx={{ mt: 2.5 }}>
            <Button variant="contained" onClick={() => void saveBadges()} disabled={savingBadges}
              startIcon={savingBadges ? <CircularProgress size={16} color="inherit" /> : undefined}>
              {savingBadges ? 'Salvando…' : 'Salvar conquistas'}
            </Button>
          </Box>
        </CardContent>
      </Card>
    )}
    </>
  );
};
