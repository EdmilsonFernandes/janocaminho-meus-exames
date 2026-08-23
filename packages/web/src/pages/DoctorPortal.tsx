import { useState, useEffect, useRef, useMemo, type ReactElement, type ReactNode } from 'react';
import { Box, Card, CardContent, Typography, TextField, Button, CircularProgress, Stack, Chip, Avatar, Menu, MenuItem, Alert, Divider, InputAdornment, IconButton, Link, Drawer, List, ListItemButton, ListItemText, ListItemIcon, Accordion, AccordionSummary, AccordionDetails, Badge, InputBase, Paper, useMediaQuery, useTheme, Dialog, DialogTitle, DialogContent, DialogActions, Tabs, Tab } from '@mui/material';
import { alpha } from '@mui/material/styles';
import type { Theme } from '@mui/material/styles';
import { useNavigate } from 'react-router-dom';
import LogoutIcon from '@mui/icons-material/Logout';
import LockIcon from '@mui/icons-material/Lock';
import PersonIcon from '@mui/icons-material/Person';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1';
import QuestionAnswerIcon from '@mui/icons-material/QuestionAnswer';
import RefreshIcon from '@mui/icons-material/Refresh';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import SearchIcon from '@mui/icons-material/Search';
import GroupsIcon from '@mui/icons-material/Groups';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import AssignmentIcon from '@mui/icons-material/Assignment';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import DescriptionIcon from '@mui/icons-material/Description';
import EditNoteIcon from '@mui/icons-material/EditNote';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import FlagIcon from '@mui/icons-material/Flag';
import SummarizeIcon from '@mui/icons-material/Summarize';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import SpaceDashboardIcon from '@mui/icons-material/SpaceDashboard';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import { API_URL, photoUrlFor, doctorPhotoUrl } from '../config';
import { LAYOUT, COPPER, copperText } from '../theme';
import { priorityOf, refScaleSuspect } from '../utils/alertPriority';
import { QuestionStatusBadge } from '../components/QuestionStatusBadge';
import { confirmDialog, snackbar } from '../components/ConfirmDialog';
import { DrExame } from '../components/DrExame';
import { OtpInput } from '../components/OtpInput';
import { MfaSetupCard } from '../components/mfa/MfaSetupCard';
import { SPECIALTIES, UFS } from '../utils/medicalData';
import { PhotoUpload } from '../components/PhotoUpload';
import { formatCpf, isValidCpf } from '../utils/cpf';
import { DoctorPatientSwitcher } from '../components/doctors/DoctorPatientSwitcher';
import { DoctorExamList } from '../components/doctors/DoctorExamList';
import { DoctorExamDetail } from '../components/doctors/DoctorExamDetail';
import { DoctorValoresAlterados } from '../components/doctors/DoctorValoresAlterados';
import { DoctorConsolidatedReport } from '../components/doctors/DoctorConsolidatedReport';
import { DoctorTrends } from '../components/doctors/DoctorTrends';
import { PatientSummary } from '../components/doctors/PatientSummary';

const docKey = 'doctorToken';

/* Ícones inline (sem dependência extra). */
const I = {
  Mail: () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>),
  Lock: () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>),
  Person: () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-3.3 3.6-5 8-5s8 1.7 8 5" /></svg>),
  Badge: () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M8 4v4M16 4v4" /></svg>),
  Eye: () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>),
  EyeOff: () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3l18 18" /><path d="M10.6 5.1A10.9 10.9 0 0 1 12 5c6.5 0 10 7 10 7a18 18 0 0 1-3.2 4M6.6 6.6A18 18 0 0 0 2 12s3.5 7 10 7a10.8 10.8 0 0 0 5.4-1.5" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>),
};

const fieldSx = {
  '& .MuiOutlinedInput-root': {
    borderRadius: '8px', bgcolor: 'background.paper',
    '& fieldset': { borderColor: 'divider' },
    '&:hover fieldset': { borderColor: 'primary.light' },
    '&.Mui-focused fieldset': { borderColor: 'primary.main', borderWidth: '1.5px' },
  },
} as const;

// Countdown timer pro dialog de PIX (10 min, fecha sozinho ao expirar)
const PayCountdown = ({ expiresAt, onExpire }: { expiresAt: string; onExpire: () => void }) => {
  const [secs, setSecs] = useState(Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)));
  useEffect(() => {
    if (secs <= 0) { onExpire(); return; }
    const iv = setInterval(() => setSecs((s) => { if (s <= 1) { clearInterval(iv); onExpire(); return 0; } return s - 1; }), 1000);
    return () => clearInterval(iv);
  }, []);
  const mm = Math.floor(secs / 60), ss = secs % 60;
  return (
    <Box aria-live="polite" aria-atomic="true" component="span" sx={{ display: 'inline-flex', alignItems: 'center' }}>
      <Typography component="span" sx={{ fontWeight: 800, color: secs < 60 ? 'error.main' : '#6366f1', fontFamily: 'monospace', fontSize: 18 }}>{String(mm).padStart(2, '0')}:{String(ss).padStart(2, '0')}</Typography>
    </Box>
  );
};

/* Ícones das abas (feedback E4c): mais ILUSTRATIVOS e distintos entre si.
 * - Exames → ReceiptLong: fita de laudo laboratorial (não um documento genérico).
 * - Alterados → Flag: bandeira = "valores sinalizados" (mesma linguagem do app 🚩).
 * - Relatório → Summarize: documento com resumo/linhas (diferente do Exames). */
const SCOPE_META: Record<string, { label: string; icon: ReactElement }> = {
  exams: { label: 'Exames', icon: <ReceiptLongIcon /> },
  alterados: { label: 'Alterados', icon: <FlagIcon /> },
  tendencias: { label: 'Tendências', icon: <TrendingUpIcon /> },
  relatorio: { label: 'Relatório', icon: <SummarizeIcon /> },
  questions: { label: 'Perguntas', icon: <QuestionAnswerIcon /> },
  notes: { label: 'Anotações', icon: <EditNoteIcon /> },
};

/** Abas do portal = 4 destinos CLÍNICOS grandes (feedback 2026-08-19): Exames, Alterados,
 *  Tendências (scope 'exams') + Relatório (scope 'summary'). Perguntas e Anotações SAEM da barra
 *  — viram destino dos TILES do resumo do paciente (Pendências→Perguntas, Anotações→notas,
 *  Último exame→Exames): menos competição na barra, botões maiores com rótulo legível. */
const computeTabs = (scopes: string[]): string[] => {
  const t: string[] = [];
  if (scopes.includes('exams')) t.push('exams', 'alterados', 'tendencias');
  if (scopes.includes('summary')) t.push('relatorio');
  return t;
};

export const DoctorPortalPage = () => {
  const navigate = useNavigate();
  const [token, setToken] = useState<string | null>(localStorage.getItem(docKey));
  const [doctor, setDoctor] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [pwd, setPwd] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [mode, setMode] = useState<'login' | 'register'>(() => {
    const hashQuery = window.location.hash.split('?')[1] || '';
    const searchQuery = window.location.search.replace(/^\?/, '');
    const q = hashQuery || searchQuery;
    return new URLSearchParams(q).get('mode') === 'register' ? 'register' : 'login';
  });
  const [regName, setRegName] = useState(''); const [regCpf, setRegCpf] = useState(''); const [regCrm, setRegCrm] = useState(''); const [regUf, setRegUf] = useState(''); const [regSpec, setRegSpec] = useState('');
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
      if (mode === 'register' && !isValidCpf(regCpf)) { throw new Error('Informe um CPF válido.'); }
      const body = mode === 'login' ? { email: email.trim().toLowerCase(), password: pwd } : { name: regName.trim(), cpf: regCpf, crm: regCrm.trim(), crmUf: regUf, specialty: finalSpec, email: email.trim().toLowerCase(), password: pwd };
      const r = await fetch(`${API_URL}/doctor/${mode}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Falha');
      if (d.needsVerification) { setPendingEmail(d.email); return; } // médico valida e-mail (OTP) antes de logar
      localStorage.setItem(docKey, d.token); localStorage.setItem('doctorPhotoToken', d.token); setToken(d.token); setDoctor(d.doctor);
    } catch (e: any) { setErr(e.message); } finally { setLoading(false); }
  };

  // Verifica o código enviado por e-mail → ativa a conta e loga.
  const verifyEmail = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setErr('');
    try {
      const r = await fetch(`${API_URL}/doctor/verify-email`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: pendingEmail, code: verifyCode.trim() }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Código inválido.');
      localStorage.setItem(docKey, d.token); localStorage.setItem('doctorPhotoToken', d.token); setToken(d.token); setDoctor(d.doctor);
    } catch (e: any) { setErr(e.message); } finally { setLoading(false); }
  };

  const logout = () => { localStorage.removeItem(docKey); localStorage.removeItem('doctorPhotoToken'); navigate('/entrar/medico'); };

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
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2, background: 'linear-gradient(135deg, rgba(32,178,170,.08), transparent)' }}>
        <Box sx={{ width: '100%', maxWidth: 420, bgcolor: 'background.paper', borderRadius: '16px', boxShadow: '0 10px 40px rgba(0,80,70,.12)', p: { xs: 3, sm: 4 } }}>
          <Button size="small" onClick={() => { setPendingEmail(null); setErr(''); }} sx={{ color: 'text.secondary', textTransform: 'none', fontWeight: 700, p: 0, minWidth: 0, mb: 1 }}>← Voltar</Button>
          <Typography variant="h6" sx={{ fontWeight: 800, color: 'text.primary', mb: 0.5 }}>✉️ Confirme seu e-mail</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>Enviamos um código de 6 dígitos para <strong>{pendingEmail}</strong>. Digite abaixo pra ativar sua conta de médico.</Typography>
          <Box component="form" onSubmit={verifyEmail} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 0.5 }}>
              <OtpInput value={verifyCode} onChange={setVerifyCode} />
            </Box>
            {err && <Alert severity="error" sx={{ py: 0.5, borderRadius: '12px' }}>{err}</Alert>}
            <Button type="submit" variant="contained" color="primary" size="large" fullWidth disabled={loading} sx={{ borderRadius: '8px', py: 1.35, fontWeight: 800, textTransform: 'none', fontSize: 16 }}>{loading ? <CircularProgress size={22} color="inherit" /> : 'Ativar conta'}</Button>
          </Box>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2, background: 'linear-gradient(135deg, rgba(32,178,170,.08), transparent)' }}>
      <Box sx={{ width: '100%', maxWidth: 420, bgcolor: 'background.paper', borderRadius: '16px', boxShadow: '0 10px 40px rgba(0,80,70,.12)', p: { xs: 3, sm: 4 } }}>
        <Box sx={{ mb: 1 }}>
          <Button size="small" onClick={() => navigate('/')} sx={{ color: 'text.secondary', textTransform: 'none', fontWeight: 700, p: 0, minWidth: 0, '&:hover': { bgcolor: 'transparent', color: 'primary.dark' } }}>← Voltar ao app</Button>
        </Box>
        <Stack alignItems="center" spacing={1} sx={{ mb: 3 }}>
          <Box sx={{ width: 78, height: 78, borderRadius: '50%', bgcolor: 'rgba(32,178,170,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'inset 0 0 0 1px rgba(32,178,170,.15)' }}>
            <DrExame size={56} sx={{ borderRadius: '50%' }} />
          </Box>
          <Typography variant="h5" sx={{ fontWeight: 800, color: 'text.primary', fontFamily: 'Poppins, sans-serif' }}>Portal do Médico</Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>{mode === 'register' ? 'Crie sua conta de profissional de saúde' : 'Acesso restrito a profissionais'}</Typography>
        </Stack>

        <Box component="form" onSubmit={submit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {mode === 'register' && (<>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, p: 1.25, borderRadius: '12px', background: 'rgba(32,178,170,0.08)', border: '1px solid', borderColor: 'divider' }}>
              <Box sx={{ fontSize: 24, flexShrink: 0 }}>🩺</Box>
              <Box>
                <Typography sx={{ fontSize: 13, fontWeight: 800, color: 'text.primary' }}>Conta de Profissional de Saúde</Typography>
                <Typography sx={{ fontSize: 11, color: 'text.secondary', lineHeight: 1.35 }}>Use o <strong>mesmo CRM</strong> que seu paciente informou no convite pra ativar seu acesso.</Typography>
              </Box>
            </Box>
            <TextField placeholder="Nome completo" required value={regName} onChange={(e) => setRegName(e.target.value)} sx={fieldSx}
              slotProps={{ input: { startAdornment: <InputAdornment position="start"><I.Person /></InputAdornment> } }} />
            <TextField placeholder="CPF" required value={regCpf} onChange={(e) => setRegCpf(formatCpf(e.target.value))} sx={fieldSx} error={!!regCpf && regCpf.length === 14 && !isValidCpf(regCpf)} helperText={!!regCpf && regCpf.length === 14 && !isValidCpf(regCpf) ? 'CPF inválido.' : 'Usado para proteger sua identidade profissional.'}
              slotProps={{ input: { inputMode: 'numeric', startAdornment: <InputAdornment position="start"><I.Badge /></InputAdornment> } }} />
            <Box sx={{ display: 'flex', gap: 1 }}>
              <TextField placeholder="CRM (número)" required value={regCrm} onChange={(e) => setRegCrm(e.target.value.replace(/[^\d]/g, ''))} sx={{ ...fieldSx, flex: 1 }} helperText="Mesmo CRM do convite."
                slotProps={{ input: { startAdornment: <InputAdornment position="start"><I.Badge /></InputAdornment> } }} />
              <TextField select label="UF" required value={regUf} onChange={(e) => setRegUf(e.target.value)} sx={{ ...fieldSx, width: 92 }}>
                <MenuItem value=""><em>—</em></MenuItem>
                {UFS.map((u) => <MenuItem key={u} value={u}>{u}</MenuItem>)}
              </TextField>
            </Box>
            <Button type="button" variant="outlined" size="small" onClick={buscarCrmReg} disabled={regLooking} startIcon={regLooking ? <CircularProgress size={15} color="inherit" /> : <span>🔍</span>} sx={{ alignSelf: 'flex-start', borderRadius: '999px', textTransform: 'none', fontWeight: 700, color: 'primary.dark', borderColor: 'primary.dark' }}>
              {regLooking ? 'Buscando…' : 'Buscar dados no conselho'}
            </Button>
            {regHint && <Alert severity={regHint.type} icon={false} sx={{ py: 0.5, borderRadius: '12px', '& .MuiAlert-message': { fontSize: 13 } }}>{regHint.msg}</Alert>}
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
          {err && <Alert severity="error" sx={{ py: 0.5, borderRadius: '12px' }}>{err}</Alert>}
          <Button type="submit" variant="contained" color="primary" size="large" fullWidth disabled={loading} sx={{ borderRadius: '8px', py: 1.35, fontWeight: 800, textTransform: 'none', fontSize: 16 }}>
            {loading ? <CircularProgress size={22} color="inherit" /> : mode === 'login' ? 'Entrar' : 'Criar conta médica'}
          </Button>
        </Box>

        <Typography align="center" sx={{ mt: 2, fontSize: 13, color: 'text.secondary' }}>
          {mode === 'login' ? 'Primeiro acesso?' : 'Já tem conta?'}{' '}
          <Link component="button" type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setErr(''); }} sx={{ fontWeight: 700, color: 'primary.dark' }}>
            {mode === 'login' ? 'Cadastrar' : 'Fazer login'}
          </Link>
        </Typography>
        <Box sx={{ mt: 2, display: 'flex', gap: 1, alignItems: 'flex-start', p: 1.25, borderRadius: '12px', background: 'background.default', border: '1px solid', borderColor: 'divider' }}>
          <Box sx={{ fontSize: 16, lineHeight: 1.3, flexShrink: 0 }}>🩺</Box>
          <Typography sx={{ fontSize: 12, color: 'text.secondary', lineHeight: 1.45 }}><strong>Conteúdo educativo.</strong> O paciente controla o que compartilha. Você vê apenas os exames e dados autorizados.</Typography>
        </Box>
      </Box>
    </Box>
  );
};

// Respostas prontas pro médico (chips de 1 clique que preenchem a caixa). Frases de triagem
// neutras/não-diagnósticas — economizam tempo e padronizam o tom. O médico edita antes de enviar.
const QUICK_REPLIES = [
  'Recebido! Vou analisar seus exames com atenção e já te respondo.',
  'Vamos conversar sobre isso na sua próxima consulta.',
  'Por favor, marque uma consulta para avaliarmos juntos.',
  'Preciso do exame completo/atual para concluir a análise.',
  'Seus resultados estão dentro da normalidade — mantenha o acompanhamento de rotina.',
  'Está tudo estável, sem alterações relevantes. Continue assim!',
];

const DoctorDashboard = ({ token, onLogout }: { token: string; onLogout: () => void }) => {
  const [patients, setPatients] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [tab, setTab] = useState('exams');
  const [exams, setExams] = useState<any[]>([]);
  // Itens REALMENTE alterados (endpoint dedicado /items/abnormal) — alimenta o hero do
  // paciente e o badge da aba Alterados. O count antigo somava TODOS os itens (normais
  // incluídos) e inflava o número.
  const [abnormalItems, setAbnormalItems] = useState<any[]>([]);
  // Remédios ativos + interações críticas do paciente (tile 6 do hero; dialog no clique).
  const [medsInfo, setMedsInfo] = useState<{ medications: any[]; critical: any[] } | null>(null);
  const [medsOpen, setMedsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const openSeq = useRef(0); // guarda de race: só aplica estado do openPatient mais recente
  const [doctor, setDoctor] = useState<any>(null);
  const [view, setView] = useState<'overview' | 'patients' | 'invites' | 'questions' | 'profile' | 'password'>('overview');
  const [photoVer, setPhotoVer] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [avatarEl, setAvatarEl] = useState<HTMLElement | null>(null); // menu vertical do avatar (perfil/senha/sair)
  const [selExam, setSelExam] = useState<string | null>(null); // examId p/ o DoctorExamDetail import
  // Funil do médico: convidar paciente (pré-cadastro) + lista de convites pendentes.
  const [invites, setInvites] = useState<any[]>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inv, setInv] = useState({ name: '', phone: '', email: '' });
  const [invBusy, setInvBusy] = useState(false);
  const [invResult, setInvResult] = useState<{ link: string; wa: string; name: string } | null>(null);
  const [notes, setNotes] = useState<any[]>([]);
  const [questions, setQuestions] = useState<any[]>([]);
  const [qFilter, setQFilter] = useState<'all' | 'pending' | 'answered'>('all');
  const [qText, setQText] = useState<Record<string, string>>({});
  const [qSending, setQSending] = useState<string | null>(null);
  const [unreadQ, setUnreadQ] = useState(0);
  // Inbox global de perguntas (todas as pacientes) — carregado on-demand ao abrir a aba "Perguntas".
  const [allQ, setAllQ] = useState<any[]>([]);
  const [allQLoading, setAllQLoading] = useState(false);
  // Reply INLINE no inbox (qual pergunta está com a caixa aberta) — não navega mais pro paciente.
  const [replyOpen, setReplyOpen] = useState<string | null>(null);
  // Badge de perguntas não lidas no portal (poll 60s). O e-mail (doctorQuestionEmail) também avisa.
  useEffect(() => {
    const tick = () => fetch(`${API_URL}/doctor/questions/unread`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null)).then((d) => setUnreadQ(d?.count ?? 0)).catch(() => {});
    tick();
    const t = setInterval(tick, 60000);
    return () => clearInterval(t);
  }, []);
  const responderQ = async (id: string) => {
    const body = (qText[id] ?? '').trim(); if (!body) return;
    setQSending(id);
    try {
      const r = await fetch(`${API_URL}/doctor/questions/${id}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ body }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Falha');
      setQuestions((qs) => qs.map((q) => q.id === id ? d.item : q));
      setQText((t) => ({ ...t, [id]: '' }));
      snackbar({ message: 'Resposta enviada — o paciente será avisado.', severity: 'success' });
    } catch (e: any) { snackbar({ message: e.message || 'Falha ao responder.', severity: 'error' }); } finally { setQSending(null); }
  };
  const [newNote, setNewNote] = useState('');
  const [activity, setActivity] = useState<{ days: number; avgSteps: number; avgKcal: number; avgKm: number } | null>(null);
  const [planInfo, setPlanInfo] = useState<any>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [payData, setPayData] = useState<any>(null);
  const [payLoading, setPayLoading] = useState(false);
  const [payMethod, setPayMethod] = useState<'pix' | 'card'>('pix');
  const [patQuery, setPatQuery] = useState('');
  const [patAlertOnly, setPatAlertOnly] = useState(false);
  // Banner "Dr. Exame Pro" dismissível (persiste no localStorage). Só re-aparece se limparem a flag.
  const [payDismissed, setPayDismissed] = useState<boolean>(() => { try { return localStorage.getItem('doctorPayDismissed') === '1'; } catch { return false; } });
  const h = { Authorization: `Bearer ${token}` };
  // Web (md+): menu vertical PERMANENTE à esquerda (igual ao app do paciente) + sem rodapé.
  // Mobile: mantém o Drawer overlay + rodapé (Pacientes · Perfil · Mais).
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));

  useEffect(() => {
    // Libras NUNCA no portal do médico (widget do paciente; portal clínico limpo). Ao sair,
    // restaura a preferência do usuário (index.html aplica 'libras-off' só no boot).
    document.body.classList.add('libras-off');
    return () => { try { document.body.classList.toggle('libras-off', localStorage.getItem('meus_exames_libras') !== '1'); } catch { /* */ } };
  }, []);
  useEffect(() => {
    fetch(`${API_URL}/doctor/me`, { headers: h }).then((r) => r.json()).then((d) => setDoctor(d.doctor)).catch(() => {});
    // Ordem alfabética por nome do paciente (2026-08-19): médico com vários pacientes precisa
    // de lista previsível p/ se organizar — localeCompare pt-BR ignora acento.
    fetch(`${API_URL}/doctor/patients`, { headers: h }).then((r) => r.json()).then((d) => {
      setPatients([...(d.items ?? [])].sort((a: any, b: any) => (a.patient?.fullName ?? '').localeCompare(b.patient?.fullName ?? '', 'pt-BR', { sensitivity: 'base' })));
      setLoading(false);
    }).catch(() => setLoading(false));
    fetch(`${API_URL}/doctor/me/plan`, { headers: h }).then((r) => r.json()).then(setPlanInfo).catch(() => {});
    fetch(`${API_URL}/doctor/invites`, { headers: h }).then((r) => r.json()).then((d) => setInvites(d.items ?? [])).catch(() => {});
  }, []);

  // --- Convite de paciente (funil de aquisição: pré-cadastro no agendamento) ---
  const loadInvites = () => fetch(`${API_URL}/doctor/invites`, { headers: h }).then((r) => r.json()).then((d) => setInvites(d.items ?? [])).catch(() => {});
  // --- Inbox global de perguntas (todas as pacientes, em aberto primeiro) ---
  const loadAllQ = () => { setAllQLoading(true); fetch(`${API_URL}/doctor/questions`, { headers: h }).then((r) => r.json()).then((d) => setAllQ(d.items ?? [])).catch(() => {}).finally(() => setAllQLoading(false)); };
  // Responder DIRETO do inbox (inline) — sem navegar pro paciente/tab (era lento: abria Risco 1º).
  // Atualiza allQ p/ refletir status='answered' + colapsa a caixa. Preserva patient (não vem no retorno).
  const answerInbox = async (id: string) => {
    const body = (qText[id] ?? '').trim(); if (!body) return;
    setQSending(id);
    try {
      const r = await fetch(`${API_URL}/doctor/questions/${id}/messages`, { method: 'POST', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify({ body }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Falha');
      setAllQ((qs) => qs.map((q) => (q.id === id ? { ...q, ...d.item, patient: q.patient } : q)));
      setQText((t) => ({ ...t, [id]: '' })); setReplyOpen(null);
      snackbar({ message: 'Resposta enviada — o paciente será avisado.', severity: 'success' });
    } catch (e: any) { snackbar({ message: e.message || 'Falha ao responder.', severity: 'error' }); } finally { setQSending(null); }
  };
  // Clicar no cabeçalho do card (avatar/nome) leva à área do paciente em questão (tab Perguntas).
  // O "Responder" continua inline no card; este é o atalho pra ver o histórico completo do paciente.
  const goToPatient = async (patientId: string) => {
    const p = patients.find((x) => x.patient?.id === patientId);
    if (!p) { snackbar({ message: 'Paciente não encontrado na sua lista.', severity: 'warning' }); return; }
    await openPatient(p, 'questions');
  };
  const createInvite = async () => {
    if (!inv.name.trim() || (!inv.phone.trim() && !inv.email.trim())) return;
    setInvBusy(true);
    try {
      const r = await fetch(`${API_URL}/doctor/invites`, { method: 'POST', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify({ patientName: inv.name.trim(), phone: inv.phone.replace(/\D/g, ''), email: inv.email.trim() || undefined }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Falha ao gerar convite.');
      const phone = inv.phone.replace(/\D/g, '');
      const firstName = inv.name.trim().split(' ')[0];
      const msg = `Olá ${firstName}! Aqui é ${doctor?.name || 'seu médico'}. Cadastre-se no app Meus Exames pra eu acompanhar seus exames (leva 1 minuto): ${d.link}`;
      setInvResult({ link: d.link, wa: phone ? `https://wa.me/${phone.startsWith('55') ? '' : '55'}${phone}?text=${encodeURIComponent(msg)}` : '', name: inv.name.trim() });
      setInv({ name: '', phone: '', email: '' });
      void loadInvites();
    } catch (e: any) { window.alert(e?.message || 'Falha ao gerar convite.'); }
    finally { setInvBusy(false); }
  };
  const cancelInvite = async (id: string) => { await fetch(`${API_URL}/doctor/invites/${id}`, { method: 'DELETE', headers: h }); void loadInvites(); };

  // Abas disponíveis = escopos que o paciente autorizou (e que suportamos visualmente)
  const scopes: string[] = selected?.scopes ?? [];
  const supportedTabs = computeTabs(scopes);

  /** Estratificação por prioridade (mesma régua da aba Alterados: suspect de escala fora). */
  const abnormalStats = useMemo(() => {
    const c = { total: 0, importante: 0, moderada: 0, leve: 0 };
    for (const it of abnormalItems) {
      if (refScaleSuspect(it)) continue;
      c[priorityOf(it)]++; c.total++;
    }
    return c;
  }, [abnormalItems]);

  // --- Anotações ---
  const addNote = async () => {
    const content = newNote.trim();
    if (!content || !selected) return;
    const r = await fetch(`${API_URL}/doctor/patients/${selected.patient.id}/notes`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ content }) });
    const d = await r.json();
    if (r.ok) { setNotes((n) => [{ ...d.note }, ...n]); setNewNote(''); }
  };
  const delNote = async (id: string) => {
    if (!(await confirmDialog({ title: 'Excluir anotação', message: 'Excluir esta anotação?', confirmLabel: 'Excluir' }))) return;
    await fetch(`${API_URL}/doctor/notes/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    setNotes((n) => n.filter((x) => x.id !== id));
  };
  const saveNote = async (id: string, content: string) => {
    const r = await fetch(`${API_URL}/doctor/notes/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ content }) });
    const d = await r.json();
    if (r.ok) setNotes((n) => n.map((x) => x.id === id ? d.note : x));
  };

  const openPatient = async (p: any, tabOverride?: string) => {
    setSelected(p);
    setView('patients');
    const pScopes: string[] = p.scopes ?? [];
    const pTabs = computeTabs(pScopes);
    // Default = 1ª aba (Exames) SEMPRE — o pulo automático p/ "Alterados" confundia o médico
    // (feedback 2026-08-19). Deep-link explícito do Painel (ex.: "ver alterados" no card de
    // atenção) continua funcionando via tabOverride. (doctorPrefTab morreu: só era lido.)
    let initial: string = pTabs[0] ?? 'questions';
    if (tabOverride && pTabs.includes(tabOverride)) initial = tabOverride;
    setTab(initial);
    setSelExam(null);
    setDetailLoading(true); setExams([]); setAbnormalItems([]); setNotes([]); setQuestions([]); setMedsInfo(null);
    const mySeq = ++openSeq.current;
    const mine = () => mySeq === openSeq.current;
    const pid = p.patient.id;
    const get = async (path: string) => { try { const r = await fetch(`${API_URL}/doctor/patients/${pid}${path}`, { headers: h }); return r.ok ? await r.json() : null; } catch { return null; } };
    const wantExams = pScopes.includes('exams');
    await Promise.allSettled([
      ...(wantExams ? [get('/exams').then((d) => { if (d && mine()) setExams(d.items ?? []); })] : []),
      ...(wantExams ? [get('/items/abnormal').then((d) => { if (d && mine()) setAbnormalItems(d.items ?? []); })] : []),
      // Atividade 30d (Health Connect do paciente) p/ o tile do resumo — silencioso se não houver.
      ...(wantExams ? [get('/activity').then((d) => { if (d && mine()) setActivity(d?.days ? d : null); })] : []),
      get('/questions').then((d) => { if (d && mine()) setQuestions(d.items ?? []); }),
      get('/notes').then((d) => { if (d && mine()) setNotes(d.items ?? []); }),
      get('/medications').then((d) => { if (d && mine()) setMedsInfo({ medications: d.medications ?? [], critical: d.critical ?? [] }); }),
    ]);
    if (mine()) setDetailLoading(false);
  };
  // Checkout MP (Dr. Exame Pro R$29,90/mês) — PIX QR inline OU cartão redirect
  const startCheckout = async (method: 'pix' | 'card') => {
    setPayLoading(true);
    setPayMethod(method);
    try {
      const r = await fetch(`${API_URL}/doctor/subscription/checkout`, { method: 'POST', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify({ method }) });
      const d = await r.json();
      if (method === 'card' && d.url) { window.location.href = d.url; return; }
      if (method === 'pix' && d.qrCode) { setPayData(d); setPayOpen(true); pollPayment(d.paymentId); return; }
    } catch {}
    setPayLoading(false);
  };
  const pollPayment = (paymentId: string) => {
    let tries = 0;
    const iv = setInterval(async () => {
      if (++tries > 60 || !payOpen) { clearInterval(iv); return; }
      try {
        const r = await fetch(`${API_URL}/doctor/subscription/payment-status/${paymentId}`, { headers: h });
        const d = await r.json();
        if (d.approved) { clearInterval(iv); setPayOpen(false); setPayData(null); fetch(`${API_URL}/doctor/me/plan`, { headers: h }).then((r) => r.json()).then(setPlanInfo).catch(() => {}); snackbar({ message: '💎 Dr. Exame Pro ativado! SOAP e planos agora são ilimitados.', severity: 'success' }); }
      } catch {}
    }, 5000);
  };

  const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString('pt-BR') : 's/d';

  // Gesto de voltar do Android (Capacitor): fecha detalhe do exame → fecha paciente → volta à lista → sai.
  // O App.tsx ignora o back na rota /doctor; este listener é o dono da navegação aqui.
  const backRef = useRef<() => void>(() => {});
  // Voltar de UI (fecha exame → fecha paciente → painel inicial). Sem sair do app.
  const goBack = () => {
    if (selExam) { setSelExam(null); return; }
    if (selected) { setSelected(null); return; }
    if (view !== 'overview') setView('overview');
  };
  backRef.current = () => {
    if (selExam || selected || view !== 'overview') { goBack(); return; }
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
      <Box sx={{ p: 2, pb: 1.5, background: (t) => `linear-gradient(135deg, ${t.palette.primary.main}, ${t.palette.primary.dark})`, color: '#fff' }}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <IconButton onClick={(e) => setAvatarEl(e.currentTarget)} aria-label="Menu do médico" sx={{ p: 0.5, borderRadius: '50%', '&:hover': { bgcolor: 'rgba(255,255,255,.18)' } }}>
            <Avatar src={doctor?.photoUrl ? doctorPhotoUrl(doctor.id, photoVer) : undefined} sx={{ width: 52, height: 52, fontSize: 20, bgcolor: 'rgba(255,255,255,.2)', fontWeight: 800, border: '2px solid rgba(255,255,255,.5)' }}>{doctor?.name?.charAt(0)}</Avatar>
          </IconButton>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif' }}>🩺 {doctor?.name || 'Médico'}</Typography>
            {unreadQ > 0 && <Chip size="small" label={`❓ ${unreadQ} ${unreadQ === 1 ? 'pergunta nova' : 'perguntas novas'}`} sx={{ mt: 0.5, height: 20, fontSize: 11, bgcolor: 'rgba(255,255,255,.28)', color: '#fff', fontWeight: 700 }} />}
            <Typography variant="caption" sx={{ opacity: 0.9, display: 'block' }}>{[doctor?.specialty, doctor?.crm && `CRM ${doctor.crm}`].filter(Boolean).join(' • ')}</Typography>
          </Box>
        </Stack>
      </Box>
      <Divider />
      <Box sx={{ mx: '10px', mt: 1.5, p: 1.25, borderRadius: '12px', background: planInfo?.isPremium ? 'rgba(99,102,241,.08)' : 'rgba(32,178,170,0.08)', border: '1px solid', borderColor: planInfo?.isPremium ? 'rgba(99,102,241,.2)' : 'divider' }}>
        <Typography variant="caption" sx={{ fontWeight: 800, color: planInfo?.isPremium ? '#6366f1' : 'primary.dark', display: 'block' }}>PLANO</Typography>
        {planInfo?.isPremium
          ? <><Typography sx={{ fontSize: 13, fontWeight: 700, color: '#6366f1' }}>💎 Dr. Exame Pro</Typography><Typography variant="caption" sx={{ color: 'text.secondary' }}>SOAP e planos ilimitados.{planInfo.planExpiresAt ? ` Até ${new Date(planInfo.planExpiresAt).toLocaleDateString('pt-BR')}.` : ''}</Typography></>
          : <><Typography sx={{ fontSize: 13, fontWeight: 700, color: 'text.primary' }}>Grátis ({planInfo?.freeUsed ?? 0}/{planInfo?.freeLimit ?? 5} usados)</Typography><Typography variant="caption" sx={{ color: 'text.secondary' }}>5 pré-consultas/SOAP grátis por mês.</Typography></>}
      </Box>
      <List sx={{
        pt: 1,
        '& .MuiListItemButton-root': { borderRadius: '12px', m: '2px 10px' },
        // Assinatura cobre: item ativo do menu do portal (no app do paciente é teal).
        '& .MuiListItemButton-root.Mui-selected': { bgcolor: (t: Theme) => (t.palette.mode === 'dark' ? 'rgba(212,165,116,.24)' : 'rgba(212,165,116,.16)') },
        '& .MuiListItemButton-root.Mui-selected:hover': { bgcolor: 'rgba(212,165,116,.20)' },
        '& .MuiListItemButton-root.Mui-selected .MuiListItemText-primary': { color: (t: Theme) => copperText(t.palette.mode) },
      }}>
        <ListItemButton selected={view === 'overview'} onClick={() => { setView('overview'); setSelected(null); setSelExam(null); onNav(); }}><ListItemIcon sx={{ minWidth: 38 }}><SpaceDashboardIcon sx={{ color: 'secondary.dark' }} /></ListItemIcon><ListItemText primary="Painel" primaryTypographyProps={{ fontWeight: 600 }} /></ListItemButton>
        <ListItemButton selected={view === 'patients'} onClick={() => { setView('patients'); setSelected(null); setSelExam(null); onNav(); }}><ListItemIcon sx={{ minWidth: 38 }}><GroupsIcon sx={{ color: 'secondary.dark' }} /></ListItemIcon><ListItemText primary="Pacientes" primaryTypographyProps={{ fontWeight: 600 }} /></ListItemButton>
        <ListItemButton selected={view === 'invites'} onClick={() => { setView('invites'); onNav(); }}>
          <ListItemIcon sx={{ minWidth: 38 }}><Badge color="error" variant="dot" invisible={invites.filter((i) => i.status === 'pending').length === 0}><PersonAddAlt1Icon sx={{ color: 'secondary.dark' }} /></Badge></ListItemIcon>
          <ListItemText primary={`Convites${invites.filter((i) => i.status === 'pending').length ? ` · ${invites.filter((i) => i.status === 'pending').length}` : ''}`} primaryTypographyProps={{ fontWeight: 600 }} />
        </ListItemButton>
        <ListItemButton selected={view === 'questions'} onClick={() => { setView('questions'); loadAllQ(); onNav(); }}>
          <ListItemIcon sx={{ minWidth: 38 }}><Badge color="error" variant="dot" invisible={unreadQ === 0}><QuestionAnswerIcon sx={{ color: 'secondary.dark' }} /></Badge></ListItemIcon>
          <ListItemText primary={`Perguntas${unreadQ ? ` · ${unreadQ}` : ''}`} primaryTypographyProps={{ fontWeight: 600 }} />
        </ListItemButton>
        <ListItemButton selected={view === 'profile'} onClick={() => { setView('profile'); onNav(); }}><ListItemIcon sx={{ minWidth: 38 }}><PersonIcon sx={{ color: 'secondary.dark' }} /></ListItemIcon><ListItemText primary="Meu perfil" primaryTypographyProps={{ fontWeight: 600 }} /></ListItemButton>
        <ListItemButton selected={view === 'password'} onClick={() => { setView('password'); onNav(); }}><ListItemIcon sx={{ minWidth: 38 }}><LockIcon sx={{ color: 'secondary.dark' }} /></ListItemIcon><ListItemText primary="Trocar senha" primaryTypographyProps={{ fontWeight: 600 }} /></ListItemButton>
        <Divider sx={{ my: 1 }} />
        <ListItemButton onClick={() => { onNav(); onLogout(); }} sx={{ color: 'error.main' }}><ListItemIcon sx={{ minWidth: 38 }}><LogoutIcon sx={{ color: 'error.main' }} /></ListItemIcon><ListItemText primary="Sair" primaryTypographyProps={{ fontWeight: 600 }} /></ListItemButton>
      </List>
      <Typography variant="caption" sx={{ mt: 'auto', p: 2, color: 'text.secondary' }}>Portal do Médico</Typography>
    </>
  );

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', display: 'flex' }}>
      {/* Menu vertical do avatar (perfil/senha/sair) — aberto ao clicar no avatar do médico */}
      <Menu anchorEl={avatarEl} open={!!avatarEl} onClose={() => setAvatarEl(null)} slotProps={{ paper: { sx: { borderRadius: '12px', minWidth: 210, mt: 1 } } }}>
        <MenuItem onClick={() => { setView('profile'); setAvatarEl(null); }}><ListItemIcon><PersonIcon fontSize="small" /></ListItemIcon><ListItemText>Meu perfil</ListItemText></MenuItem>
        <MenuItem onClick={() => { setView('password'); setAvatarEl(null); }}><ListItemIcon><LockIcon fontSize="small" /></ListItemIcon><ListItemText>Trocar senha</ListItemText></MenuItem>
        <Divider sx={{ my: 0.5 }} />
        <MenuItem onClick={() => { setAvatarEl(null); onLogout(); }} sx={{ color: 'error.main' }}><ListItemIcon><LogoutIcon fontSize="small" sx={{ color: 'error.main' }} /></ListItemIcon><ListItemText>Sair</ListItemText></MenuItem>
      </Menu>
      {/* MENU vertical PERMANENTE (web/desktop) — abre igual ao app do paciente. Mobile usa o Drawer abaixo. */}
      {isDesktop && (
        <Box component="nav" sx={{ width: 290, flexShrink: 0, borderRight: '1px solid', borderRightColor: 'divider', bgcolor: 'background.paper', display: 'flex', flexDirection: 'column', position: 'sticky', top: 0, height: '100vh', overflowY: 'auto' }}>
          {renderSideMenu(() => {})}
        </Box>
      )}
      <Box sx={{ flex: 1, minWidth: 0 }}>
      {/* Header profissional — limpo, sem gradiente (inspirado em Linear/Stripe) */}
      <Box sx={{ bgcolor: 'background.paper', px: { xs: 2, md: 3 }, pt: 'calc(env(safe-area-inset-top) + 10px)', pb: 1.5, display: 'flex', alignItems: 'center', gap: 1.5, borderBottom: '1px solid', borderColor: 'rgba(0,0,0,.06)', boxShadow: '0 1px 3px rgba(0,0,0,.03)' }}>
        {(selected || selExam) && (
          <IconButton onClick={goBack} size="small" aria-label="Voltar" sx={{ color: 'text.secondary', '&:hover': { bgcolor: 'rgba(32,178,170,.06)' }, flexShrink: 0 }}><ArrowBackIcon fontSize="small" /></IconButton>
        )}
        {isDesktop ? (
          <Box sx={{ flex: 1 }}>
            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0 }}>
              <Typography sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif', fontSize: 17, color: 'text.primary', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{view === 'overview' ? 'Painel' : view === 'patients' ? (selected ? selected.patient?.fullName : 'Pacientes') : view === 'invites' ? 'Convites' : view === 'questions' ? 'Perguntas' : view === 'profile' ? 'Meu Perfil' : 'Trocar Senha'}</Typography>
              {planInfo?.isPremium && <Chip size="small" label="💎 Pro" sx={{ bgcolor: 'rgba(99,102,241,.10)', color: '#6366f1', fontWeight: 700, height: 18, fontSize: 10, flexShrink: 0 }} />}
            </Stack>
            {/* Assinatura do portal: cobre = modo médico (viewer clínico somente leitura). */}
            <Chip size="small" label="🩺 Acesso médico · leitura" title="Você acessa como médico — vista somente leitura dos dados compartilhados pelo paciente" sx={{ mt: 0.5, height: 20, fontSize: 10.5, fontWeight: 700, bgcolor: COPPER.wash, color: (t: Theme) => copperText(t.palette.mode) }} />
          </Box>
        ) : (
          <>
            {view !== 'profile' && (
              <IconButton onClick={(e) => setAvatarEl(e.currentTarget)} aria-label="Menu do médico" sx={{ p: 0.5, borderRadius: '50%', flexShrink: 0 }}>
                <Avatar src={doctor?.photoUrl ? doctorPhotoUrl(doctor.id, photoVer) : undefined} sx={{ bgcolor: 'rgba(32,178,170,.10)', color: 'primary.dark', fontWeight: 800, border: '2px solid rgba(32,178,170,.15)', width: 44, height: 44, fontSize: 17 }}>{doctor?.name?.charAt(0)}</Avatar>
              </IconButton>
            )}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif', fontSize: 15, color: 'text.primary', lineHeight: 1.2 }}>{doctor?.name || 'Médico'}</Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>{[doctor?.specialty, doctor?.crm && `CRM ${doctor.crm}`].filter(Boolean).join(' • ') || 'Portal do Médico'}</Typography>
              {/* Assinatura do portal: cobre = modo médico (viewer clínico somente leitura). */}
              <Chip size="small" label="🩺 Acesso médico · leitura" title="Você acessa como médico — vista somente leitura dos dados compartilhados pelo paciente" sx={{ mt: 0.5, height: 18, fontSize: 10, fontWeight: 700, bgcolor: COPPER.wash, color: (t: Theme) => copperText(t.palette.mode) }} />
            </Box>
          </>
        )}
      </Box>

      <Box sx={{ maxWidth: LAYOUT.content, mx: 'auto', p: { xs: 2, md: 3 }, pb: { xs: 11, md: 4 }, bgcolor: 'background.default', minHeight: '100vh' }}>
        {view === 'profile' && <DoctorProfile token={token} doctor={doctor} onBack={() => setView('patients')} onSaved={(d) => setDoctor(d)} onPhoto={() => setPhotoVer((v) => v + 1)} photoVer={photoVer} />}
        {view === 'password' && <DoctorChangePassword token={token} onBack={() => setView('patients')} />}

        {/* CONVITES — gestão dedicada (criar, copiar link, reenviar WhatsApp, cancelar). Tira o
            convite de dentro da lista de pacientes (poluía a tela principal do médico). */}
        {view === 'invites' && (() => {
          const pending = invites.filter((i) => i.status === 'pending');
          const accepted = invites.filter((i) => i.status === 'accepted');
          const expired = invites.filter((i) => i.status === 'expired');
          const linkFor = (tok: string) => `${window.location.href.split('#')[0]}#/convite/${tok}`;
          const relDate = (d?: string) => (d ? new Date(d).toLocaleDateString('pt-BR') : '');
          return (
            <>
              <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ mb: 2 }}>
                <Box>
                  <Typography variant="h6" sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif' }}>Convites</Typography>
                  <Typography variant="caption" color="text.secondary">Convide pacientes — eles instalam o app e o compartilhamento já fica ativo.</Typography>
                </Box>
                <Button variant="contained" startIcon={<PersonAddAlt1Icon />} onClick={() => { setInvResult(null); setInviteOpen(true); }} sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 700, bgcolor: 'primary.main', boxShadow: 'none', '&:hover': { bgcolor: 'primary.dark' } }}>Convidar</Button>
              </Stack>
              <Stack direction="row" spacing={1.5} sx={{ mb: 2.5 }} useFlexGap flexWrap="wrap">
                {[['Pendentes', pending.length, '#c2410c'], ['Aceitos', accepted.length, '#047857'], ['Expirados', expired.length, '#94a3b8']].map(([l, n, c]) => (
                  <Box key={l as string} sx={{ flex: 1, minWidth: 100, p: 1.5, borderRadius: '12px', bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider' }}>
                    <Typography sx={{ fontWeight: 800, fontSize: 22, color: c as string, lineHeight: 1.1 }}>{n as number}</Typography>
                    <Typography variant="caption" color="text.secondary">{l as string}</Typography>
                  </Box>
                ))}
              </Stack>

              {pending.length > 0 && (<Box sx={{ mb: 3 }}>
                <Typography sx={{ fontWeight: 800, mb: 1, display: 'flex', alignItems: 'center', gap: 0.75 }}><InboxOutlinedIcon fontSize="small" sx={{ color: 'primary.main' }} />Aguardando aceite ({pending.length})</Typography>
                <Stack spacing={1.5}>
                  {pending.map((it) => {
                    const waBase = it.phone ? `https://wa.me/${it.phone.startsWith('55') ? '' : '55'}${it.phone}` : '';
                    const waMsg = waBase ? `${waBase}?text=${encodeURIComponent(`Olá! Aqui é ${doctor?.name || 'seu médico'}. Cadastre-se no app Meus Exames pra eu acompanhar seus exames: ${linkFor(it.token)}`)}` : '';
                    return (
                      <Card key={it.id} sx={{ borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}><CardContent>
                        <Stack direction="row" alignItems="center" spacing={1.5}>
                          <Avatar sx={{ bgcolor: 'rgba(234,88,12,.12)', color: '#c2410c', fontWeight: 800, width: 44, height: 44 }}>{it.patientName?.charAt(0)}</Avatar>
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography sx={{ fontWeight: 800 }}>{it.patientName}</Typography>
                            <Typography variant="caption" color="text.secondary">{[it.phone, it.email, `enviado ${relDate(it.createdAt)}`].filter(Boolean).join(' · ')}</Typography>
                          </Box>
                          <Chip size="small" label="pendente" sx={{ height: 20, bgcolor: 'rgba(234,88,12,.12)', color: '#c2410c', fontWeight: 700 }} />
                        </Stack>
                        <Stack direction="row" spacing={1} sx={{ mt: 1.5 }} useFlexGap flexWrap="wrap">
                          <Button size="small" variant="contained" startIcon={<WhatsAppIcon />} disabled={!waMsg} onClick={() => waMsg && window.open(waMsg, '_blank')} sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 700, bgcolor: '#25D366', color: '#fff', boxShadow: 'none', '&:hover': { bgcolor: '#047857' } }}>WhatsApp</Button>
                          <Button size="small" variant="outlined" onClick={() => { try { navigator.clipboard?.writeText(linkFor(it.token)); } catch {} snackbar({ message: 'Link copiado!', severity: 'success' }); }} sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 700 }}>Copiar link</Button>
                          <Button size="small" onClick={() => cancelInvite(it.id)} sx={{ borderRadius: '999px', textTransform: 'none', color: 'error.main', fontWeight: 700 }}>Cancelar</Button>
                        </Stack>
                      </CardContent></Card>
                    );
                  })}
                </Stack>
              </Box>)}

              {accepted.length > 0 && (<Box sx={{ mb: 3 }}>
                <Typography sx={{ fontWeight: 800, mb: 1, display: 'flex', alignItems: 'center', gap: 0.75 }}><CheckCircleOutlinedIcon fontSize="small" sx={{ color: 'success.main' }} />Aceitos ({accepted.length})</Typography>
                <Stack spacing={1}>
                  {accepted.map((it) => (
                    <Card key={it.id} sx={{ borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}><CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.25 }}>
                      <Avatar sx={{ bgcolor: 'rgba(22,163,74,.12)', color: '#047857', fontWeight: 800, width: 44, height: 44 }}>{it.patientName?.charAt(0)}</Avatar>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 800 }}>{it.patientName}</Typography>
                        <Typography variant="caption" color="text.secondary">Conta criada em {relDate(it.acceptedAt)} · já nos seus pacientes</Typography>
                      </Box>
                      <Chip size="small" label="ativo" sx={{ height: 20, bgcolor: 'rgba(22,163,74,.12)', color: '#047857', fontWeight: 700 }} />
                    </CardContent></Card>
                  ))}
                </Stack>
              </Box>)}

              {expired.length > 0 && (<Box>
                <Typography sx={{ fontWeight: 800, mb: 1, color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.75 }}><ScheduleOutlinedIcon fontSize="small" />Expirados / cancelados ({expired.length})</Typography>
                <Stack spacing={1}>
                  {expired.map((it) => (
                    <Card key={it.id} sx={{ borderRadius: '12px', opacity: 0.75 }}><CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.25 }}>
                      <Avatar sx={{ bgcolor: 'action.hover', color: 'text.secondary', fontWeight: 800, width: 44, height: 44 }}>{it.patientName?.charAt(0)}</Avatar>
                      <Box sx={{ flex: 1, minWidth: 0 }}><Typography sx={{ fontWeight: 700 }}>{it.patientName}</Typography></Box>
                      <Button size="small" variant="outlined" startIcon={<PersonAddAlt1Icon />} onClick={() => { setInv({ name: it.patientName, phone: it.phone || '', email: it.email || '' }); setInvResult(null); setInviteOpen(true); }} sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 700, borderColor: 'primary.main', color: 'primary.dark' }}>Reenviar</Button>
                    </CardContent></Card>
                  ))}
                </Stack>
              </Box>)}

              {invites.length === 0 && (
                <Card sx={{ borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}><CardContent><Box sx={{ textAlign: 'center', py: 5 }}>
                  <Box sx={{ fontSize: 56, mb: 1.5, opacity: 0.4 }}>📨</Box>
                  <Typography sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif', fontSize: 17, mb: 0.5 }}>Nenhum convite ainda</Typography>
                  <Typography color="text.secondary">Toque em “Convidar” pra enviar o app a um paciente — ele instala e vocês já ficam conectados.</Typography>
                </Box></CardContent></Card>
              )}
            </>
          );
        })()}

        {/* PERGUNTAS — inbox global (todas as pacientes). Em aberto primeiro. Responder abre o paciente. */}
        {view === 'questions' && (() => {
          const openQ = allQ.filter((q: any) => q.status !== 'answered');
          const answeredQ = allQ.filter((q: any) => q.status === 'answered');
          const relDate = (d?: string) => { if (!d) return ''; const days = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 86400000)); return days === 0 ? 'hoje' : days === 1 ? 'há 1 dia' : `há ${days} dias`; };
          const card = (q: any) => {
            const answered = q.status === 'answered';
            const lastPatient = (q.messages ?? []).filter((m: any) => m.authorRole === 'patient').slice(-1)[0];
            const lastDoctor = (q.messages ?? []).filter((m: any) => m.authorRole === 'doctor').slice(-1)[0];
            const qp = patients.find((pp: any) => pp.patient?.id === q.patientId);
            const isOpen = replyOpen === q.id;
            return (
              <Card key={q.id} sx={{ borderRadius: '12px', mb: 1.5, boxShadow: '0 1px 3px rgba(0,0,0,.04)', border: '1px solid', borderColor: answered ? 'divider' : 'transparent' }}><CardContent>
                <Stack direction="row" alignItems="center" spacing={1.25}>
                  <Box onClick={() => goToPatient(q.patientId)} title="Abrir o paciente" sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flex: 1, minWidth: 0, cursor: 'pointer', borderRadius: '12px', mx: -0.5, px: 0.5, py: 0.25, transition: 'background .15s', '&:hover': { bgcolor: 'rgba(32,178,170,.06)' } }}>
                    <Avatar src={q.patient?.id ? photoUrlFor(q.patient.id) : undefined} sx={{ bgcolor: 'primary.dark', fontWeight: 800, width: 44, height: 44, flexShrink: 0 }}>{q.patient?.fullName?.charAt(0)}</Avatar>
                    <Box sx={{ minWidth: 0 }}>
                      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
                        <Typography sx={{ fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>{q.patient?.fullName}<OpenInNewIcon sx={{ fontSize: 13, color: 'text.disabled' }} /></Typography>
                        <QuestionStatusBadge status={answered ? 'answered' : 'open'} />
                      </Stack>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={q.subject}>{q.subject} · {relDate(q.createdAt)}{qp?.age != null ? ` · ${qp.age}a${qp.sex === 'female' ? ' · F' : qp.sex === 'male' ? ' · M' : ''}` : ''}</Typography>
                    </Box>
                  </Box>
                  {!answered && <Button size="small" variant={isOpen ? 'outlined' : 'contained'} onClick={() => setReplyOpen(isOpen ? null : q.id)} sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 700, bgcolor: isOpen ? undefined : 'primary.main', color: isOpen ? 'primary.dark' : '#fff', boxShadow: 'none', '&:hover': { bgcolor: isOpen ? undefined : 'primary.dark' }, flexShrink: 0 }}>{isOpen ? 'Fechar' : 'Responder'}</Button>}
                </Stack>
                {lastPatient && <Typography variant="body2" sx={{ mt: 1, color: 'text.secondary', fontStyle: 'italic', pl: 0.5 }}>"{String(lastPatient.body).slice(0, 160)}{(String(lastPatient.body).length ?? 0) > 160 ? '…' : ''}"</Typography>}
                {/* Resposta INLINE + respostas prontas (sem navegar pro paciente — era lento). */}
                {isOpen && !answered && (
                  <Box sx={{ mt: 1.5 }}>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>⚡ Resposta rápida:</Typography>
                    <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" sx={{ mt: 0.5, mb: 1 }}>
                      {QUICK_REPLIES.map((t) => <Chip key={t} size="small" variant="outlined" label={t} onClick={() => setQText((prev) => ({ ...prev, [q.id]: t }))} sx={{ fontWeight: 600, height: 'auto', maxWidth: '100%', borderRadius: '12px', py: 0.5, borderColor: 'rgba(32,178,170,.4)', color: 'primary.dark', '& .MuiChip-label': { whiteSpace: 'normal', lineHeight: 1.3 }, '&:hover': { bgcolor: 'rgba(32,178,170,.06)' } }} />)}
                    </Stack>
                    <TextField multiline minRows={2} size="small" fullWidth placeholder="Escrever resposta…" value={qText[q.id] ?? ''} onChange={(e) => setQText((t) => ({ ...t, [q.id]: e.target.value }))} />
                    <Stack direction="row" spacing={1} sx={{ mt: 1 }} justifyContent="flex-end">
                      <Button size="small" onClick={() => { setQText((t) => ({ ...t, [q.id]: '' })); setReplyOpen(null); }} sx={{ textTransform: 'none', fontWeight: 700, color: 'text.secondary' }}>Cancelar</Button>
                      <Button size="small" variant="contained" disabled={qSending === q.id || !(qText[q.id]?.trim())} onClick={() => answerInbox(q.id)} startIcon={qSending === q.id ? <CircularProgress size={14} color="inherit" /> : undefined} sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 700, bgcolor: 'primary.main', boxShadow: 'none', '&:hover': { bgcolor: 'primary.dark' } }}>{qSending === q.id ? 'Enviando…' : 'Enviar resposta'}</Button>
                    </Stack>
                  </Box>
                )}
                {answered && lastDoctor && (
                  <Box sx={{ mt: 1.25, p: 1, px: 1.25, borderRadius: '12px', bgcolor: (t) => t.palette.mode === 'dark' ? '#1e2d2c' : '#e0f2f1', border: '1px solid', borderColor: 'rgba(32,178,170,.25)' }}>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: 'primary.dark' }}>Sua resposta</Typography>
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{String(lastDoctor.body)}</Typography>
                  </Box>
                )}
              </CardContent></Card>
            );
          };
          return (
            <>
              <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ mb: 2 }}>
                <Box>
                  <Typography variant="h6" sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif' }}>Perguntas</Typography>
                  <Typography variant="caption" color="text.secondary">{openQ.length} em aberto · {answeredQ.length} respondidas</Typography>
                </Box>
                <IconButton onClick={loadAllQ} disabled={allQLoading} sx={{ color: 'primary.dark' }}><RefreshIcon /></IconButton>
              </Stack>
              {allQLoading && <Box sx={{ textAlign: 'center', py: 4 }}><CircularProgress sx={{ color: 'primary.dark' }} /></Box>}
              {!allQLoading && allQ.length === 0 && (
                <Card sx={{ borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}><CardContent><Box sx={{ textAlign: 'center', py: 5 }}>
                  <Box sx={{ fontSize: 56, mb: 1.5, opacity: 0.4 }}>💬</Box>
                  <Typography sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif', fontSize: 17 }}>Nenhuma pergunta ainda</Typography>
                  <Typography color="text.secondary">Quando um paciente enviar uma pergunta pelo app, ela aparece aqui.</Typography>
                </Box></CardContent></Card>
              )}
              {!allQLoading && openQ.length > 0 && (<Box sx={{ mb: 3 }}>
                <Typography sx={{ fontWeight: 800, mb: 1.5, display: 'flex', alignItems: 'center', gap: 0.75 }}><ScheduleOutlinedIcon fontSize="small" sx={{ color: 'warning.main' }} />Em aberto ({openQ.length})</Typography>
                <Stack spacing={1.5}>
                  {(() => {
                    const map = new Map<string, { p: any; qs: any[]; last: number }>();
                    for (const q of openQ) { const pid = q.patientId; const g = map.get(pid) ?? { p: q.patient, qs: [], last: 0 }; g.qs.push(q); g.last = Math.max(g.last, new Date(q.createdAt).getTime()); map.set(pid, g); }
                    return [...map.values()].sort((a, b) => b.last - a.last).map((g) => (
                      <Accordion key={g.p?.id} elevation={0} sx={{ '&:before': { display: 'none' }, border: '1px solid', borderColor: 'divider', borderRadius: '12px !important', overflow: 'hidden' }}>
                        <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: '52px !important', '& .MuiAccordionSummary-content': { my: 0.75 } }}>
                          <Stack direction="row" alignItems="center" spacing={1.5} sx={{ flex: 1, minWidth: 0 }}>
                            <Avatar src={g.p?.id ? photoUrlFor(g.p.id) : undefined} sx={{ width: 40, height: 40, bgcolor: 'primary.dark', fontSize: 15, fontWeight: 700, flexShrink: 0 }}>{(g.p?.fullName || 'P').charAt(0)}</Avatar>
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Typography sx={{ fontWeight: 800, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.p?.fullName || 'Paciente'}</Typography>
                              <Typography variant="caption" color="text.secondary">{g.qs.length} pergunta(s) · última {new Date(g.last).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</Typography>
                            </Box>
                            <Chip size="small" label="aberto" sx={{ height: 22, fontWeight: 700, bgcolor: 'rgba(245,158,11,.12)', color: '#b45309', flexShrink: 0 }} />
                          </Stack>
                        </AccordionSummary>
                        <AccordionDetails sx={{ p: 1.5, pt: 0.5 }}>
                          <Stack spacing={1}>{g.qs.map(card)}</Stack>
                        </AccordionDetails>
                      </Accordion>
                    ));
                  })()}
                </Stack>
              </Box>)}
              {!allQLoading && answeredQ.length > 0 && (<Box>
                <Typography sx={{ fontWeight: 800, mb: 1.5, color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.75 }}><CheckCircleOutlinedIcon fontSize="small" />Respondidas ({answeredQ.length})</Typography>
                <Stack spacing={1.5}>
                  {(() => {
                    const map = new Map<string, { p: any; qs: any[]; last: number }>();
                    for (const q of answeredQ) { const pid = q.patientId; const g = map.get(pid) ?? { p: q.patient, qs: [], last: 0 }; g.qs.push(q); g.last = Math.max(g.last, new Date(q.createdAt).getTime()); map.set(pid, g); }
                    return [...map.values()].sort((a, b) => b.last - a.last).map((g) => (
                      <Accordion key={g.p?.id} elevation={0} sx={{ '&:before': { display: 'none' }, border: '1px solid', borderColor: 'divider', borderRadius: '12px !important', overflow: 'hidden' }}>
                        <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: '52px !important', '& .MuiAccordionSummary-content': { my: 0.75 } }}>
                          <Stack direction="row" alignItems="center" spacing={1.5} sx={{ flex: 1, minWidth: 0 }}>
                            <Avatar src={g.p?.id ? photoUrlFor(g.p.id) : undefined} sx={{ width: 40, height: 40, bgcolor: 'rgba(32,178,170,.08)', color: 'primary.dark', fontSize: 15, fontWeight: 700, flexShrink: 0 }}>{(g.p?.fullName || 'P').charAt(0)}</Avatar>
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Typography sx={{ fontWeight: 800, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'text.secondary' }}>{g.p?.fullName || 'Paciente'}</Typography>
                              <Typography variant="caption" color="text.secondary">{g.qs.length} respondida(s) · última {new Date(g.last).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</Typography>
                            </Box>
                            <Chip size="small" label="✓" sx={{ height: 22, fontWeight: 700, bgcolor: 'rgba(32,178,170,.12)', color: 'primary.dark', flexShrink: 0 }} />
                          </Stack>
                        </AccordionSummary>
                        <AccordionDetails sx={{ p: 1.5, pt: 0.5 }}>
                          <Stack spacing={1}>{g.qs.map(card)}</Stack>
                        </AccordionDetails>
                      </Accordion>
                    ));
                  })()}
                </Stack>
              </Box>)}
            </>
          );
        })()}

        {/* Dialog de convite — sempre montado (aberto pela lista de pacientes E pela tela de Convites). */}
        <Dialog open={inviteOpen} onClose={() => setInviteOpen(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: '12px' } }}>
          <DialogTitle sx={{ fontWeight: 800, fontFamily: '"Poppins",sans-serif' }}>Convidar paciente</DialogTitle>
          <DialogContent>
            {invResult ? (
              <Box sx={{ textAlign: 'center', py: 1 }}>
                <Typography sx={{ fontWeight: 800, mb: 1 }}>Convite pronto pra {invResult.name}! 🎉</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Toque pra enviar no WhatsApp — o paciente instala o app e você já fica conectado aos exames dele.</Typography>
                {invResult.wa && <Button href={invResult.wa} target="_blank" fullWidth variant="contained" startIcon={<WhatsAppIcon />} sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 700, bgcolor: '#25D366', mb: 1, color: '#fff', '&:hover': { bgcolor: '#047857' } }}>Enviar no WhatsApp</Button>}
                <Button fullWidth variant="outlined" onClick={() => { try { navigator.clipboard?.writeText(invResult.link); } catch {} snackbar({ message: 'Link copiado!', severity: 'success' }); }} sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 700 }}>Copiar link</Button>
              </Box>
            ) : (
              <Stack spacing={1.5} sx={{ mt: 1 }}>
                <TextField label="Nome do paciente" value={inv.name} onChange={(e) => setInv({ ...inv, name: e.target.value })} size="small" fullWidth />
                <TextField label="WhatsApp (com DDD)" value={inv.phone} onChange={(e) => setInv({ ...inv, phone: e.target.value })} size="small" fullWidth placeholder="11 98888-7777" />
                <TextField label="Ou e-mail" value={inv.email} onChange={(e) => setInv({ ...inv, email: e.target.value })} size="small" fullWidth />
                <Typography variant="caption" color="text.secondary">O paciente recebe o link, instala o app e o compartilhamento dos exames com você já fica ativo — ele não configura nada.</Typography>
              </Stack>
            )}
          </DialogContent>
          <DialogActions sx={{ justifyContent: 'center', pb: 2, gap: 1 }}>
            <Button onClick={() => setInviteOpen(false)} sx={{ textTransform: 'none' }}>{invResult ? 'Fechar' : 'Cancelar'}</Button>
            {!invResult && <Button variant="contained" disabled={invBusy || !inv.name.trim() || (!inv.phone.trim() && !inv.email.trim())} onClick={createInvite} sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 700, bgcolor: 'primary.main' }}>{invBusy ? 'Gerando…' : 'Gerar convite'}</Button>}
            {invResult && <Button onClick={() => setInvResult(null)} sx={{ textTransform: 'none', color: 'primary.dark' }}>Novo convite</Button>}
          </DialogActions>
        </Dialog>
        {view === 'patients' && loading && <Box sx={{ textAlign: 'center', py: 6 }}><CircularProgress sx={{ color: 'primary.dark' }} /></Box>}

        {/* PAINEL INICIAL DO MÉDICO (self-service): o que importa AGORA, em 5 segundos —
            quem precisa de atenção (risk-sorted), perguntas em aberto, exames a renovar.
            Princípios de dashboard clínico: priorização por risco + por quê + ação de 1 clique. */}
        {view === 'overview' && loading && <Box sx={{ textAlign: 'center', py: 6 }}><CircularProgress sx={{ color: 'primary.dark' }} /></Box>}
        {view === 'overview' && !loading && (() => {
          // Alfabética (2026-08-19): pedido do dono — organização previsível pro médico; a
          // prioridade clínica segue visível na linha de status (🟠 moderadas · exame há X).
          const alerts = [...patients].filter((p) => p.hasAlerts).sort((a, b) => (a.patient?.fullName ?? '').localeCompare(b.patient?.fullName ?? '', 'pt-BR', { sensitivity: 'base' }));
          const openQP = patients.filter((p) => (p.openQuestions ?? 0) > 0);
          const pendingInv = invites.filter((i) => i.status === 'pending');
          const PRIORITY_LABEL: Record<string, string> = { importante: '🔴 Prioridade alta', moderada: '🟠 Alterações moderadas', leve: '🟡 Alterações leves' };
          const relDays = (d?: string | null) => { if (!d) return null; const n = Math.floor((Date.now() - new Date(d).getTime()) / 86400000); return n < 1 ? 'hoje' : n < 30 ? `há ${n} ${n === 1 ? 'dia' : 'dias'}` : n < 365 ? `há ${Math.floor(n / 30)} ${Math.floor(n / 30) === 1 ? 'mês' : 'meses'}` : `há ${Math.floor(n / 365)} ${Math.floor(n / 365) === 1 ? 'ano' : 'anos'}`; };
          // Renovação: exame antigo (>1 ano) ou nenhum exame compartilhado — deixa o médico pedir atualização.
          const stale = patients
            .filter((p) => !p.hasAlerts && ((p.examsCount ?? 0) === 0 || (p.lastExamAt && Date.now() - new Date(p.lastExamAt).getTime() > 365 * 86400000)))
            .sort((a, b) => new Date(a.lastExamAt ?? 0).getTime() - new Date(b.lastExamAt ?? 0).getTime());
          const firstName = (doctor?.name || 'Doutor(a)').replace(/^Dr[aº.]*\s+/i, '').split(' ')[0];
          const hour = new Date().getHours();
          const greet = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
          const today = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
          const row = (p: any, statusLine: ReactNode, onClick: () => void) => {
            const who = [p.age != null ? `${p.age}a` : null, p.sex === 'female' ? 'F' : p.sex === 'male' ? 'M' : null].filter(Boolean).join(' · ');
            return (
            <Card key={p.shareId} onClick={onClick} sx={{ borderRadius: '12px', cursor: 'pointer', transition: 'all .15s', boxShadow: '0 1px 3px rgba(0,0,0,.04)', '&:hover': { boxShadow: '0 4px 16px rgba(0,0,0,.08)', transform: 'translateY(-1px)' } }}>
              <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Avatar src={p.patient?.id ? photoUrlFor(p.patient.id) : undefined} sx={{ bgcolor: 'rgba(32,178,170,.08)', color: 'primary.dark', fontWeight: 800, width: 44, height: 44, flexShrink: 0 }}>{p.patient?.fullName?.charAt(0)}</Avatar>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif', fontSize: 14, color: 'text.primary', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.patient?.fullName}</Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {who}
                    {statusLine ? <>{who ? ' · ' : ''}{statusLine}</> : null}
                  </Typography>
                </Box>
                <ChevronRightIcon sx={{ color: 'text.disabled', fontSize: 20, flexShrink: 0 }} />
              </CardContent>
            </Card>
            );
          };
          return (
            <Stack spacing={2}>
              {/* HERO: saudação + manchete clínica do dia */}
              <Box sx={(t) => ({ borderRadius: '16px', overflow: 'hidden', background: `linear-gradient(135deg, ${t.palette.primary.main}, ${t.palette.primary.dark})`, color: t.palette.primary.contrastText, p: { xs: 2, md: 2.5 }, boxShadow: '0 10px 28px rgba(15,95,90,.25)' })}>
                <Typography sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif', fontSize: { xs: 19, md: 22 }, lineHeight: 1.2 }}>{greet}, Dr. {firstName} 👋</Typography>
                <Typography sx={{ opacity: 0.92, fontSize: 14, mt: 0.75 }}>
                  {alerts.length > 0
                    ? `${alerts.length} ${alerts.length === 1 ? 'paciente com valores alterados' : 'pacientes com valores alterados'}${openQP.length ? ` · ${openQP.length} ${openQP.length === 1 ? 'pergunta em aberto' : 'perguntas em aberto'}` : ''}`
                    : openQP.length > 0
                      ? `${openQP.length} ${openQP.length === 1 ? 'pergunta aguardando resposta' : 'perguntas aguardando resposta'}`
                      : 'Tudo em ordem — nenhum alerta crítico no momento ✅'}
                </Typography>
                <Typography variant="caption" sx={{ opacity: 0.75, display: 'block', mt: 0.5, textTransform: 'capitalize' }}>{today}</Typography>
              </Box>

              {/* TILES: números do consultório (cada um navega) */}
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 1.5 }}>
                {([
                  { label: 'Pacientes', value: patients.length, color: '#178f89', onClick: () => setView('patients'), icon: <GroupsIcon /> },
                  { label: 'Com alerta', value: alerts.length, color: '#ef4444', onClick: () => { setPatAlertOnly(true); setView('patients'); }, icon: <WarningAmberIcon /> },
                  { label: 'Perguntas abertas', value: patients.reduce((n, p) => n + (p.openQuestions ?? 0), 0), color: '#b45309', onClick: () => { setView('questions'); loadAllQ(); }, icon: <QuestionAnswerIcon /> },
                  { label: 'Convites pendentes', value: pendingInv.length, color: '#c2410c', onClick: () => setView('invites'), icon: <PersonAddAlt1Icon /> },
                ] as const).map((tile) => (
                  <Card key={tile.label} onClick={tile.onClick} sx={{ borderRadius: '12px', cursor: 'pointer', transition: 'all .15s', boxShadow: '0 1px 3px rgba(0,0,0,.04)', '&:hover': { boxShadow: '0 4px 16px rgba(0,0,0,.08)', transform: 'translateY(-1px)' } }}>
                    <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                      <Stack direction="row" alignItems="center" spacing={1}>
                        <Box component="span" sx={{ display: 'inline-flex', color: tile.color, '& svg': { fontSize: 18 } }}>{tile.icon}</Box>
                        <Typography sx={{ fontWeight: 800, fontSize: 22, color: tile.color, lineHeight: 1.1 }}>{tile.value}</Typography>
                      </Stack>
                      <Typography variant="caption" color="text.secondary">{tile.label}</Typography>
                    </CardContent>
                  </Card>
                ))}
              </Box>

              {/* FILA DE ATENÇÃO: risk-sorted, com o PORQUÊ e ação de 1 clique */}
              {alerts.length > 0 && (
                <Box>
                  <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                    <Typography sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif', fontSize: 15 }}>🩺 Precisam de atenção agora</Typography>
                    <Button size="small" onClick={() => setView('patients')} sx={{ textTransform: 'none', fontWeight: 700, color: 'primary.dark', borderRadius: '999px' }}>Ver todos</Button>
                  </Stack>
                  <Stack spacing={1.25}>
                    {alerts.slice(0, 4).map((p) => row(
                      p,
                      <>{PRIORITY_LABEL[p.maxPriority] ?? '🔴 Com alerta'}{p.openQuestions ? ` · ❓ ${p.openQuestions}` : ''}{p.lastExamAt ? ` · exame ${relDays(p.lastExamAt)}` : ''}</>,
                      () => openPatient(p, 'alterados'),
                    ))}
                    {alerts.length > 4 && (
                      <Button size="small" variant="outlined" onClick={() => setView('patients')} sx={{ alignSelf: 'center', borderRadius: '999px', textTransform: 'none', fontWeight: 700 }}>
                        {`+${alerts.length - 4} outro${alerts.length - 4 > 1 ? 's' : ''} com alerta`}
                      </Button>
                    )}
                  </Stack>
                </Box>
              )}

              {/* PERGUNTAS EM ABERTO: resposta rápida */}
              {openQP.length > 0 && (
                <Box>
                  <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                    <Typography sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif', fontSize: 15 }}>❓ Perguntas aguardando você</Typography>
                    <Button size="small" onClick={() => { setView('questions'); loadAllQ(); }} sx={{ textTransform: 'none', fontWeight: 700, color: 'primary.dark', borderRadius: '999px' }}>Inbox</Button>
                  </Stack>
                  <Stack spacing={1.25}>
                    {openQP.slice(0, 3).map((p) => row(p, `❓ ${p.openQuestions} em aberto`, () => openPatient(p, 'questions')))}
                  </Stack>
                </Box>
              )}

              {/* RENOVAÇÃO: exames velhos ou inexistentes — oportunidade de pedido novo */}
              {stale.length > 0 && (
                <Box>
                  <Typography sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif', fontSize: 15, mb: 1 }}>📅 Exames para renovar</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>Sem exame novo há mais de 1 ano (ou nenhum compartilhado) — peça uma atualização na próxima consulta.</Typography>
                  <Stack spacing={1.25}>
                    {stale.slice(0, 3).map((p) => row(p, (p.examsCount ?? 0) === 0 ? 'sem exames compartilhados' : `último exame ${relDays(p.lastExamAt)}`, () => openPatient(p)))}
                  </Stack>
                </Box>
              )}

              {/* EMPTY: sem pacientes ainda → funil de convite */}
              {patients.length === 0 && (
                <Card sx={{ borderRadius: '12px' }}><CardContent><Box sx={{ textAlign: 'center', py: 4 }}>
                  <Box sx={{ fontSize: 56, mb: 1.5, opacity: 0.4 }}>🩺</Box>
                  <Typography sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif', fontSize: 17, mb: 0.5 }}>Seu painel começa com 1 paciente</Typography>
                  <Typography color="text.secondary" sx={{ mb: 2, maxWidth: 380, mx: 'auto' }}>Convide pelo WhatsApp — ele instala o app, sobe os exames e você acompanha tudo aqui, na hora que ele chegar.</Typography>
                  <Button variant="contained" startIcon={<PersonAddAlt1Icon />} onClick={() => { setInvResult(null); setInviteOpen(true); }} sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 700 }}>Convidar paciente</Button>
                </Box></CardContent></Card>
              )}
            </Stack>
          );
        })()}

        {/* DR. EXAME PRO — banner premium (free tier + CTA). No painel e na LISTA (sem paciente aberto). Dismissível. */}
        {planInfo && !planInfo.isPremium && (view === 'overview' || view === 'patients') && !selected && !payDismissed && (
          <Box sx={{ mb: 2, p: 2, pr: 6, borderRadius: '12px', position: 'relative', background: 'linear-gradient(135deg,rgba(99,102,241,.08),rgba(99,102,241,.02))', border: '1px solid', borderColor: 'rgba(99,102,241,.2)' }}>
            <IconButton size="small" aria-label="Fechar banner" onClick={() => { try { localStorage.setItem('doctorPayDismissed', '1'); } catch { /* */ } setPayDismissed(true); }} sx={{ position: 'absolute', top: 6, right: 6, color: 'text.secondary', '&:hover': { bgcolor: 'rgba(99,102,241,.10)' } }}><span aria-hidden style={{ fontSize: 20, lineHeight: 1 }}>×</span></IconButton>
            <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
              <Typography sx={{ fontWeight: 800, color: '#6366f1', fontSize: 16 }}>💎 Dr. Exame Pro</Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', flex: 1, minWidth: 180 }}>{planInfo.freeUsed >= planInfo.freeLimit ? '🔒 Pré-consultas grátis esgotadas este mês.' : `💡 ${planInfo.freeUsed} de ${planInfo.freeLimit} pré-consultas grátis usadas.`}</Typography>
              <Button size="small" variant="contained" onClick={() => startCheckout('pix')} disabled={payLoading} sx={{ bgcolor: '#6366f1', textTransform: 'none', borderRadius: '999px', fontWeight: 700, '&:hover': { bgcolor: '#4f46e5' } }}>{payLoading ? 'Gerando...' : 'Assinar R$29,90/mês'}</Button>
            </Stack>
          </Box>
        )}
        {planInfo?.isPremium && (view === 'overview' || view === 'patients') && !selected && (
          <Chip size="small" label="💎 Dr. Exame Pro ativo" sx={{ mb: 1.5, bgcolor: 'rgba(99,102,241,.12)', color: '#6366f1', fontWeight: 700 }} />
        )}

        {/* MASTER/DETAIL LEVE (desktop): rail de pacientes à esquerda MESMO com paciente aberto —
            troca rápida sem "Voltar" (também mitiga contexto stale do item 20). NÃO ressuscita o
            grid 2-col de CONTEÚDO (revertido no d56c3c3 por gap vertical) — só pina a lista. */}
        {/* alignItems: stretch no MOBILE — flex-start em column faz cada filho virar fit-content
            (bug: coluna do detalhe crescia p/ ~585px pelo min-content das 6 abas e CORTAVA a
            direita em 390px). No desktop (row) flex-start continua: colunas alinham ao topo. */}
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 2, alignItems: { xs: 'stretch', md: 'flex-start' } }}>

        {/* LISTA DE PACIENTES */}
        {view === 'patients' && !loading && (!selected || isDesktop) && (
          <Box sx={{ width: { xs: '100%', md: selected ? 320 : '100%' }, flexShrink: 0, position: 'sticky', top: selected ? 16 : undefined }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ mb: 1.5 }}>
              <Typography variant="h6" sx={{ fontWeight: 800, color: 'text.primary' }}>Pacientes ({patients.length})</Typography>
              {patients.some((p) => p.hasAlerts) && <Chip size="small" color="error" label={`🔴 ${patients.filter((p) => p.hasAlerts).length} com alerta`} sx={{ fontWeight: 700 }} />}
            </Stack>
            {patients.length > 0 && (
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
                <Paper variant="outlined" sx={{ p: '2px 12px', display: 'flex', alignItems: 'center', gap: 1, borderRadius: '999px', flex: 1, borderColor: 'divider' }}>
                  <SearchIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
                  <InputBase inputProps={{ 'aria-label': 'Buscar paciente' }} value={patQuery} onChange={(e: any) => setPatQuery(e.target.value)} placeholder="Buscar paciente pelo nome…" sx={{ flex: 1, fontSize: 14 }} />
                  {patQuery && <Chip size="small" label="limpar" onClick={() => setPatQuery('')} sx={{ height: 22 }} />}
                </Paper>
                {patients.some((p) => p.hasAlerts) && (
                  <Chip size="small" icon={<Box component="span" sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#ef4444', display: 'inline-block' }} />} label="Só alerta" onClick={() => setPatAlertOnly((v) => !v)} color={patAlertOnly ? 'error' : 'default'} variant={patAlertOnly ? 'filled' : 'outlined'} sx={{ fontWeight: 700, flexShrink: 0 }} />
                )}
              </Stack>
            )}
            {patients.length === 0 && (
              <Card sx={{ borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,.04)', border: 'none' }}><CardContent><Box sx={{ textAlign: 'center', py: 6 }}>
                <Box sx={{ fontSize: 64, mb: 2, opacity: 0.4 }}>🩺</Box>
                <Typography sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif', fontSize: 18, color: 'text.primary', mb: 1 }}>Nenhum paciente ainda</Typography>
                <Typography color="text.secondary" sx={{ mb: 0.5 }}>Quando um paciente compartilhar os exames com você, ele aparece aqui automaticamente.</Typography>
                <Typography variant="caption" color="text.secondary">💡 O paciente faz isso no app dele em "Meus Médicos → Compartilhar"</Typography>
              </Box></CardContent></Card>
            )}
            <Stack spacing={1.5}>
              {(() => {
                const q = patQuery.trim().toLowerCase();
                const filtered = patients.filter((p) => (!q || (p.patient?.fullName || '').toLowerCase().includes(q) || (p.code || '').toLowerCase().includes(q)) && (!patAlertOnly || p.hasAlerts));
                // ORDENAÇÃO CLÍNICA (lista flat): alertas primeiro -> exame mais recente -> nome.
                // Médico pensa em PACIENTES (não famílias): nada escondido em acordeão colapsado.
                filtered.sort((a, b) => {
                  if (!!a.hasAlerts !== !!b.hasAlerts) return a.hasAlerts ? -1 : 1;
                  const ad = a.lastExamAt ? new Date(a.lastExamAt).getTime() : 0;
                  const bd = b.lastExamAt ? new Date(b.lastExamAt).getTime() : 0;
                  if (bd !== ad) return bd - ad;
                  return (a.patient?.fullName || '').localeCompare(b.patient?.fullName || '');
                });
                const card = (p: any, key: string) => {
                  const sex = p.sex === 'female' ? 'F' : p.sex === 'male' ? 'M' : null;
                  // Vínculo familiar como DETALHE sutil (não eixo principal): dependente mostra o titular.
                  const isDependente = !!p.relationship && !/titular|respons/i.test(p.relationship);
                  const titularHint = isDependente && p.ownerName ? ` · titular: ${p.ownerName}` : '';
                  const statusLine = [
                    p.hasAlerts ? `🔴 alerta` : null,
                    p.examsCount > 0 ? `📋 ${p.examsCount} exame${p.examsCount > 1 ? 's' : ''}` : null,
                    p.lastExamAt ? `📅 ${fmtDate(p.lastExamAt)}` : null,
                    p.convenio || 'Particular',
                  ].filter(Boolean).join(' · ');
                  return (
                    <Card key={key} sx={{ borderRadius: '12px', cursor: 'pointer', transition: 'all .15s', border: 'none', boxShadow: '0 1px 3px rgba(0,0,0,.04)', '&:hover': { boxShadow: '0 4px 16px rgba(0,0,0,.08)', transform: 'translateY(-1px)' } }} onClick={() => openPatient(p)}>
                      <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.5 }}>
                        <Box sx={{ position: 'relative', flexShrink: 0 }}>
                          <Avatar src={p.patient?.id ? photoUrlFor(p.patient.id) : undefined} sx={{ bgcolor: 'rgba(32,178,170,.08)', color: 'primary.dark', fontWeight: 800, width: 48, height: 48, border: '2px solid', borderColor: p.hasAlerts ? '#ef4444' : 'rgba(32,178,170,.15)' }}>{p.patient?.fullName?.charAt(0)}</Avatar>
                          {p.hasAlerts && <Box sx={{ position: 'absolute', top: -2, right: -2, width: 12, height: 12, borderRadius: '50%', bgcolor: '#ef4444', border: '2px solid #fff' }} />}
                        </Box>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif', fontSize: 15, color: 'text.primary', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.patient?.fullName}</Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25 }}>
                            {[p.age != null ? `${p.age}a` : null, sex, p.relationship].filter(Boolean).join(' · ')}{titularHint}
                          </Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25, fontSize: 11 }}>{statusLine}</Typography>
                        </Box>
                        <ChevronRightIcon sx={{ color: 'text.disabled', fontSize: 20, flexShrink: 0 }} />
                      </CardContent>
                    </Card>
                  );
                };
                return filtered.map((p) => card(p, p.shareId));
              })()}
            </Stack>
          </Box>
        )}

        {/* DETALHE DO PACIENTE — coluna única (PatientSummary → tabs → conteúdo). Desktop: flex 1 ao lado do rail de pacientes. */}
        {view === 'patients' && selected && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, flex: { md: 1 }, minWidth: 0 }}>
            <PatientSummary
              patient={selected}
              exams={exams}
              abnormal={abnormalStats}
              questions={questions}
              notes={notes}
              patients={patients}
              onSwitchPatient={(pid) => { const np = patients.find((x: any) => (x.patient?.id || x.id) === pid); if (np) openPatient(np); }}
              onOpenExam={(id) => setSelExam(id)}
              onAlterados={() => { if (supportedTabs.includes('alterados')) { setTab('alterados'); setSelExam(null); } }}
              onOpenExams={() => { setTab('exams'); setSelExam(null); }}
              onOpenQuestions={() => { setTab('questions'); setSelExam(null); }}
              onOpenNotes={() => { setTab('notes'); setSelExam(null); }}
              medsCount={medsInfo ? medsInfo.medications.filter((m: any) => m.active).length : 0}
              criticalMeds={medsInfo?.critical?.length ?? 0}
              onOpenMeds={() => setMedsOpen(true)}
              activity={activity}
            />

            {/* REMÉDIOS do paciente (read-only) + interações críticas — contexto farmacológico. */}
            <Dialog open={medsOpen} onClose={() => setMedsOpen(false)} fullWidth maxWidth="sm" PaperProps={{ sx: { borderRadius: '12px' } }}>
              <DialogTitle sx={{ fontWeight: 800 }}>💊 Remédios de {selected.patient?.fullName ?? 'paciente'}</DialogTitle>
              <DialogContent>
                {(!medsInfo || medsInfo.medications.length === 0) && (
                  <Typography sx={{ color: 'text.secondary', py: 2 }}>Nenhum remédio cadastrado pelo paciente.</Typography>
                )}
                {medsInfo && medsInfo.medications.length > 0 && (
                  <Stack spacing={0.75} sx={{ mt: 1 }}>
                    {medsInfo.medications.map((m: any) => (
                      <Box key={m.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.25, p: 1, borderRadius: '12px', bgcolor: 'action.hover', opacity: m.active ? 1 : 0.55 }}>
                        {/* FOTO do produto (catálogo/snapshot) — mesma régua da página Remédios */}
                        {m.catalogPhotoUrl ? (
                          <Box component="img" src={m.catalogPhotoUrl} alt={m.name} loading="lazy"
                            sx={{ width: 40, height: 40, borderRadius: '10px', objectFit: 'contain', bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', flexShrink: 0 }} />
                        ) : (
                          <Box sx={{ width: 40, height: 40, borderRadius: '10px', display: 'grid', placeItems: 'center', flexShrink: 0, bgcolor: 'rgba(32,178,170,.1)', color: '#178f89', fontWeight: 800, fontSize: 16, fontFamily: 'Poppins, sans-serif' }}>
                            {String(m.name || '?').trim().charAt(0).toUpperCase()}
                          </Box>
                        )}
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography sx={{ fontWeight: 700, fontSize: 14 }}>{m.name}</Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary' }}>{[m.dosage, m.frequency].filter(Boolean).join(' · ')}{m.active ? '' : ' · suspenso'}</Typography>
                        </Box>
                      </Box>
                    ))}
                    {medsInfo.critical.length > 0 && (
                      <Box sx={{ mt: 1.5 }}>
                        <Typography sx={{ fontWeight: 800, color: 'error.main', fontSize: 13.5, mb: 0.5 }}>⚠️ Interações críticas</Typography>
                        {medsInfo.critical.map((c: any, i: number) => (
                          <Box key={i} sx={{ p: 1, borderRadius: '8px', bgcolor: 'rgba(185,28,28,.08)', mb: 0.75 }}>
                            <Typography sx={{ fontWeight: 700, fontSize: 13 }}>{c.drugA} + {c.drugB} ({c.severity})</Typography>
                            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>{c.effect}</Typography>
                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>💡 {c.recommendation}</Typography>
                          </Box>
                        ))}
                      </Box>
                    )}
                    <Typography variant="caption" sx={{ color: 'text.secondary', mt: 1 }}>Cadastro do paciente · leitura educativa, não substitui julgamento clínico.</Typography>
                  </Stack>
                )}
              </DialogContent>
              <DialogActions>
                <Button onClick={() => setMedsOpen(false)} sx={{ textTransform: 'none', fontWeight: 700 }}>Fechar</Button>
              </DialogActions>
            </Dialog>

            {supportedTabs.length > 0 && (
              <Box sx={{ position: 'sticky', top: 'env(safe-area-inset-top)', zIndex: 10, bgcolor: 'background.paper', borderBottom: '1px solid', borderColor: 'divider', mx: -2, px: 2, mt: { xs: -0.5, lg: 0 }, mb: 2 }}>
                <Tabs
                  /* A aba ativa pode ser um destino de TILE (questions/notes) que não está na
                     barra — value=false evita warning do MUI e mantém nenhuma aba marcada. */
                  value={supportedTabs.includes(tab) ? tab : false}
                  onChange={(_, v) => { setTab(v); setSelExam(null); }}
                  variant="fullWidth"
                  aria-label="Abas do paciente"
                  sx={{
                    minHeight: 58,
                    // Assinatura do portal médico: aba ativa em COBRE (no app do paciente é teal).
                    '& .MuiTabs-indicator': { height: 3, borderRadius: '3px', bgcolor: COPPER.deep },
                    '& .MuiTabs-scroller': { py: 0.5 },
                    '& .MuiTabs-flexContainer': { justifyContent: 'space-between' },
                    '& .MuiTab-root': {
                      // 4 abas agora: MAIORES, com rótulo SEMPRE visível (ícone em cima,
                      // descrição embaixo) — alvo confortável + clareza de destino.
                      minHeight: 58, px: { xs: 0.5, sm: 1.5 }, py: 1,
                      textTransform: 'none', fontWeight: 700,
                      color: 'text.secondary', flexDirection: 'column', gap: 0.5,
                      '& .MuiTab-icon': { fontSize: 26 },
                      '&.Mui-selected': { color: (t: Theme) => copperText(t.palette.mode) },
                    },
                  }}
                >
                  {supportedTabs.map((s) => {
                    const meta = SCOPE_META[s] || { icon: <DescriptionIcon />, label: s };
                    const count = s === 'exams' ? exams.length : s === 'alterados' ? abnormalStats.total : 0;
                    // 4 abas: rótulo SEMPRE visível (era icon-only no xs p/ caber 6) — ícone em
                    // cima, descrição embaixo, contador como sup discreto.
                    return (
                      <Tab
                        key={s}
                        value={s}
                        icon={meta.icon}
                        iconPosition="top"
                        aria-label={meta.label}
                        title={meta.label}
                        label={
                          <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontSize: { xs: 12, sm: 13 }, lineHeight: 1.2 }}>
                            <Box component="span">{meta.label}</Box>
                            {count > 0 && (
                              <Box component="sup" sx={{
                                fontSize: 11, fontWeight: 800, lineHeight: 1,
                                color: s === 'alterados' && abnormalStats.total > 0 ? 'error.main' : 'text.secondary',
                                ml: 0.25,
                              }}>{count}</Box>
                            )}
                          </Box>
                        }
                      />
                    );
                  })}
                </Tabs>
              </Box>
            )}

            {/* NOVOS BODIES (espelham o app do paciente) — Exames / Alterados / Relatório via
                componentes dedicados em components/doctors. Perguntas e Anotações seguem inline. */}
            {tab === 'exams' && !selExam && (
              <DoctorExamList patientId={selected.patient.id} token={token} onOpen={(id) => setSelExam(id)} />
            )}
            {tab === 'alterados' && !selExam && (
              <DoctorValoresAlterados patientId={selected.patient.id} token={token} />
            )}
            {tab === 'tendencias' && !selExam && (
              <DoctorTrends patientId={selected.patient.id} token={token} />
            )}
            {tab === 'relatorio' && !selExam && (
              <DoctorConsolidatedReport patientId={selected.patient.id} token={token} patientName={selected.patient.fullName} onOpenExam={(id) => setSelExam(id)} />
            )}
            {selExam && (
              <DoctorExamDetail patientId={selected.patient.id} examId={selExam} token={token} onBack={() => setSelExam(null)} />
            )}

            {/* PERGUNTAS — thread completa (paciente + médico + IA) em bolhas. */}
            {tab === 'questions' && !selExam && (
                  <Stack spacing={1.5}>
                    {questions.length === 0 && <Empty label="Nenhuma pergunta deste paciente ainda." icon="❓" />}
                    {questions.length > 0 && (
                      <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
                        {([['all', 'Todas'], ['pending', 'Aguardando'], ['answered', 'Respondidas']] as const).map(([k, l]) => (
                          <Chip key={k} size="small" label={l} color={qFilter === k ? 'primary' : 'default'} variant={qFilter === k ? 'filled' : 'outlined'} onClick={() => setQFilter(k)} sx={{ fontWeight: 700, borderRadius: '999px' }} />
                        ))}
                      </Stack>
                    )}
                    {[...questions].filter((q: any) => qFilter === 'all' || (qFilter === 'pending' ? q.status !== 'answered' : q.status === 'answered')).sort((a: any, b: any) => (a.status === 'answered' ? 1 : 0) - (b.status === 'answered' ? 1 : 0)).map((q: any) => {
                      const msgs = q.messages ?? [];
                      return (
                        <Card key={q.id} variant="outlined" sx={{ borderRadius: '12px', borderColor: 'divider' }}>
                          <CardContent>
                            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1} sx={{ mb: 1 }}>
                              {/* Título com clamp 2 linhas (perguntas antigas têm subject longo) + texto completo no title. */}
                              <Typography sx={{ fontWeight: 800, wordBreak: 'break-word', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }} title={q.subject}>💬 {q.subject}</Typography>
                              <QuestionStatusBadge status={q.status} />
                            </Stack>
                            {msgs.length > 0 && (
                              <Stack spacing={0.75} sx={{ mb: 1 }}>
                                {msgs.map((m: any, i: number) => {
                                  const isDoc = m.authorRole === 'doctor';
                                  const isAi = m.authorRole === 'ai';
                                  const isSys = m.authorRole === 'system';
                                  if (isSys) {
                                    // Auto-recebimento (ex.: "✅ Recebido! Dr. X vai analisar em breve") — centralizado, muted.
                                    return <Box key={i} sx={{ textAlign: 'center', my: 0.5 }}><Box sx={{ display: 'inline-block', px: 1.5, py: 0.5, borderRadius: '999px', bgcolor: 'rgba(32,178,170,.08)', color: 'text.secondary', fontSize: 12, fontWeight: 600 }}>{m.body}</Box></Box>;
                                  }
                                  const av = isAi ? null : isDoc
                                    ? <Avatar src={doctor?.photoUrl ? doctorPhotoUrl(doctor.id, photoVer) : undefined} sx={{ width: 36, height: 36, bgcolor: 'primary.dark', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>{(doctor?.name || 'M').charAt(0)}</Avatar>
                                    : <Avatar src={selected?.patient?.photoUrl ? photoUrlFor(selected.patient.id, 0) : undefined} sx={{ width: 36, height: 36, bgcolor: '#94a3b8', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>{(selected?.patient?.fullName || 'P').charAt(0)}</Avatar>;
                                  // Nome do médico vem com "Dr." no cadastro — stripa p/ não virar "Dr. Dr." (auditoria)
                                  const docName = (doctor?.name || 'Médico').replace(/^Dr[aº.]*\s+/i, '').trim();
                                  const role = isDoc ? `Dr. ${docName}` : isAi ? '🤖 IA' : selected?.patient?.fullName || 'Paciente';
                                  return (
                                    <Box key={i} sx={{ display: 'flex', justifyContent: isDoc ? 'flex-end' : 'flex-start', gap: 0.75, alignItems: 'flex-end' }}>
                                      {!isDoc && av}
                                      <Box sx={{ maxWidth: '78%', p: 1, px: 1.25, borderRadius: '12px', bgcolor: (t) => isDoc ? (t.palette.mode === 'dark' ? '#1e2d2c' : '#e0f2f1') : isAi ? (t.palette.mode === 'dark' ? '#2b2438' : '#f3e8ff') : (t.palette.mode === 'dark' ? '#242f33' : '#f1f5f9'), border: '1px solid', borderColor: isDoc ? 'rgba(32,178,170,.25)' : 'transparent' }}>
                                        <Typography variant="caption" sx={{ display: 'block', fontWeight: 700, color: isDoc ? 'primary.dark' : isAi ? '#6366f1' : 'text.secondary', mb: 0.25, fontSize: 11 }}>{role} · {new Date(m.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</Typography>
                                        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.45, wordBreak: 'break-word' }}>{m.body}</Typography>
                                      </Box>
                                      {isDoc && av}
                                    </Box>
                                  );
                                })}
                              </Stack>
                            )}
                            {q.status === 'answered' ? null : (<>
                              <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" sx={{ mb: 0.75 }}>
                                {QUICK_REPLIES.slice(0, 4).map((t) => <Chip key={t} size="small" variant="outlined" label={t} onClick={() => setQText((prev) => ({ ...prev, [q.id]: t }))} sx={{ fontWeight: 600, height: 'auto', maxWidth: '100%', borderRadius: '12px', py: 0.5, borderColor: 'rgba(32,178,170,.4)', color: 'primary.dark', '& .MuiChip-label': { whiteSpace: 'normal', lineHeight: 1.3 }, '&:hover': { bgcolor: 'rgba(32,178,170,.06)' } }} />)}
                              </Stack>
                              <TextField multiline minRows={1} size="small" fullWidth placeholder="Escrever resposta…" value={qText[q.id] ?? ''} onChange={(e) => setQText((t) => ({ ...t, [q.id]: e.target.value }))} />
                              <Button size="small" disabled={qSending === q.id || !(qText[q.id]?.trim())} onClick={() => responderQ(q.id)} startIcon={qSending === q.id ? <CircularProgress size={14} color="inherit" /> : undefined} sx={{ mt: 0.5, textTransform: 'none', fontWeight: 700, color: 'primary.dark' }}>{qSending === q.id ? 'Enviando…' : 'Responder'}</Button>
                            </>)}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </Stack>
                )}

                {tab === 'notes' && !selExam && (
                  <NotesTab notes={notes} newNote={newNote} setNewNote={setNewNote} onAdd={addNote} onDelete={delNote} onSave={saveNote} />
                )}
          </Box>
        )}
        </Box>{/* fim do master/detail leve (rail + workspace) */}
      </Box>
      </Box>{/* fim da coluna de conteúdo (flex:1) */}

      {/* MENU vertical OVERLAY (mobile) — no desktop a sidebar permanente acima já está visível */}
      {!isDesktop && (
        <Drawer open={menuOpen} onClose={() => setMenuOpen(false)} PaperProps={{ sx: { width: 290, display: 'flex', flexDirection: 'column' } }}>
          {renderSideMenu(() => setMenuOpen(false))}
        </Drawer>
      )}

      {/* DIALOG DE PAGAMENTO — PIX QR inline + timer + opção cartão */}
      <Dialog open={payOpen} onClose={() => { setPayOpen(false); setPayData(null); }} PaperProps={{ sx: { borderRadius: '12px', maxWidth: 380 } }}>
        <DialogTitle sx={{ fontWeight: 800, textAlign: 'center', pb: 1 }}>💎 Dr. Exame Pro — R$29,90/mês</DialogTitle>
        <DialogContent>
          {payData?.qrBase64 ? (
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="body2" sx={{ mb: 1.5, color: 'text.secondary' }}>Escaneie o QR Code com o app do seu banco:</Typography>
              <Box component="img" src={payData.qrBase64} alt="PIX QR Code" sx={{ width: 220, height: 220, borderRadius: '12px', border: '1px solid', borderColor: 'divider' }} />
              <Box sx={{ mt: 1.5, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 0.5 }}>
                <Typography component="span" sx={{ fontSize: 20 }}>⏳</Typography>
                <PayCountdown expiresAt={payData.expiresAt} onExpire={() => { setPayOpen(false); setPayData(null); }} />
              </Box>
              <Typography variant="caption" sx={{ display: 'block', mt: 1, color: '#047857', fontWeight: 700 }}>✅ Detecta pagamento automaticamente</Typography>
              <Button fullWidth size="small" onClick={() => { if (payData.qrCode) navigator.clipboard.writeText(payData.qrCode); }} sx={{ mt: 1, textTransform: 'none', borderRadius: '999px' }}>📋 Copiar código PIX</Button>
              <Divider sx={{ my: 1.5 }}><Typography variant="caption" sx={{ color: 'text.secondary' }}>ou pague com</Typography></Divider>
              <Button fullWidth size="small" variant="outlined" onClick={() => startCheckout('card')} sx={{ textTransform: 'none', borderRadius: '999px', fontWeight: 700 }}>💳 Cartão de crédito / débito</Button>
            </Box>
          ) : (
            <Box sx={{ textAlign: 'center', py: 3 }}>
              <CircularProgress size={28} sx={{ color: '#6366f1' }} />
              <Typography variant="body2" sx={{ mt: 1, color: 'text.secondary' }}>Gerando pagamento...</Typography>
            </Box>
          )}
        </DialogContent>
      </Dialog>

      {/* MENU RODAPÉ (mobile) — Pacientes · Perguntas · Perfil · Mais. Botões acessíveis (aria + button nativo). */}
      <Box component="nav" sx={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1100, display: { xs: 'flex', md: 'none' }, justifyContent: 'space-around', bgcolor: 'background.paper', backdropFilter: 'blur(14px)', borderTop: '1px solid', borderTopColor: 'divider', pb: 'env(safe-area-inset-bottom)', boxShadow: '0 -6px 24px rgba(32,178,170,.10)' }}>
        {([
          { label: 'Início', on: view === 'overview', onClick: () => { setView('overview'); setSelected(null); setSelExam(null); }, icon: <SpaceDashboardIcon />, badge: 0 },
          { label: 'Pacientes', on: view === 'patients', onClick: () => { setView('patients'); setSelected(null); setSelExam(null); }, icon: <GroupsIcon />, badge: 0 },
          { label: 'Perguntas', on: view === 'questions', onClick: () => { setView('questions'); loadAllQ(); }, icon: <QuestionAnswerIcon />, badge: unreadQ },
          { label: 'Perfil', on: view === 'profile' || view === 'password', onClick: () => setView('profile'), icon: <PersonIcon />, badge: 0 },
          { label: 'Mais', on: menuOpen, onClick: () => setMenuOpen(true), icon: <MoreHorizIcon />, badge: 0 },
        ] as const).map((it) => (
          <Box
            key={it.label}
            component="button"
            type="button"
            onClick={it.onClick}
            aria-label={it.label}
            aria-current={it.on ? 'page' : undefined}
            sx={{
              flex: 1, minHeight: 44, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              py: 0.9, cursor: 'pointer', color: it.on ? (t: Theme) => copperText(t.palette.mode) : 'text.secondary', transition: 'color .15s',
              bgcolor: 'transparent', border: 'none', outline: 'none', fontFamily: 'inherit',
              '&:focus-visible': { outline: (t) => `2px solid ${t.palette.primary.main}`, outlineOffset: -2 },
              '&:active': { transform: 'scale(.92)' },
            }}
          >
            <Badge color="error" variant="dot" invisible={it.badge === 0} overlap="circular" sx={{ '& .MuiBadge-badge': { right: 4, top: 4 } }}>
              <Box sx={{ fontSize: 21, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', '& .MuiSvgIcon-root': { fontSize: 22 } }}>{it.icon}</Box>
            </Badge>
            <Typography sx={{ fontSize: 10, fontWeight: it.on ? 800 : 600, mt: 0.25, fontFamily: 'Poppins, sans-serif' }}>{it.label}</Typography>
            <Box sx={{ height: 3, width: it.on ? 22 : 0, borderRadius: '12px', bgcolor: COPPER.main, mt: 0.3, transition: 'width .2s' }} />
          </Box>
        ))}
      </Box>
    </Box>
  );
};

const Empty = ({ label, icon = '📭' }: { label: string; icon?: string }) => (
  <Card sx={{ borderRadius: '12px' }}><CardContent><Box sx={{ textAlign: 'center', py: 4 }}>
    <Box sx={{ fontSize: 44, mb: 1 }}>{icon}</Box>
    <Typography color="text.secondary">{label}</Typography>
  </Box></CardContent></Card>
);

/** Perfil do médico: foto (reusa PhotoUpload) + edição de nome/especialidade/e-mail. CRM fixo. */
const DoctorProfile = ({ token, doctor, onBack, onSaved, onPhoto, photoVer }: { token: string; doctor: any; onBack: () => void; onSaved: (d: any) => void; onPhoto: () => void; photoVer: number }) => {
  const [name, setName] = useState(doctor?.name ?? '');
  const [spec, setSpec] = useState(doctor?.specialty ?? '');
  const [email, setEmail] = useState(doctor?.email ?? '');
  // Perfil público (visto pelo paciente ao abrir o médico na lista dele)
  const [phone, setPhone] = useState(doctor?.phone ?? '');
  const [clinicName, setClinicName] = useState(doctor?.clinicName ?? '');
  const [clinicCity, setClinicCity] = useState(doctor?.clinicCity ?? '');
  const [bio, setBio] = useState(doctor?.bio ?? '');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const save = async () => {
    setSaving(true); setMsg(null);
    try {
      const r = await fetch(`${API_URL}/doctor/me`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ name, specialty: spec, email }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Falha ao salvar');
      // Perfil público (telefone/consultório/cidade/bio) — endpoint dedicado, visto pelo paciente.
      const r2 = await fetch(`${API_URL}/doctor/profile`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ phone, clinicName, clinicCity, bio }) });
      const d2 = await r2.json();
      if (!r2.ok) throw new Error(d2.error || 'Falha ao salvar perfil público');
      onSaved(d2.doctor); setMsg({ type: 'ok', text: 'Perfil atualizado!' });
    } catch (e: any) { setMsg({ type: 'err', text: e.message }); } finally { setSaving(false); }
  };

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
        <Button size="small" onClick={onBack} sx={{ color: 'primary.dark', textTransform: 'none', fontWeight: 700, minWidth: 0 }}>← Voltar</Button>
        <Typography sx={{ fontWeight: 800, color: 'text.primary' }}>Meu perfil</Typography>
      </Stack>

      <Card sx={{ borderRadius: '12px', mb: 2, background: 'rgba(32,178,170,0.08)', border: '1px solid', borderColor: 'divider' }}>
        <CardContent>
          <Stack direction="row" spacing={2} alignItems="center">
            <PhotoUpload endpoint={`${API_URL}/doctor/me/photo`} authToken={token} fallback={doctor?.name?.charAt(0)} src={doctor?.photoUrl ? doctorPhotoUrl(doctor.id, photoVer) : undefined} onUploaded={onPhoto} size={84} hideLabel />
            <Box>
              <Typography sx={{ fontWeight: 800, color: 'text.primary' }}>{name || 'Médico'}</Typography>
              <Typography variant="caption" color="text.secondary">CRM {doctor?.crm}{spec ? ` • ${spec}` : ''}</Typography>
              <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>Toque na câmera pra trocar a foto.</Typography>
            </Box>
          </Stack>
        </CardContent>
      </Card>

      <Box sx={{ mt: 2 }}>
        <MfaSetupCard apiBase={`${API_URL}/doctor`} authToken={token} />
      </Box>

      <Card sx={{ borderRadius: '12px' }}>
        <CardContent>
          <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 800, color: 'primary.dark' }}>DADOS PROFISSIONAIS</Typography>
          <Stack spacing={2}>
            <TextField label="Nome completo" value={name} onChange={(e) => setName(e.target.value)} size="small" fullWidth />
            <TextField label="CPF" value={doctor?.cpfMasked ?? 'Não cadastrado'} disabled size="small" fullWidth helperText="CPF fica bloqueado após verificação. Correção somente via suporte auditado." />
            <TextField label="CRM" value={doctor?.crm ?? ''} disabled size="small" fullWidth helperText="O CRM não pode ser alterado (identidade profissional)." />
            <TextField select label="Especialidade" value={spec} onChange={(e) => setSpec(e.target.value)} size="small" fullWidth>
              <MenuItem value=""><em>Selecione…</em></MenuItem>
              {SPECIALTIES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
            </TextField>
            <TextField label="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} size="small" fullWidth />
            <Divider sx={{ my: 0.5 }}><Typography variant="caption" color="text.secondary">PERFIL PÚBLICO (visto pelo paciente)</Typography></Divider>
            <TextField label="Telefone / WhatsApp" value={phone} onChange={(e) => setPhone(e.target.value)} size="small" fullWidth helperText="Vira o botão 'Agendar no WhatsApp' para o paciente." inputProps={{ inputMode: 'tel' }} />
            <TextField label="Consultório / Clínica" value={clinicName} onChange={(e) => setClinicName(e.target.value)} size="small" fullWidth />
            <TextField label="Cidade - UF" value={clinicCity} onChange={(e) => setClinicCity(e.target.value)} size="small" fullWidth placeholder="Ex.: São Paulo - SP" />
            <TextField label="Apresentação / referências" value={bio} onChange={(e) => setBio(e.target.value)} size="small" fullWidth multiline minRows={2} inputProps={{ maxLength: 500 }} />
          </Stack>
          {msg && <Alert severity={msg.type === 'ok' ? 'success' : 'error'} sx={{ mt: 1.5, py: 0.5, borderRadius: '12px' }}>{msg.text}</Alert>}
          <Button variant="contained" color="primary" onClick={save} disabled={saving} startIcon={saving ? <CircularProgress size={18} color="inherit" /> : undefined} sx={{ mt: 2, borderRadius: '12px', textTransform: 'none', fontWeight: 800 }}>{saving ? 'Salvando…' : 'Salvar perfil'}</Button>
        </CardContent>
      </Card>
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
        <Button size="small" onClick={onBack} sx={{ color: 'primary.dark', textTransform: 'none', fontWeight: 700, minWidth: 0 }}>← Voltar</Button>
        <Typography sx={{ fontWeight: 800, color: 'text.primary' }}>🔒 Trocar senha</Typography>
      </Stack>
      <Card sx={{ borderRadius: '12px' }}><CardContent>
        <Stack spacing={2}>
          <TextField type="password" label="Senha atual" value={cur} onChange={(e) => setCur(e.target.value)} size="small" fullWidth />
          <TextField type="password" label="Nova senha (mín. 6)" value={nw} onChange={(e) => setNw(e.target.value)} size="small" fullWidth />
          <TextField type="password" label="Confirmar nova senha" value={cf} onChange={(e) => setCf(e.target.value)} size="small" fullWidth />
          {msg && <Alert severity={msg.type === 'ok' ? 'success' : 'error'} sx={{ py: 0.5, borderRadius: '12px' }}>{msg.text}</Alert>}
          <Button variant="contained" color="primary" onClick={save} disabled={saving || !cur || !nw} startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <LockIcon />} sx={{ alignSelf: 'flex-start', borderRadius: '12px', textTransform: 'none', fontWeight: 800 }}>{saving ? 'Alterando…' : 'Alterar senha'}</Button>
        </Stack>
      </CardContent></Card>
    </Box>
  );
};

/** #1 Anotações clínicas (histórico de atendimento) — adicionar / editar / excluir. */
const NotesTab = ({ notes, newNote, setNewNote, onAdd, onDelete, onSave }: { notes: any[]; newNote: string; setNewNote: (s: string) => void; onAdd: () => void; onDelete: (id: string) => void; onSave: (id: string, content: string) => void }) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const btnSx = { borderRadius: '12px', textTransform: 'none', fontWeight: 800, bgcolor: 'primary.dark', '&:hover': { bgcolor: 'primary.main' } } as const;
  return (
    <Box>
      <Card sx={{ mb: 2, borderRadius: '12px', border: '1px solid', borderColor: 'divider' }}><CardContent>
        <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 800, color: 'primary.dark' }}>📝 Nova anotação</Typography>
        <TextField value={newNote} onChange={(e) => setNewNote(e.target.value)} multiline minRows={2} fullWidth size="small" placeholder="Conduta, observação clínica, retorno solicitado…" />
        <Button variant="contained" onClick={onAdd} disabled={!newNote.trim()} sx={{ mt: 1, ...btnSx }}>Adicionar</Button>
      </CardContent></Card>
      {notes.length === 0 && <Empty label="Nenhuma anotação ainda. Use o campo acima pra registrar uma conduta." icon="📝" />}
      <Stack spacing={1.25}>
        {notes.map((n) => (
          <Card key={n.id} variant="outlined" sx={{ borderRadius: '12px', borderColor: 'divider' }}><CardContent>
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
                <Typography sx={{ whiteSpace: 'pre-wrap', fontSize: 14, color: 'text.primary' }}>{n.content}</Typography>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 1 }}>
                  <Typography variant="caption" color="text.secondary">{new Date(n.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</Typography>
                  <Stack direction="row" spacing={0.5}>
                    <IconButton aria-label="Editar anotação" size="small" sx={{ color: 'text.secondary' }} onClick={() => { setEditingId(n.id); setEditText(n.content); }}><EditOutlinedIcon fontSize="small" /></IconButton>
                    <IconButton aria-label="Excluir anotação" size="small" sx={{ color: 'error.main' }} onClick={() => onDelete(n.id)}><DeleteOutlinedIcon fontSize="small" /></IconButton>
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

// Status de triagem do analito removido (EvolutionCharts migrado para components/doctors).

