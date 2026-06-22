import { useState, useEffect, useMemo } from 'react';
import { Box, Card, CardContent, Typography, TextField, Button, CircularProgress, Stack, Chip, Avatar, MenuItem, Tabs, Tab, Alert, Divider, InputAdornment, IconButton, Link, Drawer, List, ListItemButton, ListItemText, ListItemIcon, Accordion, AccordionSummary, AccordionDetails } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import LogoutIcon from '@mui/icons-material/Logout';
import LockIcon from '@mui/icons-material/Lock';
import PersonIcon from '@mui/icons-material/Person';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PdfIcon from '@mui/icons-material/PictureAsPdf';
import { API_URL } from '../config';
import { DrExame } from '../components/DrExame';
import { SPECIALTIES } from '../utils/medicalData';
import { PhotoUpload } from '../components/PhotoUpload';
import { CATS, categorize } from './Evolution';
import ReactMarkdown from 'react-markdown';

const docKey = 'doctorToken';

/* Ícones inline (sem dependência extra). */
const I = {
  Mail: () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9aa7ad" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>),
  Lock: () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9aa7ad" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>),
  Person: () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9aa7ad" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-3.3 3.6-5 8-5s8 1.7 8 5" /></svg>),
  Badge: () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9aa7ad" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M8 4v4M16 4v4" /></svg>),
  Eye: () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9aa7ad" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>),
  EyeOff: () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9aa7ad" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3l18 18" /><path d="M10.6 5.1A10.9 10.9 0 0 1 12 5c6.5 0 10 7 10 7a18 18 0 0 1-3.2 4M6.6 6.6A18 18 0 0 0 2 12s3.5 7 10 7a10.8 10.8 0 0 0 5.4-1.5" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>),
};

const fieldSx = {
  '& .MuiOutlinedInput-root': { borderRadius: '8px', bgcolor: '#fff', '& fieldset': { borderColor: '#dde3e8' }, '&:hover fieldset': { borderColor: '#7fcfc6' }, '&.Mui-focused fieldset': { borderColor: '#20b2aa', borderWidth: '1.5px' } },
} as const;

const SCOPE_META: Record<string, { label: string; icon: string }> = {
  exams: { label: 'Exames', icon: '📋' },
  evolution: { label: 'Evolução', icon: '📈' },
  alerts: { label: 'Alertas', icon: '🚨' },
  summary: { label: 'Resumos IA', icon: '🤖' },
};

export const DoctorPortalPage = () => {
  const navigate = useNavigate();
  const [token, setToken] = useState<string | null>(localStorage.getItem(docKey));
  const [doctor, setDoctor] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [pwd, setPwd] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [mode, setMode] = useState<'login' | 'register'>(() => { const q = window.location.hash.split('?')[1] || ''; return new URLSearchParams(q).get('mode') === 'register' ? 'register' : 'login'; });
  const [regName, setRegName] = useState(''); const [regCrm, setRegCrm] = useState(''); const [regSpec, setRegSpec] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setErr('');
    try {
      const body = mode === 'login' ? { email: email.trim().toLowerCase(), password: pwd } : { name: regName.trim(), crm: regCrm.trim(), specialty: regSpec, email: email.trim().toLowerCase(), password: pwd };
      const r = await fetch(`${API_URL}/doctor/${mode}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Falha');
      localStorage.setItem(docKey, d.token); setToken(d.token); setDoctor(d.doctor);
    } catch (e: any) { setErr(e.message); } finally { setLoading(false); }
  };

  const logout = () => { localStorage.removeItem(docKey); setToken(null); setDoctor(null); setEmail(''); setPwd(''); setMode('login'); };

  if (token) return <DoctorDashboard token={token} onLogout={logout} />;

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2, background: 'linear-gradient(135deg,#e6f7f5,#d4f0ec)' }}>
      <Box sx={{ width: '100%', maxWidth: 420, bgcolor: '#fff', borderRadius: '16px', boxShadow: '0 10px 40px rgba(0,80,70,.12)', p: { xs: 3, sm: 4 } }}>
        <Box sx={{ mb: 1 }}>
          <Button size="small" onClick={() => navigate('/')} sx={{ color: '#64748b', textTransform: 'none', fontWeight: 700, p: 0, minWidth: 0, '&:hover': { bgcolor: 'transparent', color: TEAL } }}>← Voltar ao app</Button>
        </Box>
        <Stack alignItems="center" spacing={1} sx={{ mb: 3 }}>
          <Box sx={{ width: 78, height: 78, borderRadius: '50%', bgcolor: '#e0f2f1', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'inset 0 0 0 1px rgba(32,178,170,.15)' }}>
            <DrExame size={56} sx={{ borderRadius: '50%' }} />
          </Box>
          <Typography variant="h5" sx={{ fontWeight: 800, color: '#0f3d3a', fontFamily: 'Poppins, sans-serif' }}>Portal do Médico</Typography>
          <Typography variant="caption" sx={{ color: '#757575' }}>{mode === 'register' ? 'Crie sua conta de profissional de saúde' : 'Acesso restrito a profissionais'}</Typography>
        </Stack>

        <Box component="form" onSubmit={submit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {mode === 'register' && (<>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, p: 1.25, borderRadius: 2, background: 'linear-gradient(135deg,#e0f2f1,#d6ece8)', border: '1px solid #bfe7e3' }}>
              <Box sx={{ fontSize: 24, flexShrink: 0 }}>🩺</Box>
              <Box>
                <Typography sx={{ fontSize: 12.5, fontWeight: 800, color: '#0f3d3a' }}>Conta de Profissional de Saúde</Typography>
                <Typography sx={{ fontSize: 11, color: '#4a6b66', lineHeight: 1.35 }}>Use o <strong>mesmo CRM</strong> que seu paciente informou no convite pra ativar seu acesso.</Typography>
              </Box>
            </Box>
            <TextField placeholder="Nome completo" required value={regName} onChange={(e) => setRegName(e.target.value)} sx={fieldSx}
              slotProps={{ input: { startAdornment: <InputAdornment position="start"><I.Person /></InputAdornment> } }} />
            <TextField placeholder="CRM (ex.: 12345-SP)" required value={regCrm} onChange={(e) => setRegCrm(e.target.value)} sx={fieldSx} helperText="Use o mesmo CRM que o paciente informou no convite."
              slotProps={{ input: { startAdornment: <InputAdornment position="start"><I.Badge /></InputAdornment> } }} />
            <TextField select label="Especialidade" value={regSpec} onChange={(e) => setRegSpec(e.target.value)} sx={fieldSx} fullWidth>
              <MenuItem value=""><em>Selecione…</em></MenuItem>
              {SPECIALTIES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
            </TextField>
          </>)}
          <TextField placeholder="E-mail ou CRM" type="text" required value={email} onChange={(e) => setEmail(e.target.value)} sx={fieldSx}
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><I.Mail /></InputAdornment> } }} />
          <TextField placeholder="Senha (mín. 6 caracteres)" type={showPwd ? 'text' : 'password'} required value={pwd} onChange={(e) => setPwd(e.target.value)} sx={fieldSx}
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><I.Lock /></InputAdornment>, endAdornment: <InputAdornment position="end"><IconButton onClick={() => setShowPwd((s) => !s)} edge="end" size="small">{showPwd ? <I.Eye /> : <I.EyeOff />}</IconButton></InputAdornment> } }} />
          {err && <Alert severity="error" sx={{ py: 0.5, borderRadius: 2 }}>{err}</Alert>}
          <Button type="submit" variant="contained" size="large" fullWidth disabled={loading} sx={{ borderRadius: '8px', py: 1.35, fontWeight: 800, textTransform: 'none', fontSize: 16, background: 'linear-gradient(180deg,#20b2aa,#009688)', boxShadow: '0 6px 18px rgba(0,150,136,.3)', '&:hover': { background: 'linear-gradient(180deg,#1ca39e,#00897b)' } }}>
            {loading ? <CircularProgress size={22} color="inherit" /> : mode === 'login' ? 'Entrar' : 'Criar conta médica'}
          </Button>
        </Box>

        <Typography align="center" sx={{ mt: 2, fontSize: 13, color: '#46555a' }}>
          {mode === 'login' ? 'Primeiro acesso?' : 'Já tem conta?'}{' '}
          <Link component="button" type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setErr(''); }} sx={{ fontWeight: 700, color: '#00897b' }}>
            {mode === 'login' ? 'Cadastrar' : 'Fazer login'}
          </Link>
        </Typography>
        <Box sx={{ mt: 2, display: 'flex', gap: 1, alignItems: 'flex-start', p: 1.25, borderRadius: 2, background: '#f0f9f7', border: '1px solid #d6ece8' }}>
          <Box sx={{ fontSize: 16, lineHeight: 1.3, flexShrink: 0 }}>🩺</Box>
          <Typography sx={{ fontSize: 11.5, color: '#4a6b66', lineHeight: 1.45 }}><strong>Conteúdo educativo.</strong> O paciente controla o que compartilha. Você vê apenas os exames e dados autorizados.</Typography>
        </Box>
      </Box>
    </Box>
  );
};

const TEAL = '#178f89';

const DoctorDashboard = ({ token, onLogout }: { token: string; onLogout: () => void }) => {
  const [patients, setPatients] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [tab, setTab] = useState('exams');
  const [exams, setExams] = useState<any[]>([]);
  const [evolution, setEvolution] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [doctor, setDoctor] = useState<any>(null);
  const [view, setView] = useState<'patients' | 'profile' | 'password'>('patients');
  const [photoVer, setPhotoVer] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [selExam, setSelExam] = useState<any | null>(null);
  const [examDetail, setExamDetail] = useState<any | null>(null);
  const [summaries, setSummaries] = useState<any[]>([]);
  const h = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    fetch(`${API_URL}/doctor/me`, { headers: h }).then((r) => r.json()).then((d) => setDoctor(d.doctor)).catch(() => {});
    fetch(`${API_URL}/doctor/patients`, { headers: h }).then((r) => r.json()).then((d) => { setPatients(d.items ?? []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  // Abas disponíveis = escopos que o paciente autorizou (e que suportamos visualmente)
  const scopes: string[] = selected?.scopes ?? [];
  const supportedTabs = ['exams', 'alerts', 'evolution', 'summary'].filter((s) => scopes.includes(s));

  const openPatient = async (p: any) => {
    setSelected(p);
    const pScopes: string[] = p.scopes ?? [];
    const pTabs = ['exams', 'alerts', 'evolution', 'summary'].filter((s) => pScopes.includes(s));
    const wantExams = pScopes.includes('exams') || pScopes.includes('alerts');
    const wantEvol = pScopes.includes('evolution');
    const wantSummary = pScopes.includes('summary');
    setTab(pTabs[0] || 'exams');
    setDetailLoading(true); setExams([]); setEvolution([]); setSummaries([]);
    try {
      if (wantExams) { const r = await fetch(`${API_URL}/doctor/patients/${p.patient.id}/exams`, { headers: h }); const d = await r.json(); if (r.ok) setExams(d.items ?? []); }
      if (wantEvol) { const r = await fetch(`${API_URL}/doctor/patients/${p.patient.id}/evolution`, { headers: h }); const d = await r.json(); if (r.ok) setEvolution(d.items ?? []); }
      if (wantSummary) { const r = await fetch(`${API_URL}/doctor/patients/${p.patient.id}/summaries`, { headers: h }); const d = await r.json(); if (r.ok) setSummaries(d.items ?? []); }
    } catch {} finally { setDetailLoading(false); }
  };

  // Abre o detalhe de um exame (todos os itens) — busca via endpoint scoped
  const openExam = async (ex: any) => {
    setSelExam(ex); setExamDetail(null);
    try { const r = await fetch(`${API_URL}/doctor/patients/${selected.patient.id}/exams/${ex.id}`, { headers: h }); const d = await r.json(); if (r.ok) setExamDetail(d.exam); } catch {}
  };

  // Alertas = todos os valores alterados agregados dos exames
  const allAlerts = exams.flatMap((ex: any) => (ex.items ?? []).map((it: any) => ({ ...it, examTitle: ex.title, examDate: ex.performedAt })));

  // Exames agrupados por ano (estilo lista do paciente)
  const examsByYear = useMemo(() => {
    const map = new Map<number, any[]>();
    for (const ex of exams) { const y = ex.performedAt ? new Date(ex.performedAt).getFullYear() : 0; if (!map.has(y)) map.set(y, []); map.get(y)!.push(ex); }
    return [...map.entries()].sort((a, b) => b[0] - a[0]).map(([year, items]) => ({ year, items }));
  }, [exams]);

  const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString('pt-BR') : 's/d';

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f4faf9' }}>
      {/* Header — mesma identidade teal do app do paciente */}
      <Box sx={{ background: 'linear-gradient(135deg,#20b2aa,#178f89)', color: '#fff', px: { xs: 2, md: 3 }, pt: 'calc(env(safe-area-inset-top) + 12px)', pb: 2, display: 'flex', alignItems: 'center', gap: 2, boxShadow: '0 4px 20px rgba(32,178,170,.25)' }}>
        <Avatar src={doctor?.id ? `${API_URL}/doctor/photo/${doctor.id}?v=${photoVer}` : undefined} sx={{ bgcolor: 'rgba(255,255,255,.2)', fontWeight: 800, border: '2px solid rgba(255,255,255,.5)' }}>{doctor?.name?.charAt(0)}</Avatar>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif' }}>🩺 {doctor?.name || 'Médico'}</Typography>
            <Chip size="small" label="Profissional" sx={{ bgcolor: 'rgba(255,255,255,.2)', color: '#fff', fontWeight: 700, height: 20, fontSize: 10 }} />
          </Stack>
          <Typography variant="caption" sx={{ opacity: 0.9 }}>{[doctor?.specialty, doctor?.crm && `CRM ${doctor.crm}`].filter(Boolean).join(' • ') || 'Portal do Médico'}</Typography>
        </Box>
      </Box>

      <Box sx={{ maxWidth: 920, mx: 'auto', p: { xs: 2, md: 3 }, pb: { xs: 11, md: 4 } }}>
        {view === 'profile' && <DoctorProfile token={token} doctor={doctor} onBack={() => setView('patients')} onSaved={(d) => setDoctor(d)} onPhoto={() => setPhotoVer((v) => v + 1)} photoVer={photoVer} />}
        {view === 'password' && <DoctorChangePassword token={token} onBack={() => setView('patients')} />}
        {view === 'patients' && loading && <Box sx={{ textAlign: 'center', py: 6 }}><CircularProgress sx={{ color: TEAL }} /></Box>}

        {/* LISTA DE PACIENTES */}
        {view === 'patients' && !loading && !selected && (
          <>
            <Typography variant="h6" sx={{ mb: 2, fontWeight: 800, color: '#0f3d3a' }}>Pacientes que compartilharam ({patients.length})</Typography>
            {patients.length === 0 && (
              <Card sx={{ borderRadius: 4 }}><CardContent><Box sx={{ textAlign: 'center', py: 4 }}>
                <Box sx={{ fontSize: 48, mb: 1 }}>📭</Box>
                <Typography color="text.secondary">Nenhum paciente compartilhou dados com você ainda.</Typography>
                <Typography variant="caption" color="text.secondary">O compartilhamento é feito pelo paciente no app dele.</Typography>
              </Box></CardContent></Card>
            )}
            <Stack spacing={1.5}>
              {patients.map((p) => (
                <Card key={p.shareId} sx={{ borderRadius: 4, cursor: 'pointer', transition: 'all .15s', border: '1px solid #e2efec', '&:hover': { boxShadow: '0 8px 24px rgba(32,178,170,.15)', transform: 'translateY(-1px)' } }} onClick={() => openPatient(p)}>
                  <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Avatar src={p.patient?.id ? `${API_URL}/patients/${p.patient.id}/photo` : undefined} sx={{ bgcolor: TEAL, fontWeight: 800 }}>{p.patient?.fullName?.charAt(0)}</Avatar>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 800, color: '#0f3d3a' }}>{p.patient?.fullName}</Typography>
                      <Typography variant="caption" sx={{ color: '#757575' }}>{[p.patient?.relationship, p.convenio || 'Particular', `desde ${fmtDate(p.createdAt)}`].filter(Boolean).join(' • ')}</Typography>
                      <Box sx={{ mt: 0.5 }}>{(p.scopes ?? []).map((s: string) => <Chip key={s} size="small" label={`${SCOPE_META[s]?.icon || ''} ${SCOPE_META[s]?.label || s}`} sx={{ mr: 0.5, height: 22, fontSize: 11, bgcolor: '#e0f2f1', color: TEAL, fontWeight: 600 }} />)}</Box>
                    </Box>
                    <Typography sx={{ color: TEAL, fontWeight: 800 }}>›</Typography>
                  </CardContent>
                </Card>
              ))}
            </Stack>
          </>
        )}

        {/* DETALHE DO PACIENTE */}
        {view === 'patients' && selected && (
          <>
            <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
              {!selExam && <Button size="small" onClick={() => setSelected(null)} sx={{ color: TEAL, textTransform: 'none', fontWeight: 700, minWidth: 0 }}>← Voltar</Button>}
              <Avatar src={selected.patient?.id ? `${API_URL}/patients/${selected.patient.id}/photo` : undefined} sx={{ bgcolor: TEAL, width: 36, height: 36, fontSize: 16 }}>{selected.patient?.fullName?.charAt(0)}</Avatar>
              <Box>
                <Typography sx={{ fontWeight: 800, color: '#0f3d3a', lineHeight: 1.1 }}>{selected.patient?.fullName}</Typography>
                <Typography variant="caption" sx={{ color: '#757575' }}>{[selected.patient?.relationship, selected.convenio || 'Particular'].filter(Boolean).join(' • ')}</Typography>
              </Box>
            </Stack>

            {selected.patient?.clinicalProfile && (
              <Card sx={{ mb: 2, borderRadius: 3, bgcolor: '#f0f9f7', border: '1px solid #d6ece8' }}><CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Typography variant="caption" sx={{ fontWeight: 800, color: TEAL }}>PERFIL CLÍNICO</Typography>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mt: 0.25 }}>{selected.patient.clinicalProfile}</Typography>
              </CardContent></Card>
            )}

            {/* Detalhe de um exame (todos os itens + PDF) OU tabs por escopo */}
            {selExam ? (
              <DoctorExamDetail exam={selExam} detail={examDetail} patientId={selected.patient.id} token={token} onBack={() => { setSelExam(null); setExamDetail(null); }} />
            ) : supportedTabs.length > 0 ? (
              <>
                <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto" sx={{ mb: 2, '& .MuiTab-root': { textTransform: 'none', fontWeight: 700, minHeight: 44 }, '& .Mui-selected': { color: `${TEAL} !important` }, '& .MuiTabs-indicator': { bgcolor: TEAL } }}>
                  {supportedTabs.map((s) => <Tab key={s} value={s} label={`${SCOPE_META[s]?.icon || ''} ${SCOPE_META[s]?.label || s}`} />)}
                </Tabs>

                {detailLoading && <Box sx={{ textAlign: 'center', py: 4 }}><CircularProgress size={28} sx={{ color: TEAL }} /></Box>}

                {/* EXAMES — agrupados por ano (igual à lista do paciente), clicáveis p/ ver detalhe */}
                {!detailLoading && tab === 'exams' && (
                  <Stack spacing={1.5}>
                    {exams.length === 0 && <Empty label="Sem exames extraídos." />}
                    {examsByYear.map((g) => (
                      <Accordion key={g.year} defaultExpanded={g.year === examsByYear[0]?.year} disableGutters elevation={0} sx={{ '&:before': { display: 'none' }, border: '1px solid #e2efec', borderRadius: '12px !important', overflow: 'hidden' }}>
                        <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ bgcolor: '#f0f9f7', minHeight: '48px !important', '& .MuiAccordionSummary-content': { my: 0.75 } }}>
                          <Typography sx={{ fontWeight: 800, color: '#0f3d3a' }}>{g.year === 0 ? 'Sem data' : g.year}</Typography>
                          <Chip size="small" label={g.items.length} sx={{ ml: 1, bgcolor: '#e0f2f1', color: TEAL, fontWeight: 700, height: 20 }} />
                        </AccordionSummary>
                        <AccordionDetails sx={{ p: 1.25 }}>
                          <Stack spacing={1}>
                            {g.items.map((ex) => (
                              <Card key={ex.id} variant="outlined" onClick={() => openExam(ex)} sx={{ borderRadius: 2.5, borderColor: '#e2efec', cursor: 'pointer', transition: 'all .15s', '&:hover': { borderColor: TEAL, boxShadow: '0 4px 12px rgba(32,178,170,.1)' } }}><CardContent sx={{ py: 1.25, '&:last-child': { pb: 1.25 } }}>
                                <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                                  <Box>
                                    <Typography sx={{ fontWeight: 700, color: '#0f3d3a' }}>{ex.title}</Typography>
                                    <Typography variant="caption" sx={{ color: '#757575' }}>{fmtDate(ex.performedAt)}{ex.sourceLab ? ` • ${ex.sourceLab}` : ''} • {ex._count?.items ?? 0} itens{ex.requestingDoctor ? ` • Dr. ${ex.requestingDoctor}` : ''}</Typography>
                                  </Box>
                                  {ex.items?.length > 0 ? <Chip size="small" color="error" label={`${ex.items.length} alterado`} sx={{ fontWeight: 700, height: 20 }} /> : <Chip size="small" label="normal" sx={{ bgcolor: '#dcfce7', color: '#15803d', fontWeight: 700, height: 20 }} />}
                                </Stack>
                                {ex.items?.length > 0 && <Box sx={{ mt: 0.75, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>{ex.items.slice(0, 6).map((it: any, i: number) => <Chip key={i} size="small" color="error" variant="outlined" label={`${it.name}: ${it.valueText}`} sx={{ height: 20, fontSize: 10 }} />)}</Box>}
                                <Typography variant="caption" sx={{ display: 'block', mt: 0.75, color: TEAL, fontWeight: 700 }}>Toque para ver todos os itens →</Typography>
                              </CardContent></Card>
                            ))}
                          </Stack>
                        </AccordionDetails>
                      </Accordion>
                    ))}
                  </Stack>
                )}

                {!detailLoading && tab === 'alerts' && (
                  <Stack spacing={1}>
                    {allAlerts.length === 0 && <Empty label="Nenhum valor alterado nos exames." />}
                    {allAlerts.map((a, i) => (
                      <Card key={i} variant="outlined" sx={{ borderRadius: 2, borderColor: '#f3dada', bgcolor: '#fff8f8' }}><CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.25, '&:last-child': { pb: 1.25 } }}>
                        <Box sx={{ fontSize: 18 }}>🚩</Box>
                        <Box sx={{ flex: 1 }}>
                          <Typography sx={{ fontWeight: 700, color: '#b91c1c' }}>{a.name} <Typography component="span" sx={{ fontWeight: 800 }}>: {a.valueText}</Typography></Typography>
                          <Typography variant="caption" sx={{ color: '#757575' }}>{a.examTitle} • {fmtDate(a.examDate)}</Typography>
                        </Box>
                      </CardContent></Card>
                    ))}
                  </Stack>
                )}

                {!detailLoading && tab === 'evolution' && (
                  <Stack spacing={1}>
                    {evolution.length === 0 && <Empty label="Sem dados de evolução (valores numéricos) ainda." />}
                    {evolution.slice(0, 50).map((it, i) => (
                      <Card key={i} variant="outlined" sx={{ borderRadius: 2, borderColor: '#e2efec' }}><CardContent sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 1.25, '&:last-child': { pb: 1.25 } }}>
                        <Box>
                          <Typography sx={{ fontWeight: 700, color: '#0f3d3a' }}>{it.name}</Typography>
                          <Typography variant="caption" sx={{ color: '#757575' }}>Ref: {[it.refLow, it.refHigh].filter((x: any) => x != null).join('-') || '—'} {it.unit || ''}</Typography>
                        </Box>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Typography sx={{ fontWeight: 800, color: it.isAbnormal ? '#b91c1c' : '#0f3d3a' }}>{it.valueNumeric} {it.unit || ''}</Typography>
                          {it.flag && <Chip size="small" label={it.flag} color={it.isAbnormal ? 'error' : 'success'} variant="outlined" sx={{ height: 20, fontSize: 10 }} />}
                        </Stack>
                      </CardContent></Card>
                    ))}
                  </Stack>
                )}

                {!detailLoading && tab === 'summary' && (
                  <Stack spacing={1.5}>
                    {summaries.length === 0 && <Empty label="O paciente ainda não gerou resumos de IA." icon="🤖" />}
                    {summaries.map((s) => (
                      <Card key={s.id} variant="outlined" sx={{ borderRadius: 3, borderColor: '#e2efec' }}><CardContent>
                        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 1 }}>
                          <Typography sx={{ fontWeight: 700, color: '#0f3d3a' }}>🤖 {s.exam?.title || 'Resumo de IA'}</Typography>
                          <Typography variant="caption" sx={{ color: '#94a3b8' }}>{new Date(s.createdAt).toLocaleDateString('pt-BR')}</Typography>
                        </Stack>
                        <Box sx={{ '& p': { margin: '0.3em 0', fontSize: 14 }, '& h3': { fontSize: '0.95rem', fontWeight: 800, color: TEAL }, '& ul,& ol': { margin: '0.3em 0', paddingLeft: '1.2em' }, '& strong': { fontWeight: 700 } }}>
                          <ReactMarkdown>{s.contentMd}</ReactMarkdown>
                        </Box>
                      </CardContent></Card>
                    ))}
                  </Stack>
                )}
              </>
            ) : (
              <Empty label="O paciente não autorizou nenhum escopo de visualização." icon="🔒" />
            )}
          </>
        )}
      </Box>

      {/* MENU vertical (Sair, Perfil, Trocar senha) — igual ao app do paciente */}
      <Drawer open={menuOpen} onClose={() => setMenuOpen(false)} PaperProps={{ sx: { width: 290, display: 'flex', flexDirection: 'column' } }}>
        <Box sx={{ p: 2, pb: 1.5, background: 'linear-gradient(135deg,#20b2aa,#178f89)', color: '#fff' }}>
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <Avatar src={doctor?.id ? `${API_URL}/doctor/photo/${doctor.id}?v=${photoVer}` : undefined} sx={{ bgcolor: 'rgba(255,255,255,.2)', fontWeight: 800, border: '2px solid rgba(255,255,255,.5)' }}>{doctor?.name?.charAt(0)}</Avatar>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif' }}>🩺 {doctor?.name || 'Médico'}</Typography>
              <Typography variant="caption" sx={{ opacity: 0.9, display: 'block' }}>{[doctor?.specialty, doctor?.crm && `CRM ${doctor.crm}`].filter(Boolean).join(' • ')}</Typography>
            </Box>
          </Stack>
        </Box>
        <Divider />
        <List sx={{ pt: 1, '& .MuiListItemButton-root': { borderRadius: 2, m: '2px 10px' } }}>
          <ListItemButton onClick={() => { setView('profile'); setMenuOpen(false); }}><ListItemIcon sx={{ minWidth: 38 }}><PersonIcon sx={{ color: TEAL }} /></ListItemIcon><ListItemText primary="Meu perfil" primaryTypographyProps={{ fontWeight: 600 }} /></ListItemButton>
          <ListItemButton onClick={() => { setView('password'); setMenuOpen(false); }}><ListItemIcon sx={{ minWidth: 38 }}><LockIcon sx={{ color: TEAL }} /></ListItemIcon><ListItemText primary="Trocar senha" primaryTypographyProps={{ fontWeight: 600 }} /></ListItemButton>
          <Divider sx={{ my: 1 }} />
          <ListItemButton onClick={() => { setMenuOpen(false); onLogout(); }} sx={{ color: 'error.main' }}><ListItemIcon sx={{ minWidth: 38 }}><LogoutIcon sx={{ color: 'error.main' }} /></ListItemIcon><ListItemText primary="Sair" primaryTypographyProps={{ fontWeight: 600 }} /></ListItemButton>
        </List>
        <Typography variant="caption" sx={{ mt: 'auto', p: 2, color: '#94a3b8' }}>Portal do Médico</Typography>
      </Drawer>

      {/* MENU RODAPÉ (igual app do paciente) — Pacientes · Perfil · Mais */}
      <Box component="nav" sx={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1100, display: 'flex', justifyContent: 'space-around', bgcolor: 'rgba(238,247,246,.97)', backdropFilter: 'blur(14px)', borderTop: '1px solid #dceaea', pb: 'env(safe-area-inset-bottom)', boxShadow: '0 -6px 24px rgba(32,178,170,.10)' }}>
        {([
          { icon: '👥', label: 'Pacientes', on: view === 'patients', onClick: () => { setView('patients'); setSelected(null); setSelExam(null); } },
          { icon: '👤', label: 'Perfil', on: view === 'profile' || view === 'password', onClick: () => setView('profile') },
          { icon: '☰', label: 'Mais', on: menuOpen, onClick: () => setMenuOpen(true) },
        ] as const).map((it) => (
          <Box key={it.label} onClick={it.onClick} sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 0.9, cursor: 'pointer', color: it.on ? TEAL : '#8a979c', transition: 'color .15s', '&:active': { transform: 'scale(.92)' } }}>
            <Box sx={{ fontSize: 21, lineHeight: 1 }}>{it.icon}</Box>
            <Typography sx={{ fontSize: 10, fontWeight: it.on ? 800 : 600, mt: 0.25, fontFamily: 'Poppins, sans-serif' }}>{it.label}</Typography>
            <Box sx={{ height: 3, width: it.on ? 22 : 0, borderRadius: 9, bgcolor: '#20b2aa', mt: 0.3, transition: 'width .2s' }} />
          </Box>
        ))}
      </Box>
    </Box>
  );
};

const Empty = ({ label, icon = '📭' }: { label: string; icon?: string }) => (
  <Card sx={{ borderRadius: 4 }}><CardContent><Box sx={{ textAlign: 'center', py: 4 }}>
    <Box sx={{ fontSize: 44, mb: 1 }}>{icon}</Box>
    <Typography color="text.secondary">{label}</Typography>
  </Box></CardContent></Card>
);

/** Perfil do médico: foto (reusa PhotoUpload) + edição de nome/especialidade/e-mail. CRM fixo. */
const DoctorProfile = ({ token, doctor, onBack, onSaved, onPhoto, photoVer }: { token: string; doctor: any; onBack: () => void; onSaved: (d: any) => void; onPhoto: () => void; photoVer: number }) => {
  const [name, setName] = useState(doctor?.name ?? '');
  const [spec, setSpec] = useState(doctor?.specialty ?? '');
  const [email, setEmail] = useState(doctor?.email ?? '');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const save = async () => {
    setSaving(true); setMsg(null);
    try {
      const r = await fetch(`${API_URL}/doctor/me`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ name, specialty: spec, email }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Falha ao salvar');
      onSaved(d.doctor); setMsg({ type: 'ok', text: 'Perfil atualizado!' });
    } catch (e: any) { setMsg({ type: 'err', text: e.message }); } finally { setSaving(false); }
  };

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
        <Button size="small" onClick={onBack} sx={{ color: TEAL, textTransform: 'none', fontWeight: 700, minWidth: 0 }}>← Voltar</Button>
        <Typography sx={{ fontWeight: 800, color: '#0f3d3a' }}>Meu perfil</Typography>
      </Stack>

      <Card sx={{ borderRadius: 4, mb: 2, background: 'linear-gradient(135deg,#e0f2f1,#d6ece8)', border: '1px solid #bfe7e3' }}>
        <CardContent>
          <Stack direction="row" spacing={2} alignItems="center">
            <PhotoUpload endpoint={`${API_URL}/doctor/me/photo`} authToken={token} src={doctor?.id ? `${API_URL}/doctor/photo/${doctor.id}?v=${photoVer}` : undefined} onUploaded={onPhoto} size={84} hideLabel />
            <Box>
              <Typography sx={{ fontWeight: 800, color: '#0f3d3a' }}>{name || 'Médico'}</Typography>
              <Typography variant="caption" color="text.secondary">CRM {doctor?.crm}{spec ? ` • ${spec}` : ''}</Typography>
              <Typography variant="caption" sx={{ display: 'block', color: '#94a3b8' }}>Toque na câmera pra trocar a foto.</Typography>
            </Box>
          </Stack>
        </CardContent>
      </Card>

      <Card sx={{ borderRadius: 4 }}>
        <CardContent>
          <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 800, color: TEAL }}>DADOS PROFISSIONAIS</Typography>
          <Stack spacing={2}>
            <TextField label="Nome completo" value={name} onChange={(e) => setName(e.target.value)} size="small" fullWidth />
            <TextField label="CRM" value={doctor?.crm ?? ''} disabled size="small" fullWidth helperText="O CRM não pode ser alterado (identidade profissional)." />
            <TextField select label="Especialidade" value={spec} onChange={(e) => setSpec(e.target.value)} size="small" fullWidth>
              <MenuItem value=""><em>Selecione…</em></MenuItem>
              {SPECIALTIES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
            </TextField>
            <TextField label="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} size="small" fullWidth />
          </Stack>
          {msg && <Alert severity={msg.type === 'ok' ? 'success' : 'error'} sx={{ mt: 1.5, py: 0.5, borderRadius: 2 }}>{msg.text}</Alert>}
          <Button variant="contained" onClick={save} disabled={saving} startIcon={saving ? <CircularProgress size={18} color="inherit" /> : undefined} sx={{ mt: 2, borderRadius: 2, textTransform: 'none', fontWeight: 800, background: 'linear-gradient(180deg,#20b2aa,#009688)', '&:hover': { background: 'linear-gradient(180deg,#1ca39e,#00897b)' } }}>{saving ? 'Salvando…' : 'Salvar perfil'}</Button>
        </CardContent>
      </Card>
    </Box>
  );
};

/** Detalhe de um exame (TODOS os itens, agrupados por categoria) + botão p/ abrir o PDF original. Igual à página do paciente. */
const DoctorExamDetail = ({ exam, detail, patientId, token, onBack }: { exam: any; detail: any | null; patientId: string; token: string; onBack: () => void }) => {
  const [pdfLoading, setPdfLoading] = useState(false);
  const items = detail?.items ?? [];
  const groups = useMemo(() => {
    const map = new Map<string, { cat: string; emoji: string; color: string; items: any[] }>();
    for (const it of items) { const c = categorize(it.name); if (!map.has(c.key)) map.set(c.key, { cat: c.cat, emoji: c.emoji, color: c.color, items: [] }); map.get(c.key)!.items.push(it); }
    return [...map.values()];
  }, [items]);
  const openPdf = async () => {
    setPdfLoading(true);
    try {
      const url = `${API_URL}/doctor/patients/${patientId}/exams/${exam.id}/file?token=${encodeURIComponent(token)}`;
      try {
        const { Capacitor } = await import('@capacitor/core');
        if (Capacitor.isNativePlatform()) { const { Browser } = await import('@capacitor/browser'); await Browser.open({ url }); return; }
      } catch { /* web: cai pra window.open */ }
      window.open(url, '_blank');
    } catch { window.alert('Não foi possível abrir o PDF.'); } finally { setPdfLoading(false); }
  };
  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1.5 }}>
        <Button size="small" onClick={onBack} sx={{ color: TEAL, textTransform: 'none', fontWeight: 700, minWidth: 0 }}>← Voltar</Button>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 800, color: '#0f3d3a' }}>{detail?.title || exam.title}</Typography>
          <Typography variant="caption" sx={{ color: '#757575' }}>{detail?.performedAt ? new Date(detail.performedAt).toLocaleDateString('pt-BR') : 's/d'}{detail?.sourceLab ? ` • ${detail.sourceLab}` : ''}{detail ? ` • ${items.length} itens` : ''}</Typography>
        </Box>
        {detail?.filePath && <Button size="small" variant="outlined" startIcon={pdfLoading ? <CircularProgress size={16} color="inherit" /> : <PdfIcon />} onClick={openPdf} sx={{ color: TEAL, borderColor: TEAL, textTransform: 'none', fontWeight: 700, borderRadius: 99, flexShrink: 0 }}>PDF</Button>}
      </Stack>
      {!detail && <Box sx={{ textAlign: 'center', py: 4 }}><CircularProgress sx={{ color: TEAL }} /></Box>}
      {detail && groups.length === 0 && <Empty label="Exame sem itens extraídos." />}
      {detail && groups.map((g) => (
        <Accordion key={g.cat} defaultExpanded disableGutters elevation={0} sx={{ '&:before': { display: 'none' }, mb: 1, border: `1px solid ${g.color}26`, borderRadius: '12px !important', overflow: 'hidden' }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ bgcolor: `${g.color}0a`, minHeight: '46px !important', '& .MuiAccordionSummary-content': { my: 0.5 } }}>
            <Box sx={{ fontSize: 18, mr: 1, display: 'inline-block' }}>{g.emoji}</Box>
            <Typography sx={{ fontWeight: 800, color: '#0f3d3a', display: 'inline-block' }}>{g.cat}</Typography>
            <Chip size="small" label={g.items.length} sx={{ ml: 1, bgcolor: `${g.color}1a`, color: g.color, fontWeight: 700, height: 20 }} />
          </AccordionSummary>
          <AccordionDetails sx={{ p: 0 }}>
            {g.items.map((it, idx) => (
              <Box key={it.id || idx} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 1.5, py: 1, borderBottom: idx < g.items.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                <Box sx={{ minWidth: 0, pr: 1 }}>
                  <Typography sx={{ fontSize: 13.5, fontWeight: it.isAbnormal ? 700 : 500, color: it.isAbnormal ? '#b91c1c' : '#0f3d3a' }}>{it.name}</Typography>
                  <Typography variant="caption" sx={{ color: '#94a3b8' }}>Ref: {it.refText || [it.refLow, it.refHigh].filter((x: any) => x != null).join(' - ') || '—'}{it.unit ? ` ${it.unit}` : ''}</Typography>
                </Box>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ flexShrink: 0 }}>
                  <Typography sx={{ fontWeight: 800, fontSize: 14, color: it.isAbnormal ? '#b91c1c' : '#0f3d3a' }}>{it.valueText ?? '—'}</Typography>
                  {it.flag && <Chip size="small" label={it.flag} sx={{ height: 18, fontSize: 9, bgcolor: it.isAbnormal ? '#fee2e2' : '#dcfce7', color: it.isAbnormal ? '#b91c1c' : '#15803d', fontWeight: 700 }} />}
                </Stack>
              </Box>
            ))}
          </AccordionDetails>
        </Accordion>
      ))}
    </Box>
  );
};

/** Trocar senha do médico. */
const DoctorChangePassword = ({ token, onBack }: { token: string; onBack: () => void }) => {
  const [cur, setCur] = useState(''); const [nw, setNw] = useState(''); const [cf, setCf] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const save = async () => {
    if (nw !== cf) { setMsg({ type: 'err', text: 'A nova senha e a confirmação não conferem.' }); return; }
    if (nw.length < 6) { setMsg({ type: 'err', text: 'Nova senha mín. 6 caracteres.' }); return; }
    setSaving(true); setMsg(null);
    try { const r = await fetch(`${API_URL}/doctor/me/password`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ currentPassword: cur, newPassword: nw }) }); const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Falha'); setMsg({ type: 'ok', text: 'Senha alterada com sucesso!' }); setCur(''); setNw(''); setCf(''); }
    catch (e: any) { setMsg({ type: 'err', text: e.message }); } finally { setSaving(false); }
  };
  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
        <Button size="small" onClick={onBack} sx={{ color: TEAL, textTransform: 'none', fontWeight: 700, minWidth: 0 }}>← Voltar</Button>
        <Typography sx={{ fontWeight: 800, color: '#0f3d3a' }}>🔒 Trocar senha</Typography>
      </Stack>
      <Card sx={{ borderRadius: 4 }}><CardContent>
        <Stack spacing={2}>
          <TextField type="password" label="Senha atual" value={cur} onChange={(e) => setCur(e.target.value)} size="small" fullWidth />
          <TextField type="password" label="Nova senha (mín. 6)" value={nw} onChange={(e) => setNw(e.target.value)} size="small" fullWidth />
          <TextField type="password" label="Confirmar nova senha" value={cf} onChange={(e) => setCf(e.target.value)} size="small" fullWidth />
          {msg && <Alert severity={msg.type === 'ok' ? 'success' : 'error'} sx={{ py: 0.5, borderRadius: 2 }}>{msg.text}</Alert>}
          <Button variant="contained" onClick={save} disabled={saving || !cur || !nw} startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <LockIcon />} sx={{ alignSelf: 'flex-start', borderRadius: 2, textTransform: 'none', fontWeight: 800, background: 'linear-gradient(180deg,#20b2aa,#009688)', '&:hover': { background: 'linear-gradient(180deg,#1ca39e,#00897b)' } }}>{saving ? 'Alterando…' : 'Alterar senha'}</Button>
        </Stack>
      </CardContent></Card>
    </Box>
  );
};
