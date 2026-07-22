import { useState, useEffect, useMemo, useRef } from 'react';
import { Box, Card, CardContent, Typography, TextField, Button, CircularProgress, Stack, Chip, Grid, Avatar, MenuItem, Alert, Divider, InputAdornment, IconButton, Link, Drawer, List, ListItemButton, ListItemText, ListItemIcon, Accordion, AccordionSummary, AccordionDetails, Badge, InputBase, Paper, useMediaQuery, useTheme, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
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
import PdfIcon from '@mui/icons-material/PictureAsPdf';
import SearchIcon from '@mui/icons-material/Search';
import GroupsIcon from '@mui/icons-material/Groups';
import MenuIcon from '@mui/icons-material/Menu';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { API_URL } from '../config';
import { confirmDialog, snackbar } from '../components/ConfirmDialog';
import { DrExame } from '../components/DrExame';
import { OtpInput } from '../components/OtpInput';
import { MfaSetupCard } from '../components/mfa/MfaSetupCard';
import { SPECIALTIES, UFS } from '../utils/medicalData';
import { PhotoUpload } from '../components/PhotoUpload';
import { CATS, categorize, refLabel } from '../utils/medicalData';
import { displayStatus } from '../utils/examStatus';
import { formatCpf, isValidCpf } from '../utils/cpf';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
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
  '& .MuiOutlinedInput-root': { borderRadius: '8px', bgcolor: 'background.paper', '& fieldset': { borderColor: 'divider' }, '&:hover fieldset': { borderColor: '#7fcfc6' }, '&.Mui-focused fieldset': { borderColor: '#20b2aa', borderWidth: '1.5px' } },
} as const;

// Estilos pra Markdown (SOAP + plano de conduta). Antes cada card tinha o seu (e faltava
// remark-gfm, então quebras de linha sumiam — texto "sem formato" no mobile). Centralizado.
const mdSx = {
  // Premium + mobile-first: quebra palavras/linhas longas (sem scroll horizontal), tabelas e
  // blocos de código com scroll INTERNO (não estouram o card). Resolve o "txt porco" com
  // tabelas largas/tokens longos que forçavam scroll lateral no mobile.
  minWidth: 0, maxWidth: '100%',
  '& p': { margin: '0.4em 0', fontSize: 14, lineHeight: 1.55, overflowWrap: 'anywhere' },
  '& h2': { fontSize: '0.95rem', fontWeight: 800, color: '#178f89', mt: 1.5, mb: 0.5 },
  '& h3': { fontSize: '0.9rem', fontWeight: 700, color: '#0f7670', mt: 1, mb: 0.25 },
  '& ul, & ol': { margin: '0.4em 0', paddingLeft: '1.4em' },
  '& li': { mb: 0.4, fontSize: 14, lineHeight: 1.5, overflowWrap: 'anywhere' },
  '& strong': { fontWeight: 700 },
  '& em': { fontStyle: 'italic' },
  '& hr': { border: 0, borderTop: '1px solid', borderColor: 'divider', my: 1 },
  '& blockquote': { borderLeft: '3px solid', borderColor: 'divider', pl: 1.25, ml: 0, color: 'text.secondary', my: 0.75 },
  '& code': { fontFamily: 'monospace', fontSize: 12.5, bgcolor: 'action.hover', px: 0.4, borderRadius: 0.5 },
  '& pre': { overflowX: 'auto', maxWidth: '100%', bgcolor: 'action.hover', p: 1, borderRadius: 1, my: 0.75, '& code': { bgcolor: 'transparent', px: 0 } },
  '& table': { display: 'block', overflowX: 'auto', maxWidth: '100%', borderCollapse: 'collapse', my: 0.75 },
  '& th, & td': { border: '1px solid', borderColor: 'divider', padding: '4px 8px', fontSize: 13, textAlign: 'left', verticalAlign: 'top' },
  '& th': { bgcolor: 'rgba(32,178,170,.06)', fontWeight: 700, color: '#178f89' },
} as const;

// A IA (GLM) às vezes envolve o markdown em code fences (```markdown ... ```); aí o
// ReactMarkdown mostra cru num <pre> (### visível + scroll horizontal de 2000px+ no mobile).
// Remove TODAS as fences — em SOAP/plano clínico NÃO há code blocks legítimos, então seguro.
const stripMdFences = (md: string | null | undefined): string => {
  if (!md) return '';
  return md.replace(/```[a-zA-Z]*[ \t]*\r?\n?/g, '').trim();
};

// Countdown timer pro dialog de PIX (10 min, fecha sozinho ao expirar)
const PayCountdown = ({ expiresAt, onExpire }: { expiresAt: string; onExpire: () => void }) => {
  const [secs, setSecs] = useState(Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)));
  useEffect(() => {
    if (secs <= 0) { onExpire(); return; }
    const iv = setInterval(() => setSecs((s) => { if (s <= 1) { clearInterval(iv); onExpire(); return 0; } return s - 1; }), 1000);
    return () => clearInterval(iv);
  }, []);
  const mm = Math.floor(secs / 60), ss = secs % 60;
  return <Typography component="span" sx={{ fontWeight: 800, color: secs < 60 ? '#dc2626' : '#6366f1', fontFamily: 'monospace', fontSize: 18 }}>{String(mm).padStart(2, '0')}:{String(ss).padStart(2, '0')}</Typography>;
};

const SCOPE_META: Record<string, { label: string; icon: string }> = {
  risk: { label: 'Risco', icon: '🛡️' },
  exams: { label: 'Exames', icon: '📋' },
  evolution: { label: 'Evolução', icon: '📈' },
  alerts: { label: 'Alertas', icon: '🚨' },
  summary: { label: 'Resumos IA', icon: '🤖' },
  questions: { label: 'Perguntas', icon: '❓' },
  notes: { label: 'Anotações', icon: '📝' },
};

// riskLevel (server, em inglês) -> pt-BR. Usar em TODO lugar que mostra o nível (timeline, pré-consulta).
const RISK_LABEL: Record<string, string> = { low: 'Baixa', moderate: 'Moderada', high: 'Alta' };
const riskLabel = (lvl?: string) => (lvl && RISK_LABEL[lvl] ? RISK_LABEL[lvl] : lvl ?? '');

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
        <Box sx={{ width: '100%', maxWidth: 420, bgcolor: 'background.paper', borderRadius: '16px', boxShadow: '0 10px 40px rgba(0,80,70,.12)', p: { xs: 3, sm: 4 } }}>
          <Button size="small" onClick={() => { setPendingEmail(null); setErr(''); }} sx={{ color: 'text.secondary', textTransform: 'none', fontWeight: 700, p: 0, minWidth: 0, mb: 1 }}>← Voltar</Button>
          <Typography variant="h6" sx={{ fontWeight: 800, color: 'text.primary', mb: 0.5 }}>✉️ Confirme seu e-mail</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>Enviamos um código de 6 dígitos para <strong>{pendingEmail}</strong>. Digite abaixo pra ativar sua conta de médico.</Typography>
          <Box component="form" onSubmit={verifyEmail} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 0.5 }}>
              <OtpInput value={verifyCode} onChange={setVerifyCode} />
            </Box>
            {err && <Alert severity="error" sx={{ py: 0.5, borderRadius: 2 }}>{err}</Alert>}
            <Button type="submit" variant="contained" size="large" fullWidth disabled={loading} sx={{ borderRadius: '8px', py: 1.35, fontWeight: 800, textTransform: 'none', fontSize: 16, background: 'linear-gradient(180deg,#20b2aa,#009688)' }}>{loading ? <CircularProgress size={22} color="inherit" /> : 'Ativar conta'}</Button>
          </Box>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2, background: 'linear-gradient(135deg,#e6f7f5,#d4f0ec)' }}>
      <Box sx={{ width: '100%', maxWidth: 420, bgcolor: 'background.paper', borderRadius: '16px', boxShadow: '0 10px 40px rgba(0,80,70,.12)', p: { xs: 3, sm: 4 } }}>
        <Box sx={{ mb: 1 }}>
          <Button size="small" onClick={() => navigate('/')} sx={{ color: 'text.secondary', textTransform: 'none', fontWeight: 700, p: 0, minWidth: 0, '&:hover': { bgcolor: 'transparent', color: TEAL } }}>← Voltar ao app</Button>
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
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, p: 1.25, borderRadius: 2, background: 'rgba(32,178,170,0.08)', border: '1px solid', borderColor: 'divider' }}>
              <Box sx={{ fontSize: 24, flexShrink: 0 }}>🩺</Box>
              <Box>
                <Typography sx={{ fontSize: 12.5, fontWeight: 800, color: 'text.primary' }}>Conta de Profissional de Saúde</Typography>
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

        <Typography align="center" sx={{ mt: 2, fontSize: 13, color: 'text.secondary' }}>
          {mode === 'login' ? 'Primeiro acesso?' : 'Já tem conta?'}{' '}
          <Link component="button" type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setErr(''); }} sx={{ fontWeight: 700, color: '#00897b' }}>
            {mode === 'login' ? 'Cadastrar' : 'Fazer login'}
          </Link>
        </Typography>
        <Box sx={{ mt: 2, display: 'flex', gap: 1, alignItems: 'flex-start', p: 1.25, borderRadius: 2, background: 'background.default', border: '1px solid', borderColor: 'divider' }}>
          <Box sx={{ fontSize: 16, lineHeight: 1.3, flexShrink: 0 }}>🩺</Box>
          <Typography sx={{ fontSize: 11.5, color: 'text.secondary', lineHeight: 1.45 }}><strong>Conteúdo educativo.</strong> O paciente controla o que compartilha. Você vê apenas os exames e dados autorizados.</Typography>
        </Box>
      </Box>
    </Box>
  );
};

const TEAL = '#178f89';

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
  const [evolution, setEvolution] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [doctor, setDoctor] = useState<any>(null);
  const [view, setView] = useState<'patients' | 'invites' | 'questions' | 'profile' | 'password'>('patients');
  const [photoVer, setPhotoVer] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [selExam, setSelExam] = useState<any | null>(null);
  const [examDetail, setExamDetail] = useState<any | null>(null);
  const [summaries, setSummaries] = useState<any[]>([]);
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
  const [risk, setRisk] = useState<any>(null);
  const [riskHistory, setRiskHistory] = useState<any[]>([]);
  const [clinicalPlan, setClinicalPlan] = useState<string | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [preVisit, setPreVisit] = useState<any>(null);
  const [soap, setSoap] = useState<string | null>(null);
  const [soapLoading, setSoapLoading] = useState(false);
  const [planInfo, setPlanInfo] = useState<any>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [payData, setPayData] = useState<any>(null);
  const [payLoading, setPayLoading] = useState(false);
  const [payMethod, setPayMethod] = useState<'pix' | 'card'>('pix');
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
    setView('patients'); await openPatient(p); setTab('questions');
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
  const supportedTabs = ['risk', 'questions', ...['exams', 'alerts', 'evolution', 'summary'].filter((s) => scopes.includes(s)), 'notes'];

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

  // --- Export PES (CID-10 + resumo estruturado) ---
  const exportPES = async () => {
    if (!selected) return;
    try {
      const r = await fetch(`${API_URL}/doctor/patients/${selected.patient.id}/export-pes`, { headers: h });
      const d = await r.json();
      if (r.ok && d.text) {
        await navigator.clipboard.writeText(d.text);
        snackbar({ message: 'Resumo estruturado (com CID-10) copiado! Cole no prontuário.', severity: 'success' });
      }
    } catch { snackbar({ message: 'Não foi possível exportar agora.', severity: 'error' }); }
  };
  // --- Copiar resumo pro prontuário (#4) ---
  const copySummary = async () => {
    if (!selected) return;
    const lines = [
      `Paciente: ${selected.patient?.fullName ?? ''}`,
      selected.convenio ? `Convênio: ${selected.convenio}` : '',
      exams[0] ? `Último exame: ${exams[0].title} (${fmtDate(exams[0].performedAt)})${exams[0].sourceLab ? ` — ${exams[0].sourceLab}` : ''}` : 'Sem exames extraídos.',
      selected.patient?.clinicalProfile ? `Perfil clínico: ${selected.patient.clinicalProfile}` : '',
      allAlerts.length ? `Valores alterados (${allAlerts.length}):` : 'Sem valores alterados.',
      ...allAlerts.map((a) => `- ${a.name}: ${a.valueText} (${a.examTitle}, ${fmtDate(a.examDate)})`),
      comparison.length ? 'Variação vs exame anterior:' : '',
      ...comparison.map((d) => `- ${d.name}: ${d.pct > 0 ? '+' : ''}${d.pct.toFixed(0)}% (${d.prev} → ${d.last}${d.unit ? ' ' + d.unit : ''})`),
      '',
      'Resumo gerado pelo app Meus Exames — conteúdo educativo, não substitui avaliação clínica.',
    ].filter((x) => x !== '');
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      snackbar({ message: 'Resumo copiado! Cole no prontuário do paciente.', severity: 'success' });
    } catch { snackbar({ message: 'Não foi possível copiar. Selecione e copie manualmente.', severity: 'error' }); }
  };

  const openPatient = async (p: any) => {
    setSelected(p);
    const pScopes: string[] = p.scopes ?? [];
    const pTabs = ['risk', 'questions', ...['exams', 'alerts', 'evolution', 'summary'].filter((s) => pScopes.includes(s)), 'notes'];
    const wantExams = pScopes.includes('exams') || pScopes.includes('alerts');
    const wantEvol = pScopes.includes('evolution');
    const wantSummary = pScopes.includes('summary');
    setTab('risk'); // abre na Visão de risco (1-min do médico)
    setDetailLoading(true); setExams([]); setEvolution([]); setSummaries([]); setNotes([]); setQuestions([]); setRisk(null); setRiskHistory([]); setClinicalPlan(null); setPreVisit(null); setSoap(null);
    try {
      // Risco + histórico sempre (derivado dos exames — não depende de escopo)
      { const r = await fetch(`${API_URL}/doctor/patients/${p.patient.id}/risk`, { headers: h }); const d = await r.json(); if (r.ok) setRisk(d); }
      { const r = await fetch(`${API_URL}/doctor/patients/${p.patient.id}/risk/history`, { headers: h }); const d = await r.json(); if (r.ok) setRiskHistory(d.history ?? []); }
      // Pré-Consulta (brief automático)
      { const r = await fetch(`${API_URL}/doctor/patients/${p.patient.id}/pre-visit`, { headers: h }); const d = await r.json(); if (r.ok) setPreVisit(d); }
      if (wantExams) { const r = await fetch(`${API_URL}/doctor/patients/${p.patient.id}/exams`, { headers: h }); const d = await r.json(); if (r.ok) setExams(d.items ?? []); }
      if (wantEvol) { const r = await fetch(`${API_URL}/doctor/patients/${p.patient.id}/evolution`, { headers: h }); const d = await r.json(); if (r.ok) setEvolution(d.items ?? []); }
      if (wantSummary) { const r = await fetch(`${API_URL}/doctor/patients/${p.patient.id}/summaries`, { headers: h }); const d = await r.json(); if (r.ok) setSummaries(d.items ?? []); }
      // Perguntas do paciente (pergunta-paga) — sempre carrega (não depende de escopo)
      { const r = await fetch(`${API_URL}/doctor/patients/${p.patient.id}/questions`, { headers: h }); const d = await r.json(); if (r.ok) setQuestions(d.items ?? []); }
      // Anotações sempre (são do próprio médico, não dependem de escopo)
      { const r = await fetch(`${API_URL}/doctor/patients/${p.patient.id}/notes`, { headers: h }); const d = await r.json(); if (r.ok) setNotes(d.items ?? []); }
      // Plano de ação + SOAP salvos (grátis — /latest): não regenera/premium-quota a cada abertura.
      { const r = await fetch(`${API_URL}/doctor/patients/${p.patient.id}/action-plan/latest`, { headers: h }); const d = await r.json(); setClinicalPlan(r.ok && d?.contentMd ? d.contentMd : null); }
      { const r = await fetch(`${API_URL}/doctor/patients/${p.patient.id}/soap/latest`, { headers: h }); const d = await r.json(); setSoap(r.ok && d?.contentMd ? d.contentMd : null); }
    } catch {} finally { setDetailLoading(false); }
  };

  // PLANO DE AÇÃO CLÍNICO (C2) — versão médico, grátis. Gera via GLM com tom técnico.
  const genActionPlan = async () => {
    if (!selected || planLoading) return;
    setPlanLoading(true);
    try { const r = await fetch(`${API_URL}/doctor/patients/${selected.patient.id}/action-plan`, { method: 'POST', headers: h }); const d = await r.json(); if (r.ok) setClinicalPlan(d.contentMd); }
    catch {}
    finally { setPlanLoading(false); }
  };
  // RESUMO CLÍNICO (B3) — gera versão médico (audience=doctor, tom técnico), grátis.
  const genSummary = async () => {
    if (!selected) return;
    setDetailLoading(true);
    try { const r = await fetch(`${API_URL}/doctor/patients/${selected.patient.id}/summary/generate`, { method: 'POST', headers: h }); const d = await r.json(); if (r.ok) setSummaries([{ id: d.id, createdAt: d.createdAt, contentMd: d.contentMd, userMessage: 'audience:doctor' }]); }
    catch {}
    finally { setDetailLoading(false); }
  };
  // SOAP rascunho (IA preenche, médico edita) — grátis pro médico.
  const genSoap = async () => {
    if (!selected || soapLoading) return;
    setSoapLoading(true);
    try { const r = await fetch(`${API_URL}/doctor/patients/${selected.patient.id}/soap`, { method: 'POST', headers: h }); const d = await r.json(); if (r.ok) setSoap(d.contentMd); else if (r.status === 402) snackbar({ message: d.message || 'Limite de pré-consultas grátis atingido. Assine o Dr. Exame Pro.', severity: 'warning' }); }
    catch {}
    finally { setSoapLoading(false); }
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

  // Comparativo "melhorou/piorou" (#2): delta % de cada analito entre o exame mais recente e o
  // anterior. Computado a partir do `evolution` (valueNumeric por analito × performedAt). Top 5
  // maiores variações. Leitura instantânea da tendência sem abrir a tab Evolução.
  const comparison = useMemo(() => {
    const byKey = new Map<string, { name: string; unit?: string; points: { t: number; v: number }[] }>();
    for (const it of evolution) {
      if (it.valueNumeric == null || !it.nameCanonical) continue;
      const k = it.nameCanonical as string;
      if (!byKey.has(k)) byKey.set(k, { name: it.name, unit: it.unit, points: [] });
      byKey.get(k)!.points.push({ t: new Date(it.exam?.performedAt || 0).getTime(), v: it.valueNumeric });
    }
    const deltas: { name: string; unit?: string; pct: number; last: number; prev: number }[] = [];
    for (const { name, unit, points } of byKey.values()) {
      if (points.length < 2) continue;
      points.sort((a, b) => a.t - b.t);
      const last = points[points.length - 1], prev = points[points.length - 2];
      if (!prev.v) continue; // evita divisão por zero
      deltas.push({ name, unit, pct: ((last.v - prev.v) / prev.v) * 100, last: last.v, prev: prev.v });
    }
    return deltas.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct)).slice(0, 5);
  }, [evolution]);

  // Histórico de risco deduplicado por CONTEÚDO (conditionKey+riskLevel), não por dia. O /risk/assess
  // cria 1 RiskAssessment a cada 24h (cache) mesmo quando nada mudou — motor determinístico + dados
  // iguais ⇒ rows idênticos só com createdAt diferente. Mostrar "01/07, 02/07, 03/07" idênticos polui
  // e parece bug ("a cada dia gera o mesmo resumo"). Mantém só a 1ª (mais recente) de cada combinação
  // conditionKey+riskLevel — só aparece linha quando MUDOU algo de verdade.
  const riskHistoryDedup = useMemo(() => {
    const seen = new Set<string>();
    return riskHistory.filter((hh: any) => {
      const key = `${hh.conditionKey ?? 'none'}|${hh.riskLevel ?? ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [riskHistory]);

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
          <Avatar src={doctor?.photoUrl ? `${API_URL}/doctor/photo/${doctor.id}?v=${photoVer}` : undefined} sx={{ width: 52, height: 52, fontSize: 20, bgcolor: 'rgba(255,255,255,.2)', fontWeight: 800, border: '2px solid rgba(255,255,255,.5)' }}>{doctor?.name?.charAt(0)}</Avatar>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif' }}>🩺 {doctor?.name || 'Médico'}</Typography>
            {unreadQ > 0 && <Chip size="small" label={`❓ ${unreadQ} ${unreadQ === 1 ? 'pergunta nova' : 'perguntas novas'}`} sx={{ mt: 0.5, height: 20, fontSize: 11, bgcolor: 'rgba(255,255,255,.28)', color: '#fff', fontWeight: 700 }} />}
            <Typography variant="caption" sx={{ opacity: 0.9, display: 'block' }}>{[doctor?.specialty, doctor?.crm && `CRM ${doctor.crm}`].filter(Boolean).join(' • ')}</Typography>
          </Box>
        </Stack>
      </Box>
      <Divider />
      <Box sx={{ mx: '10px', mt: 1.5, p: 1.25, borderRadius: 2, background: planInfo?.isPremium ? 'rgba(99,102,241,.08)' : 'rgba(32,178,170,0.08)', border: '1px solid', borderColor: planInfo?.isPremium ? 'rgba(99,102,241,.2)' : 'divider' }}>
        <Typography variant="caption" sx={{ fontWeight: 800, color: planInfo?.isPremium ? '#6366f1' : TEAL, display: 'block' }}>PLANO</Typography>
        {planInfo?.isPremium
          ? <><Typography sx={{ fontSize: 13, fontWeight: 700, color: '#6366f1' }}>💎 Dr. Exame Pro</Typography><Typography variant="caption" sx={{ color: 'text.secondary' }}>SOAP e planos ilimitados.{planInfo.planExpiresAt ? ` Até ${new Date(planInfo.planExpiresAt).toLocaleDateString('pt-BR')}.` : ''}</Typography></>
          : <><Typography sx={{ fontSize: 13, fontWeight: 700, color: 'text.primary' }}>Grátis ({planInfo?.freeUsed ?? 0}/{planInfo?.freeLimit ?? 5} usados)</Typography><Typography variant="caption" sx={{ color: 'text.secondary' }}>5 pré-consultas/SOAP grátis por mês.</Typography></>}
      </Box>
      <List sx={{ pt: 1, '& .MuiListItemButton-root': { borderRadius: 2, m: '2px 10px' } }}>
        <ListItemButton selected={view === 'patients'} onClick={() => { setView('patients'); setSelected(null); setSelExam(null); onNav(); }}><ListItemIcon sx={{ minWidth: 38 }}><GroupsIcon sx={{ color: TEAL }} /></ListItemIcon><ListItemText primary="Pacientes" primaryTypographyProps={{ fontWeight: 600 }} /></ListItemButton>
        <ListItemButton selected={view === 'invites'} onClick={() => { setView('invites'); onNav(); }}>
          <ListItemIcon sx={{ minWidth: 38 }}><Badge color="error" variant="dot" invisible={invites.filter((i) => i.status === 'pending').length === 0}><PersonAddAlt1Icon sx={{ color: TEAL }} /></Badge></ListItemIcon>
          <ListItemText primary={`Convites${invites.filter((i) => i.status === 'pending').length ? ` · ${invites.filter((i) => i.status === 'pending').length}` : ''}`} primaryTypographyProps={{ fontWeight: 600 }} />
        </ListItemButton>
        <ListItemButton selected={view === 'questions'} onClick={() => { setView('questions'); loadAllQ(); onNav(); }}>
          <ListItemIcon sx={{ minWidth: 38 }}><Badge color="error" variant="dot" invisible={unreadQ === 0}><QuestionAnswerIcon sx={{ color: TEAL }} /></Badge></ListItemIcon>
          <ListItemText primary={`Perguntas${unreadQ ? ` · ${unreadQ}` : ''}`} primaryTypographyProps={{ fontWeight: 600 }} />
        </ListItemButton>
        <ListItemButton selected={view === 'profile'} onClick={() => { setView('profile'); onNav(); }}><ListItemIcon sx={{ minWidth: 38 }}><PersonIcon sx={{ color: TEAL }} /></ListItemIcon><ListItemText primary="Meu perfil" primaryTypographyProps={{ fontWeight: 600 }} /></ListItemButton>
        <ListItemButton selected={view === 'password'} onClick={() => { setView('password'); onNav(); }}><ListItemIcon sx={{ minWidth: 38 }}><LockIcon sx={{ color: TEAL }} /></ListItemIcon><ListItemText primary="Trocar senha" primaryTypographyProps={{ fontWeight: 600 }} /></ListItemButton>
        <Divider sx={{ my: 1 }} />
        <ListItemButton onClick={() => { onNav(); onLogout(); }} sx={{ color: 'error.main' }}><ListItemIcon sx={{ minWidth: 38 }}><LogoutIcon sx={{ color: 'error.main' }} /></ListItemIcon><ListItemText primary="Sair" primaryTypographyProps={{ fontWeight: 600 }} /></ListItemButton>
      </List>
      <Typography variant="caption" sx={{ mt: 'auto', p: 2, color: 'text.secondary' }}>Portal do Médico</Typography>
    </>
  );

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', display: 'flex' }}>
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
            <Typography sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif', fontSize: 17, color: 'text.primary' }}>{view === 'patients' ? (selected ? selected.patient?.fullName : 'Pacientes') : view === 'invites' ? 'Convites' : view === 'questions' ? 'Perguntas' : view === 'profile' ? 'Meu Perfil' : 'Trocar Senha'}</Typography>
            {planInfo?.isPremium && <Chip size="small" label="💎 Pro" sx={{ bgcolor: 'rgba(99,102,241,.10)', color: '#6366f1', fontWeight: 700, height: 18, fontSize: 10 }} />}
          </Box>
        ) : (
          <>
            <Avatar src={doctor?.photoUrl ? `${API_URL}/doctor/photo/${doctor.id}?v=${photoVer}` : undefined} sx={{ bgcolor: 'rgba(32,178,170,.10)', color: '#178f89', fontWeight: 800, border: '2px solid rgba(32,178,170,.15)', width: 44, height: 44, fontSize: 17 }}>{doctor?.name?.charAt(0)}</Avatar>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif', fontSize: 15, color: 'text.primary', lineHeight: 1.2 }}>{doctor?.name || 'Médico'}</Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>{[doctor?.specialty, doctor?.crm && `CRM ${doctor.crm}`].filter(Boolean).join(' • ') || 'Portal do Médico'}</Typography>
            </Box>
            <IconButton onClick={() => setMenuOpen(true)} sx={{ color: 'text.secondary' }}><MenuIcon /></IconButton>
          </>
        )}
      </Box>

      <Box sx={{ maxWidth: 920, mx: 'auto', p: { xs: 2, md: 3 }, pb: { xs: 11, md: 4 }, bgcolor: 'background.default', minHeight: '100vh' }}>
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
                <Button variant="contained" startIcon={<PersonAddAlt1Icon />} onClick={() => { setInvResult(null); setInviteOpen(true); }} sx={{ borderRadius: 99, textTransform: 'none', fontWeight: 700, bgcolor: '#20b2aa', boxShadow: 'none', '&:hover': { bgcolor: '#178f89' } }}>Convidar</Button>
              </Stack>
              <Stack direction="row" spacing={1.5} sx={{ mb: 2.5 }} useFlexGap flexWrap="wrap">
                {[['Pendentes', pending.length, '#ea580c'], ['Aceitos', accepted.length, '#16a34a'], ['Expirados', expired.length, '#9aa7ad']].map(([l, n, c]) => (
                  <Box key={l as string} sx={{ flex: 1, minWidth: 100, p: 1.5, borderRadius: 3, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider' }}>
                    <Typography sx={{ fontWeight: 800, fontSize: 22, color: c as string, lineHeight: 1.1 }}>{n as number}</Typography>
                    <Typography variant="caption" color="text.secondary">{l as string}</Typography>
                  </Box>
                ))}
              </Stack>

              {pending.length > 0 && (<Box sx={{ mb: 3 }}>
                <Typography sx={{ fontWeight: 800, mb: 1 }}>📨 Aguardando aceite ({pending.length})</Typography>
                <Stack spacing={1.5}>
                  {pending.map((it) => {
                    const waBase = it.phone ? `https://wa.me/${it.phone.startsWith('55') ? '' : '55'}${it.phone}` : '';
                    const waMsg = waBase ? `${waBase}?text=${encodeURIComponent(`Olá! Aqui é ${doctor?.name || 'seu médico'}. Cadastre-se no app Meus Exames pra eu acompanhar seus exames: ${linkFor(it.token)}`)}` : '';
                    return (
                      <Card key={it.id} sx={{ borderRadius: 3, boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}><CardContent>
                        <Stack direction="row" alignItems="center" spacing={1.5}>
                          <Avatar sx={{ bgcolor: 'rgba(234,88,12,.12)', color: '#ea580c', fontWeight: 800, width: 44, height: 44 }}>{it.patientName?.charAt(0)}</Avatar>
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography sx={{ fontWeight: 800 }}>{it.patientName}</Typography>
                            <Typography variant="caption" color="text.secondary">{[it.phone, it.email, `enviado ${relDate(it.createdAt)}`].filter(Boolean).join(' · ')}</Typography>
                          </Box>
                          <Chip size="small" label="pendente" sx={{ height: 20, bgcolor: 'rgba(234,88,12,.12)', color: '#ea580c', fontWeight: 700 }} />
                        </Stack>
                        <Stack direction="row" spacing={1} sx={{ mt: 1.5 }} useFlexGap flexWrap="wrap">
                          <Button size="small" variant="contained" startIcon={<WhatsAppIcon />} disabled={!waMsg} onClick={() => waMsg && window.open(waMsg, '_blank')} sx={{ borderRadius: 99, textTransform: 'none', fontWeight: 700, bgcolor: '#25D366', color: '#fff', boxShadow: 'none', '&:hover': { bgcolor: '#1da851' } }}>WhatsApp</Button>
                          <Button size="small" variant="outlined" onClick={() => { try { navigator.clipboard?.writeText(linkFor(it.token)); } catch {} snackbar({ message: 'Link copiado!', severity: 'success' }); }} sx={{ borderRadius: 99, textTransform: 'none', fontWeight: 700 }}>Copiar link</Button>
                          <Button size="small" onClick={() => cancelInvite(it.id)} sx={{ borderRadius: 99, textTransform: 'none', color: 'error.main', fontWeight: 700 }}>Cancelar</Button>
                        </Stack>
                      </CardContent></Card>
                    );
                  })}
                </Stack>
              </Box>)}

              {accepted.length > 0 && (<Box sx={{ mb: 3 }}>
                <Typography sx={{ fontWeight: 800, mb: 1 }}>✅ Aceitos ({accepted.length})</Typography>
                <Stack spacing={1}>
                  {accepted.map((it) => (
                    <Card key={it.id} sx={{ borderRadius: 3, boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}><CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.25 }}>
                      <Avatar sx={{ bgcolor: 'rgba(22,163,74,.12)', color: '#16a34a', fontWeight: 800, width: 44, height: 44 }}>{it.patientName?.charAt(0)}</Avatar>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 800 }}>{it.patientName}</Typography>
                        <Typography variant="caption" color="text.secondary">Conta criada em {relDate(it.acceptedAt)} · já nos seus pacientes</Typography>
                      </Box>
                      <Chip size="small" label="ativo" sx={{ height: 20, bgcolor: 'rgba(22,163,74,.12)', color: '#16a34a', fontWeight: 700 }} />
                    </CardContent></Card>
                  ))}
                </Stack>
              </Box>)}

              {expired.length > 0 && (<Box>
                <Typography sx={{ fontWeight: 800, mb: 1, color: 'text.secondary' }}>⏰ Expirados / cancelados ({expired.length})</Typography>
                <Stack spacing={1}>
                  {expired.map((it) => (
                    <Card key={it.id} sx={{ borderRadius: 3, opacity: 0.75 }}><CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.25 }}>
                      <Avatar sx={{ bgcolor: 'action.hover', color: 'text.secondary', fontWeight: 800, width: 44, height: 44 }}>{it.patientName?.charAt(0)}</Avatar>
                      <Box sx={{ flex: 1, minWidth: 0 }}><Typography sx={{ fontWeight: 700 }}>{it.patientName}</Typography></Box>
                      <Button size="small" variant="outlined" startIcon={<PersonAddAlt1Icon />} onClick={() => { setInv({ name: it.patientName, phone: it.phone || '', email: it.email || '' }); setInvResult(null); setInviteOpen(true); }} sx={{ borderRadius: 99, textTransform: 'none', fontWeight: 700, borderColor: '#20b2aa', color: '#178f89' }}>Reenviar</Button>
                    </CardContent></Card>
                  ))}
                </Stack>
              </Box>)}

              {invites.length === 0 && (
                <Card sx={{ borderRadius: 3, boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}><CardContent><Box sx={{ textAlign: 'center', py: 5 }}>
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
            const isOpen = replyOpen === q.id;
            return (
              <Card key={q.id} sx={{ borderRadius: 3, mb: 1.5, boxShadow: '0 1px 3px rgba(0,0,0,.04)', border: '1px solid', borderColor: answered ? 'divider' : 'transparent' }}><CardContent>
                <Stack direction="row" alignItems="center" spacing={1.25}>
                  <Box onClick={() => goToPatient(q.patientId)} title="Abrir o paciente" sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flex: 1, minWidth: 0, cursor: 'pointer', borderRadius: 2, mx: -0.5, px: 0.5, py: 0.25, transition: 'background .15s', '&:hover': { bgcolor: 'rgba(32,178,170,.06)' } }}>
                    <Avatar src={q.patient?.id ? `${API_URL}/patients/${q.patient.id}/photo` : undefined} sx={{ bgcolor: TEAL, fontWeight: 800, width: 44, height: 44, flexShrink: 0 }}>{q.patient?.fullName?.charAt(0)}</Avatar>
                    <Box sx={{ minWidth: 0 }}>
                      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
                        <Typography sx={{ fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>{q.patient?.fullName}<OpenInNewIcon sx={{ fontSize: 13, color: 'text.disabled' }} /></Typography>
                        <Chip size="small" label={answered ? '✓ respondida' : 'em aberto'} sx={{ height: 18, fontSize: 10, bgcolor: answered ? 'rgba(22,163,74,.12)' : 'rgba(234,88,12,.12)', color: answered ? '#16a34a' : '#ea580c', fontWeight: 700 }} />
                      </Stack>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{q.subject} · {relDate(q.createdAt)}</Typography>
                    </Box>
                  </Box>
                  {!answered && <Button size="small" variant={isOpen ? 'outlined' : 'contained'} onClick={() => setReplyOpen(isOpen ? null : q.id)} sx={{ borderRadius: 99, textTransform: 'none', fontWeight: 700, bgcolor: isOpen ? undefined : '#20b2aa', color: isOpen ? '#178f89' : '#fff', boxShadow: 'none', '&:hover': { bgcolor: isOpen ? undefined : '#178f89' }, flexShrink: 0 }}>{isOpen ? 'Fechar' : 'Responder'}</Button>}
                </Stack>
                {lastPatient && <Typography variant="body2" sx={{ mt: 1, color: 'text.secondary', fontStyle: 'italic', pl: 0.5 }}>"{String(lastPatient.body).slice(0, 160)}{(String(lastPatient.body).length ?? 0) > 160 ? '…' : ''}"</Typography>}
                {/* Resposta INLINE + respostas prontas (sem navegar pro paciente — era lento). */}
                {isOpen && !answered && (
                  <Box sx={{ mt: 1.5 }}>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>⚡ Resposta rápida:</Typography>
                    <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" sx={{ mt: 0.5, mb: 1 }}>
                      {QUICK_REPLIES.map((t) => <Chip key={t} size="small" variant="outlined" label={t} onClick={() => setQText((prev) => ({ ...prev, [q.id]: t }))} sx={{ fontWeight: 600, height: 'auto', maxWidth: '100%', borderRadius: 2, py: 0.5, borderColor: 'rgba(32,178,170,.4)', color: '#178f89', '& .MuiChip-label': { whiteSpace: 'normal', lineHeight: 1.3 }, '&:hover': { bgcolor: 'rgba(32,178,170,.06)' } }} />)}
                    </Stack>
                    <TextField multiline minRows={2} size="small" fullWidth placeholder="Escrever resposta…" value={qText[q.id] ?? ''} onChange={(e) => setQText((t) => ({ ...t, [q.id]: e.target.value }))} />
                    <Stack direction="row" spacing={1} sx={{ mt: 1 }} justifyContent="flex-end">
                      <Button size="small" onClick={() => { setQText((t) => ({ ...t, [q.id]: '' })); setReplyOpen(null); }} sx={{ textTransform: 'none', fontWeight: 700, color: 'text.secondary' }}>Cancelar</Button>
                      <Button size="small" variant="contained" disabled={qSending === q.id || !(qText[q.id]?.trim())} onClick={() => answerInbox(q.id)} startIcon={qSending === q.id ? <CircularProgress size={14} color="inherit" /> : undefined} sx={{ borderRadius: 99, textTransform: 'none', fontWeight: 700, bgcolor: '#20b2aa', boxShadow: 'none', '&:hover': { bgcolor: '#178f89' } }}>{qSending === q.id ? 'Enviando…' : 'Enviar resposta'}</Button>
                    </Stack>
                  </Box>
                )}
                {answered && lastDoctor && (
                  <Box sx={{ mt: 1.25, p: 1, px: 1.25, borderRadius: 2, bgcolor: (t) => t.palette.mode === 'dark' ? '#1e2d2c' : '#e0f2f1', border: '1px solid', borderColor: 'rgba(32,178,170,.25)' }}>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: TEAL }}>Sua resposta</Typography>
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
                <IconButton onClick={loadAllQ} disabled={allQLoading} sx={{ color: TEAL }}><RefreshIcon /></IconButton>
              </Stack>
              {allQLoading && <Box sx={{ textAlign: 'center', py: 4 }}><CircularProgress sx={{ color: TEAL }} /></Box>}
              {!allQLoading && allQ.length === 0 && (
                <Card sx={{ borderRadius: 3, boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}><CardContent><Box sx={{ textAlign: 'center', py: 5 }}>
                  <Box sx={{ fontSize: 56, mb: 1.5, opacity: 0.4 }}>💬</Box>
                  <Typography sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif', fontSize: 17 }}>Nenhuma pergunta ainda</Typography>
                  <Typography color="text.secondary">Quando um paciente enviar uma pergunta pelo app, ela aparece aqui.</Typography>
                </Box></CardContent></Card>
              )}
              {!allQLoading && openQ.length > 0 && (<Box sx={{ mb: 3 }}><Typography sx={{ fontWeight: 800, mb: 1 }}>⏳ Em aberto ({openQ.length})</Typography>{openQ.map(card)}</Box>)}
              {!allQLoading && answeredQ.length > 0 && (<Box><Typography sx={{ fontWeight: 800, mb: 1, color: 'text.secondary' }}>✅ Respondidas ({answeredQ.length})</Typography>{answeredQ.map(card)}</Box>)}
            </>
          );
        })()}

        {/* Dialog de convite — sempre montado (aberto pela lista de pacientes E pela tela de Convites). */}
        <Dialog open={inviteOpen} onClose={() => setInviteOpen(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
          <DialogTitle sx={{ fontWeight: 800, fontFamily: '"Poppins",sans-serif' }}>Convidar paciente</DialogTitle>
          <DialogContent>
            {invResult ? (
              <Box sx={{ textAlign: 'center', py: 1 }}>
                <Typography sx={{ fontWeight: 800, mb: 1 }}>Convite pronto pra {invResult.name}! 🎉</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Toque pra enviar no WhatsApp — o paciente instala o app e você já fica conectado aos exames dele.</Typography>
                {invResult.wa && <Button href={invResult.wa} target="_blank" fullWidth variant="contained" startIcon={<WhatsAppIcon />} sx={{ borderRadius: 99, textTransform: 'none', fontWeight: 700, bgcolor: '#25D366', mb: 1, color: '#fff', '&:hover': { bgcolor: '#1da851' } }}>Enviar no WhatsApp</Button>}
                <Button fullWidth variant="outlined" onClick={() => { try { navigator.clipboard?.writeText(invResult.link); } catch {} snackbar({ message: 'Link copiado!', severity: 'success' }); }} sx={{ borderRadius: 99, textTransform: 'none', fontWeight: 700 }}>Copiar link</Button>
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
            {!invResult && <Button variant="contained" disabled={invBusy || !inv.name.trim() || (!inv.phone.trim() && !inv.email.trim())} onClick={createInvite} sx={{ borderRadius: 99, textTransform: 'none', fontWeight: 700, bgcolor: '#20b2aa' }}>{invBusy ? 'Gerando…' : 'Gerar convite'}</Button>}
            {invResult && <Button onClick={() => setInvResult(null)} sx={{ textTransform: 'none', color: '#178f89' }}>Novo convite</Button>}
          </DialogActions>
        </Dialog>
        {view === 'patients' && loading && <Box sx={{ textAlign: 'center', py: 6 }}><CircularProgress sx={{ color: TEAL }} /></Box>}

        {/* DR. EXAME PRO — banner premium (free tier + CTA) */}
        {planInfo && !planInfo.isPremium && view === 'patients' && (
          <Box sx={{ mb: 2, p: 2, borderRadius: 3, background: 'linear-gradient(135deg,rgba(99,102,241,.08),rgba(99,102,241,.02))', border: '1px solid', borderColor: 'rgba(99,102,241,.2)' }}>
            <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
              <Typography sx={{ fontWeight: 800, color: '#6366f1', fontSize: 16 }}>💎 Dr. Exame Pro</Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', flex: 1, minWidth: 180 }}>{planInfo.freeUsed >= planInfo.freeLimit ? '🔒 Pré-consultas grátis esgotadas este mês.' : `💡 ${planInfo.freeUsed} de ${planInfo.freeLimit} pré-consultas grátis usadas.`}</Typography>
              <Button size="small" variant="contained" onClick={() => startCheckout('pix')} disabled={payLoading} sx={{ bgcolor: '#6366f1', textTransform: 'none', borderRadius: 99, fontWeight: 700, '&:hover': { bgcolor: '#4f46e5' } }}>{payLoading ? 'Gerando...' : 'Assinar R$29,90/mês'}</Button>
            </Stack>
          </Box>
        )}
        {planInfo?.isPremium && view === 'patients' && (
          <Chip size="small" label="💎 Dr. Exame Pro ativo" sx={{ mb: 1.5, bgcolor: 'rgba(99,102,241,.12)', color: '#6366f1', fontWeight: 700 }} />
        )}

        {/* LISTA DE PACIENTES */}
        {view === 'patients' && !loading && !selected && (
          <>
            <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ mb: 1.5 }}>
              <Typography variant="h6" sx={{ fontWeight: 800, color: 'text.primary' }}>Pacientes ({patients.length})</Typography>
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
              <Card sx={{ borderRadius: 3, boxShadow: '0 1px 3px rgba(0,0,0,.04)', border: 'none' }}><CardContent><Box sx={{ textAlign: 'center', py: 6 }}>
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
                    <Card key={key} sx={{ borderRadius: 3, cursor: 'pointer', transition: 'all .15s', border: 'none', boxShadow: '0 1px 3px rgba(0,0,0,.04)', '&:hover': { boxShadow: '0 4px 16px rgba(0,0,0,.08)', transform: 'translateY(-1px)' } }} onClick={() => openPatient(p)}>
                      <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.5 }}>
                        <Box sx={{ position: 'relative', flexShrink: 0 }}>
                          <Avatar src={p.patient?.id ? `${API_URL}/patients/${p.patient.id}/photo` : undefined} sx={{ bgcolor: 'rgba(32,178,170,.08)', color: '#178f89', fontWeight: 800, width: 48, height: 48, border: '2px solid', borderColor: p.hasAlerts ? '#ef4444' : 'rgba(32,178,170,.15)' }}>{p.patient?.fullName?.charAt(0)}</Avatar>
                          {p.hasAlerts && <Box sx={{ position: 'absolute', top: -2, right: -2, width: 12, height: 12, borderRadius: '50%', bgcolor: '#ef4444', border: '2px solid #fff' }} />}
                        </Box>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif', fontSize: 15, color: 'text.primary', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.patient?.fullName}</Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25 }}>
                            {[p.age != null ? `${p.age}a` : null, sex, p.relationship].filter(Boolean).join(' · ')}{titularHint} {p.code && <Box component="span" sx={{ fontFamily: 'monospace', color: 'text.disabled' }}>· {p.code}</Box>}
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
          </>
        )}

        {/* DETALHE DO PACIENTE */}
        {view === 'patients' && selected && (
          <>
            <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
              {/* Voltar só no header (←) — um botão só, igual app profissional */}
              <Avatar src={selected.patient?.id ? `${API_URL}/patients/${selected.patient.id}/photo` : undefined} sx={{ bgcolor: TEAL, width: 44, height: 44, fontSize: 17 }}>{selected.patient?.fullName?.charAt(0)}</Avatar>
              <Box>
                <Stack direction="row" alignItems="center" spacing={0.75}>
                  <Typography sx={{ fontWeight: 800, color: 'text.primary', lineHeight: 1.1 }}>{selected.patient?.fullName}</Typography>
                  {selected.code && <Chip size="small" label={selected.code} sx={{ height: 18, fontSize: 10, bgcolor: '#0f3d3a', color: '#fff', fontWeight: 700, fontFamily: 'monospace' }} />}
                </Stack>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>{[selected.age != null ? `${selected.age} anos` : null, selected.sex === 'female' ? 'Feminino' : selected.sex === 'male' ? 'Masculino' : null, selected.patient?.relationship, selected.convenio || 'Particular', selected.latestWeight ? `${selected.latestWeight.value} kg` : null].filter(Boolean).join(' • ')}</Typography>
              </Box>
              <Box sx={{ flex: 1 }} />
            </Stack>

            {/* COMMAND BAR — segmented control premium (iOS style) com contagens. Sticky. */}
            {supportedTabs.length > 0 && (
              <Box sx={{ mb: 2, position: 'sticky', top: 0, zIndex: 10, bgcolor: 'transparent', py: 1, mx: -2, px: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
                <Stack direction="row" spacing={0.5} sx={{ overflowX: 'auto', '&::-webkit-scrollbar': { display: 'none' } }}>
                  {supportedTabs.map((s) => {
                    const on = tab === s;
                    const meta = SCOPE_META[s] || { icon: '📄', label: s };
                    const count = s === 'risk' ? (risk?.result ? 1 : 0) : s === 'exams' ? (exams?.length || 0) : s === 'alerts' ? (allAlerts?.length || 0) : s === 'notes' ? (notes?.length || 0) : s === 'summary' ? (summaries?.length || 0) : s === 'questions' ? (questions?.filter((q: any) => q.status !== 'answered').length || 0) : 0;
                    return (
                      <Box key={s} onClick={() => setTab(s)} sx={{
                        flexShrink: 0, display: 'flex', alignItems: 'center', gap: 0.5, px: 1.5, py: 0.75, borderRadius: 1.5, cursor: 'pointer',
                        transition: 'all .15s', whiteSpace: 'nowrap',
                        bgcolor: on ? '#178f89' : 'transparent',
                        color: on ? '#fff' : 'text.secondary',
                        boxShadow: on ? '0 2px 6px rgba(23,143,137,.25)' : 'none',
                        '&:hover': { bgcolor: on ? '#0f7670' : 'rgba(0,0,0,.04)' },
                        '&:active': { transform: 'scale(.97)' },
                      }}>
                        <Box sx={{ fontSize: 14, lineHeight: 1 }}>{meta.icon}</Box>
                        <Typography sx={{ fontSize: 12.5, fontWeight: on ? 800 : 600 }}>{meta.label}</Typography>
                        {count > 0 && <Box sx={{ fontSize: 10, fontWeight: 800, bgcolor: on ? 'rgba(255,255,255,.25)' : 'rgba(0,0,0,.06)', borderRadius: 99, px: 0.5, minWidth: 16, textAlign: 'center' }}>{count}</Box>}
                      </Box>
                    );
                  })}
                </Stack>
              </Box>
            )}

            {/* PERFIL CLÍNICO + RESUMO RÁPIDO + PERGUNTAS — só na tab Risco (não polui Exames/Evolução/etc) */}
            {tab === 'risk' && !selExam && (
            <>
            <Accordion defaultExpanded={false} sx={{ mb: 2, borderRadius: '12px !important', border: '1px solid', borderColor: 'divider', borderLeft: '4px solid #20b2aa', '&:before': { display: 'none' }, overflow: 'hidden' }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: '44px !important', '& .MuiAccordionSummary-content': { my: 0.5 } }}>
                <Typography variant="caption" sx={{ fontWeight: 800, color: '#178f89' }}>🩺 PERFIL CLÍNICO{selected.patient?.clinicalProfile ? '' : ' — não cadastrado'} <Box component="span" sx={{ color: 'text.secondary', fontWeight: 500 }}>(toque p/ expandir)</Box></Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ pt: 0.5 }}>
                {selected.patient?.clinicalProfile
                  ? <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{selected.patient.clinicalProfile}</Typography>
                  : <Typography variant="body2" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>Paciente ainda não informou condições, medicações ou alergias.</Typography>}
              </AccordionDetails>
            </Accordion>

            {/* PRÉ-CONSULTA — Accordion colapsável (acima das tabs, não dentro de nenhuma aba).
                Colapsada por padrão: resumo inline (risco + score + top issue) no título,
                o médico vê o essencial sem expandir e sem rolar até as abas. */}
            {preVisit && (
              <Accordion sx={{ mb: 2, borderRadius: '12px !important', border: `2px solid ${TEAL}`, '&:before': { display: 'none' }, overflow: 'hidden' }}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: '44px !important', '& .MuiAccordionSummary-content': { my: 0.5 } }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap', width: '100%' }}>
                    <Typography sx={{ fontWeight: 800, color: TEAL, fontSize: 14 }}>🩺 PRÉ-CONSULTA{preVisit.lastVisit ? ` · desde ${new Date(preVisit.lastVisit).toLocaleDateString('pt-BR')}` : ''}</Typography>
                    {preVisit.risk && <Chip size="small" label={`${preVisit.risk.riskLevel === 'high' ? '🔴' : preVisit.risk.riskLevel === 'moderate' ? '🟠' : '🟢'} ${preVisit.risk.conditionLabel}`} sx={{ height: 20, fontSize: 10, bgcolor: 'action.hover', color: 'text.primary', fontWeight: 700 }} />}
                    {preVisit.score != null && <Chip size="small" label={`Score ${preVisit.score}/100`} sx={{ height: 20, fontSize: 10, bgcolor: 'action.hover', color: 'text.primary', fontWeight: 700 }} />}
                    {preVisit.topIssues?.[0] && <Chip size="small" label={`⚠️ ${preVisit.topIssues[0].name}`} sx={{ height: 20, fontSize: 10, bgcolor: 'action.hover', color: 'text.primary', fontWeight: 700 }} />}
                  </Box>
                </AccordionSummary>
                <AccordionDetails sx={{ pt: 0.5 }}>
                  {preVisit.topIssues?.length > 0 && (
                    <Box sx={{ mb: 1.5 }}>
                      <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary' }}>⚠️ TOP 3 PRA HOJE</Typography>
                      <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                        {preVisit.topIssues.map((issue: any, i: number) => {
                          // antes → agora p/ o médico VALIDAR a % (ex.: ↑279% só é real se antes→agora for plausível)
                          const lv = issue.last != null ? issue.last : (issue.lastText ?? null);
                          const pv = issue.prev != null ? issue.prev : (issue.prevText ?? null);
                          const u = issue.unit ? ` ${issue.unit}` : '';
                          const vals = (lv != null || pv != null) ? `${pv ?? '—'} → ${lv ?? '—'}${u}` : '';
                          return (
                            <Stack key={i} direction="row" spacing={0.75} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
                              <Chip size="small" label={i + 1} sx={{ height: 20, width: 20, bgcolor: issue.priority === 'importante' ? '#dc262622' : issue.priority === 'moderada' ? '#ea580c22' : '#ca8a0422', color: issue.priority === 'importante' ? '#dc2626' : issue.priority === 'moderada' ? '#ea580c' : '#ca8a04', fontWeight: 800, fontSize: 11 }} />
                              <Typography variant="body2" sx={{ fontWeight: 600 }}>{issue.name}</Typography>
                              {issue.delta != null && <Chip size="small" label={`${issue.delta > 0 ? '↑' : '↓'} ${Math.abs(Math.round(issue.delta))}%`} sx={{ height: 20, fontSize: 11, bgcolor: issue.delta > 0 ? '#fef3c7' : '#dbeafe', color: issue.delta > 0 ? '#92400e' : '#1e40af', fontWeight: 700 }} />}
                              {vals && <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>{vals}</Typography>}
                            </Stack>
                          );
                        })}
                      </Stack>
                    </Box>
                  )}
                  <Stack direction="row" spacing={2} useFlexGap flexWrap="wrap" sx={{ mb: 0.5 }} alignItems="center">
                    {preVisit.risk && <Typography variant="body2"><b>Risco:</b> {preVisit.risk.conditionLabel} ({riskLabel(preVisit.risk.riskLevel)}){preVisit.risk.trend && preVisit.risk.trend !== 'primeiro' ? ` · ${preVisit.risk.trend === 'melhorou' ? '↓ caiu' : preVisit.risk.trend === 'piorou' ? '↑ subiu' : '→ estável'}` : ''}</Typography>}
                    {(() => {
                      const s = preVisit.score;
                      const meta = s == null ? { label: 'sem dados suficientes', color: 'text.secondary' }
                        : s >= 80 ? { label: 'maioria em dia', color: '#16a34a' }
                        : s >= 60 ? { label: 'pontos de atenção', color: '#ea580c' }
                        : { label: 'vários alterados — revisar', color: '#dc2626' };
                      return <Typography variant="body2"><b>Score:</b> {s ?? '—'}/100 ({preVisit.markers ?? 0} marc.) <Box component="span" sx={{ color: meta.color, fontWeight: 700 }}>· {meta.label}</Box></Typography>;
                    })()}
                  </Stack>
                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1 }}>{'Score = % de exames com valor normal (≥80 bom · 60–79 atenção · <60 revisar).'}</Typography>
                  {preVisit.investigate?.length > 0 && (
                    <Box sx={{ mb: 1 }}>
                      <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary' }}>🔬 INVESTIGAR</Typography>
                      <Stack spacing={0.25} sx={{ mt: 0.25 }}>
                        {preVisit.investigate.map((inv: any, i: number) => {
                          const months = inv.ageMonths != null ? Math.round(inv.ageMonths) : null;
                          const ago = months != null ? (months < 1 ? 'recente' : months === 1 ? 'há 1 mês' : `há ${months} meses`) : (inv.lastMeasured ? new Date(inv.lastMeasured).toLocaleDateString('pt-BR') : '');
                          return <Typography key={i} variant="body2" sx={{ color: 'text.secondary' }}>• {inv.name} {ago ? `${ago} · refazer` : '(refazer)'}</Typography>;
                        })}
                      </Stack>
                    </Box>
                  )}
                  {preVisit.patterns?.length > 0 && (
                    <Box sx={{ mb: 1 }}>
                      <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary' }}>🧬 PADRÕES (sistemas com alteração)</Typography>
                      <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" sx={{ mt: 0.25 }}>
                        {preVisit.patterns.map((p: any, i: number) => (
                          <Chip key={i} size="small" label={`${p.emoji} ${p.title} (${p.markers.length})`} sx={{ height: 20, fontSize: 10, bgcolor: 'action.hover', color: 'text.primary', fontWeight: 600 }} />
                        ))}
                      </Stack>
                    </Box>
                  )}
                  {preVisit.followUpTests?.length > 0 && (
                    <Box sx={{ mb: 1 }}>
                      <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary' }}>🧪 EXAMES DE SEGUIMENTO SUGERIDOS</Typography>
                      <Stack spacing={0.25} sx={{ mt: 0.25 }}>
                        {preVisit.followUpTests.map((t: string, i: number) => (
                          <Typography key={i} variant="body2" sx={{ color: 'text.secondary' }}>• {t}</Typography>
                        ))}
                      </Stack>
                    </Box>
                  )}
                  {preVisit.patientQuestions?.length > 0 && (
                    <Box>
                      <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary' }}>💬 PERGUNTAS RECENTES NO APP</Typography>
                      <Stack spacing={0.25} sx={{ mt: 0.25 }}>
                        {preVisit.patientQuestions.slice(0, 3).map((qa: any, i: number) => {
                          const days = qa.at ? Math.max(0, Math.round((Date.now() - new Date(qa.at).getTime()) / 86400000)) : null;
                          const ago = days == null ? '' : days === 0 ? 'hoje' : days === 1 ? 'há 1 dia' : `há ${days} dias`;
                          return <Typography key={i} variant="body2" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>"{qa.q}"{ago && <Box component="span" sx={{ fontStyle: 'normal', fontSize: 11 }}> · {ago}</Box>}</Typography>;
                        })}
                      </Stack>
                    </Box>
                  )}
                </AccordionDetails>
              </Accordion>
            )}

            {/* CLINICAL BRIEF — card compacto (3 linhas) expansível. Substitui o hero gigante. */}
              <Card sx={{ mb: 2, borderRadius: 3, boxShadow: '0 1px 3px rgba(0,0,0,.04)', border: 'none', overflow: 'hidden' }}>
                <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                  {/* Linha 1: status principal + ações inline */}
                  <Stack direction="row" justifyContent="space-between" alignItems="center" useFlexGap flexWrap="wrap" gap={1}>
                    <Typography sx={{ fontWeight: 800, fontSize: 16, fontFamily: 'Poppins, sans-serif', color: allAlerts.length ? '#dc2626' : '#059669' }}>
                      {allAlerts.length > 0 ? `🔴 ${allAlerts.length} valor(es) alterado(s)` : '✅ Sem alterações'}
                    </Typography>
                    <Stack direction="row" spacing={0.5}>
                      <Button size="small" onClick={copySummary} sx={{ textTransform: 'none', fontWeight: 600, fontSize: 12, color: 'text.secondary', minWidth: 0, py: 0.25 }}>📋 Copiar</Button>
                      <Button size="small" onClick={exportPES} sx={{ textTransform: 'none', fontWeight: 600, fontSize: 12, color: '#6366f1', minWidth: 0, py: 0.25 }}>🏥 PES</Button>
                    </Stack>
                  </Stack>
                  {/* Linha 2: top 3 alterados (não 10 chips) */}
                  {allAlerts.length > 0 && (
                    <Typography variant="body2" sx={{ mt: 0.5, color: 'text.secondary', fontSize: 13 }}>
                      {allAlerts.slice(0, 3).map((a) => a.name).join(', ')}{allAlerts.length > 3 ? ` +${allAlerts.length - 3}` : ''}
                      {exams[0] && ` · ${exams[0].title} · ${fmtDate(exams[0].performedAt)}`}
                    </Typography>
                  )}
                  {/* Linha 3: comparação + nota (compacto, inline) */}
                  {(comparison.length > 0 || notes.length > 0) && (
                    <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: 'text.secondary', fontSize: 11.5 }}>
                      {comparison.length > 0 && `${comparison.slice(0, 3).map((d) => `${d.name} ${d.pct > 0 ? '↑' : '↓'}${Math.abs(d.pct).toFixed(0)}%`).join(' · ')}`}
                      {comparison.length > 0 && notes.length > 0 && ' · '}
                      {notes.length > 0 && `📝 ${notes[0].content?.slice(0, 60)}${(notes[0]?.content?.length ?? 0) > 60 ? '…' : ''}`}
                    </Typography>
                  )}
                </CardContent>
              </Card>
            </>
            )}

            {/* Detalhe de um exame (todos os itens + PDF) OU conteúdo das tabs */}
            {selExam ? (
              <DoctorExamDetail exam={selExam} detail={examDetail} patientId={selected.patient.id} token={token} onBack={() => { setSelExam(null); setExamDetail(null); }} />
            ) : supportedTabs.length > 0 ? (
              <>
                {detailLoading && <Box sx={{ textAlign: 'center', py: 4 }}><CircularProgress size={28} sx={{ color: TEAL }} /></Box>}

                {/* RISCO (C1+C2+C3) — leitura de risco + mudanças ao longo do tempo + plano de ação clínico (versão médico, grátis) */}
                {!detailLoading && tab === 'risk' && (
                  <Stack spacing={1.5}>
                    {risk?.result ? (() => {
                      const rl = risk.result.riskLevel;
                      const color = rl === 'high' ? '#dc2626' : rl === 'moderate' ? '#ea580c' : '#16a34a';
                      return (
                        <Card variant="outlined" sx={{ borderRadius: 3, borderColor: 'divider', borderLeft: `4px solid ${color}` }}><CardContent>
                          <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 1 }}>
                            <Typography sx={{ fontWeight: 800 }}>🛡️ Leitura de risco <Box component="span" sx={{ fontSize: 12, fontWeight: 600, color: color }}>{rl === 'high' ? '🔴 Alta' : rl === 'moderate' ? '🟠 Moderada' : '🟢 Baixa'}</Box></Typography>
                            <Chip size="small" label={risk.result.predictedCondition} sx={{ fontWeight: 700, bgcolor: 'action.hover', height: 22 }} />
                          </Stack>
                          {risk.trend && risk.trend !== 'primeiro' && <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1 }}>{risk.trend === 'melhorou' ? '↓ Risco caiu' : risk.trend === 'piorou' ? '↑ Risco subiu' : '→ Estável'}{risk.prior ? ` desde ${new Date(risk.prior.createdAt).toLocaleDateString('pt-BR')}` : ''}</Typography>}
                          {risk.result.detectedFindings?.length > 0 && (
                            <Stack spacing={0.5} sx={{ mb: 1 }}>
                              {risk.result.detectedFindings.map((f: string, i: number) => <Typography key={i} variant="body2" sx={{ color: 'text.secondary' }}>• {f}</Typography>)}
                            </Stack>
                          )}
                          <Typography variant="caption" sx={{ color: 'text.secondary' }}>*Educativo. Não substitui avaliação médica.</Typography>
                        </CardContent></Card>
                      );
                    })() : <Empty label="Sem leitura de risco ainda." icon="🛡️" />}

                    {/* Mudanças ao longo do tempo (C3) — deduplicado por dia (não repetir a mesma data) */}
                    {riskHistoryDedup.length > 1 && (
                      <Card variant="outlined" sx={{ borderRadius: 3, borderColor: 'divider' }}><CardContent>
                        <Typography sx={{ fontWeight: 800, mb: 1 }}>📊 Mudanças ao longo do tempo</Typography>
                        <Stack spacing={0.5}>
                          {riskHistoryDedup.slice(0, 6).map((hh: any, i: number) => {
                            const c = hh.riskLevel === 'high' ? '#dc2626' : hh.riskLevel === 'moderate' ? '#ea580c' : '#16a34a';
                            return (
                              <Box key={hh.id ?? i} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
                                <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>{hh.conditionLabel} <Box component="span" sx={{ color: 'text.secondary' }}>· {new Date(hh.createdAt).toLocaleDateString('pt-BR')}</Box></Typography>
                                <Chip size="small" label={riskLabel(hh.riskLevel)} sx={{ height: 20, flexShrink: 0, bgcolor: c + '22', color: c }} />
                              </Box>
                            );
                          })}
                        </Stack>
                      </CardContent></Card>
                    )}

                    {/* Plano de ação clínico (C2) — versão médico, grátis */}
                    <Card variant="outlined" sx={{ borderRadius: 3, borderColor: 'divider' }}><CardContent>
                      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                        <Typography sx={{ fontWeight: 800 }}>📋 Plano de conduta <Box component="span" sx={{ fontSize: 11, fontWeight: 600, color: 'text.secondary' }}>(investigação + follow-up + diferenciais)</Box></Typography>
                        <Button size="small" variant="outlined" onClick={genActionPlan} disabled={planLoading} sx={{ textTransform: 'none', borderRadius: 99, fontWeight: 700, flexShrink: 0 }}>{clinicalPlan ? '🔄 Regenerar' : 'Gerar plano'}</Button>
                      </Stack>
                      {planLoading && <Box sx={{ textAlign: 'center', py: 2 }}><CircularProgress size={22} sx={{ color: TEAL }} /></Box>}
                      {clinicalPlan && <Box sx={mdSx}><ReactMarkdown remarkPlugins={[remarkGfm]}>{stripMdFences(clinicalPlan)}</ReactMarkdown></Box>}
                      {!clinicalPlan && !planLoading && <Typography variant="body2" sx={{ color: 'text.secondary' }}>Sugestão de conduta clínica com base na leitura de risco: o que investigar, quando reavaliar, diferenciais.</Typography>}
                    </CardContent></Card>

                    {/* SOAP rascunho (IA preenche, médico edita) */}
                    <Card variant="outlined" sx={{ borderRadius: 3, borderColor: 'divider' }}><CardContent>
                      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                        <Typography sx={{ fontWeight: 800 }}>📝 SOAP <Box component="span" sx={{ fontSize: 11, fontWeight: 600, color: 'text.secondary' }}>(nota clínica: Subjetivo/Objetivo/Avaliação/Plano)</Box></Typography>
                        <Button size="small" variant="outlined" onClick={genSoap} disabled={soapLoading} sx={{ textTransform: 'none', borderRadius: 99, fontWeight: 700, flexShrink: 0 }}>{soap ? '🔄 Regenerar' : 'Gerar SOAP'}</Button>
                      </Stack>
                      {soapLoading && <Box sx={{ textAlign: 'center', py: 2 }}><CircularProgress size={22} sx={{ color: TEAL }} /></Box>}
                      {soap && <Box sx={mdSx}><ReactMarkdown remarkPlugins={[remarkGfm]}>{stripMdFences(soap)}</ReactMarkdown></Box>}
                      {!soap && !soapLoading && <Typography variant="body2" sx={{ color: 'text.secondary' }}>Gera um SOAP estruturado (S/O/A/P) com IA a partir dos dados do paciente.</Typography>}
                    </CardContent></Card>
                  </Stack>
                )}

                {/* PERGUNTAS — thread completa (paciente + médico + IA) em bolhas. Antes ficava
                    misturada na tab Risco e só mostrava a última resposta do médico (perdia o
                    histórico). Agora tem aba própria e itera q.messages. */}
                {!detailLoading && tab === 'questions' && (
                  <Stack spacing={1.5}>
                    {/* Cota de perguntas (contextual: a info que estava confusa no botão Atendi). */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap', p: 1, px: 1.25, borderRadius: 2, bgcolor: 'rgba(32,178,170,.06)', border: '1px solid rgba(32,178,170,.15)' }}>
                      <Typography variant="caption" sx={{ fontWeight: 700, color: TEAL }}>📝 Perguntas em aberto:</Typography>
                      <Typography variant="caption" sx={{ fontWeight: 800 }}>{selected.openQuestions ?? 0} de {selected.openQuestionLimit ?? 5}</Typography>
                      <Typography variant="caption" color="text.secondary">· ao responder, o espaço libera e ele pode enviar novas.</Typography>
                    </Box>
                    {questions.length === 0 && <Empty label="Nenhuma pergunta deste paciente ainda." icon="❓" />}
                    {questions.length > 0 && (
                      <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
                        {([['all', 'Todas'], ['pending', 'Aguardando'], ['answered', 'Respondidas']] as const).map(([k, l]) => (
                          <Chip key={k} size="small" label={l} color={qFilter === k ? 'primary' : 'default'} variant={qFilter === k ? 'filled' : 'outlined'} onClick={() => setQFilter(k)} sx={{ fontWeight: 700, borderRadius: 99 }} />
                        ))}
                      </Stack>
                    )}
                    {[...questions].filter((q: any) => qFilter === 'all' || (qFilter === 'pending' ? q.status !== 'answered' : q.status === 'answered')).sort((a: any, b: any) => (a.status === 'answered' ? 1 : 0) - (b.status === 'answered' ? 1 : 0)).map((q: any) => {
                      const msgs = q.messages ?? [];
                      return (
                        <Card key={q.id} variant="outlined" sx={{ borderRadius: 3, borderColor: 'divider' }}>
                          <CardContent>
                            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1} sx={{ mb: 1 }}>
                              <Typography sx={{ fontWeight: 800, wordBreak: 'break-word' }}>💬 {q.subject}</Typography>
                              <Chip size="small" label={q.status === 'answered' ? '✓ Respondida' : '⏳ Aguardando'} sx={{ height: 22, flexShrink: 0, bgcolor: q.status === 'answered' ? '#dcfce7' : '#fef3c7', color: q.status === 'answered' ? '#15803d' : '#9a6b00', fontWeight: 700 }} />
                            </Stack>
                            {msgs.length > 0 && (
                              <Stack spacing={0.75} sx={{ mb: 1 }}>
                                {msgs.map((m: any, i: number) => {
                                  const isDoc = m.authorRole === 'doctor';
                                  const isAi = m.authorRole === 'ai';
                                  const isSys = m.authorRole === 'system';
                                  if (isSys) {
                                    // Auto-recebimento (ex.: "✅ Recebido! Dr. X vai analisar em breve") — centralizado, muted.
                                    return <Box key={i} sx={{ textAlign: 'center', my: 0.5 }}><Box sx={{ display: 'inline-block', px: 1.5, py: 0.5, borderRadius: 99, bgcolor: 'rgba(32,178,170,.08)', color: 'text.secondary', fontSize: 12, fontWeight: 600 }}>{m.body}</Box></Box>;
                                  }
                                  const av = isAi ? null : isDoc
                                    ? <Avatar src={doctor?.photoUrl ? `${API_URL}/doctor/photo/${doctor.id}?v=${photoVer}` : undefined} sx={{ width: 36, height: 36, bgcolor: TEAL, fontSize: 14, fontWeight: 700, flexShrink: 0 }}>{(doctor?.name || 'M').charAt(0)}</Avatar>
                                    : <Avatar src={selected?.patient?.photoUrl ? `${API_URL}/patients/${selected.patient.id}/photo?v=0` : undefined} sx={{ width: 36, height: 36, bgcolor: '#94a3b8', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>{(selected?.patient?.fullName || 'P').charAt(0)}</Avatar>;
                                  const role = isDoc ? `Dr. ${doctor?.name || 'Médico'}` : isAi ? '🤖 IA' : selected?.patient?.fullName || 'Paciente';
                                  return (
                                    <Box key={i} sx={{ display: 'flex', justifyContent: isDoc ? 'flex-end' : 'flex-start', gap: 0.75, alignItems: 'flex-end' }}>
                                      {!isDoc && av}
                                      <Box sx={{ maxWidth: '78%', p: 1, px: 1.25, borderRadius: 2, bgcolor: (t) => isDoc ? (t.palette.mode === 'dark' ? '#1e2d2c' : '#e0f2f1') : isAi ? (t.palette.mode === 'dark' ? '#2b2438' : '#f3e8ff') : (t.palette.mode === 'dark' ? '#242f33' : '#f1f5f9'), border: '1px solid', borderColor: isDoc ? 'rgba(32,178,170,.25)' : 'transparent' }}>
                                        <Typography variant="caption" sx={{ display: 'block', fontWeight: 700, color: isDoc ? TEAL : isAi ? '#7c3aed' : 'text.secondary', mb: 0.25, fontSize: 10.5 }}>{role} · {new Date(m.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</Typography>
                                        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.45, wordBreak: 'break-word' }}>{m.body}</Typography>
                                      </Box>
                                      {isDoc && av}
                                    </Box>
                                  );
                                })}
                              </Stack>
                            )}
                            {q.status === 'answered' ? (
                              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', fontStyle: 'italic', mt: 0.5 }}>Pergunta respondida ✓ — sem ação pendente.</Typography>
                            ) : (<>
                              <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" sx={{ mb: 0.75 }}>
                                {QUICK_REPLIES.slice(0, 4).map((t) => <Chip key={t} size="small" variant="outlined" label={t} onClick={() => setQText((prev) => ({ ...prev, [q.id]: t }))} sx={{ fontWeight: 600, height: 'auto', maxWidth: '100%', borderRadius: 2, py: 0.5, borderColor: 'rgba(32,178,170,.4)', color: '#178f89', '& .MuiChip-label': { whiteSpace: 'normal', lineHeight: 1.3 }, '&:hover': { bgcolor: 'rgba(32,178,170,.06)' } }} />)}
                              </Stack>
                              <TextField multiline minRows={1} size="small" fullWidth placeholder="Escrever resposta…" value={qText[q.id] ?? ''} onChange={(e) => setQText((t) => ({ ...t, [q.id]: e.target.value }))} />
                              <Button size="small" disabled={qSending === q.id || !(qText[q.id]?.trim())} onClick={() => responderQ(q.id)} startIcon={qSending === q.id ? <CircularProgress size={14} color="inherit" /> : undefined} sx={{ mt: 0.5, textTransform: 'none', fontWeight: 700, color: TEAL }}>{qSending === q.id ? 'Enviando…' : 'Responder'}</Button>
                            </>)}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </Stack>
                )}

                {/* EXAMES — agrupados por ano (igual à lista do paciente), clicáveis p/ ver detalhe */}
                {!detailLoading && tab === 'exams' && (
                  <Stack spacing={1.5}>
                    {exams.length === 0 && <Empty label="Sem exames extraídos." />}
                    {examsByYear.map((g) => (
                      <Accordion key={g.year} defaultExpanded={g.year === examsByYear[0]?.year} disableGutters elevation={0} sx={{ '&:before': { display: 'none' }, border: '1px solid', borderColor: 'divider', borderRadius: '12px !important', overflow: 'hidden' }}>
                        <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ bgcolor: 'rgba(32,178,170,0.08)', minHeight: '48px !important', '& .MuiAccordionSummary-content': { my: 0.75 } }}>
                          <Typography sx={{ fontWeight: 800, color: 'text.primary' }}>{g.year === 0 ? 'Sem data' : g.year}</Typography>
                          <Chip size="small" label={g.items.length} sx={{ ml: 1, bgcolor: 'rgba(32,178,170,0.15)', color: TEAL, fontWeight: 700, height: 20 }} />
                        </AccordionSummary>
                        <AccordionDetails sx={{ p: 1.25 }}>
                          <Stack spacing={1}>
                            {g.items.map((ex) => (
                              <Card key={ex.id} variant="outlined" onClick={() => openExam(ex)} sx={{ borderRadius: 2.5, borderColor: 'divider', cursor: 'pointer', transition: 'all .15s', '&:hover': { borderColor: TEAL, boxShadow: '0 4px 12px rgba(32,178,170,.1)' } }}><CardContent sx={{ py: 1.25, '&:last-child': { pb: 1.25 } }}>
                                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1.5}>
                                  <Box sx={{ flex: '1 1 auto', minWidth: 0 }}>
                                    <Typography sx={{ fontWeight: 700, color: 'text.primary' }}>{ex.title}</Typography>
                                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>{fmtDate(ex.performedAt)}{ex.sourceLab ? ` • ${ex.sourceLab}` : ''} • {ex._count?.items ?? 0} itens{ex.requestingDoctor ? ` • Dr. ${ex.requestingDoctor}` : ''}</Typography>
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
                          <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ bgcolor: 'rgba(239,68,68,0.08)' }}>
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
                                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>{refLabel(it)}</Typography>
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
                  <EvolutionCharts items={evolution} />
                )}

                {!detailLoading && tab === 'summary' && (
                  <Stack spacing={1.5}>
                    <Button size="small" variant="contained" onClick={genSummary} disabled={detailLoading} sx={{ alignSelf: 'flex-start', textTransform: 'none', borderRadius: 99, fontWeight: 700 }}>{summaries[0] ? '🔄 Regenerar resumo clínico' : '🤖 Gerar resumo clínico'}</Button>
                    {summaries.length === 0 && !detailLoading && <Empty label="Sem resumo clínico ainda — toque em ‘Gerar resumo clínico’ acima." icon="🤖" />}
                    {summaries[0] && (
                      <Card key={summaries[0].id} variant="outlined" sx={{ borderRadius: 3, borderColor: 'divider' }}><CardContent>
                        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 1 }}>
                          <Typography sx={{ fontWeight: 700, color: 'text.primary' }}>🤖 Resumo clínico (mais recente){summaries[0].userMessage === 'audience:doctor' ? ' · versão médico' : ''}</Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary' }}>{new Date(summaries[0].createdAt).toLocaleDateString('pt-BR')}</Typography>
                        </Stack>
                        <Box sx={mdSx}>
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{stripMdFences(summaries[0].contentMd)}</ReactMarkdown>
                        </Box>
                      </CardContent></Card>
                    )}
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

      {/* DIALOG DE PAGAMENTO — PIX QR inline + timer + opção cartão */}
      <Dialog open={payOpen} onClose={() => { setPayOpen(false); setPayData(null); }} PaperProps={{ sx: { borderRadius: 3, maxWidth: 380 } }}>
        <DialogTitle sx={{ fontWeight: 800, textAlign: 'center', pb: 1 }}>💎 Dr. Exame Pro — R$29,90/mês</DialogTitle>
        <DialogContent>
          {payData?.qrBase64 ? (
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="body2" sx={{ mb: 1.5, color: 'text.secondary' }}>Escaneie o QR Code com o app do seu banco:</Typography>
              <Box component="img" src={payData.qrBase64} alt="PIX QR Code" sx={{ width: 220, height: 220, borderRadius: 2, border: '1px solid', borderColor: 'divider' }} />
              <Box sx={{ mt: 1.5, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 0.5 }}>
                <Typography component="span" sx={{ fontSize: 20 }}>⏳</Typography>
                <PayCountdown expiresAt={payData.expiresAt} onExpire={() => { setPayOpen(false); setPayData(null); }} />
              </Box>
              <Typography variant="caption" sx={{ display: 'block', mt: 1, color: '#16a34a', fontWeight: 700 }}>✅ Detecta pagamento automaticamente</Typography>
              <Button fullWidth size="small" onClick={() => { if (payData.qrCode) navigator.clipboard.writeText(payData.qrCode); }} sx={{ mt: 1, textTransform: 'none', borderRadius: 99 }}>📋 Copiar código PIX</Button>
              <Divider sx={{ my: 1.5 }}><Typography variant="caption" sx={{ color: 'text.secondary' }}>ou pague com</Typography></Divider>
              <Button fullWidth size="small" variant="outlined" onClick={() => startCheckout('card')} sx={{ textTransform: 'none', borderRadius: 99, fontWeight: 700 }}>💳 Cartão de crédito / débito</Button>
            </Box>
          ) : (
            <Box sx={{ textAlign: 'center', py: 3 }}>
              <CircularProgress size={28} sx={{ color: '#6366f1' }} />
              <Typography variant="body2" sx={{ mt: 1, color: 'text.secondary' }}>Gerando pagamento...</Typography>
            </Box>
          )}
        </DialogContent>
      </Dialog>

      {/* MENU RODAPÉ (igual app do paciente) — Pacientes · Perfil · Mais */}
      <Box component="nav" sx={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1100, display: { xs: 'flex', sm: 'none' }, justifyContent: 'space-around', bgcolor: 'background.paper', backdropFilter: 'blur(14px)', borderTop: '1px solid', borderTopColor: 'divider', pb: 'env(safe-area-inset-bottom)', boxShadow: '0 -6px 24px rgba(32,178,170,.10)' }}>
        {([
          { icon: '👥', label: 'Pacientes', on: view === 'patients', onClick: () => { setView('patients'); setSelected(null); setSelExam(null); } },
          { icon: '👤', label: 'Perfil', on: view === 'profile' || view === 'password', onClick: () => setView('profile') },
          { icon: '☰', label: 'Mais', on: menuOpen, onClick: () => setMenuOpen(true) },
        ] as const).map((it) => (
          <Box key={it.label} onClick={it.onClick} sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 0.9, cursor: 'pointer', color: it.on ? TEAL : 'text.secondary', transition: 'color .15s', '&:active': { transform: 'scale(.92)' } }}>
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
        <Button size="small" onClick={onBack} sx={{ color: TEAL, textTransform: 'none', fontWeight: 700, minWidth: 0 }}>← Voltar</Button>
        <Typography sx={{ fontWeight: 800, color: 'text.primary' }}>Meu perfil</Typography>
      </Stack>

      <Card sx={{ borderRadius: 4, mb: 2, background: 'rgba(32,178,170,0.08)', border: '1px solid', borderColor: 'divider' }}>
        <CardContent>
          <Stack direction="row" spacing={2} alignItems="center">
            <PhotoUpload endpoint={`${API_URL}/doctor/me/photo`} authToken={token} fallback={doctor?.name?.charAt(0)} src={doctor?.photoUrl ? `${API_URL}/doctor/photo/${doctor.id}?v=${photoVer}` : undefined} onUploaded={onPhoto} size={84} hideLabel />
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

      <Card sx={{ borderRadius: 4 }}>
        <CardContent>
          <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 800, color: TEAL }}>DADOS PROFISSIONAIS</Typography>
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
    } catch { snackbar({ message: 'Não foi possível abrir o PDF.', severity: 'error' }); } finally { setPdfLoading(false); }
  };
  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1.5 }}>
        {/* Voltar só no header (←) do portal — um botão só */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 800, color: 'text.primary' }}>{detail?.title || exam.title}</Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>{detail?.performedAt ? new Date(detail.performedAt).toLocaleDateString('pt-BR') : 's/d'}{detail?.sourceLab ? ` • ${detail.sourceLab}` : ''}{detail ? ` • ${items.length} itens` : ''}</Typography>
        </Box>
        {detail?.filePath && <Button size="small" variant="outlined" startIcon={pdfLoading ? <CircularProgress size={16} color="inherit" /> : <PdfIcon />} onClick={openPdf} sx={{ color: TEAL, borderColor: TEAL, textTransform: 'none', fontWeight: 700, borderRadius: 99, flexShrink: 0 }}>PDF</Button>}
      </Stack>
      {!detail && <Box sx={{ textAlign: 'center', py: 4 }}><CircularProgress sx={{ color: TEAL }} /></Box>}
      {detail && groups.length === 0 && <Empty label="Exame sem itens extraídos." />}
      {detail && groups.map((g) => (
        <Accordion key={g.cat} disableGutters elevation={0} sx={{ '&:before': { display: 'none' }, mb: 1, border: `1px solid ${g.color}26`, borderRadius: '12px !important', overflow: 'hidden' }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ bgcolor: `${g.color}0a`, minHeight: '46px !important', '& .MuiAccordionSummary-content': { my: 0.5 } }}>
            <Box sx={{ fontSize: 18, mr: 1, display: 'inline-block' }}>{g.emoji}</Box>
            <Typography sx={{ fontWeight: 800, color: 'text.primary', display: 'inline-block' }}>{g.cat}</Typography>
            <Chip size="small" label={g.items.length} sx={{ ml: 1, bgcolor: `${g.color}1a`, color: g.color, fontWeight: 700, height: 20 }} />
          </AccordionSummary>
          <AccordionDetails sx={{ p: 0 }}>
            {g.items.map((it, idx) => (
              <Box key={it.id || idx} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 1.5, py: 1, borderBottom: idx < g.items.length - 1 ? '1px solid' : 'none', borderBottomColor: idx < g.items.length - 1 ? 'divider' : undefined }}>
                <Box sx={{ minWidth: 0, pr: 1 }}>
                  <Typography sx={{ fontSize: 13.5, fontWeight: it.isAbnormal ? 700 : 500, color: it.isAbnormal ? '#b91c1c' : 'text.primary' }}>{it.name}</Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>{refLabel(it)}</Typography>
                </Box>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ flexShrink: 0 }}>
                  <Typography sx={{ fontWeight: 800, fontSize: 14, color: it.isAbnormal ? '#b91c1c' : 'text.primary' }}>{it.valueText ?? '—'}</Typography>
                  {it.flag && (() => {
                    const s = displayStatus(it.flag, it.name, it.refLow, it.refHigh);
                    const bg = s.tone === 'atencao' || s.tone === 'critico' ? '#fee2e2' : s.tone === 'contexto' ? '#fef3c7' : s.tone === 'normal' ? '#dcfce7' : '#f1f5f9';
                    const fg = s.tone === 'atencao' || s.tone === 'critico' ? '#b91c1c' : s.tone === 'contexto' ? '#92400e' : s.tone === 'normal' ? '#15803d' : '#475569';
                    return <Chip size="small" label={s.short} title={s.label} sx={{ height: 18, fontSize: 9, bgcolor: bg, color: fg, fontWeight: 700 }} />;
                  })()}
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
        <Typography sx={{ fontWeight: 800, color: 'text.primary' }}>🔒 Trocar senha</Typography>
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
      <Card sx={{ mb: 2, borderRadius: 4, border: '1px solid', borderColor: 'divider' }}><CardContent>
        <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 800, color: TEAL }}>📝 Nova anotação</Typography>
        <TextField value={newNote} onChange={(e) => setNewNote(e.target.value)} multiline minRows={2} fullWidth size="small" placeholder="Conduta, observação clínica, retorno solicitado…" />
        <Button variant="contained" onClick={onAdd} disabled={!newNote.trim()} sx={{ mt: 1, ...btnSx }}>Adicionar</Button>
      </CardContent></Card>
      {notes.length === 0 && <Empty label="Nenhuma anotação ainda. Use o campo acima pra registrar uma conduta." icon="📝" />}
      <Stack spacing={1.25}>
        {notes.map((n) => (
          <Card key={n.id} variant="outlined" sx={{ borderRadius: 3, borderColor: 'divider' }}><CardContent>
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
                    <Button size="small" sx={{ minWidth: 0, color: 'text.secondary' }} onClick={() => { setEditingId(n.id); setEditText(n.content); }}>✏️</Button>
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

// Status de triagem do analito (mesma semântica da tela de Evolução do paciente).
const STATUS_META_EVO = {
  out: { emoji: '🔴', label: 'Fora da faixa', color: '#ef4444' },
  change: { emoji: '🟠', label: 'Em mudança', color: '#f59e0b' },
  stable: { emoji: '✅', label: 'Estável', color: '#059669' },
} as const;
type EvoStatus = keyof typeof STATUS_META_EVO;

/** #2 Gráficos de evolução por analito — mesmas alavancas de triagem do app do paciente
 *  (chips de status Fora da faixa / Em mudança / Estável + busca) + filtro de período
 *  (6m/1y/Tudo) + zona de referência. Antes era só o gráfico bruto (sem triagem). */
const EvolutionCharts = ({ items }: { items: any[] }) => {
  const muiTheme = useTheme();
  const [period, setPeriod] = useState<'6m' | '1y' | 'all'>('1y');
  const [status, setStatus] = useState<EvoStatus | 'all'>('all');
  const [query, setQuery] = useState('');

  // Agrupa por analito dentro do período selecionado.
  const groups = useMemo(() => {
    const now = Date.now();
    const cutoff = period === '6m' ? now - 180 * 86400000 : period === '1y' ? now - 365 * 86400000 : 0;
    const map = new Map<string, { name: string; unit: string | null; refLow: number | null; refHigh: number | null; points: { date: string; ts: number; value: number; abnormal: boolean }[] }>();
    for (const it of items) {
      const ts = it.exam?.performedAt ? new Date(it.exam.performedAt).getTime() : 0;
      if (ts < cutoff) continue;
      const key = it.nameCanonical || it.name;
      if (!map.has(key)) map.set(key, { name: it.name, unit: it.unit ?? null, refLow: it.refLow ?? null, refHigh: it.refHigh ?? null, points: [] });
      map.get(key)!.points.push({ date: it.exam?.performedAt ? new Date(it.exam.performedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : 's/d', ts, value: it.valueNumeric, abnormal: !!it.isAbnormal });
    }
    return [...map.values()].map((g) => ({ ...g, points: g.points.sort((a, b) => a.ts - b.ts) })).filter((g) => g.points.length >= 1);
  }, [items, period]);

  // Status do analito = último valor fora da faixa (out) / em movimento (change) / estável.
  // Mesma semântica da tela de Evolução do paciente (statusOf).
  const statusOf = (g: { points: { value: number; abnormal: boolean }[] }): EvoStatus => {
    const last = g.points[g.points.length - 1];
    if (last?.abnormal) return 'out';
    const nums = g.points.map((p) => p.value).filter((v) => Number.isFinite(v));
    if (nums.length >= 2 && Math.abs(nums[nums.length - 1] - nums[0]) > 1e-9) return 'change';
    return 'stable';
  };

  // Contagem por status (sobre o período selecionado) pros chips de triagem.
  const counts = useMemo(() => {
    const c: Record<EvoStatus, number> = { out: 0, change: 0, stable: 0 };
    for (const g of groups) c[statusOf(g)]++;
    return c;
  }, [groups]);

  // Aplica filtro de status + busca antes de agrupar por categoria.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return groups.filter((g) => (status === 'all' || statusOf(g) === status) && (!q || (g.name || '').toLowerCase().includes(q)));
  }, [groups, status, query]);

  // Agrupa por categoria médica (igual à tela do paciente) + ordena por qtd de analitos.
  const byCat = useMemo(() => {
    const catMap = new Map<string, { cat: string; emoji: string; color: string; items: typeof filtered }>();
    for (const g of filtered) {
      const c = categorize(g.name);
      if (!catMap.has(c.key)) catMap.set(c.key, { cat: c.cat, emoji: c.emoji, color: c.color, items: [] });
      catMap.get(c.key)!.items.push(g);
    }
    return [...catMap.values()].sort((a, b) => b.items.length - a.items.length);
  }, [filtered]);

  const CHIPS: { key: EvoStatus | 'all'; emoji: string; label: string; color: string; count: number }[] = [
    { key: 'all', emoji: '📋', label: 'Todos', color: '#178f89', count: groups.length },
    { key: 'out', emoji: STATUS_META_EVO.out.emoji, label: STATUS_META_EVO.out.label, color: STATUS_META_EVO.out.color, count: counts.out },
    { key: 'change', emoji: STATUS_META_EVO.change.emoji, label: STATUS_META_EVO.change.label, color: STATUS_META_EVO.change.color, count: counts.change },
    { key: 'stable', emoji: STATUS_META_EVO.stable.emoji, label: STATUS_META_EVO.stable.label, color: STATUS_META_EVO.stable.color, count: counts.stable },
  ];

  if (items.length === 0) return <Empty label="Sem dados de evolução." icon="📈" />;

  return (
    <Box>
      {/* Chips de status (triagem) — iguais aos da Evolução do paciente */}
      <Grid container spacing={1} sx={{ mb: 1.5 }}>
        {CHIPS.map((c) => {
          const on = status === c.key;
          return (
            <Grid key={c.key} size={{ xs: 6, sm: 3 }}>
              <Chip onClick={() => setStatus(c.key)} label={`${c.emoji} ${c.label} (${c.count})`} sx={{ width: '100%', height: 36, borderRadius: 2, bgcolor: on ? c.color : `${c.color}1a`, color: on ? '#fff' : c.color, fontWeight: 700, border: `1px solid ${c.color}55`, '&:hover': { bgcolor: on ? c.color : `${c.color}2e` } }} />
            </Grid>
          );
        })}
      </Grid>

      {/* Período + busca (combo numa linha só) */}
      <Stack direction="row" spacing={1} sx={{ mb: 1.5 }} useFlexGap flexWrap="wrap" alignItems="center">
        {([['6m', '6 meses'], ['1y', '1 ano'], ['all', 'Tudo']] as const).map(([k, l]) => (
          <Chip key={k} size="small" label={l} onClick={() => setPeriod(k)} variant={period === k ? 'filled' : 'outlined'} color={period === k ? 'primary' : 'default'} sx={{ fontWeight: 600 }} />
        ))}
        <Paper variant="outlined" sx={{ p: '2px 12px', flex: 1, minWidth: 160, display: 'flex', alignItems: 'center', gap: 1, borderRadius: 99 }}>
          <SearchIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
          <InputBase value={query} onChange={(e: any) => setQuery(e.target.value)} placeholder="Buscar analito (TSH, glicose…)" sx={{ flex: 1, fontSize: 14 }} />
          {query && <Chip size="small" label="limpar" onClick={() => setQuery('')} sx={{ height: 22 }} />}
        </Paper>
      </Stack>

      {filtered.length === 0 && <Empty label="Nenhum analito nesse filtro." icon="📈" />}
      {byCat.map((cg) => (
        <Box key={cg.cat} sx={{ mb: 2 }}>
          <Typography sx={{ fontWeight: 800, fontSize: 14, color: cg.color, mb: 1, display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Box component="span" sx={{ fontSize: 18 }}>{cg.emoji}</Box> {cg.cat}
            <Chip size="small" label={`${cg.items.length}`} sx={{ height: 18, fontSize: 10, bgcolor: `${cg.color}1a`, color: cg.color, fontWeight: 700 }} />
          </Typography>
          <Stack spacing={1}>
            {cg.items.map((g) => {
              const lineColor = statusOf(g) === 'out' ? '#ef4444' : '#178f89';
              return (
                <Card key={g.name} variant="outlined" sx={{ borderRadius: 3, borderColor: 'divider' }}><CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
                    <Typography sx={{ fontWeight: 700, color: 'text.primary', fontSize: 14 }}>{STATUS_META_EVO[statusOf(g)].emoji} {g.name}</Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>{refLabel(g)}</Typography>
                  </Stack>
                  <Box sx={{ height: g.points.length >= 2 ? 110 : 'auto', width: '100%' }}>
                    {g.points.length >= 2 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={g.points} margin={{ top: 4, right: 18, bottom: 4, left: 6 }}>
                          {g.refLow != null && g.refHigh != null && <ReferenceArea y1={g.refLow} y2={g.refHigh} fill="#059669" fillOpacity={0.14} />}
                          <XAxis dataKey="date" tick={{ fontSize: 10, fill: muiTheme.palette.text.secondary }} interval="preserveStartEnd" tickMargin={6} stroke={muiTheme.palette.divider} />
                          <YAxis tick={{ fontSize: 10, fill: muiTheme.palette.text.secondary }} width={32} domain={['auto', 'auto']} stroke={muiTheme.palette.divider} />
                          <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12, background: muiTheme.palette.background.paper, border: '1px solid ' + muiTheme.palette.divider, color: muiTheme.palette.text.primary }} />
                          <Line type="monotone" dataKey="value" stroke={lineColor} strokeWidth={2.5} dot={{ r: 3, fill: lineColor }} isAnimationActive={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <Typography sx={{ fontSize: 13, color: lineColor, fontWeight: 700 }}>
                        {g.points[0].value} {g.unit || ''} <Typography component="span" variant="caption" sx={{ color: 'text.secondary', ml: 1 }}>{g.points[0].date} · única medição</Typography>
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
