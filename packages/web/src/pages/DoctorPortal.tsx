import { useState, useEffect, useRef, useMemo, type KeyboardEvent, type ReactElement, type ReactNode } from 'react';
import { Box, Card, CardContent, Typography, TextField, Button, CircularProgress, Stack, Chip, Avatar, Menu, MenuItem, Alert, Divider, InputAdornment, IconButton, Link, Drawer, List, ListItemButton, ListItemText, ListItemIcon, Accordion, AccordionSummary, AccordionDetails, Badge, InputBase, Paper, useMediaQuery, useTheme, Dialog, DialogTitle, DialogContent, DialogActions, Tabs, Tab, Tooltip, Switch } from '@mui/material';
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
import { AppCard } from '../components/AppCard';
import { LAYOUT, COPPER, copperText, SEM } from '../theme';
import { premiumText, badDot } from '../components/doctors/portal/shared';
import { priorityOf, refScaleSuspect } from '../utils/alertPriority';
import { QuestionStatusBadge } from '../components/QuestionStatusBadge';
import { confirmDialog, snackbar } from '../components/ConfirmDialog';
import VideocamIcon from '@mui/icons-material/Videocam';
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import AssignmentAddIcon from '@mui/icons-material/AssignmentAdd';
import CloseIcon from '@mui/icons-material/Close';
import { openTelemedicinaRoom } from '../utils/telemedicina';
import { DrExame } from '../components/DrExame';
import { OtpInput } from '../components/OtpInput';
import { DoctorProfileForm } from '../components/doctors/portal/DoctorProfileForm';
import { DoctorChangePasswordForm } from '../components/doctors/portal/DoctorChangePasswordForm';
import { NotesTab, Empty } from '../components/doctors/portal/NotesTab';
import { PortalInvites } from '../components/doctors/portal/PortalInvites';
import { PortalQuestions } from '../components/doctors/portal/PortalQuestions';
import { PortalOverview } from '../components/doctors/portal/PortalOverview';
import { PortalTeleconsultas } from '../components/doctors/portal/PortalTeleconsultas';
import { TeleScheduleDialog } from '../components/doctors/portal/TeleScheduleDialog';
import { PortalFinanceiro } from '../components/doctors/portal/PortalFinanceiro';
import { SPECIALTIES, UFS } from '../utils/medicalData';
import { formatCpf, isValidCpf } from '../utils/cpf';
import { DoctorPatientSwitcher } from '../components/doctors/DoctorPatientSwitcher';
import { DoctorExamList } from '../components/doctors/DoctorExamList';
import { DoctorExamDetail } from '../components/doctors/DoctorExamDetail';
import { DoctorValoresAlterados } from '../components/doctors/DoctorValoresAlterados';
import { DoctorConsolidatedReport } from '../components/doctors/DoctorConsolidatedReport';
import { DoctorTrends } from '../components/doctors/DoctorTrends';
import { SportsPanel } from '../components/doctors/portal/SportsPanel';
import { PatientSummary } from '../components/doctors/PatientSummary';
import { ClinicalRiskCard } from '../components/doctors/ClinicalRiskCard';
// F3 (20/10) — área pós-consulta + pedidos de exame (doc 2026-10-20-f3-ux.md).
import { TranscriptView } from '../components/teleconsulta/TranscriptView';
import { ExamRequestCard } from '../components/teleconsulta/ExamRequestCard';
import { DoctorRequestPanel } from '../components/teleconsulta/DoctorRequestPanel';
import type { TeleconsultaSummary } from '../components/teleconsulta/types';

const docKey = 'doctorToken';

/* Ícones inline (sem dependência extra). */
const I = {
  Mail: () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>),
  Lock: () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>),
  Person: () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-3.3 3.6-5 8-5s8 1.7 8 5" /></svg>),
  Badge: () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M8 4v4M16 4v4" /></svg>),
  Eye: () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>),
  EyeOff: () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3l18 18" /><path d="M10.6 5.1A10.9 10.9 0 0 1 12 5c6.5 0 10 7 10 7a18 18 0 0 1-3.2 4M6.6 6.6A18 18 0 0 0 2 12s3.5 7 10 7a10.8 10.8 0 0 0 5.4-1.5" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>),
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
  const t = useTheme();
  const [secs, setSecs] = useState(Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)));
  useEffect(() => {
    if (secs <= 0) { onExpire(); return; }
    const iv = setInterval(() => setSecs((s) => { if (s <= 1) { clearInterval(iv); onExpire(); return 0; } return s - 1; }), 1000);
    return () => clearInterval(iv);
  }, []);
  const mm = Math.floor(secs / 60), ss = secs % 60;
  return (
    <Box aria-live="polite" aria-atomic="true" component="span" sx={{ display: 'inline-flex', alignItems: 'center' }}>
      <Typography component="span" sx={{ fontWeight: 800, color: secs < 60 ? 'error.main' : premiumText(t.palette.mode), fontFamily: 'monospace', fontSize: 18 }}>{String(mm).padStart(2, '0')}:{String(ss).padStart(2, '0')}</Typography>
    </Box>
  );
};

/* ── ATENDER AGORA (fila imediata — spec 2026-10-27 §6) ────────────────────── */
/** Offer do GET /doctor/queue/calls (contrato spec §2; campos extras tolerados). */
interface QueueCallOffer {
  callId: string;
  patientName: string;
  patientAge?: number | null;
  queueWaitSec?: number | null;
  priceCents?: number | null;
  /** Líquido pro médico quando a snapshot traz (senão mostra o preço cheio). */
  netPriceCents?: number | null;
  acceptDeadlineIso?: string | null;
  briefUrl?: string | null;
}
/** Countdown circular (determinate) do chamado imediato — o TOTAL é capturado no
 *  1º mount (a deadline já vem parcialmente consumida); 0 não decide nada: o
 *  polling devolve offer=null e o dialog fecha sozinho ("expirou"). */
const OfferCountdown = ({ deadlineIso }: { deadlineIso: string | null }) => {
  const [secs, setSecs] = useState(() => (deadlineIso ? Math.max(0, Math.ceil((new Date(deadlineIso).getTime() - Date.now()) / 1000)) : 0));
  const totalRef = useRef(secs > 0 ? secs : 45);
  useEffect(() => {
    if (!deadlineIso) return;
    const iv = setInterval(() => setSecs(Math.max(0, Math.ceil((new Date(deadlineIso).getTime() - Date.now()) / 1000))), 250);
    return () => clearInterval(iv);
  }, [deadlineIso]);
  const pct = Math.max(0, Math.min(100, (secs / Math.max(1, totalRef.current)) * 100));
  return (
    <Stack direction="row" alignItems="center" spacing={1.25} aria-live="off">
      <Box sx={{ position: 'relative', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
        <CircularProgress variant="determinate" value={pct} size={52} thickness={4} sx={{ color: pct <= 25 ? 'error.main' : '#178f89' }} />
        <Typography sx={{ position: 'absolute', fontSize: 14, fontWeight: 900, fontVariantNumeric: 'tabular-nums', color: pct <= 25 ? 'error.main' : 'text.primary' }}>{secs}</Typography>
      </Box>
      <Typography sx={{ fontSize: 12, color: 'text.secondary', fontWeight: 700 }}>segundos<br />para aceitar</Typography>
    </Stack>
  );
};
const fmtWait = (sec?: number | null) => {
  const s = Math.max(0, Math.floor(sec ?? 0));
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)} min`;
};

/* Ícones das abas — PHOSPHOR duotone (premium, distintos, peso visual rico).
 * Mapeamento: Exames=laudo, Alterados=flag, Tendências=gráfico, Relatório=resumo,
 * Perguntas=chat, Anotações=lápis. */
import { Receipt, Flag, ChartLineUp, FileText, ChatCircle, NotePencil, Stethoscope, CalendarBlank, Diamond, Medal } from '@phosphor-icons/react';
import { tealText } from '../theme';

const SCOPE_META: Record<string, { label: string; icon: ReactElement }> = {
  exams: { label: 'Exames', icon: <Receipt size={22} weight="duotone" /> },
  alterados: { label: 'Alterados', icon: <Flag size={22} weight="duotone" /> },
  tendencias: { label: 'Tendências', icon: <ChartLineUp size={22} weight="duotone" /> },
  relatorio: { label: 'Relatório', icon: <FileText size={22} weight="duotone" /> },
  sports: { label: 'Esportivo', icon: <Medal size={22} weight="duotone" /> },
  questions: { label: 'Perguntas', icon: <ChatCircle size={22} weight="duotone" /> },
  notes: { label: 'Anotações', icon: <NotePencil size={22} weight="duotone" /> },
};

/** Abas do portal = 4 destinos CLÍNICOS grandes (feedback 2026-08-19): Exames, Alterados,
 *  Tendências (scope 'exams') + Relatório (scope 'summary'). Perguntas e Anotações SAEM da barra
 *  — viram destino dos TILES do resumo do paciente (Pendências→Perguntas, Anotações→notas,
 *  Último exame→Exames): menos competição na barra, botões maiores com rótulo legível.
 *  E5.1: scope 'sports' (opcional) adiciona a aba Esportivo — sem o escopo, NADA esportivo
 *  aparece no portal (gate único aqui). */
const computeTabs = (scopes: string[]): string[] => {
  const t: string[] = [];
  if (scopes.includes('exams')) t.push('exams', 'alterados', 'tendencias');
  if (scopes.includes('summary')) t.push('relatorio');
  if (scopes.includes('sports')) t.push('sports');
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
      <Box sx={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2, background: 'linear-gradient(135deg, rgba(32,178,170,.08), transparent)' }}>
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
    <Box sx={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2, background: 'linear-gradient(135deg, rgba(32,178,170,.08), transparent)' }}>
      <Box sx={{ width: '100%', maxWidth: 420, bgcolor: 'background.paper', borderRadius: '16px', boxShadow: '0 10px 40px rgba(0,80,70,.12)', p: { xs: 3, sm: 4 } }}>
        <Box sx={{ mb: 1 }}>
          <Button size="small" onClick={() => navigate('/')} sx={{ color: 'text.secondary', textTransform: 'none', fontWeight: 700, p: 0, minWidth: 0, '&:hover': { bgcolor: 'transparent', color: (t) => tealText(t.palette.mode) } }}>← Voltar ao app</Button>
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
                <Typography sx={{ fontSize: 12, color: 'text.secondary', lineHeight: 1.35 }}>Use o <strong>mesmo CRM</strong> que seu paciente informou no convite pra ativar seu acesso.</Typography>
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
            <Button type="button" variant="outlined" size="small" onClick={buscarCrmReg} disabled={regLooking} startIcon={regLooking ? <CircularProgress size={15} color="inherit" /> : <span>🔍</span>} sx={{ alignSelf: 'flex-start', borderRadius: '999px', textTransform: 'none', fontWeight: 700, color: (t) => tealText(t.palette.mode), borderColor: 'primary.dark' }}>
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
          <Link component="button" type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setErr(''); }} sx={{ fontWeight: 700, color: (t) => tealText(t.palette.mode) }}>
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

/** Cards clicáveis acessíveis por TECLADO (WCAG 2.1.1): Enter/Space disparam a mesma ação
 *  do clique. Usar sempre junto com role="button" tabIndex={0} + focusRingSx no componente. */
const a11yClick = (fn: () => void) => ({
  onClick: fn,
  onKeyDown: (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); }
  },
});
const focusRingSx = { '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 } } as const;
/** Marcador de status SEM emoji — leitor de tela lia "círculo vermelho grande" e o emoji
 *  compete com a linguagem Phosphor do app. Ponto colorido resolve os dois. */
const statusDot = (color: string) => (
  <Box component="span" aria-hidden="true" sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: color, display: 'inline-block', flexShrink: 0 }} />
);
const inlineStat = { display: 'inline-flex', alignItems: 'center', gap: 0.4, verticalAlign: 'middle' } as const;

const DoctorDashboard = ({ token, onLogout }: { token: string; onLogout: () => void }) => {
  const navigate = useNavigate(); // teleconsulta in-app (P0-reviewer): navega p/ /teleconsulta/:id
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
  // TELECONSULTA (lote "estilo Teams" 18/10): o médico marca data/hora + cola o link
  // externo (Meet/Teams/WhatsApp) → vira lembrete no app do paciente com push + consentimento.
  const [teleOpen, setTeleOpen] = useState(false);
  const [flashTele, setFlashTele] = useState<string | null>(null); // card recém-agendado pisca (feedback de sucesso)
  const [teleBusy, setTeleBusy] = useState(false);
  const [tele, setTele] = useState({ date: '', time: '14:00', link: '', title: '', recurrence: '', price: '' });
  /** Erro INLINE do dialog de agendamento (toast global fica atrás do modal). */
  const [teleError, setTeleError] = useState('');
  // Mexeu no formulário depois de um erro → o aviso velho some (não fica "mentindo").
  useEffect(() => { setTeleError(''); }, [tele]);
  const [patientTele, setPatientTele] = useState<any[]>([]);
  const [doctorTele, setDoctorTele] = useState<any[]>([]);
  // F3 (20/10) — área pós-consulta: summary/transcript on-demand + cache p/ chips da lista.
  const [postOpenId, setPostOpenId] = useState<string | null>(null);
  const [postLoading, setPostLoading] = useState(false);
  const [postErr, setPostErr] = useState(false);
  const [postSummary, setPostSummary] = useState<TeleconsultaSummary | null>(null);
  const [postTranscript, setPostTranscript] = useState<{ text: string | null; transcriptAt: string | null } | null>(null);
  const [teleSummaries, setTeleSummaries] = useState<Record<string, TeleconsultaSummary>>({});
  const [reqOpenId, setReqOpenId] = useState<string | null>(null); // drawer "Pedir exame" (id da teleconsulta de origem)
  const [telePatId, setTelePatId] = useState<string>('');
  const [teleFilter, setTeleFilter] = useState<'all' | 'today' | 'upcoming' | 'past'>('all');
  const [teleSearch, setTeleSearch] = useState('');
  const [fichaTeleMenu, setFichaTeleMenu] = useState<HTMLElement | null>(null); // overflow (⋮) da teleconsulta em destaque na ficha

  /** Abre o dialog de teleconsulta já com AMANHÃ pré-marcado — botão de agendar
   *  nasce clicável (vazio antes = desabilitado em silêncio, parecia "morto"). */
  const openTele = (patientId?: string) => {
    if (patientId) setTelePatId(patientId);
    else if (selected?.patient?.id) setTelePatId(selected.patient.id);
    else if (patients.length > 0) setTelePatId(patients[0].patient?.id || patients[0].id);
    if (!tele.date) {
      const d = new Date(Date.now() + 86_400_000);
      setTele((t) => ({ ...t, date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }));
    }
    // Consulta particular (23/10): pré-preenche com o valor PADRÃO do médico (perfil).
    // O médico pode ajustar só desta consulta ou limpar (sem cobrança).
    if (doctor?.consultPriceCents) {
      setTele((t) => ({ ...t, price: t.price || (Number(doctor.consultPriceCents) / 100).toFixed(2).replace('.', ',') }));
    }
    setTeleOpen(true);
  };
  // Retorno do OAuth do Meet (callback server → #/para-medicos?meet=ok|erro): confirma
  // na tela — antes a volta era muda (dono 18/10: "conectou e ficou na tela preta").
  useEffect(() => {
    const m = window.location.hash.match(/[?&]meet=(ok|erro)/);
    if (!m) return;
    if (m[1] === 'ok') snackbar({ message: 'Conta Google conectada ✨ Salas Meet serão criadas sozinhas ao agendar.', severity: 'success' });
    else snackbar({ message: 'Não deu pra conectar o Google. Tente de novo.', severity: 'error' });
    try { window.history.replaceState({}, '', window.location.hash.replace(/[?&]meet=(ok|erro)/, '')); } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Meet automático (lote Teams 18/10): status da integração + preferência do diálogo.
  const [meetStatus, setMeetStatus] = useState<{ configured: boolean; connected: boolean; livekit?: boolean; priceMinCents?: number } | null>(null);
  const [createMeet, setCreateMeet] = useState(true);

  useEffect(() => {
    if (!teleOpen || meetStatus) return;
    fetch(`${API_URL}/doctor/google/status`, { headers: h }).then((r) => r.ok ? r.json() : null).then((s) => setMeetStatus(s)).catch(() => setMeetStatus({ configured: false, connected: false }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teleOpen]);
  const openSeq = useRef(0); // guarda de race: só aplica estado do openPatient mais recente
  const [doctor, setDoctor] = useState<any>(null);
  const [view, setView] = useState<'overview' | 'patients' | 'teleconsultas' | 'finance' | 'invites' | 'questions' | 'profile' | 'password'>('overview');
  const [photoVer, setPhotoVer] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [avatarEl, setAvatarEl] = useState<HTMLElement | null>(null); // menu vertical do avatar (perfil/senha/sair)
  const [selExam, setSelExam] = useState<string | null>(null); // examId p/ o DoctorExamDetail import
  // §12.4 (spec teleconsulta): "Novos dados recebidos — atualizando análise" — true quando
  // o último exame extraído é mais recente que a última análise de risco (server já recalcula
  // no GET /risk; o banner avisa o médico de que a prioridade mudou com dados novos).
  const [riskInfo, setRiskInfo] = useState<{ newDataReceived: boolean; createdAt: string | null } | null>(null);
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
  const [activity, setActivity] = useState<{ days: number; avgSteps: number; avgKcal: number; avgKm: number; totalSteps?: number; totalKcal?: number; totalKm?: number } | null>(null);
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
  // Diálogo de agendar: paciente do cabeçalho (fixo no detalhe; escolhido na Agenda).
  const teleOptions = patients.map((p) => {
    const id = String(p.patient?.id || p.id);
    return { id, name: p.patient?.fullName || p.name || 'Paciente', photo: photoUrlFor(id) };
  });
  const teleTarget = selected?.patient?.id
    ? { id: String(selected.patient.id), name: selected.patient.fullName || 'Paciente', photo: photoUrlFor(String(selected.patient.id)) }
    : teleOptions.find((p) => p.id === String(telePatId)) ?? null;
  /** Conectar Google Meet (OAuth) — erro INLINE no diálogo (o toast fica atrás dele). */
  const connectGoogleMeet = async () => {
    const r = await fetch(`${API_URL}/doctor/google/auth`, { headers: h });
    const d = await r.json().catch(() => ({}));
    if (r.ok && d.url) window.location.href = d.url;
    else setTeleError(d.error || 'Não deu pra iniciar a conexão com o Google.');
  };
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
  // Lista de pacientes com ERRO EXPLÍPITO (review 09/26): antes o catch engolia a falha e o
  // médico via o empty state "Nenhum paciente ainda" — parecia ter PERDIDO os pacientes.
  const [loadErr, setLoadErr] = useState(false);
  const loadPatients = () => {
    setLoading(true); setLoadErr(false);
    fetch(`${API_URL}/doctor/patients`, { headers: h })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        // fetch-cache devolve 200-VAZIO com X-Offline-Empty quando offline sem cache —
        // sem este check, offline de 1ª carga renderizava o empty state "Nenhum paciente".
        if (r.headers.get('X-Offline-Empty') === 'true') throw new Error('offline');
        return r.json();
      })
      // Ordem alfabética por nome do paciente (2026-08-19): médico com vários pacientes precisa
      // de lista previsível p/ se organizar — localeCompare pt-BR ignora acento.
      .then((d) => {
        setPatients([...(d.items ?? [])].sort((a: any, b: any) => (a.patient?.fullName ?? '').localeCompare(b.patient?.fullName ?? '', 'pt-BR', { sensitivity: 'base' })));
      })
      .catch(() => setLoadErr(true))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    fetch(`${API_URL}/doctor/me`, { headers: h }).then((r) => r.json()).then((d) => setDoctor(d.doctor)).catch(() => {});
    loadPatients(); /* eslint-disable-next-line react-hooks/exhaustive-deps */
    fetch(`${API_URL}/doctor/me/plan`, { headers: h }).then((r) => r.json()).then(setPlanInfo).catch(() => {});
    fetch(`${API_URL}/doctor/invites`, { headers: h }).then((r) => r.json()).then((d) => setInvites(d.items ?? [])).catch(() => {});
    loadDoctorTele();
  }, []);

  const loadDoctorTele = () => fetch(`${API_URL}/doctor/teleconsultas`, { headers: h }).then((r) => r.json()).then((d) => setDoctorTele(d.items ?? [])).catch(() => {});
  // fix dono 23/10: consulta recém-agendada não aparecia sem sair/entrar do app —
  // refetch no focus (voltar pro app) + a cada 60s enquanto a tela está visível.
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') { loadPatients(); loadDoctorTele(); } };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    const iv = setInterval(refresh, 60_000);
    return () => { window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); clearInterval(iv); };
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
    setDetailLoading(true); setExams([]); setAbnormalItems([]); setNotes([]); setQuestions([]); setMedsInfo(null); setPatientTele([]); setRiskInfo(null);
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
      // §12.4: análise de risco + flag "dados novos desde a última análise" (banner no prontuário).
      ...(wantExams ? [get('/risk').then((d) => { if (d && mine()) setRiskInfo({ newDataReceived: !!d.newDataReceived, createdAt: d.createdAt ?? null }); })] : []),
      get('/questions').then((d) => { if (d && mine()) setQuestions(d.items ?? []); }),
      get('/notes').then((d) => { if (d && mine()) setNotes(d.items ?? []); }),
      get('/medications').then((d) => { if (d && mine()) setMedsInfo({ medications: d.medications ?? [], critical: d.critical ?? [] }); }),
      get('/teleconsultas').then((d) => { if (d && mine()) setPatientTele(d?.items ?? []); }),
    ]);
    if (mine()) setDetailLoading(false);
  };

  const focusTab = (targetTab: string) => {
    setTab(targetTab);
    setSelExam(null);
    setTimeout(() => {
      const el = document.getElementById('patient-tabs-section');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 60);
  };

  const refreshPatientDetail = async () => {
    if (!selected) return;
    setDetailLoading(true);
    const pid = selected.patient.id;
    const pScopes: string[] = selected.scopes ?? [];
    const get = async (path: string) => {
      try {
        const sep = path.includes('?') ? '&' : '?';
        const r = await fetch(`${API_URL}/doctor/patients/${pid}${path}${sep}_t=${Date.now()}`, {
          headers: { ...h, 'Cache-Control': 'no-cache' },
          cache: 'no-store',
        });
        return r.ok ? await r.json() : null;
      } catch { return null; }
    };
    const wantExams = pScopes.includes('exams');
    await Promise.allSettled([
      ...(wantExams ? [get('/exams').then((d) => { if (d) setExams(d.items ?? []); })] : []),
      ...(wantExams ? [get('/items/abnormal').then((d) => { if (d) setAbnormalItems(d.items ?? []); })] : []),
      ...(wantExams ? [get('/activity').then((d) => { if (d) setActivity(d?.days ? d : null); })] : []),
      ...(wantExams ? [get('/risk').then((d) => { if (d) setRiskInfo({ newDataReceived: !!d.newDataReceived, createdAt: d.createdAt ?? null }); })] : []),
      get('/questions').then((d) => { if (d) setQuestions(d.items ?? []); }),
      get('/notes').then((d) => { if (d) setNotes(d.items ?? []); }),
      get('/medications').then((d) => { if (d) setMedsInfo({ medications: d.medications ?? [], critical: d.critical ?? [] }); }),
      get('/teleconsultas').then((d) => { if (d) setPatientTele(d?.items ?? []); }),
    ]);
    void loadPatients();
    setDetailLoading(false);
    snackbar({ message: 'Análise clínica e exames atualizados!', severity: 'success' });
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

  const handleEnterTele = (tc: any, patientName?: string) => {
    const pFullName = patientName || tc.patient?.fullName || selected?.patient?.fullName || selected?.patient?.name;
    const pId = tc.patient?.id || tc.patientId || selected?.patient?.id || selected?.id;
    const pPhoto = pId ? photoUrlFor(pId) : undefined;
    const navState = {
      reminder: tc,
      patientName: pFullName,
      patient: { id: pId, name: pFullName, photoUrl: pPhoto },
    };
    if (tc.provider === 'livekit' || (!tc.linkUrl && tc.id)) {
      navigate(`/teleconsulta/${tc.id}?role=doctor`, { state: navState });
    } else if (tc.linkUrl) {
      void openTelemedicinaRoom(tc.linkUrl);
    } else {
      navigate(`/teleconsulta/${tc.id}?role=doctor`, { state: navState });
    }
  };

  // ── ATENDER AGORA — fila imediata (spec 2026-10-27 §6) ─────────────────────
  // Toggle de presença: ON → heartbeat 30s + polling de chamados 5s; OFF/unload/
  // unmount → PUT online:false (keepalive). Heartbeat falha 3× → OFF + aviso.
  const [atendOn, setAtendOn] = useState(false);
  const [atendBusy, setAtendBusy] = useState(false);
  // v1.1: pricing do imediato — dialog antes de ligar (valor que a fila cobra + líquido + editar).
  const [pricingDlg, setPricingDlg] = useState(false);
  const [pricing, setPricing] = useState<{ priceCents: number | null; netCents: number | null; platformBps: number | null; instantPriceCents: number | null; inheritsConsult: boolean } | null>(null);
  const [priceInput, setPriceInput] = useState('');
  const [priceBusy, setPriceBusy] = useState(false);
  const [queueOffer, setQueueOffer] = useState<QueueCallOffer | null>(null);
  const [queueStats, setQueueStats] = useState<{ waiting: number; myAccepted: number }>({ waiting: 0, myAccepted: 0 });
  const [acceptedCall, setAcceptedCall] = useState<{ reminderId: string; patientName: string } | null>(null);
  const [acceptBusy, setAcceptBusy] = useState(false);
  const hbFails = useRef(0);
  const prevOfferId = useRef<string | null>(null);

  const pollQueueCalls = async () => {
    try {
      const r = await fetch(`${API_URL}/doctor/queue/calls`, { headers: h });
      if (!r.ok) return;
      const d = await r.json();
      const offer: QueueCallOffer | null = d?.offer ?? null;
      setQueueOffer(offer);
      setQueueStats({ waiting: d?.stats?.waiting ?? 0, myAccepted: d?.stats?.myAccepted ?? 0 });
      // Offer sumiu SEM decisão do médico → expirou no server: dialog fecha sozinho.
      if (prevOfferId.current && !offer) snackbar({ message: 'Chamado expirou.', severity: 'warning' });
      prevOfferId.current = offer?.callId ?? null;
    } catch { /* offline: próximo tick */ }
  };

  useEffect(() => {
    if (!atendOn) return;
    const hb = async () => {
      try {
        const r = await fetch(`${API_URL}/doctor/online-presence/heartbeat`, { method: 'POST', headers: h });
        if (r.ok) { hbFails.current = 0; return; }
        throw new Error('offline');
      } catch {
        hbFails.current += 1;
        if (hbFails.current >= 3) {
          setAtendOn(false);
          setQueueOffer(null);
          prevOfferId.current = null;
          snackbar({ message: 'Conexão instável — "Atender agora" foi pausado. Ative de novo quando estabilizar.', severity: 'warning' });
        }
      }
    };
    const goOffline = () => {
      try {
        fetch(`${API_URL}/doctor/online-presence`, {
          method: 'PUT', keepalive: true,
          headers: { ...h, 'Content-Type': 'application/json' },
          body: JSON.stringify({ online: false }),
        }).catch(() => {});
      } catch { /* best-effort — presença expira sozinha (90s sem heartbeat) */ }
    };
    void pollQueueCalls();
    const ivHb = setInterval(() => void hb(), 30_000);
    const ivPoll = setInterval(() => { if (document.visibilityState === 'visible') void pollQueueCalls(); }, 5_000);
    const onUnload = () => goOffline();
    window.addEventListener('beforeunload', onUnload);
    return () => {
      clearInterval(ivHb); clearInterval(ivPoll);
      window.removeEventListener('beforeunload', onUnload);
      goOffline();
    };
  }, [atendOn]); // eslint-disable-line react-hooks/exhaustive-deps

  const openPricingDlg = async () => {
    setPricingDlg(true); setPriceInput('');
    try {
      const r = await fetch(`${API_URL}/doctor/queue/pricing`, { headers: h });
      setPricing(r.ok ? await r.json() : null);
    } catch { setPricing(null); }
  };

  const saveInstantPrice = async () => {
    const digits = priceInput.replace(/\D/g, '');
    if (!digits) { snackbar({ message: 'Digite um valor (ex.: 180,00) — ou 0 para usar o da consulta.', severity: 'warning' }); return; }
    setPriceBusy(true);
    try {
      const cents = Number(digits);
      const r = await fetch(`${API_URL}/doctor/instant-price`, { method: 'PUT', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify({ instantPriceCents: cents }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || 'Valor inválido.');
      const pr = await fetch(`${API_URL}/doctor/queue/pricing`, { headers: h }).then((x) => x.json()).catch(() => null);
      setPricing(pr);
      setPriceInput('');
      snackbar({ message: 'Valor do imediato atualizado.', severity: 'success' });
    } catch (e: any) { snackbar({ message: e?.message || 'Não foi possível salvar o valor.', severity: 'error' }); }
    finally { setPriceBusy(false); }
  };

  const toggleAtend = async (on: boolean) => {
    setAtendBusy(true);
    try {
      const r = await fetch(`${API_URL}/doctor/online-presence`, {
        method: 'PUT', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify({ online: on }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d?.online !== on) throw new Error(d?.error || 'Falha ao atualizar sua presença.');
      setAtendOn(on);
      hbFails.current = 0;
      setQueueOffer(null);
      prevOfferId.current = null;
      if (on) snackbar({ message: 'Você está online na fila imediata — os chamados aparecem automaticamente aqui.', severity: 'success' });
    } catch (e: any) {
      snackbar({ message: e?.message || 'Não foi possível atualizar sua presença agora.', severity: 'error' });
    } finally { setAtendBusy(false); }
  };

  const declineCall = async () => {
    const id = queueOffer?.callId;
    setQueueOffer(null); // otimista — recusa é silenciosa (sem snackbar)
    prevOfferId.current = null;
    if (!id) return;
    try { await fetch(`${API_URL}/doctor/queue/calls/${id}/decline`, { method: 'POST', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify({}) }); } catch { /* silencioso */ }
  };

  const acceptCall = async () => {
    const offer = queueOffer;
    if (!offer) return;
    setAcceptBusy(true);
    try {
      const r = await fetch(`${API_URL}/doctor/queue/calls/${offer.callId}/accept`, { method: 'POST', headers: h });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || 'Chamado expirou.');
      setQueueOffer(null);
      prevOfferId.current = null;
      setAcceptedCall({ reminderId: d.reminderId, patientName: offer.patientName });
      snackbar({ message: 'Chamado aceito — a sala abre quando o paciente concluir o pagamento.', severity: 'success' });
      // Abre o painel do paciente (share efêmero criado no match): recarrega a
      // lista e casa pelo nome normalizado; sem match, a linha "pagando" garante o
      // caminho "Entrar na sala".
      try {
        const pr = await fetch(`${API_URL}/doctor/patients`, { headers: h });
        if (pr.ok) {
          const pd = await pr.json();
          const items: any[] = pd.items ?? [];
          const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
          const row = items.find((x) => norm(x.patient?.fullName || '') === norm(offer.patientName || ''));
          if (row) {
            setPatients([...items].sort((a: any, b: any) => (a.patient?.fullName ?? '').localeCompare(b.patient?.fullName ?? '', 'pt-BR', { sensitivity: 'base' })));
            void openPatient(row);
          } else void loadPatients();
        }
      } catch { /* painel é best-effort — a sala é o caminho garantido */ }
    } catch (e: any) {
      snackbar({ message: e?.message || 'Chamado expirou.', severity: 'warning' });
      void pollQueueCalls();
    } finally { setAcceptBusy(false); }
  };

  const enterAcceptedRoom = () => {
    if (!acceptedCall) return;
    navigate(`/teleconsulta/${acceptedCall.reminderId}?role=doctor`, {
      state: { reminder: { id: acceptedCall.reminderId }, patientName: acceptedCall.patientName, patient: { name: acceptedCall.patientName } },
    });
  };

  /** Agenda a teleconsulta (POST /doctor/patients/:id/teleconsulta) — cria o lembrete
   *  na conta do paciente (push imediato + antecedências 1d/1h/na hora). */
  const scheduleTele = async () => {
    // P0-reviewer: precedência explícita — app (LiveKit) > Meet automático > link manual.
    // Default: "no app" ligado quando o server tem LiveKit (capability meetStatus.livekit).
    const useInApp = createMeet && meetStatus?.livekit; // createMeet vira "chamada no app" quando LiveKit existe
    const useMeet = !useInApp && createMeet && meetStatus?.connected;
    const targetPid = selected?.patient?.id || telePatId;
    if (!targetPid || !tele.date) {
      snackbar({ message: 'Selecione o paciente e a data da consulta.', severity: 'warning' });
      return;
    }
    // link só é obrigatório no modo manual — nos modos automáticos o campo fica oculto
    if (!useInApp && !useMeet && !/^https?:\/\/[^\s/]+/i.test(tele.link.trim())) {
      snackbar({ message: 'Cole o link da consulta (https://…) ou ative a chamada automática.', severity: 'warning' });
      return;
    }
    // Cobrança: valida ANTES de enviar (bug 27/10 — a máscara faz "20" virar "0,20"
    // e o 400 do server aparecia só no inspector: toast global renderiza ATRÁS do
    // Dialog). Erro agora é INLINE no próprio dialog + validação pré-envio.
    setTeleError('');
    const priceCents = tele.price ? Number(tele.price.replace(/\D/g, '')) || null : null;
    const priceMinCents = meetStatus?.priceMinCents ?? 2000; // AppSetting teleconsulta (via /google/status)
    if (priceCents != null) {
      if (priceCents < priceMinCents) {
        setTeleError(`Valor abaixo do mínimo de R$ ${(priceMinCents / 100).toFixed(2).replace('.', ',')} (garante estorno integral). Você digitou R$ ${(priceCents / 100).toFixed(2).replace('.', ',')} — ajuste o campo acima.`);
        setTeleBusy(false);
        return;
      }
      if (priceCents > 2_000_000) {
        setTeleError('Valor acima do máximo de R$ 20.000,00. Ajuste o campo acima.');
        setTeleBusy(false);
        return;
      }
    }
    setTeleBusy(true);
    try {
      const due = new Date(`${tele.date}T${tele.time || '14:00'}`).toISOString();
      const scheduleOnce = (force: boolean) => fetch(`${API_URL}/doctor/patients/${targetPid}/teleconsulta`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          dueDate: due,
          ...(force ? { force: true } : {}),
          ...(useInApp ? { createLiveKit: true } : useMeet ? { createMeet: true } : { linkUrl: tele.link.trim() }),
          title: tele.title.trim() || `Teleconsulta com ${doctor?.name?.split(' ')[0] ?? 'seu médico'}`,
          recurrence: tele.recurrence || undefined,
          consultPriceCents: priceCents ?? undefined, // cobrança opcional (centavos; vazio = sem cobrança) — parse validado acima
        }),
      });
      let r = await scheduleOnce(false);
      // 409 tem 2 famílias: CONFLITO DE AGENDA (§19 dono 26/10 — horário de OUTRO
      // paciente; não se força, dialog segue aberto p/ trocar o horário) e duplicata
      // do mesmo paciente/dia (confirma "criar outra" e reenvia com force:true).
      if (r.status === 409) {
        const d: any = await r.json().catch(() => ({}));
        if (d?.code === 'SCHEDULE_CONFLICT') {
          const hhmm = d?.existing?.dueDate ? new Date(d.existing.dueDate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
          const who = d?.existing?.patientName ? ` (${d.existing.patientName.split(' ')[0]})` : '';
          snackbar({ message: `${d?.error || 'Você já tem uma teleconsulta nesse horário.'}${hhmm ? ` — às ${hhmm}${who}` : ''} Escolha outro horário.`, severity: 'warning' });
          setTeleBusy(false);
          return; // dialog de agendamento PERMANECE aberto — só troca o horário
        }
        // Guarda anti-duplicata: já há teleconsulta HOJE com este paciente → confirma
        // antes de criar a segunda (bug 3-salas 19/10 nasceu de cliques repetidos).
        const go = await confirmDialog({
          title: 'Já existe teleconsulta hoje',
          message: `${d.error || 'Já existe uma teleconsulta com este paciente neste dia.'}${d.existing?.roomCode ? `\n\nSala atual: ${d.existing.roomCode}` : ''}`,
          confirmLabel: 'Criar outra',
          cancelLabel: 'Cancelar',
        });
        if (!go) { setTeleBusy(false); return; }
        r = await scheduleOnce(true);
      }
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || 'Falha ao agendar.');
      const saved: any = await r.json().catch(() => ({}));
      const code = String(saved?.reminder?.id ?? '').slice(-5).toUpperCase();
      snackbar({ message: `✓ Teleconsulta agendada${code ? ` — Sala ${code}` : ''}. O paciente já foi avisado por push.`, severity: 'success' });
      setTeleOpen(false);
      setTele({ date: '', time: '14:00', link: '', title: '', recurrence: '', price: '' });
      // Recarrega teleconsultas
      if (selected && selected.patient.id === targetPid) {
        fetch(`${API_URL}/doctor/patients/${targetPid}/teleconsultas`, { headers: h })
          .then((res) => res.json()).then((d) => setPatientTele(d?.items ?? [])).catch(() => {});
      }
      loadDoctorTele();
      const newId = saved?.reminder?.id;
      if (newId) {
        setFlashTele(newId);
        setTimeout(() => {
          try {
            document.getElementById(`tele-card-${newId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          } catch { /* ignore */ }
          setTimeout(() => setFlashTele(null), 4000);
        }, 350);
      }
    } catch (e: any) {
      setTeleError(String(e?.message || 'Falha ao agendar.')); // dialog permanece aberto com o motivo
      snackbar({ message: e?.message || 'Falha ao agendar.', severity: 'error' });
    } finally { setTeleBusy(false); }
  };

  // Dono 26/10: cancelar ganhou MOTIVO (vai no push+e-mail pro paciente e no
  // histórico "Cancelada") — Dialog próprio com campo, em vez do confirm seco.
  const [cancelCtx, setCancelCtx] = useState<{ rid: string; pid: string } | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelBusy, setCancelBusy] = useState(false);

  const cancelTele = async (reminderId: string, patientId?: string) => {
    let pid = patientId || selected?.patient?.id;
    if (!pid) {
      const found = doctorTele.find((x) => x.id === reminderId);
      pid = found?.patientId || found?.patient?.id;
    }
    if (!pid) {
      snackbar({ message: 'Não foi possível identificar o paciente da consulta.', severity: 'error' });
      return;
    }
    setCancelReason('');
    setCancelCtx({ rid: reminderId, pid });
  };

  const doCancelTele = async () => {
    if (!cancelCtx) return;
    setCancelBusy(true);
    try {
      const r = await fetch(`${API_URL}/doctor/patients/${cancelCtx.pid}/teleconsulta/${cancelCtx.rid}`, {
        method: 'DELETE', headers: { ...h, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: cancelReason.trim() || undefined }),
      });
      if (r.ok) {
        snackbar({ message: 'Teleconsulta cancelada — o paciente será avisado com o motivo.', severity: 'info' });
        // Não remove mais das listas: a consulta vai pro HISTÓRICO com status 'cancelled'.
        const stamp = { endedAt: new Date().toISOString(), done: true, teleStatus: 'cancelled' };
        setPatientTele((l) => l.map((it: any) => (it.id === cancelCtx.rid ? { ...it, ...stamp } : it)));
        setDoctorTele((l) => l.map((it: any) => (it.id === cancelCtx.rid ? { ...it, ...stamp } : it)));
        loadDoctorTele();
        setCancelCtx(null);
      } else {
        const d = await r.json().catch(() => null);
        snackbar({ message: d?.error || 'Não foi possível cancelar a teleconsulta.', severity: 'error' });
      }
    } catch {
      snackbar({ message: 'Não foi possível cancelar a teleconsulta.', severity: 'error' });
    } finally { setCancelBusy(false); }
  };

  /** F3: abre a área pós-consulta ("Resumo da consulta") — GET summary +
   *  transcript em paralelo, on-demand. Falha parcial não derruba a outra seção;
   *  o summary em cache alimenta os chips "N pedidos"/"Transcrição ✓" da lista.
   *  Bug 26/10 ("transcrição pensando pra sempre"): o fetch único deixava o card
   *  parado eternamente quando o STT ainda rodava — agora POLLA enquanto o dialog
   *  estiver aberto e a transcrição seguir pendente (summary.recordingAt/at). */
  const postOpenIdRef = useRef<string | null>(null);
  const postTxPollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopPostTxPoll = () => {
    if (postTxPollRef.current) { clearTimeout(postTxPollRef.current); postTxPollRef.current = null; }
  };
  // Fechou o dialog por QUALQUER caminho (Fechar, pedir exame, navegação) → poll morre.
  useEffect(() => {
    if (!postOpenId) { postOpenIdRef.current = null; stopPostTxPoll(); }
    return stopPostTxPoll;
  }, [postOpenId]);
  const schedulePostTxPoll = (teleId: string, tries: number) => {
    stopPostTxPoll();
    postTxPollRef.current = setTimeout(() => void (async () => {
      if (postOpenIdRef.current !== teleId) return;
      try {
        const [sRes, tRes] = await Promise.allSettled([
          fetch(`${API_URL}/teleconsulta/${teleId}/summary`, { headers: h }),
          fetch(`${API_URL}/teleconsulta/${teleId}/transcript`, { headers: h }),
        ]);
        let s: any = null, t: any = null;
        if (sRes.status === 'fulfilled' && sRes.value.ok) { s = await sRes.value.json(); setPostSummary(s); setTeleSummaries((m) => ({ ...m, [teleId]: s })); }
        if (tRes.status === 'fulfilled' && tRes.value.ok) { t = await tRes.value.json(); if (t?.text) setPostTranscript({ text: t.text, transcriptAt: t?.transcriptAt ?? null }); }
        if (postOpenIdRef.current !== teleId) return;
        // Continua enquanto o server disser que o STT está vivo (status processing)
        // ou houver promessa de texto (transcript.at) que ainda não chegou.
        const stillPending = !t?.text && !!(s?.recordingAt || s?.transcript?.at || t?.status === 'processing');
        if (stillPending && tries < 10) schedulePostTxPoll(teleId, tries + 1); // ~2 min
      } catch { if (postOpenIdRef.current === teleId && tries < 10) schedulePostTxPoll(teleId, tries + 1); }
    })(), 12_000);
  };
  const openPost = async (teleId: string) => {
    stopPostTxPoll();
    postOpenIdRef.current = teleId;
    setPostOpenId(teleId); setPostLoading(true); setPostErr(false);
    setPostSummary(null); setPostTranscript(null);
    try {
      const [sRes, tRes] = await Promise.allSettled([
        fetch(`${API_URL}/teleconsulta/${teleId}/summary`, { headers: h }),
        fetch(`${API_URL}/teleconsulta/${teleId}/transcript`, { headers: h }),
      ]);
      let anyOk = false;
      let sData: any = null, tData: any = null;
      if (sRes.status === 'fulfilled' && sRes.value.ok) {
        anyOk = true;
        sData = await sRes.value.json();
        setPostSummary(sData);
        setTeleSummaries((m) => ({ ...m, [teleId]: sData }));
      }
      if (tRes.status === 'fulfilled' && tRes.value.ok) {
        anyOk = true;
        tData = await tRes.value.json();
        setPostTranscript({ text: tData?.text ?? null, transcriptAt: tData?.transcriptAt ?? null });
      }
      if (!anyOk) setPostErr(true);
      // STT pendente (áudio no disco ou at sem texto ainda) → polla com o dialog aberto.
      const pending = !tData?.text && !!(sData?.recordingAt || sData?.transcript?.at || tData?.status === 'processing');
      if (pending) schedulePostTxPoll(teleId, 1);
    } catch { setPostErr(true); }
    finally { setPostLoading(false); }
  };

  // Teleconsulta mais recente do paciente — origem do "Pedir exame" fora da chamada.
  const latestTele = patientTele.length
    ? [...patientTele].sort((a: any, b: any) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime())[0]
    : null;
  const postPend = postSummary ? (postSummary.examRequests ?? []).filter((r) => r.status === 'pending').length : 0;
  const postHasTr = !!(postTranscript?.transcriptAt || postSummary?.transcript?.at);

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
      <Box
        sx={{
          p: 2.25,
          pb: 2,
          background: (t) =>
            t.palette.mode === 'dark'
              ? 'radial-gradient(ellipse 90% 80% at 10% 0%, #0d9488 0%, #082d2b 100%)'
              : 'radial-gradient(ellipse 90% 80% at 10% 0%, #20B2AA 0%, #178f89 100%)',
          color: '#fff',
          boxShadow: '0 4px 16px rgba(15,95,90,.18)',
        }}
      >
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <IconButton
            onClick={(e) => setAvatarEl(e.currentTarget)}
            aria-label="Menu do médico"
            sx={{
              p: 0.5,
              borderRadius: '50%',
              '&:hover': { bgcolor: 'rgba(255,255,255,.18)' },
            }}
          >
            <Avatar
              src={doctor?.photoUrl ? doctorPhotoUrl(doctor.id, photoVer) : undefined}
              sx={{
                width: 54,
                height: 54,
                fontSize: 21,
                bgcolor: 'rgba(255,255,255,.22)',
                fontWeight: 800,
                border: '2px solid rgba(255,255,255,.7)',
                boxShadow: '0 0 0 3px rgba(255,255,255,0.2), 0 0 14px rgba(32,178,170,0.5)',
              }}
            >
              {doctor?.name?.charAt(0)}
            </Avatar>
          </IconButton>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif', fontSize: 16 }}>{doctor?.name || 'Médico'}</Typography>
            {unreadQ > 0 && <Chip size="small" label={`${unreadQ} ${unreadQ === 1 ? 'pergunta nova' : 'perguntas novas'}`} sx={{ mt: 0.5, height: 22, fontSize: 12, bgcolor: 'rgba(255,255,255,.28)', color: '#fff', fontWeight: 700 }} />}
            <Typography variant="caption" sx={{ opacity: 0.9, display: 'block', mt: 0.25, fontWeight: 500 }}>{[doctor?.specialty, doctor?.crm && `CRM ${doctor.crm}`].filter(Boolean).join(' • ')}</Typography>
          </Box>
        </Stack>
      </Box>
      <Divider />
      <Box sx={{ mx: '12px', mt: 1.5, p: 1.5, borderRadius: '16px', background: planInfo?.isPremium ? 'linear-gradient(135deg, rgba(99,102,241,.12), rgba(99,102,241,.04))' : 'linear-gradient(135deg, rgba(32,178,170,0.12), rgba(32,178,170,0.03))', border: '1px solid', borderColor: planInfo?.isPremium ? 'rgba(99,102,241,.25)' : 'rgba(32,178,170,0.2)', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
        <Typography variant="caption" sx={{ fontWeight: 800, letterSpacing: '0.05em', color: (t: Theme) => (planInfo?.isPremium ? premiumText(t.palette.mode) : 'primary.dark'), display: 'block' }}>PLANO</Typography>
        {planInfo?.isPremium
          ? <><Typography sx={{ fontSize: 13.5, fontWeight: 800, color: (t: Theme) => premiumText(t.palette.mode), display: 'inline-flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}><Diamond size={15} weight="fill" /> Dr. Exame Pro</Typography><Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25 }}>SOAP e planos ilimitados.{planInfo.planExpiresAt ? ` Até ${new Date(planInfo.planExpiresAt).toLocaleDateString('pt-BR')}.` : ''}</Typography></>
          : <><Typography sx={{ fontSize: 13.5, fontWeight: 800, color: 'text.primary', mt: 0.25 }}>Grátis ({planInfo?.freeUsed ?? 0}/{planInfo?.freeLimit ?? 5} usados)</Typography><Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25 }}>5 pré-consultas/SOAP grátis por mês.</Typography></>}
      </Box>
      <List sx={{
        pt: 1.25,
        px: 0.5,
        '& .MuiListItemButton-root': {
          borderRadius: '12px',
          m: '3px 8px',
          py: 0.85,
          transition: 'all 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
          '&:hover': {
            transform: 'translateX(4px)',
            bgcolor: (t: Theme) => alpha(t.palette.primary.main, 0.08),
          },
        },
        '& .MuiListItemButton-root.Mui-selected': {
          bgcolor: (t: Theme) => (t.palette.mode === 'dark' ? 'rgba(212,165,116,.24)' : 'rgba(212,165,116,.16)'),
          borderLeft: `3px solid ${COPPER.main}`,
          pl: '13px',
          '& .MuiListItemIcon-root': {
            transform: 'scale(1.12)',
            transition: 'transform 0.18s ease',
          },
        },
        '& .MuiListItemButton-root.Mui-selected:hover': { bgcolor: 'rgba(212,165,116,.22)' },
        '& .MuiListItemButton-root.Mui-selected .MuiListItemText-primary': { color: (t: Theme) => copperText(t.palette.mode), fontWeight: 700 },
      }}>
        <ListItemButton selected={view === 'overview'} onClick={() => { setView('overview'); setSelected(null); setSelExam(null); onNav(); }}><ListItemIcon sx={{ minWidth: 38 }}><SpaceDashboardIcon sx={{ color: 'secondary.dark' }} /></ListItemIcon><ListItemText primary="Painel" primaryTypographyProps={{ fontWeight: 600 }} /></ListItemButton>
        <ListItemButton selected={view === 'patients'} onClick={() => { setView('patients'); setSelected(null); setSelExam(null); onNav(); }}><ListItemIcon sx={{ minWidth: 38 }}><GroupsIcon sx={{ color: 'secondary.dark' }} /></ListItemIcon><ListItemText primary="Pacientes" primaryTypographyProps={{ fontWeight: 600 }} /></ListItemButton>
        <ListItemButton selected={view === 'teleconsultas'} onClick={() => { setView('teleconsultas'); setSelected(null); setSelExam(null); onNav(); }}>
          <ListItemIcon sx={{ minWidth: 38 }}><Badge color="primary" badgeContent={doctorTele.length} max={99}><VideocamIcon sx={{ color: 'secondary.dark' }} /></Badge></ListItemIcon>
          <ListItemText primary="Teleconsultas" primaryTypographyProps={{ fontWeight: 600 }} />
        </ListItemButton>
        <ListItemButton selected={view === 'finance'} onClick={() => { setView('finance'); setSelected(null); setSelExam(null); onNav(); }}>
          <ListItemIcon sx={{ minWidth: 38 }}><AccountBalanceWalletOutlinedIcon sx={{ color: 'secondary.dark' }} /></ListItemIcon>
          <ListItemText primary="Financeiro" primaryTypographyProps={{ fontWeight: 600 }} />
        </ListItemButton>
        <ListItemButton selected={view === 'invites'} onClick={() => { setView('invites'); onNav(); }}>
          <ListItemIcon sx={{ minWidth: 38 }}><Badge color="error" variant="dot" invisible={invites.filter((i) => i.status === 'pending').length === 0}><PersonAddAlt1Icon sx={{ color: 'secondary.dark' }} /></Badge></ListItemIcon>
          <ListItemText primary={`Convites${invites.filter((i) => i.status === 'pending').length ? ` · ${invites.filter((i) => i.status === 'pending').length}` : ''}`} primaryTypographyProps={{ fontWeight: 600 }} />
        </ListItemButton>
        <ListItemButton selected={view === 'questions'} onClick={() => { setView('questions'); loadAllQ(); onNav(); }}>
          <ListItemIcon sx={{ minWidth: 38 }}><Badge color="error" variant="dot" invisible={unreadQ === 0}><QuestionAnswerIcon sx={{ color: 'secondary.dark' }} /></Badge></ListItemIcon>
          <ListItemText primary={`Perguntas${unreadQ ? ` · ${unreadQ}` : ''}`} primaryTypographyProps={{ fontWeight: 600 }} />
        </ListItemButton>
        <Divider sx={{ my: 1, mx: 1, borderColor: 'divider' }} />
        <ListItemButton selected={view === 'profile'} onClick={() => { setView('profile'); onNav(); }}>
          <ListItemIcon sx={{ minWidth: 38 }}><PersonIcon sx={{ color: 'secondary.dark' }} /></ListItemIcon>
          <ListItemText primary="Meu perfil" primaryTypographyProps={{ fontWeight: 600 }} />
        </ListItemButton>
        <ListItemButton
          onClick={() => { onLogout(); onNav(); }}
          sx={{
            color: 'error.main',
            '&:hover': { bgcolor: (t: Theme) => alpha(t.palette.error.main, 0.08) },
          }}
        >
          <ListItemIcon sx={{ minWidth: 38 }}><LogoutIcon sx={{ color: 'error.main' }} /></ListItemIcon>
          <ListItemText primary="Sair da conta" primaryTypographyProps={{ fontWeight: 600 }} />
        </ListItemButton>
      </List>
      <Box sx={{ mt: 'auto', p: 2, borderTop: '1px solid', borderColor: 'divider', textAlign: 'center' }}>
        <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
          Dr. Exame • Portal do Médico 🩺
        </Typography>
      </Box>
    </>
  );

  return (
    <Box sx={{ minHeight: '100dvh', bgcolor: 'background.default', display: 'flex' }}>
      {/* Menu vertical do avatar (perfil/senha/sair) — aberto ao clicar no avatar do médico */}
      <Menu anchorEl={avatarEl} open={!!avatarEl} onClose={() => setAvatarEl(null)} slotProps={{ paper: { sx: { borderRadius: '16px', minWidth: 210, mt: 1, boxShadow: '0 10px 28px rgba(0,0,0,0.12)' } } }}>
        <MenuItem onClick={() => { setView('finance'); setAvatarEl(null); }}><ListItemIcon><AccountBalanceWalletOutlinedIcon fontSize="small" /></ListItemIcon><ListItemText>Financeiro</ListItemText></MenuItem>
        <MenuItem onClick={() => { setView('profile'); setAvatarEl(null); }}><ListItemIcon><PersonIcon fontSize="small" /></ListItemIcon><ListItemText>Meu perfil</ListItemText></MenuItem>
        <MenuItem onClick={() => { setView('password'); setAvatarEl(null); }}><ListItemIcon><LockIcon fontSize="small" /></ListItemIcon><ListItemText>Trocar senha</ListItemText></MenuItem>
        <Divider sx={{ my: 0.5 }} />
        <MenuItem onClick={() => { setAvatarEl(null); onLogout(); }} sx={{ color: 'error.main' }}><ListItemIcon><LogoutIcon fontSize="small" sx={{ color: 'error.main' }} /></ListItemIcon><ListItemText>Sair</ListItemText></MenuItem>
      </Menu>
      {/* MENU vertical PERMANENTE (web/desktop) — abre igual ao app do paciente. Mobile usa o Drawer abaixo. */}
      {isDesktop && (
        <Box component="nav" sx={{ width: 290, flexShrink: 0, borderRight: '1px solid', borderRightColor: 'divider', bgcolor: 'background.paper', display: 'flex', flexDirection: 'column', position: 'sticky', top: 0, height: '100dvh', overflowY: 'auto' }}>
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
              <Typography sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif', fontSize: 17, color: 'text.primary', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{view === 'overview' ? 'Painel' : view === 'patients' ? (selected ? 'Detalhe do paciente' : 'Pacientes') : view === 'teleconsultas' ? 'Agenda de Teleconsultas' : view === 'finance' ? 'Financeiro' : view === 'invites' ? 'Convites' : view === 'questions' ? 'Perguntas' : view === 'profile' ? 'Meu Perfil' : 'Trocar Senha'}</Typography>
              {planInfo?.isPremium && <Chip size="small" icon={<Diamond size={12} weight="fill" />} label="Pro" sx={{ bgcolor: 'rgba(99,102,241,.10)', color: (t: Theme) => premiumText(t.palette.mode), fontWeight: 700, height: 22, fontSize: 12, flexShrink: 0, '& .MuiChip-icon': { color: (t: Theme) => premiumText(t.palette.mode) } }} />}
            </Stack>
            {/* Assinatura do portal: cobre = modo médico (viewer clínico somente leitura). */}
            <Chip size="small" icon={<Stethoscope size={13} />} label="Acesso médico · leitura" title="Você acessa como médico — vista somente leitura dos dados compartilhados pelo paciente" sx={{ mt: 0.5, height: 22, fontSize: 12, fontWeight: 700, bgcolor: COPPER.wash, color: (t: Theme) => copperText(t.palette.mode), '& .MuiChip-icon': { color: (t: Theme) => copperText(t.palette.mode) } }} />
          </Box>
        ) : (
          <>
            {view !== 'profile' && (
              <IconButton onClick={(e) => setAvatarEl(e.currentTarget)} aria-label="Menu do médico" sx={{ p: 0.5, borderRadius: '50%', flexShrink: 0 }}>
                <Avatar src={doctor?.photoUrl ? doctorPhotoUrl(doctor.id, photoVer) : undefined} sx={{ bgcolor: 'rgba(32,178,170,.10)', color: (t) => tealText(t.palette.mode), fontWeight: 800, border: '2px solid rgba(32,178,170,.15)', width: 44, height: 44, fontSize: 17 }}>{doctor?.name?.charAt(0)}</Avatar>
              </IconButton>
            )}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif', fontSize: 15, color: 'text.primary', lineHeight: 1.2 }}>{doctor?.name || 'Médico'}</Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>{[doctor?.specialty, doctor?.crm && `CRM ${doctor.crm}`].filter(Boolean).join(' • ') || 'Portal do Médico'}</Typography>
              {/* Assinatura do portal: cobre = modo médico (viewer clínico somente leitura). */}
              <Chip size="small" icon={<Stethoscope size={13} />} label="Acesso médico · leitura" title="Você acessa como médico — vista somente leitura dos dados compartilhados pelo paciente" sx={{ mt: 0.5, height: 20, fontSize: 12, fontWeight: 700, bgcolor: COPPER.wash, color: (t: Theme) => copperText(t.palette.mode), '& .MuiChip-icon': { color: (t: Theme) => copperText(t.palette.mode) } }} />
            </Box>
          </>
        )}

        {/* ATENDER AGORA — presença na fila imediata (header, à direita). Enquanto
            houver chamada aceita aguardando pagamento, o toggle dá lugar à linha
            "Paciente concluindo pagamento…" com atalho p/ a sala. */}
        {acceptedCall || (atendOn && queueStats.myAccepted > 0) ? (
          <Stack direction="row" alignItems="center" spacing={1} sx={{ flexShrink: 0, pl: { xs: 0.5, md: 1.5 }, minWidth: 0 }}>
            <Box
              component="span"
              aria-hidden="true"
              sx={{
                width: 8, height: 8, borderRadius: '50%', bgcolor: '#22c55e', flexShrink: 0,
                animation: 'atendPulse 1.6s infinite ease-in-out',
                '@keyframes atendPulse': { '0%, 100%': { opacity: 0.35, transform: 'scale(0.85)' }, '50%': { opacity: 1, transform: 'scale(1.2)' } },
                '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
              }}
            />
            <Box sx={{ minWidth: 0 }}>
              <Typography noWrap sx={{ fontSize: { xs: 11.5, md: 12.5 }, fontWeight: 800, color: 'success.main', lineHeight: 1.2 }}>
                Paciente concluindo pagamento…
              </Typography>
              {acceptedCall && (
                <Stack direction="row" spacing={0.75} sx={{ mt: 0.25 }}>
                  <Button size="small" variant="contained" onClick={enterAcceptedRoom} sx={{ minHeight: 30, px: 1.25, borderRadius: '8px', textTransform: 'none', fontWeight: 800, fontSize: 11.5, bgcolor: '#178f89', '&:hover': { bgcolor: '#0f766e' } }}>
                    Entrar na sala
                  </Button>
                  <Button size="small" onClick={() => setAcceptedCall(null)} aria-label="Dispensar aviso de pagamento" sx={{ minHeight: 30, px: 0.75, textTransform: 'none', fontWeight: 700, fontSize: 11, color: 'text.disabled', minWidth: 0 }}>
                    ok
                  </Button>
                </Stack>
              )}
            </Box>
          </Stack>
        ) : (
          <Tooltip title={atendOn ? `Atender agora · fila imediata ativo — ${queueStats.waiting} paciente(s) aguardando` : 'Atender agora · fila imediata — receba chamados de pacientes sem agendamento'} arrow>
            <Stack direction="row" alignItems="center" spacing={0.75} sx={{ flexShrink: 0, pl: { xs: 0.5, md: 1.5 } }}>
              {atendOn && (
                <Box
                  component="span"
                  aria-hidden="true"
                  sx={{
                    width: 8, height: 8, borderRadius: '50%', bgcolor: '#22c55e',
                    animation: 'atendPulse 1.6s infinite ease-in-out',
                    '@keyframes atendPulse': { '0%, 100%': { opacity: 0.35, transform: 'scale(0.85)' }, '50%': { opacity: 1, transform: 'scale(1.2)' } },
                    '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
                  }}
                />
              )}
              <Typography noWrap sx={{ fontSize: { xs: 11.5, md: 12.5 }, fontWeight: 800, color: atendOn ? 'success.main' : 'text.secondary' }}>
                Atender agora
              </Typography>
              <Switch
                size="small"
                color="success"
                checked={atendOn}
                disabled={atendBusy}
                onChange={(e) => (e.target.checked ? void openPricingDlg() : void toggleAtend(false))}
                inputProps={{ 'aria-label': 'Atender agora · fila imediata' }}
              />
            </Stack>
          </Tooltip>
        )}
      </Box>

      {/* v1.1: PRICING antes de ligar "Atender agora" — valor que a fila cobra,
          líquido com a comissão e edição do valor próprio do imediato. */}
      <Dialog open={pricingDlg} onClose={() => setPricingDlg(false)} maxWidth="xs" fullWidth aria-label="Atendimento imediato — valor e condições" PaperProps={{ sx: { borderRadius: '20px', p: 1.5 } }}>
        <DialogTitle sx={{ fontFamily: '"Poppins",sans-serif', fontWeight: 800, fontSize: 18, display: 'flex', alignItems: 'center', gap: 1, pb: 1 }}>
          ⚡ Atendimento imediato
        </DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.75, pt: 0.5 }}>
          {pricing == null ? (
            <Typography sx={{ fontSize: 14, color: 'text.secondary' }}>Carregando seu valor…</Typography>
          ) : (
            <>
              <Box sx={{ p: 1.75, borderRadius: '14px', bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(32,178,170,.08)' : 'rgba(32,178,170,.06)'), border: '1px solid rgba(32,178,170,.25)' }}>
                <Typography sx={{ fontSize: 12.5, color: 'text.secondary' }}>Paciente paga (fila imediata)</Typography>
                <Typography sx={{ fontFamily: '"Poppins",sans-serif', fontWeight: 800, fontSize: 26 }}>
                  {pricing.priceCents != null ? `R$ ${(pricing.priceCents / 100).toFixed(2).replace('.', ',')}` : 'Sem cobrança'}
                </Typography>
                {pricing.netCents != null && pricing.platformBps != null && (
                  <Typography sx={{ fontSize: 12.5, color: 'text.secondary', mt: 0.25 }}>
                    Você recebe <b style={{ color: '#20b2aa' }}>R$ {(pricing.netCents / 100).toFixed(2).replace('.', ',')}</b> líquido{pricing.platformBps > 0 ? ` (taxa ${(pricing.platformBps / 100).toFixed(1)}%)` : ''}
                  </Typography>
                )}
                <Typography sx={{ fontSize: 11.5, color: 'text.secondary', mt: 0.5 }}>
                  {pricing.instantPriceCents == null ? 'Usando o valor da sua consulta agendada — defina um valor próprio abaixo se quiser.' : 'Valor próprio do imediato.'}
                </Typography>
              </Box>
              <Stack direction="row" spacing={1} alignItems="center">
                <TextField
                  size="small" fullWidth placeholder="novo valor (ex.: 180,00)"
                  value={priceInput}
                  onChange={(e) => setPriceInput(e.target.value.replace(/[^\d,\.]/g, ''))}
                  inputProps={{ inputMode: 'decimal', 'aria-label': 'Novo valor do atendimento imediato' }}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: '12px' } }}
                />
                <Button size="small" variant="outlined" disabled={priceBusy || !priceInput.trim()} onClick={() => void saveInstantPrice()} sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 700, minHeight: 44, flexShrink: 0 }}>
                  Salvar valor
                </Button>
              </Stack>
              <Typography sx={{ fontSize: 11.5, color: 'text.secondary' }}>
                Enquanto online, chamados chegam aqui com <b>45s</b> para aceitar. Mín. R$ 20,00 (garante estorno integral); 0 = usar o valor da consulta.
              </Typography>
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setPricingDlg(false)} sx={{ textTransform: 'none', fontWeight: 700 }}>Depois</Button>
          <Button
            variant="contained" disabled={atendBusy}
            onClick={() => { setPricingDlg(false); void toggleAtend(true); }}
            sx={{ textTransform: 'none', fontWeight: 800, borderRadius: '999px', px: 3, minHeight: 44 }}
          >
            Ficar online
          </Button>
        </DialogActions>
      </Dialog>

      {/* CHAMADO IMEDIATO — offer da fila (spec §6): nome/idade, espera, preço
          (líquido quando a snapshot traz), countdown até acceptDeadlineIso,
          Aceitar/Recusar. Fecha sozinho quando o polling devolve offer=null. */}
      <Dialog
        open={!!queueOffer}
        onClose={(_e, reason) => { if (reason === 'backdropClick' || reason === 'escapeKeyDown') return; setQueueOffer(null); }}
        maxWidth="xs"
        fullWidth
        aria-label="Chamado imediato de teleconsulta"
        PaperProps={{ sx: { borderRadius: '20px', p: 1 } }}
      >
        {queueOffer && (
          <>
            <DialogTitle sx={{ fontWeight: 800, fontFamily: '"Poppins",sans-serif', fontSize: 18, pb: 1 }}>
              🔔 Chamado imediato
            </DialogTitle>
            <DialogContent>
              <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1.5 }}>
                <Avatar sx={{ bgcolor: 'rgba(32,178,170,.12)', color: '#178f89', fontWeight: 800, width: 44, height: 44, fontSize: 18 }}>
                  {queueOffer.patientName?.charAt(0)?.toUpperCase() || 'P'}
                </Avatar>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography noWrap sx={{ fontWeight: 800, fontSize: 16, color: 'text.primary', fontFamily: '"Poppins",sans-serif' }}>
                    {queueOffer.patientName || 'Paciente'}
                  </Typography>
                  <Typography sx={{ fontSize: 12.5, color: 'text.secondary' }}>
                    {[
                      queueOffer.patientAge != null ? `${queueOffer.patientAge} anos` : null,
                      queueOffer.queueWaitSec != null ? `esperando há ${fmtWait(queueOffer.queueWaitSec)}` : null,
                    ].filter(Boolean).join(' · ')}
                  </Typography>
                </Box>
              </Stack>

              <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1.5} sx={{ p: 1.25, borderRadius: '12px', bgcolor: 'rgba(32,178,170,.07)', border: '1px solid rgba(32,178,170,.2)' }}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontSize: 11, fontWeight: 800, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                    Valor da consulta
                  </Typography>
                  <Typography sx={{ fontSize: 18, fontWeight: 900, color: 'text.primary', fontFamily: '"Poppins",sans-serif' }}>
                    R$ {((queueOffer.priceCents ?? 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Typography>
                  {queueOffer.netPriceCents != null && (
                    <Typography sx={{ fontSize: 11.5, color: 'text.secondary' }}>
                      seu líquido: R$ {(queueOffer.netPriceCents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Typography>
                  )}
                </Box>
                <OfferCountdown deadlineIso={queueOffer.acceptDeadlineIso ?? null} />
              </Stack>

              {queueOffer.briefUrl && (
                <Link href={queueOffer.briefUrl} target="_blank" rel="noopener" underline="hover" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, mt: 1.25, fontSize: 12.5, fontWeight: 700 }}>
                  Ver brief clínico do paciente <OpenInNewIcon sx={{ fontSize: 13 }} />
                </Link>
              )}
            </DialogContent>
            <DialogActions sx={{ justifyContent: 'center', pb: 2.5, px: 2.5, gap: 1 }}>
              <Button
                variant="outlined"
                onClick={() => void declineCall()}
                sx={{ flex: 1, minHeight: 46, borderRadius: '12px', textTransform: 'none', fontWeight: 800, fontSize: 13.5, borderColor: 'divider', color: 'text.secondary', '&:hover': { borderColor: 'text.secondary' } }}
              >
                Recusar
              </Button>
              <Button
                variant="contained"
                disabled={acceptBusy}
                startIcon={acceptBusy ? <CircularProgress size={16} color="inherit" /> : null}
                onClick={() => void acceptCall()}
                sx={{ flex: 1, minHeight: 46, borderRadius: '12px', textTransform: 'none', fontWeight: 800, fontSize: 13.5, bgcolor: '#178f89', color: '#fff', '&:hover': { bgcolor: '#0f766e' } }}
              >
                {acceptBusy ? 'Aceitando…' : 'Aceitar'}
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      <Box sx={{ maxWidth: LAYOUT.content, mx: 'auto', p: { xs: 2, md: 3 }, pb: { xs: 11, md: 4 }, bgcolor: 'background.default', minHeight: '100dvh', overflowX: 'hidden', width: '100%' }}>
        {view === 'profile' && <DoctorProfileForm token={token} doctor={doctor} onBack={() => setView('patients')} onSaved={(d) => setDoctor(d)} onPhoto={() => setPhotoVer((v) => v + 1)} photoVer={photoVer} isPremium={!!planInfo?.isPremium} />}
        {view === 'password' && <DoctorChangePasswordForm token={token} onBack={() => setView('patients')} />}

        {/* CONVITES — gestão dedicada */}
        {view === 'invites' && (
          <PortalInvites invites={invites} doctorName={doctor?.name} onNewInvite={() => { setInvResult(null); setInviteOpen(true); }} onCancel={cancelInvite} linkFor={(tok) => `${window.location.href.split('#')[0]}#/convite/${tok}`} onSnackbar={(m, s) => snackbar({ message: m, severity: s })} onPrefill={(p) => { setInv({ name: p.name ?? '', phone: p.phone ?? '', email: p.email ?? '' }); setInvResult(null); setInviteOpen(true); }} />
        )}
        {/* PERGUNTAS — inbox global */}
        {view === 'questions' && (
          <PortalQuestions allQ={allQ} allQLoading={allQLoading} patients={patients} qText={qText} setQText={setQText} qSending={qSending} replyOpen={replyOpen} setReplyOpen={setReplyOpen} onAnswer={answerInbox} onRefresh={loadAllQ} onGoToPatient={goToPatient} />
        )}

        {/* Dialog de convite */}
        <Dialog open={inviteOpen} onClose={() => setInviteOpen(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: '20px', p: 1 } }}>
          <DialogTitle sx={{ fontWeight: 800, fontFamily: '"Poppins",sans-serif', fontSize: 18 }}>Convidar paciente</DialogTitle>
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
            {invResult && <Button onClick={() => setInvResult(null)} sx={{ textTransform: 'none', color: (t) => tealText(t.palette.mode) }}>Novo convite</Button>}
          </DialogActions>
        </Dialog>
        {view === 'patients' && loading && <Box sx={{ textAlign: 'center', py: 6 }}><CircularProgress sx={{ color: (t) => tealText(t.palette.mode) }} /></Box>}
        {view === 'patients' && !loading && loadErr && (
          <Alert severity="warning" sx={{ mb: 2, borderRadius: '14px' }} action={<Button color="inherit" size="small" onClick={loadPatients} sx={{ fontWeight: 700 }}>Tentar de novo</Button>}>
            Sem conexão — não conseguimos carregar sua lista de pacientes. Seus dados estão intactos.
          </Alert>
        )}

        {/* PAINEL INICIAL DO MÉDICO (self-service) */}
        {view === 'overview' && loading && <Box sx={{ textAlign: 'center', py: 6 }}><CircularProgress sx={{ color: (t) => tealText(t.palette.mode) }} /></Box>}
        {view === 'overview' && !loading && loadErr && (
          <Alert severity="warning" sx={{ mb: 2, borderRadius: '14px' }} action={<Button color="inherit" size="small" onClick={loadPatients} sx={{ fontWeight: 700 }}>Tentar de novo</Button>}>
            Sem conexão — não conseguimos carregar sua lista de pacientes. Seus dados estão intactos.
          </Alert>
        )}
        {view === 'overview' && !loading && (
          <PortalOverview
            patients={patients}
            invites={invites}
            doctorName={doctor?.name}
            planInfo={planInfo}
            onStartCheckout={startCheckout}
            payLoading={payLoading}
            onOpenPatient={openPatient}
            onSetView={(v) => setView(v as any)}
            onLoadAllQ={() => { setView('questions'); loadAllQ(); }}
            onNewInvite={() => { setInvResult(null); setInviteOpen(true); }}
            onSetPatAlertOnly={setPatAlertOnly}
            teleconsultas={doctorTele}
            onCancelTele={cancelTele}
            onEnterTele={handleEnterTele}
            onViewTeleconsultas={() => setView('teleconsultas')}
          />
        )}

        {/* AGENDA DEDICADA DE TELECONSULTAS */}
        {view === 'teleconsultas' && (
          <PortalTeleconsultas
            teleconsultas={doctorTele}
            patients={patients}
            onOpenPatient={openPatient}
            onEnterTele={handleEnterTele}
            onCancelTele={cancelTele}
            onOpenPost={openPost}
            onNewTele={openTele}
            teleSummaries={teleSummaries}
            initialSearch={teleSearch}
          />
        )}
        {/* FINANCEIRO DO MÉDICO — §18.1 (Onda 3) */}
        {view === 'finance' && <PortalFinanceiro token={token} />}

        {/* DR. EXAME PRO — banner premium (na aba Pacientes; no Painel fica integrado na coluna lateral) */}
        {planInfo && !planInfo.isPremium && view === 'patients' && !selected && !payDismissed && (
          <Box sx={{ mb: 2.5, p: 2.25, pr: 6, borderRadius: '20px', position: 'relative', background: 'linear-gradient(135deg,rgba(99,102,241,.10),rgba(99,102,241,.03))', border: '1px solid', borderColor: 'rgba(99,102,241,.25)', boxShadow: '0 8px 24px rgba(99,102,241,0.08)' }}>
            <IconButton size="small" aria-label="Fechar banner" onClick={() => { try { localStorage.setItem('doctorPayDismissed', '1'); } catch { /* */ } setPayDismissed(true); }} sx={{ position: 'absolute', top: 8, right: 8, color: 'text.secondary', '&:hover': { bgcolor: 'rgba(99,102,241,.10)' } }}><span aria-hidden style={{ fontSize: 20, lineHeight: 1 }}>×</span></IconButton>
            <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
              <Typography sx={{ fontWeight: 800, color: (t: Theme) => premiumText(t.palette.mode), fontSize: 16, display: 'inline-flex', alignItems: 'center', gap: 0.5 }}><Diamond size={16} weight="fill" />Dr. Exame Pro</Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', flex: 1, minWidth: 180 }}>{planInfo.freeUsed >= planInfo.freeLimit ? '🔒 Pré-consultas grátis esgotadas este mês.' : `💡 ${planInfo.freeUsed} de ${planInfo.freeLimit} pré-consultas grátis usadas.`}</Typography>
              <Button size="small" variant="contained" onClick={() => startCheckout('pix')} disabled={payLoading} sx={{ bgcolor: '#6366f1', textTransform: 'none', borderRadius: '999px', fontWeight: 700, '&:hover': { bgcolor: '#4f46e5' } }}>{payLoading ? 'Gerando...' : 'Assinar R$29,90/mês'}</Button>
            </Stack>
          </Box>
        )}
        {planInfo?.isPremium && view === 'patients' && !selected && (
          <Chip size="small" icon={<Diamond size={12} weight="fill" />} label="Dr. Exame Pro ativo" sx={{ mb: 1.5, bgcolor: 'rgba(99,102,241,.12)', color: (t: Theme) => premiumText(t.palette.mode), fontWeight: 700, '& .MuiChip-icon': { color: (t: Theme) => premiumText(t.palette.mode) } }} />
        )}

        {/* MASTER/DETAIL LEVE (desktop): rail de pacientes à esquerda MESMO com paciente aberto —
            troca rápida sem "Voltar" (também mitiga contexto stale do item 20). NÃO ressuscita o
            grid 2-col de CONTEÚDO (revertido no d56c3c3 por gap vertical) — só pina a lista. */}
        {/* alignItems: stretch no MOBILE — flex-start em column faz cada filho virar fit-content
            (bug: coluna do detalhe crescia p/ ~585px pelo min-content das 6 abas e CORTAVA a
            direita em 390px). No desktop (row) flex-start continua: colunas alinham ao topo. */}
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 2, alignItems: { xs: 'stretch', md: 'flex-start' } }}>

        {/* LISTA DE PACIENTES — SOME quando paciente selecionado, liberando largura total pro prontuário (feedback do dono). */}
        {view === 'patients' && !loading && !selected && (
          <Box sx={{ width: { xs: '100%', md: selected ? 320 : '100%' }, flexShrink: 0 }}>
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
                  <Chip size="small" icon={<Box component="span" sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: badDot(theme.palette.mode), display: 'inline-block' }} />} label="Só alerta" onClick={() => setPatAlertOnly((v) => !v)} color={patAlertOnly ? 'error' : 'default'} variant={patAlertOnly ? 'filled' : 'outlined'} sx={{ fontWeight: 700, flexShrink: 0 }} />
                )}
              </Stack>
            )}
            {patients.length === 0 && !loadErr && (
              <AppCard><CardContent><Box sx={{ textAlign: 'center', py: 6 }}>
                <Box sx={{ fontSize: 64, mb: 2, opacity: 0.4 }}>🩺</Box>
                <Typography sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif', fontSize: 18, color: 'text.primary', mb: 1 }}>Nenhum paciente ainda</Typography>
                <Typography color="text.secondary" sx={{ mb: 0.5 }}>Quando um paciente compartilhar os exames com você, ele aparece aqui automaticamente.</Typography>
                <Typography variant="caption" color="text.secondary">💡 O paciente faz isso no app dele em "Meus Médicos → Compartilhar"</Typography>
              </Box></CardContent></AppCard>
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
                  // Status sem emoji (a11y + identidade Phosphor): ponto p/ alerta, ícones duotone.
                  const statusParts: ReactNode[] = [
                    p.hasAlerts ? <Box key="alerta" component="span" sx={inlineStat}>{statusDot(badDot(theme.palette.mode))}alerta</Box> : null,
                    p.examsCount > 0 ? <Box key="exames" component="span" sx={inlineStat}><Receipt size={12} weight="duotone" />{p.examsCount} exame{p.examsCount > 1 ? 's' : ''}</Box> : null,
                    p.lastExamAt ? <Box key="data" component="span" sx={inlineStat}><CalendarBlank size={12} weight="duotone" />{fmtDate(p.lastExamAt)}</Box> : null,
                    p.convenio || 'Particular',
                  ].filter(Boolean) as ReactNode[];
                  return (
                    <AppCard kind="interactive" key={key} role="button" tabIndex={0} sx={{ ...focusRingSx }} {...a11yClick(() => openPatient(p))}>
                      <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.5 }}>
                        <Box sx={{ position: 'relative', flexShrink: 0 }}>
                          <Avatar src={p.patient?.id ? photoUrlFor(p.patient.id) : undefined} sx={{ bgcolor: 'rgba(32,178,170,.08)', color: (t) => tealText(t.palette.mode), fontWeight: 800, width: 48, height: 48, border: '2px solid', borderColor: p.hasAlerts ? '#ef4444' : 'rgba(32,178,170,.15)' }}>{p.patient?.fullName?.charAt(0)}</Avatar>
                          {p.hasAlerts && <Box sx={{ position: 'absolute', top: -2, right: -2, width: 12, height: 12, borderRadius: '50%', bgcolor: badDot(theme.palette.mode), border: '2px solid', borderColor: 'background.paper' }} />}
                        </Box>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif', fontSize: 15, color: 'text.primary', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.patient?.fullName}</Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25 }}>
                            {[p.age != null ? `${p.age}a` : null, sex, p.relationship].filter(Boolean).join(' · ')}{titularHint}
                          </Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25, fontSize: 12 }}>{statusParts.map((el, i) => <Box component="span" key={i}>{i > 0 ? ' · ' : ''}{el}</Box>)}</Typography>
                        </Box>
                        <ChevronRightIcon sx={{ color: 'text.disabled', fontSize: 20, flexShrink: 0 }} />
                      </CardContent>
                    </AppCard>
                  );
                };
                return filtered.map((p) => card(p, p.shareId));
              })()}
            </Stack>
          </Box>
        )}

        {/* DETALHE DO PACIENTE — desktop: LARGA TOTAL (sem rail de pacientes); mobile: coluna única */}
        {view === 'patients' && selected && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0, maxWidth: { md: '100%', lg: 1040, xl: 1240 }, mx: 'auto', width: '100%' }}>
            {isDesktop && (
              <Button size="small" onClick={() => { setSelected(null); setSelExam(null); }} startIcon={<ArrowBackIcon />}
                sx={{ alignSelf: 'flex-start', textTransform: 'none', fontWeight: 700, color: 'text.secondary', mb: -1 }}>
                Voltar aos pacientes
              </Button>
            )}

            {riskInfo?.newDataReceived && (
          <Alert severity="info" sx={{ py: 0.75, borderRadius: '12px', '& .MuiAlert-message': { fontSize: 13, fontWeight: 600 } }}>
            Novos dados recebidos — atualizando análise: a prioridade clínica foi recalculada com os exames mais recentes.
          </Alert>
        )}
        {/* HERO DO PACIENTE — Identidade, Dados Vitais e Atalhos de Ação Imediata */}
            <PatientSummary
              patient={selected}
              loading={detailLoading}
              exams={exams}
              abnormal={abnormalStats}
              questions={questions}
              notes={notes}
              patients={patients}
              onSwitchPatient={(pid) => { const np = patients.find((x: any) => (x.patient?.id || x.id) === pid); if (np) openPatient(np); }}
              onOpenExam={(id) => { setSelExam(id); focusTab('exams'); }}
              onAlterados={() => focusTab('alterados')}
              onOpenExams={() => focusTab('exams')}
              onOpenQuestions={() => focusTab('questions')}
              onOpenNotes={() => focusTab('notes')}
              onOpenActivity={() => focusTab('exams')}
              medsCount={medsInfo ? medsInfo.medications.filter((m: any) => m.active).length : 0}
              criticalMeds={medsInfo?.critical?.length ?? 0}
              onOpenMeds={() => setMedsOpen(true)}
              activity={activity}
              onScheduleTele={openTele}
            />

            {/* SEÇÃO COMPACTA DE TELECONSULTA DO PACIENTE — mostra a próxima consulta e link direto p/ Agenda */}
            {patientTele.length > 0 && (() => {
              const nowMs = Date.now();
              // Prioriza próxima agendada (futura) NÃO encerrada; senão a mais recente
              // não-encerrada; senão a mais recente de todas (encerrada → read-only).
              const upcoming = patientTele.find((t) => !t.endedAt && new Date(t.dueDate).getTime() >= nowMs - 1800000)
                || patientTele.find((t) => !t.endedAt)
                || patientTele[0];
              const teleEnded = !!upcoming.endedAt; // F4: encerrada → nunca "Entrar na consulta"
              const pName = selected?.patient?.fullName || selected?.patient?.name || 'Paciente';
              const pId = selected?.patient?.id || selected?.id || upcoming.patientId || upcoming.patient?.id;
              const pPhoto = pId ? photoUrlFor(pId) : undefined;
              const dt = new Date(upcoming.dueDate).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
              const isFuture = !teleEnded && new Date(upcoming.dueDate).getTime() >= nowMs;

              return (
                <AppCard kind="elevated" sx={{ p: 2.25, borderRadius: '16px', border: '1px solid', borderColor: isFuture ? 'rgba(15,118,110,0.35)' : 'rgba(212,165,116,0.3)', bgcolor: 'background.paper', boxShadow: '0 4px 20px rgba(0,0,0,0.04)' }}>
                  <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'stretch', sm: 'center' }} justifyContent="space-between" spacing={1.5} sx={{ mb: 1.5 }}>
                    <Stack direction="row" alignItems="center" spacing={1.25} flexWrap="wrap">
                      <Box sx={{ width: 34, height: 34, borderRadius: '10px', bgcolor: isFuture ? 'rgba(15,118,110,0.12)' : 'rgba(212,165,116,0.14)', display: 'grid', placeItems: 'center', color: isFuture ? '#178f89' : 'secondary.dark' }}>
                        <VideocamIcon sx={{ fontSize: 20 }} />
                      </Box>
                      <Box>
                        <Typography sx={{ fontWeight: 800, fontSize: 15, fontFamily: 'Poppins, sans-serif', color: 'text.primary', lineHeight: 1.2 }}>
                          {isFuture ? 'Próxima Teleconsulta' : 'Última Teleconsulta'}
                        </Typography>
                        <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
                          {dt}
                        </Typography>
                      </Box>
                      <Chip size="small" label={`Sala ${String(upcoming.id).slice(-5).toUpperCase()}`} sx={{ height: 22, fontSize: 12, fontWeight: 800, fontFamily: 'monospace', bgcolor: 'rgba(212,165,116,.18)', color: 'secondary.dark', border: '1px dashed rgba(212,165,116,.5)' }} />
                      {upcoming.provider === 'livekit' && !teleEnded && (
                        <Chip size="small" label="No app" sx={{ height: 20, fontSize: 12, fontWeight: 800, bgcolor: 'rgba(32,178,170,0.16)', color: '#178f89' }} />
                      )}
                      {teleEnded && (
                        <Chip
                          size="small"
                          icon={<CheckCircleOutlinedIcon sx={{ fontSize: 13 }} />}
                          label={`✓ Encerrada ${new Date(upcoming.endedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}`}
                          sx={{ height: 22, fontSize: 12, fontWeight: 800, bgcolor: 'rgba(15,118,110,0.12)', color: '#178f89', '& .MuiChip-icon': { color: '#178f89' } }}
                        />
                      )}
                    </Stack>

                    <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ alignSelf: { xs: 'stretch', sm: 'auto' } }}>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => {
                          setTeleSearch(pName);
                          setView('teleconsultas');
                          setSelected(null);
                          setSelExam(null);
                        }}
                        sx={{
                          textTransform: 'none',
                          fontWeight: 700,
                          fontSize: 12.5,
                          borderRadius: '999px',
                          borderColor: 'rgba(15,118,110,0.4)',
                          color: '#178f89',
                          '&:hover': { bgcolor: 'rgba(15,118,110,0.08)', borderColor: '#178f89' },
                        }}
                      >
                        Ver todas na Agenda ({patientTele.length}) →
                      </Button>
                      <Button size="small" variant="outlined" startIcon={<VideocamIcon />} onClick={() => openTele()} sx={{ textTransform: 'none', fontWeight: 700, borderRadius: '999px', borderColor: 'secondary.dark', color: 'secondary.dark', fontSize: 12.5 }}>
                        + Nova
                      </Button>
                    </Stack>
                  </Stack>

                  {/* Detalhes da Teleconsulta — layout refinado e responsivo sem quebras */}
                  <Box sx={{
                    p: { xs: 1.75, sm: 2.25 }, borderRadius: '14px',
                    bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(212,165,116,0.05)',
                    border: '1px solid', borderColor: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(212,165,116,0.2)',
                  }}>
                    <Stack spacing={1.75}>
                      {/* Topo do Card: Identificação do Paciente + Status Clínico com espaço garantido */}
                      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ xs: 'flex-start', md: 'center' }} justifyContent="space-between">
                        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0, flex: 1 }}>
                          <Avatar
                            src={pPhoto}
                            alt={pName}
                            sx={{
                              width: 46,
                              height: 46,
                              fontSize: 16,
                              fontWeight: 800,
                              bgcolor: 'rgba(32,178,170,0.14)',
                              color: '#178f89',
                              border: '2px solid rgba(32,178,170,0.3)',
                              borderRadius: '12px',
                              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                              flexShrink: 0,
                            }}
                          >
                            {pName.charAt(0).toUpperCase()}
                          </Avatar>
                          <Box sx={{ minWidth: 0, flex: 1 }}>
                            <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
                              <Typography sx={{ fontWeight: 800, fontSize: 15.5, color: 'text.primary', fontFamily: 'Poppins, sans-serif', lineHeight: 1.25 }}>
                                {pName}
                              </Typography>
                              {upcoming.title && upcoming.title !== 'Teleconsulta médica' && (
                                <Chip
                                  size="small"
                                  label={`📌 ${upcoming.title}`}
                                  sx={{ height: 22, fontSize: 11.5, fontWeight: 700, bgcolor: 'action.hover', color: 'text.secondary' }}
                                />
                              )}
                            </Stack>
                            <Typography sx={{ fontSize: 12.5, color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                              <ScheduleOutlinedIcon sx={{ fontSize: 14, color: '#178f89' }} />
                              {dt} {upcoming.recurrence ? `• Repete ${upcoming.recurrence}` : ''}
                            </Typography>
                          </Box>
                        </Stack>

                        {/* Status Clínico (Aguardando vs Autorizado) — Espaço Próprio sem quebrar texto */}
                        <Box sx={{ flexShrink: 0, alignSelf: { xs: 'flex-start', md: 'center' } }}>
                          {!teleEnded ? (
                            <Chip
                              size="small"
                              icon={upcoming.consentAt ? <CheckCircleOutlinedIcon sx={{ fontSize: 14 }} /> : <ScheduleOutlinedIcon sx={{ fontSize: 14 }} />}
                              label={upcoming.consentAt ? 'Paciente autorizou (CFM)' : 'Aguardando aceite do paciente'}
                              sx={{
                                height: 26, fontSize: 12, fontWeight: 800, px: 0.75,
                                whiteSpace: 'nowrap',
                                bgcolor: upcoming.consentAt ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)',
                                color: upcoming.consentAt ? '#059669' : '#d97706',
                                border: `1px solid ${upcoming.consentAt ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.35)'}`,
                                '& .MuiChip-icon': { color: 'inherit' },
                              }}
                            />
                          ) : (
                            <Chip
                              size="small"
                              icon={<CheckCircleOutlinedIcon sx={{ fontSize: 14 }} />}
                              label="Consulta Concluída"
                              sx={{ height: 26, fontSize: 12, fontWeight: 800, bgcolor: 'rgba(15,118,110,0.12)', color: '#178f89' }}
                            />
                          )}
                        </Box>
                      </Stack>

                      {/* Notificação explicativa elegante quando aguardando aceite */}
                      {!teleEnded && !upcoming.consentAt && (
                        <Box sx={{
                          display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1, borderRadius: '10px',
                          bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(245,158,11,0.08)' : 'rgba(254,243,199,0.5)',
                          border: '1px solid rgba(245,158,11,0.22)',
                        }}>
                          <ScheduleOutlinedIcon sx={{ fontSize: 16, color: '#d97706', flexShrink: 0 }} />
                          <Typography sx={{ fontSize: 12, color: 'text.secondary', lineHeight: 1.4 }}>
                            <strong>Aguardando aceite do paciente:</strong> O termo de consentimento (CFM 2.314/22) será assinado ao ingressar. A sala já está disponível.
                          </Typography>
                        </Box>
                      )}

                      {/* Divisor suave entre dados da consulta e botões de ação */}
                      <Box sx={{ borderTop: '1px solid', borderColor: 'divider', opacity: 0.6 }} />

                      {/* Ações da Consulta — Responsivo em Web e Mobile */}
                      <Stack
                        direction={{ xs: 'column', sm: 'row' }}
                        spacing={1.25}
                        alignItems={{ xs: 'stretch', sm: 'center' }}
                        justifyContent="space-between"
                      >
                        {teleEnded ? (
                          <Button
                            variant="outlined"
                            size="small"
                            startIcon={<SummarizeIcon />}
                            onClick={() => void openPost(upcoming.id)}
                            sx={{
                              borderRadius: '999px', textTransform: 'none', fontWeight: 800,
                              borderColor: 'rgba(32,178,170,.45)', color: (t) => tealText(t.palette.mode),
                              px: 2.2, py: 0.6, fontSize: 13,
                              '&:hover': { borderColor: '#20b2aa', bgcolor: 'rgba(32,178,170,.06)' },
                              width: { xs: '100%', sm: 'auto' },
                            }}
                          >
                            Ver resumo da consulta
                          </Button>
                        ) : (
                          <Button
                            variant="contained"
                            size="small"
                            startIcon={<VideocamIcon />}
                            onClick={() => handleEnterTele(upcoming, pName)}
                            sx={{
                              borderRadius: '999px', textTransform: 'none', fontWeight: 800,
                              background: 'linear-gradient(135deg, #178f89 0%, #0d5f5a 100%)',
                              '&:hover': { background: 'linear-gradient(135deg, #20b2aa 0%, #178f89 100%)' },
                              px: 2.75, py: 0.8, fontSize: 13,
                              color: '#ffffff',
                              boxShadow: '0 3px 12px rgba(15,118,110,0.3)',
                              width: { xs: '100%', sm: 'auto' },
                            }}
                          >
                            Entrar na consulta
                          </Button>
                        )}

                        <Stack direction="row" spacing={1} alignItems="center" sx={{ width: { xs: '100%', sm: 'auto' } }}>
                          {!teleEnded && (
                            <Button
                              size="small"
                              variant="outlined"
                              startIcon={<AssignmentAddIcon />}
                              onClick={() => setReqOpenId(upcoming.id)}
                              sx={{
                                textTransform: 'none', fontWeight: 700, fontSize: 12.5, borderRadius: '999px',
                                borderColor: 'rgba(32,178,170,0.35)', color: (t) => tealText(t.palette.mode),
                                '&:hover': { borderColor: '#20b2aa', bgcolor: 'rgba(32,178,170,0.06)' },
                                flex: { xs: 1, sm: 'none' },
                              }}
                            >
                              Pedir exame
                            </Button>
                          )}
                          {!teleEnded && (
                            <Button
                              variant="outlined"
                              size="small"
                              startIcon={<SummarizeIcon />}
                              onClick={() => void openPost(upcoming.id)}
                              sx={{
                                borderRadius: '999px', textTransform: 'none', fontWeight: 700, fontSize: 12.5,
                                borderColor: 'divider', color: 'text.secondary',
                                '&:hover': { bgcolor: 'action.hover', color: 'text.primary' },
                                flex: { xs: 1, sm: 'none' },
                              }}
                            >
                              Resumo
                            </Button>
                          )}
                          <Tooltip title="Mais ações">
                            <IconButton
                              size="small"
                              aria-label="Mais ações da teleconsulta"
                              aria-haspopup="menu"
                              onClick={(e) => setFichaTeleMenu(e.currentTarget)}
                              sx={{ color: 'text.secondary', border: '1px solid', borderColor: 'divider' }}
                            >
                              <MoreVertIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      </Stack>
                    </Stack>
                  </Box>
                  {/* Overflow (⋮) da teleconsulta em destaque: copiar link + cancelar (destrutivo) fora da linha de ação — 1 primária por card. */}
                  <Menu
                    anchorEl={fichaTeleMenu}
                    open={!!fichaTeleMenu}
                    onClose={() => setFichaTeleMenu(null)}
                    slotProps={{ paper: { sx: { borderRadius: '14px', minWidth: 230, mt: 1, boxShadow: '0 10px 28px rgba(0,0,0,0.12)' } } }}
                  >
                    {upcoming.linkUrl && (
                      <MenuItem onClick={() => { navigator.clipboard.writeText(upcoming.linkUrl); snackbar({ message: 'Link da teleconsulta copiado!', severity: 'info' }); setFichaTeleMenu(null); }}>
                        <ListItemIcon><ContentCopyIcon fontSize="small" /></ListItemIcon>
                        <ListItemText>Copiar link da reunião</ListItemText>
                      </MenuItem>
                    )}
                    <MenuItem onClick={() => { setFichaTeleMenu(null); cancelTele(upcoming.id, selected.patient.id); }} sx={{ color: 'error.main' }}>
                      <ListItemIcon><DeleteOutlinedIcon fontSize="small" sx={{ color: 'error.main' }} /></ListItemIcon>
                      <ListItemText>Cancelar consulta</ListItemText>
                    </MenuItem>
                  </Menu>
                  {patientTele.length > 1 && (
                    <Typography
                      onClick={() => {
                        setTeleSearch(pName);
                        setView('teleconsultas');
                        setSelected(null);
                        setSelExam(null);
                      }}
                      sx={{
                        fontSize: 12, color: '#178f89', mt: 1, textAlign: 'center', cursor: 'pointer', fontWeight: 700,
                        '&:hover': { textDecoration: 'underline' }
                      }}
                    >
                      Exibindo a consulta em destaque. Há mais {patientTele.length - 1} {patientTele.length - 1 === 1 ? 'consulta' : 'consultas'} no histórico da Agenda →
                    </Typography>
                  )}
                </AppCard>
              );
            })()}



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
                            sx={{ width: 40, height: 40, borderRadius: '8px', objectFit: 'contain', bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', flexShrink: 0 }} />
                        ) : (
                          <Box sx={{ width: 40, height: 40, borderRadius: '8px', display: 'grid', placeItems: 'center', flexShrink: 0, bgcolor: 'rgba(32,178,170,.1)', color: (t) => tealText(t.palette.mode), fontWeight: 800, fontSize: 16, fontFamily: 'Poppins, sans-serif' }}>
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
                        <Typography sx={{ fontWeight: 800, color: 'error.main', fontSize: 14, mb: 0.5 }}>⚠️ Interações críticas</Typography>
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

            {/* AVALIAÇÃO DE RISCO CLÍNICO — Estratificação imediata para o médico */}
            <ClinicalRiskCard
              patient={selected}
              abnormalItems={abnormalItems}
              abnormalStats={abnormalStats}
              exams={exams}
              medsCount={medsInfo ? medsInfo.medications.filter((m: any) => m.active).length : 0}
              criticalMeds={medsInfo?.critical?.length ?? 0}
              onNavigateToAlterados={(targetTab) => {
                const target = targetTab || 'alterados';
                if (supportedTabs.includes(target)) { setTab(target); setSelExam(null); }
                else if (supportedTabs.includes('alterados')) { setTab('alterados'); setSelExam(null); }
              }}
              onRefreshAnalysis={refreshPatientDetail}
              refreshing={detailLoading}
              loading={detailLoading}
            />

            {supportedTabs.length > 0 && (
              <Box id="patient-tabs-section" sx={{ position: 'sticky', top: 'env(safe-area-inset-top)', zIndex: 10, bgcolor: 'background.paper', borderBottom: '1px solid', borderColor: 'divider', mx: -2, px: 2, mt: { xs: -0.5, lg: 0 }, mb: 2 }}>
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
                      // minWidth 0 no xs: o padrão do MUI (90px/aba) soma 360px fixos e
                      // CORTA "Relatório" fora da tela em viewports ≤358px (bug mobile
                      // reportado: itens da barra inacessíveis à direita). fullWidth +
                      // minWidth 0 deixa as 4 se dividirem no que houver.
                      minHeight: 58, px: { xs: 0.5, sm: 1.5 }, py: 1,
                      minWidth: { xs: 0, sm: 90 }, flex: '1 1 0',
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
                        aria-label={`${meta.label}${count > 0 ? ` (${count})` : ''}`}
                        title={meta.label}
                        label={
                          <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontSize: { xs: 12, sm: 13 }, lineHeight: 1.2 }}>
                            <Box component="span">{meta.label}</Box>
                            {count > 0 && (
                              <Box component="sup" sx={{
                                fontSize: 12, fontWeight: 800, lineHeight: 1,
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
              <DoctorValoresAlterados patientId={selected.patient.id} token={token} doctorId={doctor?.id} />
            )}
            {tab === 'tendencias' && !selExam && (
              <DoctorTrends patientId={selected.patient.id} token={token} doctorId={doctor?.id} />
            )}
            {tab === 'relatorio' && !selExam && (
              <DoctorConsolidatedReport patientId={selected.patient.id} token={token} patientName={selected.patient.fullName} onOpenExam={(id) => setSelExam(id)} />
            )}
            {tab === 'sports' && !selExam && (
              <SportsPanel patientId={selected.patient.id} token={token} doctorId={doctor?.id ?? ''} />
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
                        <Card key={q.id} variant="outlined" sx={{ borderRadius: '20px', borderColor: 'divider', boxShadow: '0 4px 16px rgba(0,0,0,0.03)' }}>
                          <CardContent sx={{ p: { xs: 2, md: 2.25 } }}>
                            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1} sx={{ mb: 1.25 }}>
                              {/* Título com clamp 2 linhas (perguntas antigas têm subject longo) + texto completo no title. */}
                              <Typography sx={{ fontWeight: 800, wordBreak: 'break-word', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }} title={q.subject}>💬 {q.subject}</Typography>
                              <QuestionStatusBadge status={q.status} />
                            </Stack>
                            {msgs.length > 0 && (
                              <Stack spacing={1} sx={{ mb: 1.25 }}>
                                {msgs.map((m: any, i: number) => {
                                  const isDoc = m.authorRole === 'doctor';
                                  const isAi = m.authorRole === 'ai';
                                  const isSys = m.authorRole === 'system';
                                  if (isSys) {
                                    // Auto-recebimento — centralizado, muted.
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
                                      <Box sx={{ maxWidth: '78%', p: 1.25, px: 1.5, borderRadius: '16px', bgcolor: (t) => isDoc ? (t.palette.mode === 'dark' ? '#1e2d2c' : '#e0f2f1') : isAi ? (t.palette.mode === 'dark' ? '#2b2438' : '#f3e8ff') : (t.palette.mode === 'dark' ? '#242f33' : '#f1f5f9'), border: '1px solid', borderColor: isDoc ? 'rgba(32,178,170,.25)' : 'transparent' }}>
                                        <Typography variant="caption" sx={{ display: 'block', fontWeight: 700, color: isDoc ? 'primary.dark' : isAi ? '#6366f1' : 'text.secondary', mb: 0.25, fontSize: 12 }}>{role} · {new Date(m.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</Typography>
                                        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.45, wordBreak: 'break-word' }}>{m.body}</Typography>
                                      </Box>
                                      {isDoc && av}
                                    </Box>
                                  );
                                })}
                              </Stack>
                            )}
                            {q.status === 'answered' ? null : (<>
                              <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" sx={{ mb: 1 }}>
                                {QUICK_REPLIES.slice(0, 4).map((t) => <Chip key={t} size="small" variant="outlined" label={t} onClick={() => setQText((prev) => ({ ...prev, [q.id]: t }))} sx={{ fontWeight: 600, height: 'auto', maxWidth: '100%', borderRadius: '999px', py: 0.5, borderColor: 'rgba(32,178,170,.4)', color: (t) => tealText(t.palette.mode), '& .MuiChip-label': { whiteSpace: 'normal', lineHeight: 1.3 }, '&:hover': { bgcolor: 'rgba(32,178,170,.08)' } }} />)}
                              </Stack>
                              <TextField multiline minRows={1} size="small" fullWidth placeholder="Escrever resposta…" value={qText[q.id] ?? ''} onChange={(e) => setQText((t) => ({ ...t, [q.id]: e.target.value }))} />
                              <Button size="small" disabled={qSending === q.id || !(qText[q.id]?.trim())} onClick={() => responderQ(q.id)} startIcon={qSending === q.id ? <CircularProgress size={14} color="inherit" /> : undefined} sx={{ mt: 0.75, textTransform: 'none', fontWeight: 700, color: (t) => tealText(t.palette.mode), borderRadius: '999px' }}>{qSending === q.id ? 'Enviando…' : 'Responder'}</Button>
                            </>)}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </Stack>
                )}

                {tab === 'notes' && !selExam && (
                  <NotesTab notes={notes} newNote={newNote} setNewNote={setNewNote} onAdd={addNote} onDelete={delNote} onSave={saveNote} patient={selected?.patient} />
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

      {/* AGENDAR TELECONSULTA — redesenho 27/10/26: tela cheia no celular, cobre, rodapé com resumo/motivo (TeleScheduleDialog) */}
      <TeleScheduleDialog
        open={teleOpen}
        onClose={() => { setTeleOpen(false); setTeleError(''); }}
        patient={teleTarget}
        patientOptions={!selected && teleOptions.length > 0 ? teleOptions : undefined}
        onPatientChange={setTelePatId}
        tele={tele}
        setTele={setTele}
        caps={meetStatus}
        autoRoom={createMeet}
        setAutoRoom={setCreateMeet}
        onConnectGoogle={() => void connectGoogleMeet()}
        defaultPriceCents={doctor?.consultPriceCents != null ? Number(doctor.consultPriceCents) : null}
        doctorFirstName={doctor?.name?.split(' ')[0]}
        busy={teleBusy}
        error={teleError}
        onSubmit={() => void scheduleTele()}
      />

      {/* F3 — ÁREA PÓS-CONSULTA: "Resumo da consulta". Transcrição + pedidos + feedback/duração */}
      <Dialog open={!!postOpenId} onClose={() => setPostOpenId(null)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: '20px' } }}>
        <DialogTitle sx={{ pb: 1, fontWeight: 800, fontFamily: '"Poppins",sans-serif', fontSize: 18, display: 'flex', alignItems: 'center', gap: 1 }}>
          <SummarizeIcon sx={{ fontSize: 22, color: 'secondary.dark' }} />
          <Box component="span" sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Resumo da consulta</Box>
          {postOpenId && (
            <Tooltip title="Código da sala — o mesmo que o paciente vê no app.">
              <Chip size="small" label={`Sala ${String(postOpenId).slice(-5).toUpperCase()}`} sx={{ height: 22, fontSize: 12, fontWeight: 800, fontFamily: 'monospace', bgcolor: 'rgba(212,165,116,.18)', color: 'secondary.dark', border: '1px dashed rgba(212,165,116,.5)', flexShrink: 0 }} />
            </Tooltip>
          )}
          <Box sx={{ flex: 1 }} />
          <IconButton size="small" aria-label="Atualizar resumo da consulta" disabled={postLoading} onClick={() => postOpenId && void openPost(postOpenId)} sx={{ color: 'text.secondary' }}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ pb: 1.5 }}>
          {postLoading && (
            <Box sx={{ textAlign: 'center', py: 5 }}><CircularProgress size={26} sx={{ color: (t) => tealText(t.palette.mode) }} /></Box>
          )}
          {!postLoading && postErr && (
            <Alert severity="warning" sx={{ borderRadius: '14px' }} action={<Button color="inherit" size="small" onClick={() => postOpenId && void openPost(postOpenId)} sx={{ fontWeight: 700 }}>Tentar de novo</Button>}>
              O resumo da consulta ainda não está disponível para esta consulta.
            </Alert>
          )}
          {!postLoading && !postErr && (
            <Stack spacing={2}>
              {/* Meta da consulta: duração, avaliação, pendências. */}
              <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                {/* F4: data REAL de encerramento (endedAt) — âncora do resumo no histórico. */}
                {!!postSummary?.endedAt && (
                  <Chip size="small" label={`Encerrada ${new Date(postSummary.endedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`} sx={{ height: 24, fontSize: 12, fontWeight: 700, bgcolor: 'rgba(15,118,110,.10)', color: '#178f89' }} />
                )}
                {postSummary?.durationHint && (
                  <Chip size="small" icon={<ScheduleOutlinedIcon sx={{ fontSize: 14 }} />} label={`Encerrada · ${postSummary.durationHint}`} sx={{ height: 24, fontSize: 12, fontWeight: 700, bgcolor: 'action.hover', color: 'text.secondary', '& .MuiChip-icon': { color: 'text.secondary' } }} />
                )}
                {!!postSummary?.feedback && (
                  <Chip size="small" label={`Avaliação do paciente: ${postSummary.feedback.rating}/5`} sx={{ height: 24, fontSize: 12, fontWeight: 700, bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(95,201,195,.12)' : 'rgba(15,118,110,.10)'), color: (t) => (t.palette.mode === 'dark' ? '#5fc9c3' : '#178f89') }} />
                )}
                {postPend > 0 && (
                  <Chip size="small" label={`${postPend} ${postPend === 1 ? 'pedido aguardando' : 'pedidos aguardando'}`} sx={{ height: 24, fontSize: 12, fontWeight: 700, bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(245,158,11,.14)' : 'rgba(245,158,11,.15)'), color: (t) => (t.palette.mode === 'dark' ? '#fbbf24' : '#92400e') }} />
                )}
                {postHasTr && (
                  <Chip size="small" label="Transcrição ✓" sx={{ height: 24, fontSize: 12, fontWeight: 700, bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(95,201,195,.12)' : 'rgba(15,118,110,.10)'), color: (t) => (t.palette.mode === 'dark' ? '#5fc9c3' : '#178f89') }} />
                )}
              </Stack>
              {!!postSummary?.feedback?.note && (
                <Typography sx={{ fontSize: 13, color: 'text.secondary', lineHeight: 1.55 }}>“{postSummary.feedback.note}”</Typography>
              )}

              {/* Pedidos do médico */}
              {!!postSummary && (postSummary.examRequests?.length ?? 0) > 0 && (
                <Box>
                  <Typography sx={{ fontWeight: 800, fontSize: 14, fontFamily: '"Poppins",sans-serif', color: 'text.primary', mb: 1 }}>Pedidos do médico</Typography>
                  <Stack spacing={1.25}>
                    {postSummary.examRequests.map((r) => (
                      <ExamRequestCard key={r.id} req={r} role="doctor" />
                    ))}
                  </Stack>
                </Box>
              )}

              {/* Transcrição — bug 26/10: pendente agora é card ANIMADO + poll (antes
                  ficava "ainda não disponível" estático pra sempre no histórico). */}
              {!!postTranscript?.text ? (
                <Box>
                  <Typography sx={{ fontWeight: 800, fontSize: 14, fontFamily: '"Poppins",sans-serif', color: 'text.primary', mb: 1 }}>Transcrição</Typography>
                  <TranscriptView
                    text={postTranscript.text}
                    transcriptAt={postTranscript.transcriptAt ?? postSummary?.transcript?.at ?? null}
                    role="doctor"
                  />
                </Box>
              ) : (postSummary?.recordingAt || postSummary?.transcript?.at) ? (
                <Box>
                  <Typography sx={{ fontWeight: 800, fontSize: 14, fontFamily: '"Poppins",sans-serif', color: 'text.primary', mb: 1 }}>Transcrição</Typography>
                  <TranscriptView
                    text={null}
                    transcriptAt={postSummary?.transcript?.at ?? null}
                    role="doctor"
                    state="processing"
                  />
                </Box>
              ) : (
                <Box sx={{ p: 2, borderRadius: '14px', bgcolor: 'action.hover', border: '1px dashed', borderColor: 'divider' }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 700, color: 'text.primary', mb: 0.5 }}>
                    🎙️ Transcrição por IA
                  </Typography>
                  <Typography sx={{ fontSize: 12.5, color: 'text.secondary', lineHeight: 1.5 }}>
                    {postSummary?.durationSec != null && postSummary.durationSec < 20
                      ? 'Esta sala foi encerrada antes do início da consulta clínica (saída rápida/teste de conexão).'
                      : 'Esta consulta ocorreu sem gravação de áudio ativa autorizada (CFM 2.314/2022). O prontuário, receitas e pedidos de exames ficam salvos permanentemente.'}
                  </Typography>
                </Box>
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button onClick={() => setPostOpenId(null)} sx={{ textTransform: 'none', fontWeight: 700 }}>Fechar</Button>
          <Button
            variant="outlined"
            startIcon={<AssignmentAddIcon />}
            onClick={() => { const id = postOpenId; setPostOpenId(null); if (id) setReqOpenId(id); }}
            sx={{ textTransform: 'none', fontWeight: 700, borderRadius: '999px', borderColor: 'rgba(32,178,170,.45)', color: (t) => tealText(t.palette.mode) }}
          >
            Pedir exame
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dono 26/10 — motivo do cancelamento: vai no push+e-mail pro paciente e no
          histórico ("Cancelada — motivo: …"). Opcional, máx 300 chars. */}
      <Dialog open={!!cancelCtx} onClose={() => { if (!cancelBusy) setCancelCtx(null); }}>
        <DialogTitle>Cancelar teleconsulta</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 13.5, color: 'text.secondary', lineHeight: 1.55, mb: 1.5 }}>
            O horário será liberado e o <strong>paciente será avisado</strong> (notificação no app e e-mail) de que a consulta foi cancelada por você.
          </Typography>
          <TextField
            autoFocus fullWidth multiline minRows={2} maxRows={4}
            label="Motivo (opcional — vai no aviso ao paciente)"
            placeholder="Ex.: conflito de agenda, imprevisto clínico…"
            inputProps={{ maxLength: 300 }}
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: '12px', fontSize: 14 } }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button disabled={cancelBusy} onClick={() => setCancelCtx(null)} sx={{ textTransform: 'none', fontWeight: 700 }}>Voltar</Button>
          <Button
            color="error" variant="contained" disabled={cancelBusy}
            onClick={() => void doCancelTele()}
            sx={{ textTransform: 'none', fontWeight: 800, borderRadius: '999px' }}
          >
            {cancelBusy ? 'Cancelando…' : 'Cancelar teleconsulta'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* F3 — Drawer "Pedir exame" (fora da chamada) */}
      <Drawer
        open={!!reqOpenId}
        onClose={() => setReqOpenId(null)}
        anchor={isDesktop ? 'right' : 'bottom'}
        PaperProps={{ sx: { width: { xs: '100%', sm: 420 }, maxHeight: { xs: '90dvh', sm: '100%' }, overflowY: 'auto', borderRadius: { xs: '20px 20px 0 0', sm: '0' }, pb: 'env(safe-area-inset-bottom)' } }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', px: 1, pt: 1 }}>
          <IconButton size="small" aria-label="Fechar pedido de exame" onClick={() => setReqOpenId(null)} sx={{ color: 'text.secondary' }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
        <DoctorRequestPanel
          patientId={selected?.patient?.id || telePatId || (patients[0]?.patient?.id || patients[0]?.id || '')}
          reminderId={reqOpenId ?? undefined}
          authToken={() => token}
          fetchExams={async () => exams.map((e: any) => ({ id: e.id, title: e.title, performedAt: e.performedAt }))}
          onSent={() => {
            const id = reqOpenId;
            if (id) setTeleSummaries((m) => { const c = { ...m }; delete c[id]; return c; });
          }}
          onClose={() => setReqOpenId(null)}
        />
      </Drawer>

      {/* DIALOG DE PAGAMENTO — PIX QR inline + timer + opção cartão */}
      <Dialog open={payOpen} onClose={() => { setPayOpen(false); setPayData(null); }} PaperProps={{ sx: { borderRadius: '20px', maxWidth: 390, p: 1 } }}>
        <DialogTitle sx={{ fontWeight: 800, textAlign: 'center', pb: 1, fontFamily: 'Poppins, sans-serif' }}>💎 Dr. Exame Pro — R$29,90/mês</DialogTitle>
        <DialogContent>
          {payData?.qrBase64 ? (
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="body2" sx={{ mb: 1.5, color: 'text.secondary' }}>Escaneie o QR Code com o app do seu banco:</Typography>
              <Box component="img" src={payData.qrBase64} alt="PIX QR Code" sx={{ width: 220, height: 220, borderRadius: '16px', border: '1px solid', borderColor: 'divider', boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }} />
              <Box sx={{ mt: 1.5, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 0.5 }}>
                <Typography component="span" sx={{ fontSize: 20 }}>⏳</Typography>
                <PayCountdown expiresAt={payData.expiresAt} onExpire={() => { setPayOpen(false); setPayData(null); }} />
              </Box>
              <Typography variant="caption" sx={{ display: 'block', mt: 1, color: '#047857', fontWeight: 700 }}>✅ Detecta pagamento automaticamente</Typography>
              <Button fullWidth size="small" onClick={() => { if (payData.qrCode) navigator.clipboard.writeText(payData.qrCode); }} sx={{ mt: 1.25, textTransform: 'none', borderRadius: '999px', fontWeight: 700 }}>📋 Copiar código PIX</Button>
              <Divider sx={{ my: 1.5 }}><Typography variant="caption" sx={{ color: 'text.secondary' }}>ou pague com</Typography></Divider>
              <Button fullWidth size="small" variant="outlined" onClick={() => startCheckout('card')} sx={{ textTransform: 'none', borderRadius: '999px', fontWeight: 700 }}>💳 Cartão de crédito / débito</Button>
            </Box>
          ) : (
            <Box sx={{ textAlign: 'center', py: 3 }}>
              <CircularProgress size={28} sx={{ color: (t: Theme) => premiumText(t.palette.mode) }} />
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
          { label: 'Consultas', on: view === 'teleconsultas', onClick: () => { setView('teleconsultas'); setSelected(null); setSelExam(null); }, icon: <VideocamIcon />, badge: doctorTele.length },
          { label: 'Perguntas', on: view === 'questions', onClick: () => { setView('questions'); loadAllQ(); }, icon: <QuestionAnswerIcon />, badge: unreadQ },
          { label: 'Perfil', on: view === 'profile' || view === 'password', onClick: () => setView('profile'), icon: <PersonIcon />, badge: 0 },
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
            <Typography sx={{ fontSize: 12, fontWeight: it.on ? 800 : 600, mt: 0.25, fontFamily: 'Poppins, sans-serif' }}>{it.label}</Typography>
            <Box sx={{ height: 3, width: it.on ? 22 : 0, borderRadius: '12px', bgcolor: COPPER.main, mt: 0.3, transition: 'width .2s' }} />
          </Box>
        ))}
      </Box>
    </Box>
  );
};

// Perfil/senha/anotações: components/doctors/portal/* (extraídos no split do P3).

// Status de triagem do analito removido (EvolutionCharts migrado para components/doctors).
