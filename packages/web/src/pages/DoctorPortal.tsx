import { useState, useEffect, useMemo, useRef } from 'react';
import { Box, Card, CardContent, Typography, TextField, Button, CircularProgress, Stack, Chip, Avatar, MenuItem, Alert, Divider, InputAdornment, IconButton, Link, Drawer, List, ListItemButton, ListItemText, ListItemIcon, Accordion, AccordionSummary, AccordionDetails, Badge, InputBase, Paper, useMediaQuery, useTheme } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import LogoutIcon from '@mui/icons-material/Logout';
import LockIcon from '@mui/icons-material/Lock';
import PersonIcon from '@mui/icons-material/Person';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PdfIcon from '@mui/icons-material/PictureAsPdf';
import SearchIcon from '@mui/icons-material/Search';
import GroupsIcon from '@mui/icons-material/Groups';
import { API_URL } from '../config';
import { DrExame } from '../components/DrExame';
import { MfaSetupCard } from '../components/mfa/MfaSetupCard';
import { SPECIALTIES, UFS } from '../utils/medicalData';
import { PhotoUpload } from '../components/PhotoUpload';
import { CATS, categorize, refLabel } from '../utils/medicalData';
import ReactMarkdown from 'react-markdown';
import { ResponsiveContainer, LineChart, Line, ReferenceArea, XAxis, YAxis, Tooltip } from 'recharts';

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
  notes: { label: 'Anotações', icon: '📝' },
};

export const DoctorPortalPage = () => {
  const navigate = useNavigate();
  const [token, setToken] = useState<string | null>(localStorage.getItem(docKey));
  const [doctor, setDoctor] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [pwd, setPwd] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [mode, setMode] = useState<'login' | 'register'>(() => { const q = window.location.hash.split('?')[1] || ''; return new URLSearchParams(q).get('mode') === 'register' ? 'register' : 'login'; });
  const [regName, setRegName] = useState(''); const [regCrm, setRegCrm] = useState(''); const [regUf, setRegUf] = useState(''); const [regSpec, setRegSpec] = useState('');
  const [regLooking, setRegLooking] = useState(false);
  const [regHint, setRegHint] = useState<{ type: 'success' | 'warning'; msg: string } | null>(null);
  const [regSpecOther, setRegSpecOther] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setErr('');
    try {
      const finalSpec = regSpec === 'Outro' ? regSpecOther.trim() : regSpec;
      const body = mode === 'login' ? { email: email.trim().toLowerCase(), password: pwd } : { name: regName.trim(), crm: regCrm.trim(), crmUf: regUf, specialty: finalSpec, email: email.trim().toLowerCase(), password: pwd };
      const r = await fetch(`${API_URL}/doctor/${mode}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Falha');
      if (d.needsVerification) { setPendingEmail(d.email); return; } // médico valida e-mail (OTP) antes de logar
      localStorage.setItem(docKey, d.token); setToken(d.token); setDoctor(d.doctor);
    } catch (e: any) { setErr(e.message); } finally { setLoading(false); }
  };

  // Verifica o código enviado por e-mail → ativa a conta e loga.
  const verifyEmail = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setErr('');
    try {
      const r = await fetch(`${API_URL}/doctor/verify-email`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: pendingEmail, code: verifyCode.trim() }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Código inválido.');
      localStorage.setItem(docKey, d.token); setToken(d.token); setDoctor(d.doctor);
    } catch (e: any) { setErr(e.message); } finally { setLoading(false); }
  };

  const logout = () => { localStorage.removeItem(docKey); navigate('/entrar?role=medico'); };

  // Busca CRM no conselho (consultaCRM) pra pré-preencher nome + especialidade no cadastro.
  const buscarCrmReg = async () => {
    const c = regCrm.replace(/\D/g, '');
    if (!c || regUf.length !== 2) { setRegHint({ type: 'warning', msg: 'Informe o CRM e o estado (UF).' }); return; }
    setRegLooking(true); setRegHint(null);
    try {
      const r = await fetch(`${API_URL}/doctor/crm?crm=${encodeURIComponent(c)}&uf=${encodeURIComponent(regUf)}`);
      const d = await r.json();
      if (d.found) { if (d.name) setRegName(d.name); if (d.specialty) setRegSpec(d.specialty); setRegHint({ type: 'success', msg: `🔍 ${d.name}${d.specialty ? ' — ' + d.specialty : ''}${d.situation ? ' • ' + d.situation : ''}. Confirme e complete abaixo.` }); }
      else setRegHint({ type: 'warning', msg: '✍️ Não encontrado no conselho — preencha nome e especialidade manualmente.' });
    } catch { setRegHint({ type: 'warning', msg: 'Busca indisponível agora — preencha manualmente.' }); }
    finally { setRegLooking(false); }
  };

  if (token) return <DoctorDashboard token={token} onLogout={logout} />;

  // Etapa de verificação de e-mail (código OTP enviado no cadastro do médico).
  if (pendingEmail) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2, background: 'linear-gradient(135deg,#e6f7f5,#d4f0ec)' }}>
        <Box sx={{ width: '100%', maxWidth: 420, bgcolor: '#fff', borderRadius: '16px', boxShadow: '0 10px 40px rgba(0,80,70,.12)', p: { xs: 3, sm: 4 } }}>
          <Button size="small" onClick={() => { setPendingEmail(null); setErr(''); }} sx={{ color: '#64748b', textTransform: 'none', fontWeight: 700, p: 0, minWidth: 0, mb: 1 }}>← Voltar</Button>
          <Typography variant="h6" sx={{ fontWeight: 800, color: '#0f3d3a', mb: 0.5 }}>✉️ Confirme seu e-mail</Typography>
          <Typography variant="body2" sx={{ color: '#4a6b66', mb: 2 }}>Enviamos um código de 6 dígitos para <strong>{pendingEmail}</strong>. Digite abaixo pra ativar sua conta de médico.</Typography>
          <Box component="form" onSubmit={verifyEmail} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField autoFocus value={verifyCode} onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="Código (6 dígitos)" inputMode="numeric" required sx={fieldSx} />
            {err && <Alert severity="error" sx={{ py: 0.5, borderRadius: 2 }}>{err}</Alert>}
            <Button type="submit" variant="contained" size="large" fullWidth disabled={loading} sx={{ borderRadius: '8px', py: 1.35, fontWeight: 800, textTransform: 'none', fontSize: 16, background: 'linear-gradient(180deg,#20b2aa,#009688)' }}>{loading ? <CircularProgress size={22} color="inherit" /> : 'Ativar conta'}</Button>
          </Box>
        </Box>
      </Box>
    );
  }

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
            <Box sx={{ display: 'flex', gap: 1 }}>
              <TextField placeholder="CRM (número)" required value={regCrm} onChange={(e) => setRegCrm(e.target.value.replace(/[^\d]/g, ''))} sx={{ ...fieldSx, flex: 1 }} helperText="Mesmo CRM do convite."
                slotProps={{ input: { startAdornment: <InputAdornment position="start"><I.Badge /></InputAdornment> } }} />
              <TextField select label="UF" required value={regUf} onChange={(e) => setRegUf(e.target.value)} sx={{ ...fieldSx, width: 92 }}>
                <MenuItem value=""><em>—</em></MenuItem>
                {UFS.map((u) => <MenuItem key={u} value={u}>{u}</MenuItem>)}
              </TextField>
            </Box>
            <Button type="button" variant="outlined" size="small" onClick={buscarCrmReg} disabled={regLooking} startIcon={regLooking ? <CircularProgress size={15} color="inherit" /> : <span>🔍</span>} sx={{ alignSelf: 'flex-start', borderRadius: 99, textTransform: 'none', fontWeight: 700, color: TEAL, borderColor: TEAL }}>
              {regLooking ? 'Buscando…' : 'Buscar dados no conselho'}
            </Button>
            {regHint && <Alert severity={regHint.type} icon={false} sx={{ py: 0.5, borderRadius: 2, '& .MuiAlert-message': { fontSize: 12.5 } }}>{regHint.msg}</Alert>}
            <TextField select label="Especialidade" value={regSpec} onChange={(e) => setRegSpec(e.target.value)} sx={fieldSx} fullWidth>
              <MenuItem value=""><em>Selecione…</em></MenuItem>
              {SPECIALTIES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
            </TextField>
            {regSpec === 'Outro' && (
              <TextField placeholder="Digite sua especialidade (ex.: Cirurgia de Cabeça e Pescoço)" value={regSpecOther} onChange={(e) => setRegSpecOther(e.target.value)} sx={fieldSx} fullWidth required />
            )}
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
  const [notes, setNotes] = useState<any[]>([]);
  const [newNote, setNewNote] = useState('');
  const [chartFilter, setChartFilter] = useState<'6m' | '1y' | 'all'>('1y');
  const [patQuery, setPatQuery] = useState('');
  const [patAlertOnly, setPatAlertOnly] = useState(false);
  const h = { Authorization: `Bearer ${token}` };
  // Web (sm+): menu vertical PERMANENTE à esquerda (igual ao app do paciente) + sem rodapé.
  // Mobile: mantém o Drawer overlay + rodapé (Pacientes · Perfil · Mais).
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('sm'));

  useEffect(() => {
    fetch(`${API_URL}/doctor/me`, { headers: h }).then((r) => r.json()).then((d) => setDoctor(d.doctor)).catch(() => {});
    fetch(`${API_URL}/doctor/patients`, { headers: h }).then((r) => r.json()).then((d) => { setPatients(d.items ?? []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  // Abas disponíveis = escopos que o paciente autorizou (e que suportamos visualmente)
  const scopes: string[] = selected?.scopes ?? [];
  const supportedTabs = [...['exams', 'alerts', 'evolution', 'summary'].filter((s) => scopes.includes(s)), 'notes'];

  // --- Anotações ---
  const addNote = async () => {
    const content = newNote.trim();
    if (!content || !selected) return;
    const r = await fetch(`${API_URL}/doctor/patients/${selected.patient.id}/notes`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ content }) });
    const d = await r.json();
    if (r.ok) { setNotes((n) => [{ ...d.note }, ...n]); setNewNote(''); }
  };
  const delNote = async (id: string) => {
    if (!window.confirm('Excluir esta anotação?')) return;
    await fetch(`${API_URL}/doctor/notes/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    setNotes((n) => n.filter((x) => x.id !== id));
  };
  const saveNote = async (id: string, content: string) => {
    const r = await fetch(`${API_URL}/doctor/notes/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ content }) });
    const d = await r.json();
    if (r.ok) setNotes((n) => n.map((x) => x.id === id ? d.note : x));
  };

  // --- Copiar resumo pro prontuário (#4) ---
  const copySummary = async () => {
    if (!selected) return;
    const lines = [
      `Paciente: ${selected.patient?.fullName ?? ''}`,
      selected.convenio ? `Convênio: ${selected.convenio}` : '',
      exams[0] ? `Último exame: ${exams[0].title} (${fmtDate(exams[0].performedAt)})${exams[0].sourceLab ? ` — ${exams[0].sourceLab}` : ''}` : 'Sem exames extraídos.',
      allAlerts.length ? `Valores alterados (${allAlerts.length}):` : 'Sem valores alterados.',
      ...allAlerts.map((a) => `- ${a.name}: ${a.valueText} (${a.examTitle}, ${fmtDate(a.examDate)})`),
      '',
      'Resumo gerado pelo app Meus Exames — conteúdo educativo, não substitui avaliação clínica.',
    ].filter((x) => x !== '');
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      window.alert('Resumo copiado! Cole no prontuário do paciente.');
    } catch { window.alert('Não foi possível copiar. Selecione e copie manualmente.'); }
  };

  const openPatient = async (p: any) => {
    setSelected(p);
    const pScopes: string[] = p.scopes ?? [];
    const pTabs = ['exams', 'alerts', 'evolution', 'summary'].filter((s) => pScopes.includes(s));
    const wantExams = pScopes.includes('exams') || pScopes.includes('alerts');
    const wantEvol = pScopes.includes('evolution');
    const wantSummary = pScopes.includes('summary');
    setTab(pTabs[0] || 'exams');
    setDetailLoading(true); setExams([]); setEvolution([]); setSummaries([]); setNotes([]);
    try {
      if (wantExams) { const r = await fetch(`${API_URL}/doctor/patients/${p.patient.id}/exams`, { headers: h }); const d = await r.json(); if (r.ok) setExams(d.items ?? []); }
      if (wantEvol) { const r = await fetch(`${API_URL}/doctor/patients/${p.patient.id}/evolution`, { headers: h }); const d = await r.json(); if (r.ok) setEvolution(d.items ?? []); }
      if (wantSummary) { const r = await fetch(`${API_URL}/doctor/patients/${p.patient.id}/summaries`, { headers: h }); const d = await r.json(); if (r.ok) setSummaries(d.items ?? []); }
      // Anotações sempre (são do próprio médico, não dependem de escopo)
      { const r = await fetch(`${API_URL}/doctor/patients/${p.patient.id}/notes`, { headers: h }); const d = await r.json(); if (r.ok) setNotes(d.items ?? []); }
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

  // Gesto de voltar do Android (Capacitor): fecha detalhe do exame → fecha paciente → volta à lista → sai.
  // O App.tsx ignora o back na rota /doctor; este listener é o dono da navegação aqui.
  const backRef = useRef<() => void>(() => {});
  // Voltar de UI (fecha exame → fecha paciente → lista). Sem sair do app.
  const goBack = () => {
    if (selExam) { setSelExam(null); setExamDetail(null); return; }
    if (selected) { setSelected(null); return; }
    if (view !== 'patients') setView('patients');
  };
  backRef.current = () => {
    if (selExam || selected || view !== 'patients') { goBack(); return; }
    // Topo do portal: NÃO faz history.back (vai pra blank/exit = "mata o app" no gesto).
    // Fica no portal; o médico sai pela opção Sair do menu.
  };
  // Escuta o evento global 'app:back' (dispatchado pelo handler central no App.tsx).
  // Trata o back por estado (fecha exame → paciente → lista) e cancela o default p/ o App não sair do app.
  useEffect(() => {
    const handler = (e: Event) => { e.preventDefault(); backRef.current(); };
    window.addEventListener('app:back', handler);
    return () => window.removeEventListener('app:back', handler);
  }, []);

  // Conteúdo do menu vertical (sidebar permanente no desktop / Drawer overlay no mobile).
  // Mesma fonte de verdade pros dois — preserva a identidade do portal do médico.
  const renderSideMenu = (onNav: () => void) => (
    <>
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
      <Box sx={{ mx: '10px', mt: 1.5, p: 1.25, borderRadius: 2, background: 'linear-gradient(135deg,#e0f2f1,#d6ece8)', border: '1px solid #bfe7e3' }}>
        <Typography variant="caption" sx={{ fontWeight: 800, color: TEAL, display: 'block' }}>PLANO</Typography>
        <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#0f3d3a' }}>✅ Grátis (médico)</Typography>
        <Typography variant="caption" sx={{ color: '#4a6b66' }}>O portal do médico é gratuito por ora. Em breve: Premium do Médico.</Typography>
      </Box>
      <List sx={{ pt: 1, '& .MuiListItemButton-root': { borderRadius: 2, m: '2px 10px' } }}>
        <ListItemButton selected={view === 'patients'} onClick={() => { setView('patients'); setSelected(null); setSelExam(null); onNav(); }}><ListItemIcon sx={{ minWidth: 38 }}><GroupsIcon sx={{ color: TEAL }} /></ListItemIcon><ListItemText primary="Pacientes" primaryTypographyProps={{ fontWeight: 600 }} /></ListItemButton>
        <ListItemButton selected={view === 'profile'} onClick={() => { setView('profile'); onNav(); }}><ListItemIcon sx={{ minWidth: 38 }}><PersonIcon sx={{ color: TEAL }} /></ListItemIcon><ListItemText primary="Meu perfil" primaryTypographyProps={{ fontWeight: 600 }} /></ListItemButton>
        <ListItemButton selected={view === 'password'} onClick={() => { setView('password'); onNav(); }}><ListItemIcon sx={{ minWidth: 38 }}><LockIcon sx={{ color: TEAL }} /></ListItemIcon><ListItemText primary="Trocar senha" primaryTypographyProps={{ fontWeight: 600 }} /></ListItemButton>
        <Divider sx={{ my: 1 }} />
        <ListItemButton onClick={() => { onNav(); onLogout(); }} sx={{ color: 'error.main' }}><ListItemIcon sx={{ minWidth: 38 }}><LogoutIcon sx={{ color: 'error.main' }} /></ListItemIcon><ListItemText primary="Sair" primaryTypographyProps={{ fontWeight: 600 }} /></ListItemButton>
      </List>
      <Typography variant="caption" sx={{ mt: 'auto', p: 2, color: '#94a3b8' }}>Portal do Médico</Typography>
    </>
  );

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f4faf9', display: 'flex' }}>
      {/* MENU vertical PERMANENTE (web/desktop) — abre igual ao app do paciente. Mobile usa o Drawer abaixo. */}
      {isDesktop && (
        <Box component="nav" sx={{ width: 290, flexShrink: 0, borderRight: '1px solid #dceaea', bgcolor: '#fff', display: 'flex', flexDirection: 'column', position: 'sticky', top: 0, height: '100vh', overflowY: 'auto' }}>
          {renderSideMenu(() => {})}
        </Box>
      )}
      <Box sx={{ flex: 1, minWidth: 0 }}>
      {/* Header — mesma identidade teal do app do paciente */}
      <Box sx={{ background: 'linear-gradient(135deg,#20b2aa,#178f89)', color: '#fff', px: { xs: 2, md: 3 }, pt: 'calc(env(safe-area-inset-top) + 12px)', pb: 2, display: 'flex', alignItems: 'center', gap: 2, boxShadow: '0 4px 20px rgba(32,178,170,.25)' }}>
        {(selected || selExam) && (
          <IconButton onClick={goBack} size="small" title="Voltar" sx={{ color: '#fff', bgcolor: 'rgba(255,255,255,.15)', '&:hover': { bgcolor: 'rgba(255,255,255,.25)' }, flexShrink: 0, width: 34, height: 34 }}>←</IconButton>
        )}
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
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
              <Typography variant="h6" sx={{ fontWeight: 800, color: '#0f3d3a' }}>Pacientes ({patients.length})</Typography>
              {patients.some((p) => p.hasAlerts) && <Chip size="small" color="error" label={`🔴 ${patients.filter((p) => p.hasAlerts).length} com alerta`} sx={{ fontWeight: 700 }} />}
            </Stack>
            {patients.length > 0 && (
              <Stack spacing={1} sx={{ mb: 1.5 }}>
                <Paper variant="outlined" sx={{ p: '2px 12px', display: 'flex', alignItems: 'center', gap: 1, borderRadius: 99 }}>
                  <SearchIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
                  <InputBase value={patQuery} onChange={(e: any) => setPatQuery(e.target.value)} placeholder="Buscar paciente pelo nome…" sx={{ flex: 1, fontSize: 14 }} />
                  {patQuery && <Chip size="small" label="limpar" onClick={() => setPatQuery('')} sx={{ height: 22 }} />}
                </Paper>
                {patients.some((p) => p.hasAlerts) && (
                  <Chip size="small" icon={<Box component="span" sx={{ pl: 0.75 }}>🔴</Box>} label="Só com alerta" onClick={() => setPatAlertOnly((v) => !v)} color={patAlertOnly ? 'error' : 'default'} variant={patAlertOnly ? 'filled' : 'outlined'} sx={{ fontWeight: 700, alignSelf: 'flex-start' }} />
                )}
              </Stack>
            )}
            {patients.length === 0 && (
              <Card sx={{ borderRadius: 4 }}><CardContent><Box sx={{ textAlign: 'center', py: 4 }}>
                <Box sx={{ fontSize: 48, mb: 1 }}>📭</Box>
                <Typography color="text.secondary">Nenhum paciente compartilhou dados com você ainda.</Typography>
                <Typography variant="caption" color="text.secondary">O compartilhamento é feito pelo paciente no app dele.</Typography>
              </Box></CardContent></Card>
            )}
            <Stack spacing={1.5}>
              {(() => {
                const q = patQuery.trim().toLowerCase();
                const filtered = patients.filter((p) => (!q || (p.patient?.fullName || '').toLowerCase().includes(q) || (p.code || '').toLowerCase().includes(q)) && (!patAlertOnly || p.hasAlerts));
                filtered.sort((a, b) => { const oa = a.ownerId || '', ob = b.ownerId || ''; if (oa !== ob) return (a.ownerName || '').localeCompare(b.ownerName || ''); return (Number(!!b.hasAlerts) - Number(!!a.hasAlerts)) || ((b.lastExamAt ? new Date(b.lastExamAt).getTime() : 0) - (a.lastExamAt ? new Date(a.lastExamAt).getTime() : 0)); });
                // Agrupa por titular (ownerId). 1 membro = card solto; 2+ = accordion COLAPSADO (não inunda com 100 famílias).
                const groups: { ownerId: string; ownerName: string; items: any[] }[] = [];
                for (const p of filtered) {
                  const oid = p.ownerId || p.shareId;
                  let g = groups.find((x) => x.ownerId === oid);
                  if (!g) { g = { ownerId: oid, ownerName: p.ownerName || 'Sem titular', items: [] }; groups.push(g); }
                  g.items.push(p);
                }
                const card = (p: any, key: string) => {
                  const sex = p.sex === 'female' ? 'F' : p.sex === 'male' ? 'M' : null;
                  return (
                    <Card key={key} sx={{ borderRadius: 4, cursor: 'pointer', transition: 'all .15s', border: '1px solid #e2efec', borderLeft: p.hasAlerts ? '5px solid #ef4444' : '5px solid transparent', '&:hover': { boxShadow: '0 8px 24px rgba(32,178,170,.15)', transform: 'translateY(-1px)' } }} onClick={() => openPatient(p)}>
                      <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.75, py: 1.5 }}>
                        <Badge color="error" variant="dot" invisible={!p.hasAlerts} overlap="circular" anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
                          <Avatar src={p.patient?.id ? `${API_URL}/patients/${p.patient.id}/photo` : undefined} sx={{ bgcolor: TEAL, fontWeight: 800, width: 48, height: 48 }}>{p.patient?.fullName?.charAt(0)}</Avatar>
                        </Badge>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Stack direction="row" alignItems="center" spacing={0.75} useFlexGap flexWrap="wrap">
                            <Typography sx={{ fontWeight: 800, color: '#0f3d3a' }}>{p.patient?.fullName}</Typography>
                            {p.code && <Chip size="small" label={p.code} sx={{ height: 18, fontSize: 10, bgcolor: '#0f3d3a', color: '#fff', fontWeight: 700, fontFamily: 'monospace' }} />}
                            {p.relationship && <Chip size="small" label={p.relationship} sx={{ height: 18, fontSize: 10, bgcolor: '#f1f5f9', color: '#475569', fontWeight: 600 }} />}
                            {p.age != null && <Chip size="small" label={`${p.age}a`} sx={{ height: 18, fontSize: 10, bgcolor: '#f1f5f9', color: '#475569', fontWeight: 700 }} />}
                            {sex && <Chip size="small" label={sex} sx={{ height: 18, fontSize: 10, bgcolor: sex === 'F' ? '#fce7f3' : '#dbeafe', color: sex === 'F' ? '#be185d' : '#1d4ed8', fontWeight: 700 }} />}
                            {p.hasAlerts && <Chip size="small" label="alerta" sx={{ height: 18, fontSize: 10, bgcolor: '#fee2e2', color: '#b91c1c', fontWeight: 700 }} />}
                          </Stack>
                          <Box sx={{ mt: 0.5, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                            {p.latestWeight && <Chip size="small" label={`⚖️ ${p.latestWeight.value}kg`} sx={{ height: 20, fontSize: 10, bgcolor: '#f0f9f7', color: '#0f3d3a' }} />}
                            {p.lastExamAt && <Chip size="small" label={`📅 ${fmtDate(p.lastExamAt)}`} sx={{ height: 20, fontSize: 10, bgcolor: '#f0f9f7', color: '#0f3d3a' }} />}
                            {p.examsCount > 0 && <Chip size="small" label={`📋 ${p.examsCount}`} sx={{ height: 20, fontSize: 10, bgcolor: '#f0f9f7', color: '#0f3d3a' }} />}
                            <Chip size="small" label={p.convenio || 'Particular'} sx={{ height: 20, fontSize: 10, bgcolor: '#e0f2f1', color: TEAL, fontWeight: 600 }} />
                          </Box>
                        </Box>
                        <Typography sx={{ color: TEAL, fontWeight: 800, fontSize: 20 }}>›</Typography>
                      </CardContent>
                    </Card>
                  );
                };
                return groups.map((g) => {
                  if (g.items.length === 1) return card(g.items[0], g.items[0].shareId);
                  const famAlerts = g.items.filter((p) => p.hasAlerts).length;
                  return (
                    <Accordion key={g.ownerId} defaultExpanded={false} disableGutters elevation={0} sx={{ '&:before': { display: 'none' }, border: '1px solid #e2efec', borderRadius: '12px !important', overflow: 'hidden' }}>
                      <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ bgcolor: '#f0f9f7', minHeight: '48px !important', '& .MuiAccordionSummary-content': { my: 0.5 } }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                          <Box sx={{ fontSize: 18 }}>👨‍👩‍👧</Box>
                          <Typography sx={{ fontWeight: 800, color: '#0f3d3a', flex: 1, minWidth: 0 }}>Família {g.ownerName}</Typography>
                          <Chip size="small" label={`${g.items.length}`} sx={{ height: 20, fontSize: 10, bgcolor: '#e0f2f1', color: TEAL, fontWeight: 700 }} />
                          {famAlerts > 0 && <Chip size="small" color="error" label={`${famAlerts} alerta`} sx={{ height: 20, fontSize: 10, fontWeight: 700 }} />}
                        </Box>
                      </AccordionSummary>
                      <AccordionDetails sx={{ p: 1.25, bgcolor: '#fbfdfc' }}><Stack spacing={1.25}>{g.items.map((p) => card(p, p.shareId))}</Stack></AccordionDetails>
                    </Accordion>
                  );
                });
              })()}
            </Stack>
          </>
        )}

        {/* DETALHE DO PACIENTE */}
        {view === 'patients' && selected && (
          <>
            <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
              {/* Voltar só no header (←) — um botão só, igual app profissional */}
              <Avatar src={selected.patient?.id ? `${API_URL}/patients/${selected.patient.id}/photo` : undefined} sx={{ bgcolor: TEAL, width: 36, height: 36, fontSize: 16 }}>{selected.patient?.fullName?.charAt(0)}</Avatar>
              <Box>
                <Stack direction="row" alignItems="center" spacing={0.75}>
                  <Typography sx={{ fontWeight: 800, color: '#0f3d3a', lineHeight: 1.1 }}>{selected.patient?.fullName}</Typography>
                  {selected.code && <Chip size="small" label={selected.code} sx={{ height: 18, fontSize: 10, bgcolor: '#0f3d3a', color: '#fff', fontWeight: 700, fontFamily: 'monospace' }} />}
                </Stack>
                <Typography variant="caption" sx={{ color: '#757575' }}>{[selected.age != null ? `${selected.age} anos` : null, selected.sex === 'female' ? 'Feminino' : selected.sex === 'male' ? 'Masculino' : null, selected.patient?.relationship, selected.convenio || 'Particular', selected.latestWeight ? `${selected.latestWeight.value} kg` : null].filter(Boolean).join(' • ')}</Typography>
              </Box>
            </Stack>

            {selected.patient?.clinicalProfile && (
              <Card sx={{ mb: 2, borderRadius: 3, bgcolor: '#f0f9f7', border: '1px solid #d6ece8' }}><CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Typography variant="caption" sx={{ fontWeight: 800, color: TEAL }}>PERFIL CLÍNICO</Typography>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mt: 0.25 }}>{selected.patient.clinicalProfile}</Typography>
              </CardContent></Card>
            )}

            {/* HERO "resumo de 10 segundos" — alertas críticos + último exame + copiar resumo */}
            {!selExam && (
              <Card sx={{ mb: 2, borderRadius: 4, background: 'linear-gradient(135deg,#0f3d3a,#178f89)', color: '#fff', overflow: 'hidden', boxShadow: '0 8px 28px rgba(15,61,58,.22)' }}>
                <CardContent>
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: allAlerts.length ? 1.25 : 0 }}>
                    <Box sx={{ flex: '1 1 200px' }}>
                      <Typography variant="caption" sx={{ opacity: 0.8, fontWeight: 800, letterSpacing: 0.6 }}>RESUMO RÁPIDO</Typography>
                      <Typography sx={{ fontWeight: 800, fontSize: 19, fontFamily: 'Poppins, sans-serif', lineHeight: 1.2 }}>{allAlerts.length > 0 ? `🔴 ${allAlerts.length} valor(es) alterado(s)` : '✅ Sem alterações relevantes'}</Typography>
                      <Typography variant="caption" sx={{ opacity: 0.88, display: 'block', mt: 0.25 }}>{exams[0] ? `${exams[0].title} • ${fmtDate(exams[0].performedAt)}` : 'Sem exames extraídos'}{exams.length > 0 ? ` • ${exams.length} exame(s)` : ''}</Typography>
                    </Box>
                    <Button size="small" variant="outlined" onClick={copySummary} sx={{ color: '#fff', borderColor: 'rgba(255,255,255,.5)', textTransform: 'none', fontWeight: 700, borderRadius: 99, flexShrink: 0, '&:hover': { borderColor: '#fff', bgcolor: 'rgba(255,255,255,.12)' } }}>📋 Copiar resumo</Button>
                  </Stack>
                  {allAlerts.length > 0 && (
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                      {allAlerts.slice(0, 10).map((a, i) => <Chip key={i} size="small" label={`${a.name}: ${a.valueText}`} sx={{ bgcolor: 'rgba(255,255,255,.18)', color: '#fff', fontWeight: 600, height: 22, fontSize: 11 }} />)}
                    </Box>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Detalhe de um exame (todos os itens + PDF) OU tabs por escopo */}
            {selExam ? (
              <DoctorExamDetail exam={selExam} detail={examDetail} patientId={selected.patient.id} token={token} onBack={() => { setSelExam(null); setExamDetail(null); }} />
            ) : supportedTabs.length > 0 ? (
              <>
                {/* Abas como controle segmentado (wrap) — todas visíveis, sem rolagem escondida */}
                <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mb: 2 }}>
                  {supportedTabs.map((s) => {
                    const on = tab === s;
                    const meta = SCOPE_META[s] || { icon: '📄', label: s };
                    return (
                      <Chip key={s} onClick={() => setTab(s)} label={`${meta.icon} ${meta.label}`} sx={{ height: 32, borderRadius: 99, fontSize: 12.5, fontWeight: on ? 800 : 600, cursor: 'pointer', bgcolor: on ? TEAL : 'transparent', color: on ? '#fff' : TEAL, border: `1px solid ${on ? TEAL : '#bfe0dc'}`, '&:hover': { bgcolor: on ? '#0f7670' : 'rgba(32,178,170,.08)' } }} />
                    );
                  })}
                </Stack>

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
                                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1.5}>
                                  <Box sx={{ flex: '1 1 auto', minWidth: 0 }}>
                                    <Typography sx={{ fontWeight: 700, color: '#0f3d3a' }}>{ex.title}</Typography>
                                    <Typography variant="caption" sx={{ color: '#757575' }}>{fmtDate(ex.performedAt)}{ex.sourceLab ? ` • ${ex.sourceLab}` : ''} • {ex._count?.items ?? 0} itens{ex.requestingDoctor ? ` • Dr. ${ex.requestingDoctor}` : ''}</Typography>
                                  </Box>
                                  <Box sx={{ flexShrink: 0, pt: 0.25 }}>
                                    {ex.items?.length > 0 ? <Chip size="small" color="error" label={`${ex.items.length} alterado`} sx={{ fontWeight: 700, height: 20, whiteSpace: 'nowrap' }} /> : <Chip size="small" label="normal" sx={{ bgcolor: '#dcfce7', color: '#15803d', fontWeight: 700, height: 20, whiteSpace: 'nowrap' }} />}
                                  </Box>
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

                {!detailLoading && tab === 'alerts' && (() => {
                  const exWithAlerts = exams.filter((ex: any) => ex.items?.length).map((ex: any) => ({ ...ex, items: [...ex.items].sort((a: any, b: any) => categorize(a.name).key.localeCompare(categorize(b.name).key)) }));
                  if (!exWithAlerts.length) return <Empty label="Nenhum valor alterado nos exames." />;
                  return (
                    <Stack spacing={1}>
                      {exWithAlerts.map((ex, idx) => (
                        <Accordion key={ex.id} defaultExpanded={idx === 0} disableGutters elevation={0} sx={{ border: '1px solid #f3dada', borderRadius: '12px', overflow: 'hidden', '&:before': { display: 'none' } }}>
                          <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ bgcolor: '#fff5f5' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', gap: 1 }}>
                              <Box component="span" sx={{ fontSize: 18 }}>🚨</Box>
                              <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Typography sx={{ fontWeight: 800, color: '#b91c1c', lineHeight: 1.2 }}>{ex.title}</Typography>
                                <Typography variant="caption" sx={{ color: '#9b3a3a' }}>{fmtDate(ex.performedAt)}{ex.sourceLab ? ` • ${ex.sourceLab}` : ''}</Typography>
                              </Box>
                              <Chip size="small" color="error" label={`${ex.items.length} alterado(s)`} sx={{ fontWeight: 700, height: 20 }} />
                            </Box>
                          </AccordionSummary>
                          <AccordionDetails sx={{ p: 1 }}>
                            <Stack spacing={0}>
                              {ex.items.map((it: any, i: number) => (
                                <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, px: 1, py: 0.75, borderBottom: i < ex.items.length - 1 ? '1px solid #fde8e8' : 'none' }}>
                                  <Box sx={{ minWidth: 0 }}>
                                    <Typography sx={{ fontWeight: 700, fontSize: 13.5, color: '#b91c1c' }}>{it.name}</Typography>
                                    <Typography variant="caption" sx={{ color: '#94a3b8' }}>{refLabel(it)}</Typography>
                                  </Box>
                                  <Typography sx={{ fontWeight: 800, color: '#b91c1c', flexShrink: 0 }}>{it.valueText}</Typography>
                                </Box>
                              ))}
                            </Stack>
                          </AccordionDetails>
                        </Accordion>
                      ))}
                    </Stack>
                  );
                })()}

                {!detailLoading && tab === 'evolution' && (
                  <EvolutionCharts items={evolution} filter={chartFilter} setFilter={setChartFilter} />
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

                {!detailLoading && tab === 'notes' && (
                  <NotesTab notes={notes} newNote={newNote} setNewNote={setNewNote} onAdd={addNote} onDelete={delNote} onSave={saveNote} />
                )}
              </>
            ) : (
              <Empty label="O paciente não autorizou nenhum escopo de visualização." icon="🔒" />
            )}
          </>
        )}
      </Box>
      </Box>{/* fim da coluna de conteúdo (flex:1) */}

      {/* MENU vertical OVERLAY (mobile) — no desktop a sidebar permanente acima já está visível */}
      {!isDesktop && (
        <Drawer open={menuOpen} onClose={() => setMenuOpen(false)} PaperProps={{ sx: { width: 290, display: 'flex', flexDirection: 'column' } }}>
          {renderSideMenu(() => setMenuOpen(false))}
        </Drawer>
      )}

      {/* MENU RODAPÉ (igual app do paciente) — Pacientes · Perfil · Mais */}
      <Box component="nav" sx={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1100, display: { xs: 'flex', sm: 'none' }, justifyContent: 'space-around', bgcolor: 'rgba(238,247,246,.97)', backdropFilter: 'blur(14px)', borderTop: '1px solid #dceaea', pb: 'env(safe-area-inset-bottom)', boxShadow: '0 -6px 24px rgba(32,178,170,.10)' }}>
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

      <Box sx={{ mt: 2 }}>
        <MfaSetupCard apiBase={`${API_URL}/doctor`} authToken={token} />
      </Box>

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
        {/* Voltar só no header (←) do portal — um botão só */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 800, color: '#0f3d3a' }}>{detail?.title || exam.title}</Typography>
          <Typography variant="caption" sx={{ color: '#757575' }}>{detail?.performedAt ? new Date(detail.performedAt).toLocaleDateString('pt-BR') : 's/d'}{detail?.sourceLab ? ` • ${detail.sourceLab}` : ''}{detail ? ` • ${items.length} itens` : ''}</Typography>
        </Box>
        {detail?.filePath && <Button size="small" variant="outlined" startIcon={pdfLoading ? <CircularProgress size={16} color="inherit" /> : <PdfIcon />} onClick={openPdf} sx={{ color: TEAL, borderColor: TEAL, textTransform: 'none', fontWeight: 700, borderRadius: 99, flexShrink: 0 }}>PDF</Button>}
      </Stack>
      {!detail && <Box sx={{ textAlign: 'center', py: 4 }}><CircularProgress sx={{ color: TEAL }} /></Box>}
      {detail && groups.length === 0 && <Empty label="Exame sem itens extraídos." />}
      {detail && groups.map((g) => (
        <Accordion key={g.cat} disableGutters elevation={0} sx={{ '&:before': { display: 'none' }, mb: 1, border: `1px solid ${g.color}26`, borderRadius: '12px !important', overflow: 'hidden' }}>
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
                  <Typography variant="caption" sx={{ color: '#94a3b8' }}>{refLabel(it)}</Typography>
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

/** #1 Anotações clínicas (histórico de atendimento) — adicionar / editar / excluir. */
const NotesTab = ({ notes, newNote, setNewNote, onAdd, onDelete, onSave }: { notes: any[]; newNote: string; setNewNote: (s: string) => void; onAdd: () => void; onDelete: (id: string) => void; onSave: (id: string, content: string) => void }) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const btnSx = { borderRadius: 2, textTransform: 'none', fontWeight: 800, bgcolor: TEAL, '&:hover': { bgcolor: '#0f7670' } } as const;
  return (
    <Box>
      <Card sx={{ mb: 2, borderRadius: 4, border: '1px solid #bfe7e3' }}><CardContent>
        <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 800, color: TEAL }}>📝 Nova anotação</Typography>
        <TextField value={newNote} onChange={(e) => setNewNote(e.target.value)} multiline minRows={2} fullWidth size="small" placeholder="Conduta, observação clínica, retorno solicitado…" />
        <Button variant="contained" onClick={onAdd} disabled={!newNote.trim()} sx={{ mt: 1, ...btnSx }}>Adicionar</Button>
      </CardContent></Card>
      {notes.length === 0 && <Empty label="Nenhuma anotação ainda. Use o campo acima pra registrar uma conduta." icon="📝" />}
      <Stack spacing={1.25}>
        {notes.map((n) => (
          <Card key={n.id} variant="outlined" sx={{ borderRadius: 3, borderColor: '#e2efec' }}><CardContent>
            {editingId === n.id ? (
              <>
                <TextField value={editText} onChange={(e) => setEditText(e.target.value)} multiline minRows={2} fullWidth size="small" autoFocus />
                <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                  <Button size="small" variant="contained" disabled={!editText.trim()} onClick={() => { onSave(n.id, editText.trim()); setEditingId(null); }} sx={btnSx}>Salvar</Button>
                  <Button size="small" onClick={() => setEditingId(null)}>Cancelar</Button>
                </Stack>
              </>
            ) : (
              <>
                <Typography sx={{ whiteSpace: 'pre-wrap', fontSize: 14, color: '#0f3d3a' }}>{n.content}</Typography>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 1 }}>
                  <Typography variant="caption" color="text.secondary">{new Date(n.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</Typography>
                  <Stack direction="row" spacing={0.5}>
                    <Button size="small" sx={{ minWidth: 0, color: '#64748b' }} onClick={() => { setEditingId(n.id); setEditText(n.content); }}>✏️</Button>
                    <Button size="small" sx={{ minWidth: 0, color: 'error.main' }} onClick={() => onDelete(n.id)}>🗑️</Button>
                  </Stack>
                </Stack>
              </>
            )}
          </CardContent></Card>
        ))}
      </Stack>
    </Box>
  );
};

/** #2 Gráficos de evolução por analito, com zona de referência e filtro de período. */
const EvolutionCharts = ({ items, filter, setFilter }: { items: any[]; filter: '6m' | '1y' | 'all'; setFilter: (f: '6m' | '1y' | 'all') => void }) => {
  const groups = useMemo(() => {
    const now = Date.now();
    const cutoff = filter === '6m' ? now - 180 * 86400000 : filter === '1y' ? now - 365 * 86400000 : 0;
    const map = new Map<string, { name: string; unit: string | null; refLow: number | null; refHigh: number | null; points: { date: string; ts: number; value: number; abnormal: boolean }[] }>();
    for (const it of items) {
      const ts = it.exam?.performedAt ? new Date(it.exam.performedAt).getTime() : 0;
      if (ts < cutoff) continue;
      const key = it.nameCanonical || it.name;
      if (!map.has(key)) map.set(key, { name: it.name, unit: it.unit ?? null, refLow: it.refLow ?? null, refHigh: it.refHigh ?? null, points: [] });
      map.get(key)!.points.push({ date: it.exam?.performedAt ? new Date(it.exam.performedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : 's/d', ts, value: it.valueNumeric, abnormal: !!it.isAbnormal });
    }
    return [...map.values()].map((g) => ({ ...g, points: g.points.sort((a, b) => a.ts - b.ts) })).filter((g) => g.points.length >= 1);
  }, [items, filter]);
  // Agrupa por categoria médica (igual à tela do paciente) + ordena por qtd de analitos
  const byCat = useMemo(() => {
    const catMap = new Map<string, { cat: string; emoji: string; color: string; items: typeof groups }>();
    for (const g of groups) {
      const c = categorize(g.name);
      if (!catMap.has(c.key)) catMap.set(c.key, { cat: c.cat, emoji: c.emoji, color: c.color, items: [] });
      catMap.get(c.key)!.items.push(g);
    }
    return [...catMap.values()].sort((a, b) => b.items.length - a.items.length);
  }, [groups]);
  return (
    <Box>
      <Stack direction="row" spacing={0.5} sx={{ mb: 1.5 }}>
        {([['6m', '6 meses'], ['1y', '1 ano'], ['all', 'Tudo']] as const).map(([k, l]) => (
          <Chip key={k} size="small" label={l} onClick={() => setFilter(k)} variant={filter === k ? 'filled' : 'outlined'} color={filter === k ? 'primary' : 'default'} sx={{ fontWeight: 600 }} />
        ))}
      </Stack>
      {groups.length === 0 && <Empty label="Sem dados de evolução no período selecionado." icon="📈" />}
      {byCat.map((cg) => (
        <Box key={cg.cat} sx={{ mb: 2 }}>
          <Typography sx={{ fontWeight: 800, fontSize: 14, color: cg.color, mb: 1, display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Box component="span" sx={{ fontSize: 18 }}>{cg.emoji}</Box> {cg.cat}
            <Chip size="small" label={`${cg.items.length}`} sx={{ height: 18, fontSize: 10, bgcolor: `${cg.color}1a`, color: cg.color, fontWeight: 700 }} />
          </Typography>
          <Stack spacing={1}>
            {cg.items.map((g) => {
              const lineColor = g.points.some((p) => p.abnormal) ? '#ef4444' : '#178f89';
              return (
                <Card key={g.name} variant="outlined" sx={{ borderRadius: 3, borderColor: '#e2efec' }}><CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
                    <Typography sx={{ fontWeight: 700, color: '#0f3d3a', fontSize: 14 }}>{g.name}</Typography>
                    <Typography variant="caption" sx={{ color: '#94a3b8' }}>{refLabel(g)}</Typography>
                  </Stack>
                  <Box sx={{ height: g.points.length >= 2 ? 110 : 'auto', width: '100%' }}>
                    {g.points.length >= 2 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={g.points} margin={{ top: 4, right: 18, bottom: 4, left: 6 }}>
                          {g.refLow != null && g.refHigh != null && <ReferenceArea y1={g.refLow} y2={g.refHigh} fill="#10b981" fillOpacity={0.14} />}
                          <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" tickMargin={6} />
                          <YAxis tick={{ fontSize: 10 }} width={32} domain={['auto', 'auto']} />
                          <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                          <Line type="monotone" dataKey="value" stroke={lineColor} strokeWidth={2.5} dot={{ r: 3, fill: lineColor }} isAnimationActive={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <Typography sx={{ fontSize: 13, color: lineColor, fontWeight: 700 }}>
                        {g.points[0].value} {g.unit || ''} <Typography component="span" variant="caption" sx={{ color: '#94a3b8', ml: 1 }}>{g.points[0].date} · única medição</Typography>
                      </Typography>
                    )}
                  </Box>
                </CardContent></Card>
              );
            })}
          </Stack>
        </Box>
      ))}
    </Box>
  );
};
