import { useEffect, useState, useMemo } from 'react';
import { Box, Card, CardContent, Typography, Button, TextField, CircularProgress, Stack, Chip, Avatar, IconButton, Alert, Divider, Switch, FormControlLabel, MenuItem, Menu as MuiMenu, Dialog, DialogTitle, DialogContent, DialogActions, InputAdornment } from '@mui/material';
import { Title, useNotify } from 'react-admin';
import { API_URL, token } from '../config';
import { useSelectedPatient } from '../patient-context';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import BlockIcon from '@mui/icons-material/Block';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import SearchIcon from '@mui/icons-material/Search';
import { SPECIALTIES, CONVENIOS, UFS } from '../utils/medicalData';
import type { DoctorLookupResult, DoctorLookupSource } from '../types/doctor';

const SCOPE_META = [
  { key: 'exams', label: 'Exames', short: 'Exames', icon: '📋' },
  { key: 'evolution', label: 'Evolução', short: 'Evol.', icon: '📈' },
  { key: 'alerts', label: 'Alertas', short: 'Alertas', icon: '🚨' },
  { key: 'summary', label: 'Resumos IA', short: 'IA', icon: '✨' },
];

/** Toggle card de escopo — SEMPRE mostra label (mesmo compacto) + acende quando ativo. */
const ScopeToggle = ({ scopeKey, active, onToggle, compact }: { scopeKey: string; active: boolean; onToggle: (k: string) => void; compact?: boolean }) => {
  const meta = SCOPE_META.find((s) => s.key === scopeKey)!;
  return (
    <Box onClick={() => onToggle(scopeKey)} sx={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: compact ? 1 : 2,
      px: compact ? 0.75 : 1.5, py: compact ? 0.5 : 1, borderRadius: 2, cursor: 'pointer',
      minWidth: compact ? 58 : 72, transition: 'all .15s',
      bgcolor: active ? 'rgba(32,178,170,.10)' : '#f8fafb',
      border: active ? `2px solid #20b2aa` : '2px solid #e8eef0',
      '&:active': { transform: 'scale(.92)' },
    }}>
      <Box sx={{ fontSize: compact ? 15 : 22, filter: active ? 'none' : 'grayscale(1) opacity(.35)', lineHeight: 1 }}>{meta.icon}</Box>
      <Typography sx={{ fontSize: compact ? 8 : 10, fontWeight: 700, lineHeight: 1, whiteSpace: 'nowrap', color: active ? '#178f89' : '#94a3b8' }}>{compact ? meta.short : meta.label}</Typography>
      {active && <Box sx={{ width: 4, height: 4, borderRadius: '50%', bgcolor: '#10b981' }} />}
    </Box>
  );
};

export const MedicosPage = () => {
  const notify = useNotify();
  const [pid] = useSelectedPatient();
  const [shares, setShares] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  // Form state
  const [name, setName] = useState(''); const [crm, setCrm] = useState(''); const [uf, setUf] = useState(''); const [spec, setSpec] = useState(''); const [email, setEmail] = useState('');
  const [scopes, setScopes] = useState<string[]>([]);
  const [convenio, setConvenio] = useState('Particular');
  const [saving, setSaving] = useState(false);
  // Busca de CRM: base → CFM → manual
  const [looking, setLooking] = useState(false);
  const [lookup, setLookup] = useState<{ source: DoctorLookupSource; msg: string } | null>(null);
  const [specialtyOptions, setSpecialtyOptions] = useState<string[]>(SPECIALTIES);
  const [shareCosts, setShareCosts] = useState<Record<string, number>>({});
  const [credits, setCredits] = useState<number | null>(null);
  // Filtros
  const [search, setSearch] = useState('');
  const [specFilter, setSpecFilter] = useState('');
  const [activeOnly, setActiveOnly] = useState(false);
  // Menu ⋯
  const [menuEl, setMenuEl] = useState<{ id: string; el: HTMLElement } | null>(null);

  const load = () => {
    fetch(`${API_URL}/doctor-shares`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => r.json()).then((d) => { setShares(d.items ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    fetch(`${API_URL}/billing/plans`).then((r) => r.json()).then((d) => setShareCosts(d.shares ?? {})).catch(() => {});
    fetch(`${API_URL}/billing/status`, { headers: { Authorization: `Bearer ${token()}` } }).then((r) => r.json()).then((d) => setCredits(typeof d.credits === 'number' ? d.credits : null)).catch(() => {});
    // Especialidades = base ∪ distintas do banco (auto-alimentação).
    fetch(`${API_URL}/doctor/specialties`, { headers: { Authorization: `Bearer ${token()}` } }).then((r) => r.json()).then((d) => { if (Array.isArray(d.specialties)) setSpecialtyOptions(d.specialties); }).catch(() => {});
  }, []);

  // Busca médico por CRM+UF: nosso banco → CFM → manual. Preenche nome/especialidade.
  const buscarMedico = async () => {
    const c = crm.replace(/\D/g, '');
    if (!c || uf.length !== 2) { notify('Informe o CRM e selecione o estado (UF).', { type: 'warning' }); return; }
    setLooking(true); setLookup(null);
    try {
      const r = await fetch(`${API_URL}/doctor/lookup?crm=${encodeURIComponent(c)}&uf=${encodeURIComponent(uf)}`, { headers: { Authorization: `Bearer ${token()}` } });
      const d: DoctorLookupResult = await r.json();
      if (d.source === 'base' && d.doctor) { setName(d.doctor.name ?? name); setSpec(d.doctor.specialty ?? spec); setLookup({ source: 'base', msg: '✅ Médico já cadastrado na plataforma.' }); }
      else if (d.source === 'cfm' && d.doctor) { setName(d.doctor.name ?? name); setSpec(d.doctor.specialty ?? spec); setLookup({ source: 'cfm', msg: `🔍 Dados obtidos do CFM${d.doctor.situation ? ` • situação: ${d.doctor.situation}` : ''}.` }); }
      else { setLookup({ source: 'manual', msg: '✍️ Não encontrado — preencha o nome manualmente.' }); }
      // recarrega especialidades (o CFM pode ter adicionado uma nova)
      fetch(`${API_URL}/doctor/specialties`, { headers: { Authorization: `Bearer ${token()}` } }).then((r2) => r2.json()).then((dd) => { if (Array.isArray(dd.specialties)) setSpecialtyOptions(dd.specialties); }).catch(() => {});
    } catch { setLookup({ source: 'manual', msg: '✍️ Busca indisponível — preencha manualmente.' }); }
    finally { setLooking(false); }
  };

  const toggleScope = (k: string) => setScopes((s) => s.includes(k) ? s.filter((x) => x !== k) : [...s, k]);
  const shareCost = scopes.reduce((sum, k) => sum + (shareCosts[k] ?? 0), 0);
  const insufficient = credits != null && credits < shareCost;
  const existingDocs = useMemo(() => {
    const seen = new Set<string>(); const list: any[] = [];
    for (const s of shares) { const crm = s.doctor?.crm; if (crm && !seen.has(crm)) { seen.add(crm); list.push(s.doctor); } }
    return list;
  }, [shares]);
  const reuseDoc = (crmVal: string) => {
    const d = existingDocs.find((x) => x.crm === crmVal);
    if (!d) return;
    setName(d.name || '');
    const m = String(d.crm).match(/^(.*?)-([A-Za-z]{2})$/); // separa "XXXX-UF"
    if (m) { setCrm(m[1]); setUf(m[2].toUpperCase()); } else { setCrm(d.crm); setUf(''); }
    setSpec(d.specialty || '');
    setEmail(!d.email || d.email.includes('@invite') ? '' : d.email);
    setLookup({ source: 'base', msg: '✅ Médico já cadastrado na plataforma.' });
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!crm || uf.length !== 2) { notify('Informe o CRM e selecione o estado (UF).', { type: 'error' }); return; }
    if (!name) { notify('Informe o nome do médico (use "Buscar" ou preencha manualmente).', { type: 'error' }); return; }
    if (scopes.length === 0) { notify('Selecione ao menos um tipo de dado para compartilhar.', { type: 'error' }); return; }
    setSaving(true);
    try {
      const r = await fetch(`${API_URL}/doctor-shares`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` }, body: JSON.stringify({ doctorName: name, doctorCrm: crm.replace(/\D/g, ''), doctorUf: uf, doctorSpecialty: spec, doctorEmail: email, scopes, convenio, patientId: pid }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Falha');
      notify('Compartilhamento criado! O médico foi avisado por e-mail.', { type: 'success' });
      setShowForm(false); setName(''); setCrm(''); setUf(''); setSpec(''); setEmail(''); setScopes([]); setConvenio('Particular'); setLookup(null);
      load();
    } catch (e: any) { notify(e.message, { type: 'error' }); } finally { setSaving(false); }
  };
  const revoke = async (id: string) => {
    setMenuEl(null);
    if (!confirm('Revogar compartilhamento? O médico perderá acesso aos seus dados.')) return;
    await fetch(`${API_URL}/doctor-shares/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` }, body: JSON.stringify({ active: false }) });
    notify('Acesso revogado.', { type: 'success' }); load();
  };
  const reactivate = async (id: string) => {
    setMenuEl(null);
    await fetch(`${API_URL}/doctor-shares/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` }, body: JSON.stringify({ active: true }) });
    notify('Acesso reativado.', { type: 'success' }); load();
  };
  // EXCLUIR (diferente de revogar): remove o compartilhamento da lista. Se o médico for só um
  // cadastro de compartilhamento (sem conta ativa nem outros shares), o cadastro dele também sai.
  const deleteShare = async (id: string) => {
    setMenuEl(null);
    if (!confirm('EXCLUIR este compartilhamento? Diferente de revogar, isto APAGA o registro (some da lista). Se o médico não tiver conta ativa nem outros compartilhamentos, o cadastro dele também é removido. Continuar?')) return;
    const r = await fetch(`${API_URL}/doctor-shares/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } });
    if (r.ok) { notify('Compartilhamento excluído.', { type: 'success' }); load(); }
    else notify('Falha ao excluir.', { type: 'error' });
  };
  const updateScopes = async (id: string, newScopes: string[]) => {
    await fetch(`${API_URL}/doctor-shares/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` }, body: JSON.stringify({ scopes: newScopes }) });
    load();
  };

  // Filtro + agrupamento por especialidade
  const myShares = shares.filter((s) => !pid || s.patientId === pid);
  const specialties = useMemo(() => [...new Set(myShares.map((s) => s.doctor?.specialty).filter(Boolean))].sort(), [myShares]);
  const filtered = useMemo(() => myShares.filter((s) => {
    const q = search.trim().toLowerCase();
    const matchSearch = !q || (s.doctor?.name || '').toLowerCase().includes(q) || (s.doctor?.crm || '').toLowerCase().includes(q);
    const matchSpec = !specFilter || s.doctor?.specialty === specFilter;
    const matchActive = !activeOnly || s.active;
    return matchSearch && matchSpec && matchActive;
  }), [myShares, search, specFilter, activeOnly]);
  const grouped = useMemo(() => {
    const active = filtered.filter((s) => s.active);
    const revoked = filtered.filter((s) => !s.active);
    const map = new Map<string, any[]>();
    for (const s of active) { const sp = s.doctor?.specialty || 'Outros'; if (!map.has(sp)) map.set(sp, []); map.get(sp)!.push(s); }
    const groups = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    return { active: groups, revoked };
  }, [filtered]);

  const activeCount = myShares.filter((s) => s.active).length;

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 760, mx: 'auto' }}>
      <Title title="Meus Médicos" />
      {/* Header */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography variant="h5" sx={{ fontWeight: 800 }}>🩺 Meus Médicos</Typography>
        <Button variant="contained" startIcon={<PersonAddIcon />} onClick={() => setShowForm(true)} sx={{ borderRadius: 99, textTransform: 'none', fontWeight: 700 }}>
          Compartilhar
        </Button>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Controle quem vê seus dados. Escolha o que compartilhar e revogue a qualquer momento.</Typography>

      {/* Filtros */}
      {!loading && myShares.length > 0 && (
        <Stack spacing={1} sx={{ mb: 2 }}>
          <TextField placeholder="Buscar por nome ou CRM…" value={search} onChange={(e) => setSearch(e.target.value)} size="small" fullWidth
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 18, color: 'text.secondary' }} /></InputAdornment> } }} />
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
            {specialties.length > 1 && (
              <TextField select size="small" value={specFilter} onChange={(e) => setSpecFilter(e.target.value)} sx={{ minWidth: 160 }} label="Especialidade">
                <MenuItem value="">Todas</MenuItem>
                {specialties.map((sp: string) => <MenuItem key={sp} value={sp}>{sp}</MenuItem>)}
              </TextField>
            )}
            <FormControlLabel control={<Switch size="small" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} />} label={<Typography sx={{ fontSize: 13 }}>Só ativos</Typography>} />
            <Chip size="small" label={`${myShares.length} médicos • ${activeCount} ativos`} sx={{ bgcolor: '#e0f2f1', color: '#178f89', fontWeight: 700 }} />
          </Stack>
        </Stack>
      )}

      {/* Loading */}
      {loading && <Box sx={{ textAlign: 'center', py: 4 }}><CircularProgress sx={{ color: '#20b2aa' }} /></Box>}

      {/* Empty state */}
      {!loading && myShares.length === 0 && (
        <Card sx={{ borderRadius: 4, background: 'linear-gradient(135deg,#f0f9f7,#e8f5f3)', border: '1px solid #bfe7e3' }}><CardContent sx={{ textAlign: 'center', py: 5 }}>
          <Box sx={{ fontSize: 56, mb: 1 }}>🩺</Box>
          <Typography variant="h6" sx={{ fontWeight: 800, color: '#0f3d3a', mb: 0.5 }}>Nenhum médico ainda?</Typography>
          <Typography color="text.secondary" sx={{ mb: 2.5, maxWidth: 320, mx: 'auto' }}>Compartilhe seus exames com seu médico em segundos — ele recebe tudo organizado.</Typography>
          <Button variant="contained" size="large" startIcon={<PersonAddIcon />} onClick={() => setShowForm(true)} sx={{ borderRadius: 99, textTransform: 'none', fontWeight: 800, px: 4 }}>Compartilhar agora →</Button>
        </CardContent></Card>
      )}

      {/* Lista agrupada por especialidade */}
      {!loading && grouped.active.map(([specName, items]) => (
        <Box key={specName} sx={{ mb: 2.5 }}>
          <Typography sx={{ fontWeight: 800, fontSize: 13, color: '#0f3d3a', mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {specName} <Chip size="small" label={items.length} sx={{ height: 18, fontSize: 10, bgcolor: '#e0f2f1', color: '#178f89', fontWeight: 700 }} />
          </Typography>
          <Stack spacing={1}>
            {items.map((s) => (
              <Card key={s.id} sx={{ borderRadius: 3, position: 'relative', overflow: 'hidden', border: '1px solid #e2efec', '&:hover': { boxShadow: '0 4px 16px rgba(32,178,170,.10)' }, transition: 'all .15s' }}>
                <Box sx={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, bgcolor: s.active ? '#20b2aa' : '#cbd5e1' }} />
                <CardContent sx={{ pl: 2.5, py: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Stack direction="row" alignItems="flex-start" spacing={1.5}>
                    <Box sx={{ position: 'relative', flexShrink: 0 }}>
                      <Avatar src={s.doctor?.id ? `${API_URL}/doctor/photo/${s.doctor.id}` : undefined} sx={{ width: 44, height: 44, fontWeight: 800, fontSize: 18, bgcolor: '#20b2aa' }}>{s.doctor?.name?.charAt(0)?.toUpperCase()}</Avatar>
                      <Box sx={{ position: 'absolute', bottom: -1, right: -1, width: 13, height: 13, borderRadius: '50%', bgcolor: s.active ? '#10b981' : '#94a3b8', border: '2.5px solid #fff' }} />
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Stack direction="row" alignItems="center" spacing={0.5} useFlexGap flexWrap="wrap">
                        <Typography sx={{ fontWeight: 800, color: '#0f3d3a', fontSize: 15 }}>{s.doctor?.name}</Typography>
                      </Stack>
                      <Typography variant="caption" sx={{ color: '#64748b', display: 'block' }}>CRM {s.doctor?.crm}{s.convenio ? ` • ${s.convenio}` : ''}</Typography>
                      {/* Scope toggles */}
                      <Stack direction="row" spacing={0.5} sx={{ mt: 1 }}>
                        {SCOPE_META.map((sm) => (
                          <ScopeToggle key={sm.key} scopeKey={sm.key} active={!!s.scopes?.includes(sm.key)} compact
                            onToggle={(k) => { const on = s.scopes?.includes(k); const ns = on ? s.scopes.filter((x: string) => x !== k) : [...(s.scopes || []), k]; updateScopes(s.id, ns); }} />
                        ))}
                      </Stack>
                    </Box>
                    {/* Menu ⋯ */}
                    <IconButton size="small" onClick={(e) => setMenuEl({ id: s.id, el: e.currentTarget })} sx={{ flexShrink: 0, mt: -0.5 }}><MoreVertIcon fontSize="small" /></IconButton>
                  </Stack>
                </CardContent>
              </Card>
            ))}
          </Stack>
        </Box>
      ))}

      {/* Revogados (seção colapsada no fim) */}
      {!loading && grouped.revoked.length > 0 && (
        <Box sx={{ mt: 2, opacity: 0.7 }}>
          <Typography sx={{ fontWeight: 700, fontSize: 12, color: '#94a3b8', mb: 1, textTransform: 'uppercase', letterSpacing: 0.5 }}>💤 Revogados ({grouped.revoked.length})</Typography>
          <Stack spacing={0.75}>
            {grouped.revoked.map((s) => (
              <Card key={s.id} sx={{ borderRadius: 2, border: '1px solid #f1f5f9', bgcolor: '#fafbfc' }}>
                <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.25, py: 1, '&:last-child': { pb: 1 } }}>
                  <Avatar sx={{ width: 32, height: 32, fontSize: 14, bgcolor: '#cbd5e1', flexShrink: 0 }}>{s.doctor?.name?.charAt(0)}</Avatar>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 600, fontSize: 13, color: '#64748b' }}>{s.doctor?.name}</Typography>
                    <Typography variant="caption" sx={{ color: '#94a3b8' }}>CRM {s.doctor?.crm}</Typography>
                  </Box>
                  <Button size="small" onClick={() => reactivate(s.id)} sx={{ textTransform: 'none', color: '#178f89', fontSize: 12 }}>Reativar</Button>
                </CardContent>
              </Card>
            ))}
          </Stack>
        </Box>
      )}

      {/* Menu ⋯ */}
      <MuiMenu anchorEl={menuEl?.el ?? null} open={!!menuEl} onClose={() => setMenuEl(null)} slotProps={{ paper: { sx: { borderRadius: 2, minWidth: 180 } } }}>
        <MenuItem onClick={() => revoke(menuEl!.id)}>
          <BlockIcon sx={{ fontSize: 18, mr: 1 }} /> Revogar acesso
        </MenuItem>
        <MenuItem onClick={() => deleteShare(menuEl!.id)} sx={{ color: 'error.main' }}>
          <DeleteIcon sx={{ fontSize: 18, mr: 1 }} /> Excluir compartilhamento
        </MenuItem>
      </MuiMenu>

      {/* Dialog de compartilhamento */}
      <Dialog open={showForm} onClose={() => setShowForm(false)} fullWidth maxWidth="sm" PaperProps={{ sx: { borderRadius: 4 } }}>
        <DialogTitle sx={{ fontWeight: 800, color: '#0f3d3a' }}>🩺 Compartilhar com médico</DialogTitle>
        <DialogContent>
          <Box component="form" onSubmit={add} sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: 1 }}>
            {existingDocs.length > 0 && (
              <TextField select label="Reusar médico já cadastrado" value="" onChange={(e: any) => reuseDoc(e.target.value)} size="small" fullWidth>
                <MenuItem value=""><em>Novo médico…</em></MenuItem>
                {existingDocs.map((d: any) => <MenuItem key={d.crm} value={d.crm}>{d.name} — CRM {d.crm}</MenuItem>)}
              </TextField>
            )}
            {/* CRM (número) + UF + Buscar médico (nosso banco → CFM → manual) */}
            <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap alignItems="flex-end">
              <TextField label="CRM (número)" required value={crm} onChange={(e) => setCrm(e.target.value.replace(/[^\d]/g, ''))} size="small" sx={{ flex: '1 1 120px' }} inputProps={{ inputMode: 'numeric', pattern: '[0-9]*' }} />
              <TextField select label="Estado (UF)" required value={uf} onChange={(e) => setUf(e.target.value)} size="small" sx={{ width: 110 }}>
                <MenuItem value=""><em>—</em></MenuItem>
                {UFS.map((u) => <MenuItem key={u} value={u}>{u}</MenuItem>)}
              </TextField>
              <Button variant="outlined" onClick={buscarMedico} disabled={looking || !crm || uf.length !== 2} startIcon={looking ? <CircularProgress size={16} color="inherit" /> : <SearchIcon />} sx={{ borderRadius: 99, textTransform: 'none', fontWeight: 700, height: 40 }}>
                {looking ? 'Buscando…' : 'Buscar médico'}
              </Button>
            </Stack>
            {lookup && (
              <Alert severity={lookup.source === 'manual' ? 'warning' : 'success'} icon={false} sx={{ borderRadius: 2, py: 0.75, '& .MuiAlert-message': { fontSize: 13 } }}>{lookup.msg}</Alert>
            )}
            <TextField label="Nome do médico" required value={name} onChange={(e) => setName(e.target.value)} size="small" fullWidth placeholder={lookup?.source === 'manual' ? 'Digite o nome…' : 'Use "Buscar" ou preencha'} />
            <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
              <TextField select label="Especialidade" value={spec} onChange={(e) => setSpec(e.target.value)} size="small" sx={{ flex: '1 1 200px' }}>
                <MenuItem value=""><em>Selecione…</em></MenuItem>
                {specialtyOptions.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
              </TextField>
              <TextField label="E-mail (opcional)" value={email} onChange={(e) => setEmail(e.target.value)} size="small" sx={{ flex: '1 1 200px' }} />
            </Stack>
            <TextField select label="Convênio" value={convenio} onChange={(e) => setConvenio(e.target.value)} size="small" sx={{ width: 220 }}>
              {CONVENIOS.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
            </TextField>
            <Box>
              <Typography variant="caption" sx={{ fontWeight: 800, display: 'block', mb: 1, color: '#178f89' }}>O que ele pode ver:</Typography>
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                {SCOPE_META.map((sm) => (
                  <ScopeToggle key={sm.key} scopeKey={sm.key} active={scopes.includes(sm.key)} onToggle={toggleScope} />
                ))}
              </Stack>
            </Box>
            {shareCost > 0 && (
              <Alert severity={insufficient ? 'error' : 'info'} sx={{ borderRadius: 2, py: 0.75 }}>
                {insufficient ? `Saldo insuficiente — faltam ${shareCost - (credits ?? 0)} créditos.` : `💎 Custo: ${shareCost} créditos (cobrado só na criação). Seu saldo: ${credits}.`}
              </Alert>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setShowForm(false)} sx={{ textTransform: 'none', fontWeight: 700 }}>Cancelar</Button>
          <Button variant="contained" onClick={add} disabled={saving || insufficient || scopes.length === 0} sx={{ borderRadius: 99, textTransform: 'none', fontWeight: 800, px: 3 }}>
            {saving ? <CircularProgress size={20} color="inherit" /> : shareCost > 0 ? `Compartilhar (${shareCost} 💎)` : 'Compartilhar →'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
