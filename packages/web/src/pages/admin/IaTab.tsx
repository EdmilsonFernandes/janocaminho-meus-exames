import { useEffect, useState } from 'react';
import { Box, Typography, Card, CardContent, Stack, Chip, Alert, FormControl, InputLabel, Select, MenuItem, TextField, OutlinedInput, Button } from '@mui/material';
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';
import { API_URL, token } from '../../config';
import { TabLoader, SectionError } from './parts';
const H = () => ({ Authorization: `Bearer ${token()}` });

const PROVIDER_LABEL: Record<string, string> = {
  anthropic: 'Anthropic (Z.ai · GLM)',
  openai: 'OpenAI',
  gemini: 'Google Gemini',
};

/** Card "Provedor de IA" — troca provider/chave em runtime (banco), com teste de conexão.
 *  A chave é cifrada e nunca volta completa (só ••••1234). Campos vazios = usa .env. */
const AiProviderCard = () => {
  const [cfg, setCfg] = useState<any>(null);
  const [provider, setProvider] = useState('anthropic');
  const [baseURL, setBaseURL] = useState('');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const apply = (j: any) => {
    setCfg(j);
    setProvider(j.activeProvider);
    const row = (j.providers as any[])?.find((p) => p.provider === j.activeProvider);
    setBaseURL(row?.baseURL ?? '');
    setModel(row?.model ?? '');
    setApiKey('');
  };
  const load = async () => { try { const r = await fetch(`${API_URL}/admin/ai-config`, { headers: H() }); if (!r.ok) throw 0; apply(await r.json()); } catch {} };
  useEffect(() => { load(); }, []);

  const onProviderChange = (p: string) => {
    setProvider(p);
    const row = (cfg?.providers as any[])?.find((x) => x.provider === p);
    setBaseURL(row?.baseURL ?? ''); setModel(row?.model ?? ''); setApiKey(''); setTestResult(null); setMsg(null);
  };

  const test = async () => {
    setTesting(true); setTestResult(null); setMsg(null);
    try {
      const r = await fetch(`${API_URL}/admin/ai-config/test`, { method: 'POST', headers: { ...H(), 'Content-Type': 'application/json' }, body: JSON.stringify({ provider, apiKey: apiKey || undefined, baseURL, model }) });
      setTestResult(await r.json());
    } catch { setTestResult({ ok: false, error: 'Falha de rede.' }); }
    setTesting(false);
  };

  const save = async () => {
    setSaving(true); setMsg(null);
    try {
      const r = await fetch(`${API_URL}/admin/ai-config`, { method: 'PATCH', headers: { ...H(), 'Content-Type': 'application/json' }, body: JSON.stringify({ provider, apiKey: apiKey || undefined, baseURL, model }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Erro ao salvar');
      apply(j);
      setMsg({ ok: true, text: `Salvo · ativo: ${PROVIDER_LABEL[j.activeProvider] ?? j.activeProvider}` });
    } catch (e: any) { setMsg({ ok: false, text: e?.message || 'Erro ao salvar' }); }
    setSaving(false);
  };

  const activeRow = (cfg?.providers as any[])?.find((p) => p.provider === cfg?.activeProvider);
  const phModel = provider === 'anthropic' ? 'glm-4.6' : provider === 'openai' ? 'gpt-4o-mini' : 'gemini-2.0-flash';
  const phBase = provider === 'anthropic' ? 'https://api.z.ai/api/anthropic' : provider === 'openai' ? 'https://api.openai.com/v1' : '(endpoint fixo)';

  return (
    <Card variant="outlined" sx={{ borderRadius: 2, mb: 2 }}>
      <CardContent>
        <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 1 }}>
          <Typography sx={{ fontWeight: 800, flex: 1 }}>🤖 Provedor de IA (Dr. Exame)</Typography>
          {cfg && <Chip size="small" color="success" variant="outlined" label={`Ativo: ${PROVIDER_LABEL[cfg.activeProvider] ?? cfg.activeProvider}`} />}
        </Stack>
        <Alert severity="info" sx={{ mb: 1.5, fontSize: 13 }}>Troca em <strong>tempo real</strong> (sem restart/deploy). Campos vazios = usa o <strong>.env</strong>. A chave é <strong>cifrada</strong> no banco e nunca volta completa.</Alert>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5, mb: 1.5 }}>
          <FormControl size="small" fullWidth>
            <InputLabel>Provedor</InputLabel>
            <Select value={provider} label="Provedor" onChange={(e) => onProviderChange(String(e.target.value))}>
              <MenuItem value="anthropic">Anthropic (Z.ai · GLM)</MenuItem>
              <MenuItem value="openai">OpenAI</MenuItem>
              <MenuItem value="gemini">Google Gemini</MenuItem>
            </Select>
          </FormControl>
          <TextField size="small" label="Modelo" value={model} onChange={(e) => setModel(e.target.value)} placeholder={phModel} />
          <TextField size="small" label="Base URL" value={baseURL} onChange={(e) => setBaseURL(e.target.value)} placeholder={phBase} disabled={provider === 'gemini'} />
          <OutlinedInput size="small" type="password" placeholder={activeRow?.keyMasked ? `${activeRow.keyMasked} · deixar vazio mantém` : 'Cole a chave (API key)'} value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
        </Box>
        <Stack direction="row" gap={1} flexWrap="wrap" alignItems="center">
          <Button size="small" variant="outlined" onClick={test} disabled={testing} startIcon={<BoltOutlinedIcon />}>{testing ? 'Testando…' : 'Testar conexão'}</Button>
          <Button size="small" variant="contained" onClick={save} disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</Button>
          {testResult && (testResult.ok
            ? <Chip size="small" color="success" label={`✅ OK · ${testResult.latencyMs}ms · ${testResult.model}`} />
            : <Chip size="small" color="error" label={`❌ ${String(testResult.error).slice(0, 80)}`} />)}
          {msg && <Alert severity={msg.ok ? 'success' : 'error'} sx={{ py: 0, fontSize: 13 }}>{msg.text}</Alert>}
        </Stack>
      </CardContent>
    </Card>
  );
};

/** IA & Alertas — config do provedor (topo) + volume (ai_analyses) + custo/latência (AiUsageLog). */
export const IaTab = () => {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState(false);
  const load = () => { setErr(false); fetch(`${API_URL}/admin/ia-usage`, { headers: H() }).then((r) => r.ok ? r.json() : Promise.reject()).then(setD).catch(() => setErr(true)); };
  useEffect(load, []);
  if (!d && !err) return <TabLoader />;
  if (err) return <SectionError message="Não foi possível carregar o uso de IA." onRetry={load} />;
  return (
    <Box>
      <AiProviderCard />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: '1fr 1fr 1fr 1fr' }, gap: 1.5, mb: 2 }}>
        {[
          { l: 'Análises IA', v: String(d.analysesCount ?? 0) },
          { l: 'Custo total (R$)', v: (d.totalCost ?? 0).toFixed(2), sub: d.totalLogs ? `${d.totalLogs} logs` : 'sem logs' },
          { l: 'Tokens', v: String(d.totalTokens ?? 0) },
          { l: 'Latência média', v: `${d.avgLatency ?? 0}ms` },
        ].map((k) => (
          <Card key={k.l} variant="outlined" sx={{ borderRadius: 2 }}><CardContent sx={{ textAlign: 'center', py: 1.5 }}>
            <Typography sx={{ fontWeight: 800, fontSize: 20, color: '#178f89' }}>{k.v}</Typography>
            <Typography variant="caption" color="text.secondary">{k.l}{k.sub ? ` (${k.sub})` : ''}</Typography>
          </CardContent></Card>
        ))}
      </Box>
      {d.totalLogs === 0 && <Alert severity="info" sx={{ mb: 2 }}>Custo/latência exigem logar cada chamada de IA no <strong>AiUsageLog</strong> (próximo passo). Hoje: volume.</Alert>}
      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 2 }}>
        {d.byModel?.map((m: any) => <Chip key={m.modelUsed} size="small" variant="outlined" label={`${m.modelUsed ?? '?'}: ${m._count}`} />)}
      </Stack>
      <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 800 }}>Análises recentes</Typography>
      <Stack spacing={1}>
        {d.recent?.map((a: any) => (
          <Card key={a.id} variant="outlined" sx={{ borderRadius: 2 }}><CardContent sx={{ py: 1.25, '&:last-child': { pb: 1.25 } }}>
            <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
              <Chip size="small" label={a.type} variant="outlined" />
              <Typography sx={{ flex: 1, minWidth: 0, fontWeight: 600 }}>{a.exam?.title ?? 'Chat/relatório'}</Typography>
              <Typography variant="caption" color="text.secondary">{a.modelUsed ?? '?'} · {new Date(a.createdAt).toLocaleDateString('pt-BR')}</Typography>
            </Stack>
          </CardContent></Card>
        ))}
      </Stack>
    </Box>
  );
};
