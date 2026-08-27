import { useEffect, useState, useMemo } from 'react';
import { Box, Card, CardContent, Typography, Button, TextField, CircularProgress, Stack, Chip, Avatar, IconButton, Alert, Divider, Switch, Checkbox, FormControlLabel, MenuItem, Menu as MuiMenu, Dialog, DialogTitle, DialogContent, DialogActions, InputAdornment } from '@mui/material';
import { useNotify, useTranslate } from 'react-admin';
import { API_URL, token, doctorPhotoUrl } from '../config';
import { bumpCredits } from '../utils/credits-events';
import { confirmDialog } from '../components/ConfirmDialog';
import { useSelectedPatient } from '../patient-context';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import BlockIcon from '@mui/icons-material/Block';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import SearchIcon from '@mui/icons-material/Search';
import MedicalServicesIcon from '@mui/icons-material/MedicalServices';
import { SPECIALTIES, CONVENIOS, UFS } from '../utils/medicalData';
import type { DoctorLookupResult, DoctorLookupSource } from '../types/doctor';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { ListSkeleton } from '../components/Skeleton';

const SCOPE_META = [
  { key: 'exams', label: 'Exames', short: 'Exames', icon: '📋' },
  { key: 'evolution', label: 'Evolução', short: 'Evol.', icon: '📈' },
  { key: 'alerts', label: 'Alertas', short: 'Alertas', icon: '🚨' },
  { key: 'summary', label: 'Resumos IA', short: 'IA', icon: '✨' },
];

const fixSpecialty = (s?: string) => {
  if (!s) return 'Outros';
  if (s === 'Cirurgiao Geral') return 'Cirurgião Geral';
  return s;
};

/** Toggle card de escopo — Pílula visual interativa em tom esmeralda. */
const ScopeToggle = ({ scopeKey, active, onToggle, compact }: { scopeKey: string; active: boolean; onToggle: (k: string) => void; compact?: boolean }) => {
  const meta = SCOPE_META.find((s) => s.key === scopeKey)!;
  return (
    <Chip
      size="small"
      onClick={(e) => { e.stopPropagation(); onToggle(scopeKey); }}
      label={
        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
          <span>{meta.icon}</span>
          <span>{compact ? meta.short : meta.label}</span>
        </Box>
      }
      sx={{
        height: 28,
        fontSize: 11,
        fontWeight: 700,
        cursor: 'pointer',
        borderRadius: '999px',
        bgcolor: active ? 'rgba(5,150,105,0.12)' : 'rgba(0,0,0,0.04)',
        color: active ? '#047857' : 'text.secondary',
        border: `1px solid ${active ? 'rgba(5,150,105,0.3)' : 'rgba(0,0,0,0.08)'}`,
        '&:hover': { bgcolor: active ? 'rgba(5,150,105,0.22)' : 'rgba(0,0,0,0.08)' },
        transition: 'all 0.15s ease',
      }}
    />
  );
};

export const MedicosPage = () => {
  const translate = useTranslate();
  const notify = useNotify();
  const [pid] = useSelectedPatient();
  const [shares, setShares] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  // Form state
  const [name, setName] = useState(''); const [crm, setCrm] = useState(''); const [uf, setUf] = useState(''); const [spec, setSpec] = useState(''); const [specOther, setSpecOther] = useState(''); const [email, setEmail] = useState('');
  const [scopes, setScopes] = useState<string[]>([]);
  const [examIds, setExamIds] = useState<string[]>([]);
  const [examOptions, setExamOptions] = useState<{ id: string; title: string; performedAt: string | null }[]>([]);
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
  // Detalhes do médico (perfil público — clicável no nome do card)
  const [detail, setDetail] = useState<any | null>(null);
  // Pergunta paga ao médico (2 créditos) — vira thread no portal do médico
  const [perg, setPerg] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [pergMsg, setPergMsg] = useState<string | null>(null);
  const enviarPergunta = async () => {
    const txt = perg.trim(); if (!txt || !detail) return;
    setEnviando(true); setPergMsg(null);
    try {
      const r = await fetch(`${API_URL}/doctor-questions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ doctorId: detail.id, patientId: pid, subject: txt }),
      });
      const d = await r.json();
      if (r.status === 402) { setPergMsg('Créditos insuficientes.'); return; }
      if (!r.ok) throw new Error(d.error || 'Falha ao enviar');
      bumpCredits(); setPerg(''); setPergMsg(`✓ Pergunta enviada ao Dr. ${detail.name?.split(' ')[0] ?? ''}. Ele verá no próximo acesso.`);
    } catch (e: any) { setPergMsg(e.message || 'Falha ao enviar.'); } finally { setEnviando(false); }
  };

  // Exames do paciente (pro seletor "compartilhar exame específico"). Vazio no seletor = TODOS.
  useEffect(() => {
    if (!pid) return;
    fetch(`${API_URL}/exams?_start=0&_end=30&patientId=${pid}&status=EXTRACTED`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setExamOptions(d.map((e: any) => ({ id: e.id, title: e.title, performedAt: e.performedAt }))); })
      .catch(() => {});
  }, [pid]);

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
      const r = await fetch(`${API_URL}/doctor-shares`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` }, body: JSON.stringify({ doctorName: name, doctorCrm: crm.replace(/\D/g, ''), doctorUf: uf, doctorSpecialty: spec === 'Outro' ? specOther.trim() : spec, doctorEmail: email, scopes, convenio, patientId: pid, examIds: scopes.includes('exams') ? examIds : [] }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Falha');
      notify('Compartilhamento criado! O médico foi avisado por e-mail.', { type: 'success' });
      setShowForm(false); setName(''); setCrm(''); setUf(''); setSpec(''); setEmail(''); setScopes([]); setConvenio('Particular'); setLookup(null); setExamIds([]);
      load();
    } catch (e: any) { notify(e.message, { type: 'error' }); } finally { setSaving(false); }
  };
  const revoke = async (id: string) => {
    setMenuEl(null);
    if (!(await confirmDialog({ title: 'Revogar compartilhamento', message: 'O médico perderá acesso aos seus dados na mesma hora.', confirmLabel: 'Revogar' }))) return;
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
    if (!(await confirmDialog({ title: 'Excluir compartilhamento', message: 'Isto APAGA o registro (some da lista). Se o médico não tiver conta ativa nem outros compartilhamentos, o cadastro dele também será removido.', confirmLabel: 'Excluir' }))) return;
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
    <PageContainer width={760} sx={{ pb: { xs: 10, sm: 5 } }}>
      {/* HERO BANNER PREMIUM */}
      <Card
        elevation={0}
        sx={{
          mb: 3,
          borderRadius: '20px',
          background: 'linear-gradient(135deg, #0f5f5a 0%, #178f89 100%)',
          color: '#fff',
          overflow: 'hidden',
          boxShadow: '0 12px 32px rgba(15,95,90,0.22)',
        }}
      >
        <CardContent sx={{ p: { xs: 2.5, sm: 3.5 } }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} spacing={2}>
            <Box>
              <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1 }}>
                <Box sx={{ bgcolor: 'rgba(255,255,255,0.2)', p: 1, borderRadius: '14px', display: 'flex', alignItems: 'center' }}>
                  <MedicalServicesIcon sx={{ fontSize: 28, color: '#fff' }} />
                </Box>
                <Typography variant="h5" sx={{ fontWeight: 900, fontFamily: 'Poppins, sans-serif', letterSpacing: '-0.02em' }}>
                  Meus Médicos
                </Typography>
                <Chip
                  size="small"
                  label={`${activeCount} com acesso ativo`}
                  sx={{ bgcolor: 'rgba(255,255,255,0.22)', color: '#fff', fontWeight: 800, backdropFilter: 'blur(6px)' }}
                />
              </Stack>
              <Typography sx={{ opacity: 0.9, fontSize: 14, maxWidth: 520, lineHeight: 1.4 }}>
                Controle o que cada médico pode ver. Altere permissões ou revogue o acesso a qualquer momento.
              </Typography>
            </Box>

            <Button
              variant="contained"
              startIcon={<PersonAddIcon />}
              onClick={() => setShowForm(true)}
              sx={{
                bgcolor: 'rgba(255,255,255,0.18)',
                color: '#fff',
                fontWeight: 800,
                textTransform: 'none',
                borderRadius: '999px',
                px: 2.5,
                py: 1,
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255,255,255,0.35)',
                whiteSpace: 'nowrap',
                '&:hover': { bgcolor: 'rgba(255,255,255,0.3)' },
              }}
            >
              + Compartilhar
            </Button>
          </Stack>
        </CardContent>
      </Card>

      {/* Filtros */}
      {!loading && myShares.length > 0 && (
        <Stack spacing={1} sx={{ mb: 2.5 }}>
          <TextField
            placeholder={translate('docs.search_ph')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            size="small"
            fullWidth
            slotProps={{
              input: {
                startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 18, color: 'text.secondary' }} /></InputAdornment>,
                sx: { borderRadius: '999px', bgcolor: 'background.paper' }
              }
            }}
          />
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
            {specialties.length > 1 && (
              <TextField select size="small" value={specFilter} onChange={(e) => setSpecFilter(e.target.value)} sx={{ minWidth: 160, '& .MuiOutlinedInput-root': { borderRadius: '999px' } }} label="Especialidade">
                <MenuItem value="">{translate('docs.all')}</MenuItem>
                {specialties.map((sp: string) => <MenuItem key={sp} value={sp}>{fixSpecialty(sp)}</MenuItem>)}
              </TextField>
            )}
            <FormControlLabel control={<Switch size="small" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} />} label={<Typography sx={{ fontSize: 13, fontWeight: 700 }}>Só ativos</Typography>} />
            <Chip size="small" label={`${myShares.length} ${myShares.length === 1 ? 'médico' : 'médicos'} • ${activeCount} ${activeCount === 1 ? 'ativo' : 'ativos'}`} sx={{ bgcolor: 'rgba(15,95,90,0.1)', color: '#0f5f5a', fontWeight: 800 }} />
          </Stack>
        </Stack>
      )}

      {/* Loading */}
      {loading && <ListSkeleton count={4} />}

      {/* Empty state */}
      {!loading && myShares.length === 0 && (
        <Card sx={{ borderRadius: '20px', background: 'background.default', border: '1px solid', borderColor: 'divider' }}><CardContent sx={{ textAlign: 'center', py: 5 }}>
          <Box sx={{ fontSize: 56, mb: 1 }}>🩺</Box>
          <Typography variant="h6" sx={{ fontWeight: 800, color: 'text.primary', mb: 0.5 }}>{translate('docs.empty_title')}</Typography>
          <Typography color="text.secondary" sx={{ mb: 2.5, maxWidth: 320, mx: 'auto' }}>{translate('docs.empty_desc')}</Typography>
          <Button variant="contained" size="large" startIcon={<PersonAddIcon />} onClick={() => setShowForm(true)} sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 800, px: 4 }}>{translate('docs.share_now')}</Button>
        </CardContent></Card>
      )}

      {/* Lista agrupada por especialidade */}
      {!loading && grouped.active.map(([specName, items]) => (
        <Box key={specName} sx={{ mb: 3 }}>
          <Typography component="div" sx={{ fontWeight: 900, fontSize: 14, color: 'text.primary', mb: 1.25, display: 'flex', alignItems: 'center', gap: 1, fontFamily: 'Poppins, sans-serif' }}>
            <span>{fixSpecialty(specName)}</span>
            <Chip size="small" label={items.length} sx={{ height: 20, fontSize: 11, bgcolor: 'rgba(15,95,90,0.12)', color: '#0f5f5a', fontWeight: 800 }} />
          </Typography>
          <Stack spacing={1.5}>
            {items.map((s) => (
              <Card
                key={s.id}
                onClick={() => setDetail(s.doctor)}
                sx={{
                  borderRadius: '16px',
                  position: 'relative',
                  overflow: 'hidden',
                  border: '1px solid',
                  borderColor: 'divider',
                  cursor: 'pointer',
                  bgcolor: 'background.paper',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
                  '&:hover': {
                    borderColor: '#178f89',
                    boxShadow: '0 8px 24px rgba(15,95,90,0.14)',
                    transform: 'translateY(-2px)',
                  },
                  '&:active': { transform: 'scale(.99)' },
                  transition: 'all .2s ease',
                }}
              >
                <Box sx={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, bgcolor: s.active ? '#059669' : '#cbd5e1' }} />
                <CardContent sx={{ pl: 2.5, py: 2, '&:last-child': { pb: 2 } }}>
                  <Stack direction="row" alignItems="flex-start" spacing={1.75}>
                    <Box sx={{ position: 'relative', flexShrink: 0 }}>
                      <Avatar
                        src={s.doctor?.id ? doctorPhotoUrl(s.doctor.id) : undefined}
                        sx={{
                          width: 52,
                          height: 52,
                          fontWeight: 800,
                          fontSize: 20,
                          bgcolor: '#0f5f5a',
                          border: `2.5px solid ${s.active ? '#059669' : '#cbd5e1'}`,
                        }}
                      >
                        {s.doctor?.name?.charAt(0)?.toUpperCase()}
                      </Avatar>
                      <Box sx={{ position: 'absolute', bottom: 0, right: 0, width: 13, height: 13, borderRadius: '50%', bgcolor: s.active ? '#059669' : '#94a3b8', border: '2px solid #fff' }} />
                    </Box>

                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                        <Typography sx={{ fontWeight: 800, color: 'text.primary', fontSize: 16, fontFamily: 'Poppins, sans-serif' }}>
                          {s.doctor?.name}
                        </Typography>
                        <IconButton size="small" aria-label={`Mais opções de ${s.doctor?.name}`} title="Mais opções" onClick={(e) => { e.stopPropagation(); setMenuEl({ id: s.id, el: e.currentTarget }); }} sx={{ flexShrink: 0, mt: -0.5 }}>
                          <MoreVertIcon fontSize="small" />
                        </IconButton>
                      </Stack>

                      <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 0.25, mb: 1, flexWrap: 'wrap', gap: 0.5 }}>
                        <Chip size="small" label={`CRM ${s.doctor?.crm}`} sx={{ height: 20, fontSize: 11, fontWeight: 700, bgcolor: 'rgba(15,95,90,0.08)', color: '#0f5f5a' }} />
                        {s.convenio && <Chip size="small" label={s.convenio} sx={{ height: 20, fontSize: 11, fontWeight: 700, bgcolor: 'rgba(0,0,0,0.05)', color: 'text.secondary' }} />}
                      </Stack>

                      {/* Scope toggles em pilulas limpas */}
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', mb: 0.5 }}>
                        Acessos autorizados (toque para alternar):
                      </Typography>
                      <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
                        {SCOPE_META.map((sm) => (
                          <ScopeToggle
                            key={sm.key}
                            scopeKey={sm.key}
                            active={!!s.scopes?.includes(sm.key)}
                            compact
                            onToggle={(k) => {
                              const on = s.scopes?.includes(k);
                              const ns = on ? s.scopes.filter((x: string) => x !== k) : [...(s.scopes || []), k];
                              updateScopes(s.id, ns);
                            }}
                          />
                        ))}
                      </Stack>
                    </Box>
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
          <Typography sx={{ fontWeight: 700, fontSize: 12, color: 'text.secondary', mb: 1, textTransform: 'uppercase', letterSpacing: 0.5 }}>💤 Revogados ({grouped.revoked.length})</Typography>
          <Stack spacing={0.75}>
            {grouped.revoked.map((s) => (
              <Card key={s.id} sx={{ borderRadius: '12px', border: '1px solid', borderColor: 'divider', bgcolor: 'background.default' }}>
                <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.25, py: 1, '&:last-child': { pb: 1 } }}>
                  <Avatar sx={{ width: 40, height: 40, fontSize: 16, bgcolor: 'action.hover', flexShrink: 0 }}>{s.doctor?.name?.charAt(0)}</Avatar>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 600, fontSize: 13, color: 'text.secondary' }}>{s.doctor?.name}</Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>CRM {s.doctor?.crm}</Typography>
                  </Box>
                  <Button size="small" onClick={() => reactivate(s.id)} sx={{ textTransform: 'none', color: '#178f89', fontSize: 12 }}>{translate('docs.reactivate')}</Button>
                </CardContent>
              </Card>
            ))}
          </Stack>
        </Box>
      )}

      {/* Menu ⋯ */}
      <MuiMenu anchorEl={menuEl?.el ?? null} open={!!menuEl} onClose={() => setMenuEl(null)} slotProps={{ paper: { sx: { borderRadius: '12px', minWidth: 180 } } }}>
        <MenuItem onClick={() => revoke(menuEl!.id)}>
          <BlockIcon sx={{ fontSize: 18, mr: 1 }} /> Revogar acesso
        </MenuItem>
        <MenuItem onClick={() => deleteShare(menuEl!.id)} sx={{ color: 'error.main' }}>
          <DeleteIcon sx={{ fontSize: 18, mr: 1 }} /> Excluir compartilhamento
        </MenuItem>
      </MuiMenu>

      {/* Detalhes do médico (perfil público — clicável no nome do card) */}
      <Dialog open={!!detail} onClose={() => setDetail(null)} fullWidth maxWidth="xs" PaperProps={{ sx: { borderRadius: '12px' } }}>
        {detail && (
          <>
            <DialogTitle sx={{ textAlign: 'center', pb: 0 }}>
              <Avatar src={detail.id ? doctorPhotoUrl(detail.id) : undefined} sx={{ width: 96, height: 96, mx: 'auto', mb: 1.5, fontSize: 36, fontWeight: 800, bgcolor: '#20b2aa', border: '3px solid rgba(32,178,170,0.2)' }}>{detail.name?.charAt(0)?.toUpperCase()}</Avatar>
              {detail.name}
            </DialogTitle>
            <DialogContent sx={{ textAlign: 'center' }}>
              {detail.specialty && <Chip size="small" label={detail.specialty} sx={{ mb: 1.5, bgcolor: 'rgba(32,178,170,0.15)', color: '#178f89', fontWeight: 700 }} />}
              <Typography variant="body2" sx={{ mb: 0.5 }}>CRM {detail.crm}{detail.uf ? `-${detail.uf}` : ''}</Typography>
              {detail.clinicName && <Typography sx={{ fontWeight: 700, mt: 1, color: 'text.primary' }}>{detail.clinicName}</Typography>}
              {detail.clinicCity && <Typography variant="body2" color="text.secondary">📍 {detail.clinicCity}</Typography>}
              {detail.bio && <Typography variant="body2" sx={{ mt: 1, fontStyle: 'italic', color: 'text.secondary', lineHeight: 1.4 }}>{detail.bio}</Typography>}
              {!detail.bio && !detail.clinicName && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>{translate('docs.invited_by_you')}</Typography>}
              {/* Agendar: WhatsApp se o médico preencheu telefone, senão e-mail */}
              {detail.phone ? (
                <Button component="a" target="_blank" rel="noopener" size="small" href={`https://wa.me/${detail.phone.replace(/\D/g, '')}?text=${encodeURIComponent('Olá, doutor(a)! Gostaria de agendar uma consulta.')}`} sx={{ mt: 1.5, borderRadius: '999px', textTransform: 'none', fontWeight: 700, py: 1.1, bgcolor: '#25D366', color: '#fff', '&:hover': { bgcolor: '#047857' } }}>💬 Agendar no WhatsApp</Button>
              ) : detail.email && !detail.email.includes('@invite.com') ? (
                <Button size="small" startIcon={<MedicalServicesIcon />} href={`mailto:${detail.email}?subject=Agendamento%20de%20consulta`} sx={{ mt: 1.5, borderRadius: '999px', textTransform: 'none', fontWeight: 700, py: 1.1, bgcolor: '#059669', color: '#fff', '&:hover': { bgcolor: '#047857' } }}>{translate('docs.schedule_email')}</Button>
              ) : null}
              <Divider sx={{ my: 0.5 }}><Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', letterSpacing: 0.5 }}>TIRAR UMA DÚVIDA</Typography></Divider>
              {/* Pergunta paga ao médico (2 créditos) — vira thread no portal do médico */}
              <Box sx={{ mt: 1.5, textAlign: 'left' }}>
                <Typography variant="caption" sx={{ fontWeight: 800, color: '#178f89', display: 'block', mb: 0.5 }}>❓ Perguntar ao médico · 2 créditos</Typography>
                <TextField multiline minRows={2} size="small" fullWidth placeholder={translate('docs.ask_ph')} value={perg} onChange={(e) => setPerg(e.target.value)} />
                {pergMsg && <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: pergMsg.startsWith('✓') ? '#059669' : 'error.main', fontWeight: 700, lineHeight: 1.3 }}>{pergMsg}</Typography>}
                <Button size="small" disabled={enviando || !perg.trim()} onClick={enviarPergunta} startIcon={enviando ? <CircularProgress size={14} color="inherit" /> : undefined} sx={{ mt: 1, borderRadius: '999px', textTransform: 'none', fontWeight: 700, py: 1, px: 2.5, bgcolor: '#178f89', color: '#fff', '&:hover': { bgcolor: '#0f766e' }, boxShadow: 'none' }}>{enviando ? 'Enviando…' : 'Enviar pergunta · 2 💎'}</Button>
              </Box>
            </DialogContent>
          </>
        )}
      </Dialog>

      {/* Dialog de compartilhamento */}
      <Dialog open={showForm} onClose={() => setShowForm(false)} fullWidth maxWidth="sm" PaperProps={{ sx: { borderRadius: '12px' } }}>
        <DialogTitle sx={{ fontWeight: 800, color: 'text.primary' }}>🩺 Compartilhar com médico</DialogTitle>
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
              <Button variant="outlined" onClick={buscarMedico} disabled={looking || !crm || uf.length !== 2} startIcon={looking ? <CircularProgress size={16} color="inherit" /> : <SearchIcon />} sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 700, height: 40 }}>
                {looking ? 'Buscando…' : 'Buscar médico'}
              </Button>
            </Stack>
            {lookup && (
              <Alert severity={lookup.source === 'manual' ? 'warning' : 'success'} icon={false} sx={{ borderRadius: '12px', py: 0.75, '& .MuiAlert-message': { fontSize: 13 } }}>{lookup.msg}</Alert>
            )}
            <TextField label="Nome do médico" required value={name} onChange={(e) => setName(e.target.value)} size="small" fullWidth placeholder={lookup?.source === 'manual' ? 'Digite o nome…' : 'Use "Buscar" ou preencha'} />
            <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
              <TextField select label="Especialidade" value={spec} onChange={(e) => setSpec(e.target.value)} size="small" sx={{ flex: '1 1 200px' }}>
                <MenuItem value=""><em>Selecione…</em></MenuItem>
                {specialtyOptions.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
              </TextField>
              <TextField label="E-mail (opcional)" value={email} onChange={(e) => setEmail(e.target.value)} size="small" sx={{ flex: '1 1 200px' }} />
            </Stack>
            {spec === 'Outro' && (
              <TextField label="Qual especialidade?" value={specOther} onChange={(e) => setSpecOther(e.target.value)} size="small" fullWidth required placeholder="Ex.: Cirurgia de Cabeça e Pescoço" />
            )}
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
              {/* Compartilhar exame específico: só aparece quando "Exames" tá marcado.
                  Vazio = TODOS (mantém o behavior de hoje). Pra evolução, marca vários. */}
              {scopes.includes('exams') && (
                <Box sx={{ mt: 1.5 }}>
                  <Typography variant="caption" sx={{ fontWeight: 800, color: '#178f89' }}>Quais exames? (vazio = todos)</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>Cada médico pode avaliar um conjunto. Pra ver evolução, marque vários.</Typography>
                  {examOptions.length === 0 ? (
                    <Typography variant="caption" color="text.secondary">Nenhum exame enviado ainda — o médico verá todos quando você enviar o primeiro.</Typography>
                  ) : (
                    <Box sx={{ maxHeight: 168, overflowY: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: '12px', p: 0.5 }}>
                      {examOptions.map((ex) => (
                        <FormControlLabel key={ex.id} sx={{ display: 'flex', m: 0, px: 0.5, borderRadius: '8px', '&:hover': { bgcolor: 'action.hover' } }}
                          control={<Checkbox size="small" sx={{ p: 0.5 }} checked={examIds.includes(ex.id)} onChange={() => setExamIds((p) => p.includes(ex.id) ? p.filter((x) => x !== ex.id) : [...p, ex.id])} />}
                          label={<Typography variant="caption" sx={{ wordBreak: 'break-word' }}>📄 {ex.title}{ex.performedAt ? ` — ${new Date(ex.performedAt).toLocaleDateString('pt-BR')}` : ''}</Typography>} />
                      ))}
                    </Box>
                  )}
                  {examIds.length > 0 && <Chip size="small" sx={{ mt: 0.5 }} label={`${examIds.length} selecionado(s) — vazio mostra todos`} onDelete={() => setExamIds([])} />}
                </Box>
              )}
            </Box>
            {shareCost > 0 && (
              <Alert severity={insufficient ? 'error' : 'info'} sx={{ borderRadius: '12px', py: 0.75 }}>
                {insufficient ? `Saldo insuficiente — faltam ${shareCost - (credits ?? 0)} créditos.` : `💎 Custo: ${shareCost} créditos (cobrado só na criação). Seu saldo: ${credits}.`}
              </Alert>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setShowForm(false)} sx={{ textTransform: 'none', fontWeight: 700 }}>Cancelar</Button>
          <Button variant="contained" onClick={add} disabled={saving || insufficient || scopes.length === 0} sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 800, px: 3 }}>
            {saving ? <CircularProgress size={20} color="inherit" /> : shareCost > 0 ? `Compartilhar (${shareCost} 💎)` : 'Compartilhar →'}
          </Button>
        </DialogActions>
      </Dialog>
    </PageContainer>
  );
};
