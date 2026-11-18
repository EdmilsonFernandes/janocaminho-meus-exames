import { useEffect, useState } from 'react';
import { Box, Typography, Card, CardContent, Stack, Chip, Alert, FormControl, InputLabel, Select, MenuItem, TextField, OutlinedInput, Button, IconButton, Dialog, DialogTitle, DialogContent, DialogActions, Switch } from '@mui/material';
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';
import RefreshOutlinedIcon from '@mui/icons-material/RefreshOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import { useNotify } from 'react-admin';
import { API_URL, token } from '../../config';
import { TabLoader, SectionError, ConfirmDialog, FEATURE_LABELS } from './parts';
import { tealText } from '../../theme';
const H = () => ({ Authorization: `Bearer ${token()}` });

const PROVIDER_LABEL: Record<string, string> = {
  anthropic: 'Anthropic (Z.ai · GLM)',
  openai: 'OpenAI',
  gemini: 'Google Gemini',
};

/** Card "Provedor de IA" — troca provider/chave/modelo em runtime (banco), com teste de conexão.
 *  Modelo = catálogo (ai_models), editável no painel "Gerenciar modelos". Chave cifrada. */
const AiProviderCard = () => {
  const [cfg, setCfg] = useState<any>(null);
  const [provider, setProvider] = useState('anthropic');
  const [managing, setManaging] = useState<string | null>(null);
  const [baseURL, setBaseURL] = useState('');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // catálogo de modelos (dropdown editável por provedor)
  const [models, setModels] = useState<any[]>([]);
  const [mgmtOpen, setMgmtOpen] = useState(false);
  const [newM, setNewM] = useState('');
  const [newL, setNewL] = useState('');
  const [addBusy, setAddBusy] = useState(false);
  const [delModel, setDelModel] = useState<any | null>(null);
  // Panorama dos providers (17/11): teste rápido POR TILE (usa a config SALVA) + flag de ativação.
  const [tileTest, setTileTest] = useState<Record<string, any>>({});
  const [activating, setActivating] = useState(true);
  const quickTest = async (p: string) => {
    setTileTest((t) => ({ ...t, [p]: { busy: true } }));
    try {
      const r = await fetch(`${API_URL}/admin/ai-config/test`, { method: 'POST', headers: { ...H(), 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: p }) });
      const j = await r.json();
      setTileTest((t) => ({ ...t, [p]: j }));
    } catch { setTileTest((t) => ({ ...t, [p]: { ok: false, error: 'Falha de rede.' } })); }
  };
  const saveChatProvider = async (v: string) => {
    setMsg(null);
    try {
      const r = await fetch(`${API_URL}/admin/ai-config`, { method: 'PATCH', headers: { ...H(), 'Content-Type': 'application/json' }, body: JSON.stringify({ chatProvider: v || null }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Erro ao salvar rota do chat');
      apply(j);
      setMsg({ ok: true, text: `💬 Chat atendido por: ${v ? (PROVIDER_LABEL[v] ?? v) : 'mesmo do motor'}` });
    } catch (e: any) { setMsg({ ok: false, text: e?.message || 'Erro ao salvar rota do chat' }); }
  };

  const fetchModels = async () => { try { const r = await fetch(`${API_URL}/admin/ai-models`, { headers: H() }); if (r.ok) setModels(await r.json()); } catch {} };
  const apply = (j: any) => {
    setCfg(j);
    setProvider(j.activeProvider);
    const row = (j.providers as any[])?.find((p) => p.provider === j.activeProvider);
    setBaseURL(row?.baseURL ?? '');
    setModel(row?.model ?? '');
    setApiKey('');
  };
  const load = async () => {
    try { const r = await fetch(`${API_URL}/admin/ai-config`, { headers: H() }); if (!r.ok) throw 0; apply(await r.json()); } catch {}
    fetchModels();
  };
  useEffect(() => { load(); }, []);

  const modelsFor = models.filter((m) => m.provider === provider);
  const modelInList = modelsFor.some((m) => m.model === model);

  const onProviderChange = (p: string) => {
    setProvider(p);
    setManaging(p);
    const row = (cfg?.providers as any[])?.find((x) => x.provider === p);
    setBaseURL(row?.baseURL ?? ''); setModel(row?.model ?? ''); setApiKey(''); setTestResult(null); setMsg(null); setMgmtOpen(false);
    setActivating(cfg?.activeProvider === p);
  };
  const onModelChange = (v: string) => {
    if (v === '__new__') { setMgmtOpen(true); return; }
    setModel(v); setTestResult(null); setMsg(null);
  };
  const addModel = async () => {
    const m = newM.trim(); if (!m) return;
    setAddBusy(true);
    try {
      const r = await fetch(`${API_URL}/admin/ai-models`, { method: 'POST', headers: { ...H(), 'Content-Type': 'application/json' }, body: JSON.stringify({ provider, model: m, label: newL.trim() || m }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Erro ao adicionar');
      await fetchModels(); setModel(m); setNewM(''); setNewL('');
    } catch (e: any) { setMsg({ ok: false, text: e?.message || 'Erro ao adicionar modelo' }); }
    setAddBusy(false);
  };
  const removeModel = async (id: string) => { try { await fetch(`${API_URL}/admin/ai-models/${id}`, { method: 'DELETE', headers: H() }); await fetchModels(); } catch {} };

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
      const r = await fetch(`${API_URL}/admin/ai-config`, { method: 'PATCH', headers: { ...H(), 'Content-Type': 'application/json' }, body: JSON.stringify({ provider, apiKey: apiKey || undefined, baseURL, model, activate: activating }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Erro ao salvar');
      apply(j);
      setActivating(j.activeProvider === provider);
      setMsg({ ok: true, text: `Salvo · ativo: ${PROVIDER_LABEL[j.activeProvider] ?? j.activeProvider}` });
    } catch (e: any) { setMsg({ ok: false, text: e?.message || 'Erro ao salvar' }); }
    setSaving(false);
  };

  const activeRow = (cfg?.providers as any[])?.find((p) => p.provider === cfg?.activeProvider);
  const phBase = provider === 'anthropic' ? 'https://api.z.ai/api/anthropic' : provider === 'openai' ? 'https://api.openai.com/v1' : '(endpoint fixo)';

  return (
    <Card variant="outlined" sx={{ borderRadius: '12px', mb: 2 }}>
      <CardContent>
        <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} gap={1} sx={{ mb: 1.25 }}>
          <Typography sx={{ fontWeight: 800, flex: 1, fontSize: 16 }}>🤖 Motores de IA</Typography>
          {cfg && (
            <FormControl size="small" sx={{ minWidth: 210 }}>
              <InputLabel sx={{ fontSize: 13 }}>💬 Chat atendido por</InputLabel>
              <Select value={cfg.chatProvider ?? ''} label="💬 Chat atendido por" onChange={(e) => saveChatProvider(String(e.target.value))}>
                <MenuItem value=""><em>Mesmo do motor ({PROVIDER_LABEL[cfg.activeProvider] ?? cfg.activeProvider})</em></MenuItem>
                {(cfg.providers as any[]).filter((p) => p.keyMasked || p.provider === cfg.activeProvider).map((p) => (
                  <MenuItem key={p.provider} value={p.provider}>{PROVIDER_LABEL[p.provider] ?? p.provider}</MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
        </Stack>

        {/* Panorama: 1 linha por motor — papel em linguagem de gente, chave, testar, gerenciar. */}
        <Stack spacing={1} sx={{ mb: 1 }}>
          {(cfg?.providers as any[] | undefined)?.map((p) => {
            const isMotor = p.provider === cfg.activeProvider;
            const chatWho = cfg.chatProvider ?? cfg.activeProvider;
            const isChat = p.provider === chatWho;
            const papel = isMotor
              ? 'Lê os exames e gera as análises clínicas'
              : isChat ? 'Conversa com o paciente · dicas diárias'
              : p.keyMasked ? 'Plano B — assume sozinho se os outros caírem' : 'Reserva (sem chave)';
            const tt = tileTest[p.provider];
            return (
              <Box key={p.provider} sx={{ p: 1.5, borderRadius: '12px', border: '1px solid', borderColor: managing === p.provider ? 'rgba(32,178,170,.55)' : 'divider', bgcolor: managing === p.provider ? 'rgba(32,178,170,.05)' : 'transparent' }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 1, sm: 1.5 }} alignItems={{ sm: 'center' }}>
                  <Box sx={{ flexShrink: 0, width: 40, height: 40, borderRadius: '11px', display: 'grid', placeItems: 'center', fontSize: 20, bgcolor: 'rgba(32,178,170,.12)', border: '1px solid rgba(32,178,170,.25)' }}>
                    {p.provider === 'gemini' ? '✨' : p.provider === 'openai' ? '🟢' : '🔷'}
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Stack direction="row" alignItems="center" spacing={0.75} useFlexGap flexWrap="wrap">
                      <Typography sx={{ fontWeight: 800, fontSize: 14 }}>{PROVIDER_LABEL[p.provider] ?? p.provider}</Typography>
                      {isMotor && <Chip size="small" label="🔧 motor da extração" sx={{ height: 20, fontSize: 10, fontWeight: 800, bgcolor: 'rgba(32,178,170,.16)', color: (t) => tealText(t.palette.mode) }} />}
                      {isChat && !isMotor && <Chip size="small" label="💬 chat" sx={{ height: 20, fontSize: 10, fontWeight: 800, bgcolor: 'rgba(212,165,116,.2)', color: '#92600c' }} />}
                      {!p.keyMasked && <Chip size="small" label="sem chave" sx={{ height: 20, fontSize: 10, fontWeight: 800, bgcolor: 'action.hover', color: 'text.secondary' }} />}
                    </Stack>
                    <Typography sx={{ fontSize: 12.5, color: 'text.secondary', fontWeight: 600, mt: 0.25 }}>{papel}</Typography>
                    <Typography sx={{ fontSize: 11.5, color: 'text.secondary', fontFamily: 'monospace', mt: 0.15 }}>
                      {p.model ?? '—'}{p.keyMasked ? ` · ${p.keyMasked}` : ''}
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={0.75} alignItems="center" flexShrink={0}>
                    <Button size="small" variant="outlined" onClick={() => quickTest(p.provider)} disabled={tt?.busy} sx={{ textTransform: 'none', fontWeight: 700, borderRadius: '8px', minWidth: 0, px: 1.25 }}>
                      {tt?.busy ? '…' : '⚡ Testar'}
                    </Button>
                    <Button size="small" variant={managing === p.provider ? 'contained' : 'text'} onClick={() => (managing === p.provider ? setManaging(null) : onProviderChange(p.provider))} sx={{ textTransform: 'none', fontWeight: 700, px: 1.25 }}>
                      {managing === p.provider ? 'Fechar' : 'Gerenciar'}
                    </Button>
                  </Stack>
                </Stack>
                {tt && !tt.busy && (
                  <Alert severity={tt.ok ? 'success' : 'error'} sx={{ mt: 1, py: 0.25, fontSize: 12.5, '& .MuiAlert-message': { overflowWrap: 'anywhere' } }}>
                    {tt.ok ? `✅ Respondendo · ${tt.latencyMs}ms · ${tt.model}` : `❌ ${String(tt.error ?? 'falhou').slice(0, 220)}`}
                  </Alert>
                )}
              </Box>
            );
          })}
        </Stack>
        <Typography sx={{ fontSize: 12, color: 'text.secondary', lineHeight: 1.5, mb: managing ? 1.5 : 0 }}>
          ⚠️ Se um motor cair (limite/429), o próximo com chave assume <strong>sozinho</strong>. Problema na rua? <strong>Gerenciar → cola a chave nova → Salvar</strong> — vale na hora, sem reiniciar nada.
        </Typography>
        {Array.isArray(cfg?.usageToday) && cfg.usageToday.length > 0 && (
          <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" sx={{ mb: managing ? 1.5 : 0 }}>
            {cfg.usageToday.map((u: any) => (
              <Chip key={u.model} size="small" variant="outlined" label={`${u.model}: ${u.requests} hoje${u.errors ? ` · ${u.errors} erros` : ''}`} sx={{ height: 22, fontSize: 11, fontWeight: 700, fontFamily: 'monospace' }} />
            ))}
          </Stack>
        )}

        {managing && (
          <>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5, mb: 1.5 }}>
          <FormControl size="small" fullWidth>
            <InputLabel>Modelo</InputLabel>
            <Select value={model} label="Modelo" onChange={(e) => onModelChange(String(e.target.value))}>
              {!modelInList && model ? <MenuItem value={model}>{model} (atual)</MenuItem> : null}
              {modelsFor.map((m) => <MenuItem key={m.id} value={m.model}>{m.label}</MenuItem>)}
              <MenuItem value="__new__" sx={{ color: 'primary.main' }}>＋ Adicionar novo modelo…</MenuItem>
            </Select>
          </FormControl>
          <TextField size="small" label="Base URL" name="ai-base-url" autoComplete="off" value={baseURL} onChange={(e) => setBaseURL(e.target.value)} placeholder={phBase} disabled={provider === 'gemini'} />
          <OutlinedInput size="small" type="password" label="Chave (API key)" name="ai-api-key" autoComplete="new-password" placeholder={activeRow?.keyMasked ? `${activeRow.keyMasked} · deixar vazio mantém` : 'Cole a chave (API key)'} value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
        </Box>
        <Box sx={{ mb: 1 }}>
          <Button size="small" color="inherit" onClick={() => setMgmtOpen((v) => !v)} sx={{ textTransform: 'none' }}>
            {mgmtOpen ? '▾' : '▸'} Gerenciar modelos ({modelsFor.length})
          </Button>
        </Box>
        {mgmtOpen && (
          <Box sx={{ mb: 1.5, p: 1.5, border: 1, borderColor: 'divider', borderRadius: '8px' }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1, flexWrap: 'wrap', gap: 1 }}>
              <TextField size="small" label="ID do modelo" name="ai-new-model" autoComplete="off" placeholder="ex: gpt-5" value={newM} onChange={(e) => setNewM(e.target.value)} sx={{ flex: 1, minWidth: 120 }} />
              <TextField size="small" label="Rótulo (opcional)" name="ai-new-label" autoComplete="off" placeholder="ex: GPT-5" value={newL} onChange={(e) => setNewL(e.target.value)} sx={{ flex: 1, minWidth: 120 }} />
              <Button size="small" variant="contained" onClick={addModel} disabled={addBusy || !newM.trim()}>＋ Adicionar</Button>
            </Stack>
            {modelsFor.length === 0
              ? <Typography variant="caption" color="text.secondary">Nenhum modelo cadastrado pra este provedor ainda.</Typography>
              : <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
                  {modelsFor.map((m) => <Chip key={m.id} size="small" variant="outlined" label={m.label} onDelete={() => setDelModel(m)} />)}
                </Stack>}
          </Box>
        )}
        <Stack direction="row" gap={1} flexWrap="wrap" alignItems="center">
          <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mr: 0.5 }}>
            <Switch size="small" checked={activating} onChange={(e) => setActivating(e.target.checked)} disabled={cfg?.activeProvider === provider} />
            <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'text.secondary' }}>Tornar motor da extração</Typography>
          </Stack>
          <Button size="small" variant="outlined" onClick={test} disabled={testing} startIcon={<BoltOutlinedIcon />}>{testing ? 'Testando…' : 'Testar conexão'}</Button>
          <Button size="small" variant="contained" onClick={save} disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</Button>
          {testResult && (testResult.ok
            ? <Chip size="small" color="success" label={`✅ OK · ${testResult.latencyMs}ms · ${testResult.model}`} />
            : <Chip size="small" color="error" label="❌ Falhou no teste" />)}
          {msg && <Alert severity={msg.ok ? 'success' : 'error'} sx={{ py: 0, fontSize: 13 }}>{msg.text}</Alert>}
        </Stack>
        {testResult && !testResult.ok && (
          <Typography component="pre" sx={{ whiteSpace: 'pre-wrap', fontSize: 12, m: 0, mt: 1, color: 'error.main', overflowWrap: 'anywhere' }}>
            {String(testResult.error ?? 'Erro desconhecido.')}
          </Typography>
        )}
          </>
        )}
        <ConfirmDialog
          open={!!delModel} onClose={() => setDelModel(null)}
          title="Remover modelo?" desc={`"${delModel?.label ?? delModel?.model ?? ''}" sai do catálogo deste provedor.`}
          confirmLabel="Remover" tone="danger"
          onConfirm={() => { const id = delModel?.id; setDelModel(null); if (id) removeModel(id); }}
        />
      </CardContent>
    </Card>
  );
};

const COMPOUND_FIELDS: Array<[string, string]> = [
  ['oQueE', 'O que é'], ['noCorpo', 'O que faz no corpo'], ['porQueUsam', 'Por que alguém usa'],
  ['nosExames', 'O que muda nos exames'], ['riscos', 'Riscos subestimados'], ['levarAoMedico', 'Perguntas para o médico (separe com |)'],
];

/** Card "Radar Hormonal — explicações dos compostos": revisão humana dos 13 textos do botão "?".
 *  Editar grava como 'curado' (não é sobrescrito pela IA); regenerar chama a IA em 2º plano. */
const CompoundKnowledgeCard = () => {
  const notify = useNotify();
  const [rows, setRows] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = async () => {
    try {
      const r = await fetch(`${API_URL}/admin/compound-knowledge`, { headers: H() });
      setRows(r.ok ? await r.json() : []);
    } catch { setRows([]); }
  };
  useEffect(() => { void load(); }, []);

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const r = await fetch(`${API_URL}/admin/compound-knowledge/${editing.key}`, { method: 'PATCH', headers: { ...H(), 'Content-Type': 'application/json' }, body: JSON.stringify({ sections: draft }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || 'Falha ao salvar');
      notify(j.problems?.length ? `Salvo, mas as travas apontam: ${j.problems.join('; ')}` : 'Texto salvo como curado ✅', { type: j.problems?.length ? 'warning' : 'success' });
      setEditing(null);
      await load();
    } catch (e: any) { notify(e.message, { type: 'error' }); } finally { setSaving(false); }
  };

  const regenerate = async (key: string) => {
    setBusyKey(key);
    try {
      const r = await fetch(`${API_URL}/admin/compound-knowledge/${key}/regenerate`, { method: 'POST', headers: H() });
      if (!r.ok) throw new Error('Falha ao pedir a regeneração');
      notify('Gerando de novo pela IA — leva 1 a 2 minutos. Atualize a lista depois.', { type: 'info' });
    } catch (e: any) { notify(e.message, { type: 'error' }); } finally { setBusyKey(null); }
  };

  return (
    <Card sx={{ mt: 3 }}>
      <CardContent>
        <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1} sx={{ mb: 0.5 }}>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>💉 Radar Hormonal — explicações dos compostos</Typography>
          <Button size="small" startIcon={<RefreshOutlinedIcon />} onClick={() => void load()}>Atualizar</Button>
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Texto do botão "?" de cada composto, igual para todos os pacientes. A IA gera uma vez; ao editar, vira <b>curado</b> e a IA não sobrescreve mais. Vale revisão clínica.
        </Typography>
        <Stack spacing={1}>
          {rows.map((row) => (
            <Stack key={row.key} direction="row" alignItems="center" spacing={1} sx={{ p: 1, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontWeight: 700, fontSize: 14 }} noWrap>{row.name}</Typography>
                <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                  {row.sections ? String(row.sections.oQueE ?? '').slice(0, 110) : 'Ainda não gerado — o servidor gera sozinho após subir.'}
                </Typography>
                {row.problems?.length > 0 && <Typography variant="caption" color="warning.main" sx={{ display: 'block' }}>⚠️ {row.problems.join('; ')}</Typography>}
              </Box>
              <Chip size="small" label={row.source === 'curated' ? 'Curado' : row.source === 'ai' ? 'IA' : 'Pendente'} color={row.source === 'curated' ? 'success' : row.source === 'ai' ? 'default' : 'warning'} variant={row.source ? 'filled' : 'outlined'} />
              <IconButton size="small" aria-label={`Editar ${row.name}`} disabled={!row.sections} onClick={() => { setEditing(row); setDraft({ ...(row.sections ?? {}) }); }}><EditOutlinedIcon fontSize="small" /></IconButton>
              <IconButton size="small" aria-label={`Gerar de novo ${row.name}`} disabled={busyKey === row.key} onClick={() => void regenerate(row.key)}><BoltOutlinedIcon fontSize="small" /></IconButton>
            </Stack>
          ))}
          {rows.length === 0 && <Typography variant="body2" color="text.secondary">Não foi possível carregar a lista.</Typography>}
        </Stack>
        <Dialog open={!!editing} onClose={() => !saving && setEditing(null)} fullWidth maxWidth="md">
          <DialogTitle>{editing?.name}</DialogTitle>
          <DialogContent>
            <Alert severity="info" sx={{ mb: 2, fontSize: 13 }}>Sem dose, esquema de uso, ciclo/TPC, onde comprar, nem "é seguro/leve". A seção "Quando procurar atendimento" é fixa no app e não aparece aqui.</Alert>
            <Stack spacing={2}>
              {COMPOUND_FIELDS.map(([k, label]) => (
                <TextField key={k} label={label} multiline minRows={2} fullWidth value={draft[k] ?? ''} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} />
              ))}
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setEditing(null)} disabled={saving}>Cancelar</Button>
            <Button variant="contained" onClick={() => void save()} disabled={saving}>Salvar como curado</Button>
          </DialogActions>
        </Dialog>
      </CardContent>
    </Card>
  );
};

/** Card "Cache de explicações" — gerencia o exam_knowledge (explicações leigas reaproveitadas
 *  no /items/explain). Buscar, editar (vira 'curated'), regenerar via IA, deletar. */
const ExamKnowledgeCard = () => {
  const notify = useNotify();
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [source, setSource] = useState('');
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<any | null>(null);
  const [delRow, setDelRow] = useState<any | null>(null);
  const [draft, setDraft] = useState({ titulo: '', resumo: '', analogia: '', alterado: '' });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      if (source) params.set('source', source);
      const r = await fetch(`${API_URL}/admin/exam-knowledge?${params.toString()}`, { headers: H() });
      if (r.ok) setRows(await r.json()); else setRows([]);
    } catch { setRows([]); }
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const openEdit = (row: any) => {
    setEditing(row);
    setDraft({ titulo: row.titulo ?? '', resumo: row.resumo ?? '', analogia: row.analogia ?? '', alterado: row.alterado ?? '' });
  };
  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const r = await fetch(`${API_URL}/admin/exam-knowledge/${editing.id}`, {
        method: 'PATCH', headers: { ...H(), 'Content-Type': 'application/json' }, body: JSON.stringify(draft),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Erro ao salvar');
      setEditing(null); load();
    } catch (e: any) { notify(e?.message || 'Erro ao salvar explicação.', { type: 'error' }); }
    setSaving(false);
  };
  const regenerate = async (id: string) => {
    setBusyId(id);
    try { await fetch(`${API_URL}/admin/exam-knowledge/${id}/regenerate`, { method: 'POST', headers: H() }); await load(); } catch {}
    setBusyId(null);
  };
  const remove = async (id: string) => {
    try { await fetch(`${API_URL}/admin/exam-knowledge/${id}`, { method: 'DELETE', headers: H() }); await load(); } catch {}
  };

  return (
    <Card variant="outlined" sx={{ borderRadius: '12px', mb: 2 }}>
      <CardContent>
        <Typography sx={{ fontWeight: 800, mb: 0.5 }}>📚 Cache de explicações ({rows.length})</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
          Explicações leigas reaproveitadas no app (1ª geração via IA; próximas saem daqui). Editar marca como <strong>curada</strong>.
        </Typography>
        <Stack direction="row" spacing={1} sx={{ mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
          <TextField size="small" label="Buscar (nome/título)" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') load(); }} sx={{ flex: 1, minWidth: 180 }} />
          <FormControl size="small" sx={{ minWidth: 130 }}>
            <InputLabel>Origem</InputLabel>
            <Select value={source} label="Origem" onChange={(e) => { setSource(e.target.value); }}>
              <MenuItem value="">Todas</MenuItem>
              <MenuItem value="ai">IA</MenuItem>
              <MenuItem value="curated">Curada</MenuItem>
            </Select>
          </FormControl>
          <Button size="small" variant="outlined" onClick={load} disabled={loading}>{loading ? '...' : 'Buscar'}</Button>
        </Stack>

        {rows.length === 0 ? (
          <Typography variant="caption" color="text.secondary">Nenhuma explicação {source ? 'curada' : 'cacheada'} ainda.</Typography>
        ) : (
          <Stack spacing={1}>
            {rows.map((row) => (
              <Box key={row.id} sx={{ p: 1.25, border: 1, borderColor: 'divider', borderRadius: '8px' }}>
                <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
                  <Typography sx={{ flex: 1, minWidth: 0, fontWeight: 700 }}>{row.titulo || row.nameDisplay || row.nameKey}</Typography>
                  <Chip size="small" label={row.source === 'curated' ? 'Curada' : 'IA'} color={row.source === 'curated' ? 'warning' : 'default'} variant="outlined" />
                  <Typography variant="caption" color="text.secondary">{new Date(row.updatedAt).toLocaleDateString('pt-BR')}</Typography>
                  <IconButton size="small" title="Editar" onClick={() => openEdit(row)}><EditOutlinedIcon fontSize="small" /></IconButton>
                  <IconButton size="small" title="Regenerar via IA" onClick={() => regenerate(row.id)} disabled={busyId === row.id}><RefreshOutlinedIcon fontSize="small" /></IconButton>
                  <IconButton size="small" title="Remover" onClick={() => setDelRow(row)}><DeleteOutlinedIcon fontSize="small" /></IconButton>
                </Stack>
                {row.resumo && <Typography variant="body2" sx={{ mt: 0.5 }}>{row.resumo}</Typography>}
                {row.analogia && <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>💡 {row.analogia}</Typography>}
              </Box>
            ))}
          </Stack>
        )}

        <Dialog open={!!editing} onClose={() => setEditing(null)} fullWidth maxWidth="sm">
          <DialogTitle>Editar explicação{editing ? ` · ${editing.nameKey}` : ''}</DialogTitle>
          <DialogContent>
            <Stack spacing={1.5} sx={{ mt: 1 }}>
              <TextField size="small" label="Título (nome amigável)" value={draft.titulo} onChange={(e) => setDraft({ ...draft, titulo: e.target.value })} fullWidth />
              <TextField size="small" label="Resumo (o que mede)" value={draft.resumo} onChange={(e) => setDraft({ ...draft, resumo: e.target.value })} fullWidth multiline minRows={2} />
              <TextField size="small" label="Analogia" value={draft.analogia} onChange={(e) => setDraft({ ...draft, analogia: e.target.value })} fullWidth multiline minRows={2} />
              <TextField size="small" label="Se alterado (alto/baixo)" value={draft.alterado} onChange={(e) => setDraft({ ...draft, alterado: e.target.value })} fullWidth multiline minRows={2} />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setEditing(null)}>Cancelar</Button>
            <Button variant="contained" onClick={saveEdit} disabled={saving}>{saving ? 'Salvando…' : 'Salvar (cura)'}</Button>
          </DialogActions>
        </Dialog>
        <ConfirmDialog
          open={!!delRow} onClose={() => setDelRow(null)}
          title="Remover explicação?" desc={'O próximo clique no "?" vai regenerá-la via IA.'}
          confirmLabel="Remover" tone="danger"
          onConfirm={() => { const id = delRow?.id; setDelRow(null); if (id) remove(id); }}
        />
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
      <ExamKnowledgeCard />
      <CompoundKnowledgeCard />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: '1fr 1fr 1fr 1fr' }, gap: 1.5, mb: 2 }}>
        {[
          { l: 'Análises IA', v: String(d.analysesCount ?? 0) },
          { l: 'Custo total', v: (d.totalCost ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), sub: d.totalLogs ? `${d.totalLogs} registros` : 'sem registros' },
          { l: 'Tokens', v: String(d.totalTokens ?? 0) },
          { l: 'Latência média', v: `${d.avgLatency ?? 0}ms` },
        ].map((k) => (
          <Card key={k.l} variant="outlined" sx={{ borderRadius: '12px' }}><CardContent sx={{ textAlign: 'center', py: 1.5 }}>
            <Typography sx={{ fontWeight: 800, fontSize: 20, color: (t) => tealText(t.palette.mode) }}>{k.v}</Typography>
            <Typography variant="caption" color="text.secondary">{k.l}{k.sub ? ` · ${k.sub}` : ''}</Typography>
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
          <Card key={a.id} variant="outlined" sx={{ borderRadius: '12px' }}><CardContent sx={{ py: 1.25, '&:last-child': { pb: 1.25 } }}>
            <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
              <Chip size="small" label={FEATURE_LABELS[a.type] ?? a.type} variant="outlined" />
              <Typography sx={{ flex: 1, minWidth: 0, fontWeight: 600 }}>{a.exam?.title ?? 'Chat/relatório'}</Typography>
              <Typography variant="caption" color="text.secondary">{a.modelUsed ?? '?'} · {new Date(a.createdAt).toLocaleDateString('pt-BR')}</Typography>
            </Stack>
          </CardContent></Card>
        ))}
      </Stack>
    </Box>
  );
};
