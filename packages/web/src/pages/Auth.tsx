import { useState, useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLogin, useNotify, useTranslate } from 'react-admin';
import { Box, Typography, Button, Link, CircularProgress, Stack, TextField, InputAdornment, IconButton, Checkbox, FormControlLabel } from '@mui/material';
import { DrExame } from '../components/DrExame';
import { API_URL } from '../config';
import { OtpInput } from '../components/OtpInput';
import { MfaChallengeDialog } from '../components/mfa/MfaChallengeDialog';
import { BiometricService, getDeviceId } from '../components/BiometricService';
import { formatCpf, isValidCpf } from '../utils/cpf';

/* ---------- ícones inline (sem dependência de @mui/icons-material) ---------- */
const I = {
  Person: (p?: any) => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9aa7ad" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="8" r="4" /><path d="M4 20c0-3.3 3.6-5 8-5s8 1.7 8 5" /></svg>),
  Mail: (p?: any) => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9aa7ad" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>),
  Lock: (p?: any) => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9aa7ad" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>),
  Eye: (p?: any) => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9aa7ad" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>),
  EyeOff: (p?: any) => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9aa7ad" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M3 3l18 18" /><path d="M10.6 5.1A10.9 10.9 0 0 1 12 5c6.5 0 10 7 10 7a18 18 0 0 1-3.2 4M6.6 6.6A18 18 0 0 0 2 12s3.5 7 10 7a10.8 10.8 0 0 0 5.4-1.5" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>),
  ArrowRight: (p?: any) => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M5 12h14M13 6l6 6-6 6" /></svg>),
  Key: (p?: any) => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="8" cy="15" r="4" /><path d="M10.8 12.2 21 2m-4 4 3 3m-6 1 3 3" /></svg>),
  Shield: (p?: any) => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#178f89" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3Z" /><path d="m9 12 2 2 4-4" /></svg>),
  Doctor: (p?: any) => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M5 3v5a4 4 0 0 0 8 0V3" /><path d="M9 12v2.5A5.5 5.5 0 0 0 20 14.5V13" /><circle cx="20" cy="11" r="2" /></svg>),
  User: (p?: any) => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="8" r="4" /><path d="M4 20c0-3.3 3.6-5 8-5s8 1.7 8 5" /></svg>),
};

/** Card centralizado sobre fundo menta (layout loginIdea). */
const Shell = ({ children }: { children: ReactNode }) => (
  <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2, background: 'linear-gradient(135deg, rgba(32,178,170,.12), rgba(32,178,170,.04))' }}>
    <Box sx={{ width: '100%', maxWidth: 400, bgcolor: 'background.paper', borderRadius: '16px', boxShadow: '0 10px 40px rgba(0,80,70,.10)', p: { xs: 3, sm: 4 } }}>
      <Stack alignItems="center" spacing={1} sx={{ mb: 3 }}>
        <Box sx={{ width: 78, height: 78, borderRadius: '50%', bgcolor: 'rgba(32,178,170,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'inset 0 0 0 1px rgba(32,178,170,.15)' }}>
          <DrExame size={56} sx={{ borderRadius: '50%' }} />
        </Box>
        <Box sx={{ textAlign: 'center' }}>
          <Typography variant="h5" sx={{ fontWeight: 800, color: 'text.primary', fontFamily: 'Poppins, sans-serif', lineHeight: 1.2 }}>Meus Exames</Typography>
          <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>Seu assistente de saúde com IA</Typography>
        </Box>
      </Stack>
      {children}
      <Box sx={{ mt: 3, display: 'flex', gap: 1, alignItems: 'flex-start', p: 1.25, borderRadius: 2, bgcolor: 'background.default', border: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ fontSize: 16, lineHeight: 1.3, flexShrink: 0 }}>🩺</Box>
        <Typography sx={{ fontSize: 11.5, color: 'text.secondary', lineHeight: 1.45 }}>
          <strong>Conteúdo educativo.</strong> Não substitui consulta, diagnóstico ou tratamento médico. Em urgências, procure um serviço de saúde.
        </Typography>
      </Box>
    </Box>
  </Box>
);

const fieldSx = {
  '& .MuiOutlinedInput-root': {
    borderRadius: '8px', bgcolor: 'background.paper',
    '& fieldset': { borderColor: 'divider' },
    '&:hover fieldset': { borderColor: '#7fcfc6' },
    '&.Mui-focused fieldset': { borderColor: '#20b2aa', borderWidth: '1.5px' },
  },
} as const;

const primaryBtnSx = {
  borderRadius: '8px', py: 1.35, fontWeight: 800, textTransform: 'none', fontSize: 16,
  background: 'linear-gradient(180deg, #20b2aa, #009688)', boxShadow: '0 6px 18px rgba(0,150,136,.3)',
  '&:hover': { background: 'linear-gradient(180deg, #1ca39e, #00897b)', boxShadow: '0 8px 22px rgba(0,150,136,.38)' },
} as const;

const tokenBtnSx = {
  borderRadius: '8px', py: 1.2, fontWeight: 700, textTransform: 'none', fontSize: 15, color: '#00897b', borderColor: '#20b2aa',
  '&:hover': { borderColor: '#00897b', bgcolor: 'rgba(32,178,170,.06)' },
} as const;

export const LoginPage = () => {
  const login = useLogin();
  const notify = useNotify();
  const translate = useTranslate();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [pwd, setPwd] = useState('');
  const [code, setCode] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [mode, setMode] = useState<'password' | 'otp'>('password');
  const [loading, setLoading] = useState(false);
  const [role, setRole] = useState<'paciente' | 'medico'>(() => (new URLSearchParams(window.location.hash.split('?')[1] || '').get('role') === 'medico' ? 'medico' : 'paciente'));
  const [mfaChallenge, setMfaChallenge] = useState<{ token: string; account?: string; verifyUrl: string; isDoctor: boolean } | null>(null);
  const [invite] = useState(() => new URLSearchParams(window.location.hash.split('?')[1] || '').get('invite') || '');
  // Quick-login só aparece se a aba atual bate com o role matriculado (paciente ≠ médico)
  const enrolledRole = BiometricService.getEnrolledRole();
  const bioReady = BiometricService.isSupported() && BiometricService.hasEnrollment() && enrolledRole === (role === 'medico' ? 'doctor' : 'patient');

  const bioLogin = async () => {
    const r = await BiometricService.loginWithBiometric();
    if (!r) { notify('Biometria cancelada ou falhou.', { type: 'error' }); return; }
    if (r.isDoctor) { localStorage.setItem('doctorToken', r.token); navigate('/doctor'); }
    else {
      localStorage.setItem('token', r.token);
      // Bio login só guardava o token → drawer ficava "Olá" e admin sumia. Popula user/paciente.
      // BUG: se o token da biometria EXPIROU (JWT 7d), /auth/me dá 401 e antes o app entrava
      // SEM dados (não populava user/paciente mas navegava pra '/'). Agora: só entra se /me
      // for OK; se expirou, limpa o token stale do Keystore e pede re-login por senha.
      try {
        const me = await fetch(`${API_URL}/auth/me`, { headers: { Authorization: `Bearer ${r.token}` } });
        if (me.ok) {
          const d = await me.json();
          // Sliding session: /me devolve um token FRESCO → renova localStorage + Keystore da
          // biometria. Assim a biometria não expira pra quem usa o app (só pra quem fica 7d sem abrir).
          if (d.token) { localStorage.setItem('token', d.token); BiometricService.enroll(d.token, false); }
          if (d.patientId) { localStorage.setItem('patientId', d.patientId); localStorage.setItem('selPatientId', d.patientId); }
          if (d.user) localStorage.setItem('user', JSON.stringify(d.user));
          window.dispatchEvent(new Event('selPatientChanged'));
          navigate('/', { replace: true });
        } else {
          // 401 = token do Keystore expirado. Limpa pra não reusar; usuário re-loga por senha.
          localStorage.removeItem('token');
          BiometricService.forget();
          notify('Sua biometria expirou por segurança. Entre com e-mail e senha para reativá-la.', { type: 'warning' });
        }
      } catch {
        localStorage.removeItem('token');
        notify('Não foi possível confirmar a biometria. Entre com e-mail e senha.', { type: 'error' });
      }
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    if (role === 'medico') {
      try {
        const r = await fetch(`${API_URL}/doctor/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim(), password: pwd }) });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Falha');
        if (d.mfaRequired) { setMfaChallenge({ token: d.challengeToken, account: d.account, verifyUrl: `${API_URL}/doctor/mfa/verify`, isDoctor: true }); return; }
        localStorage.setItem('doctorToken', d.token);
        notify(`Bem-vindo, Dr. ${(d.doctor.name || '').split(' ')[0]}!`, { type: 'success' });
        navigate('/doctor');
      } catch (err: any) { notify(err.message, { type: 'error' }); } finally { setLoading(false); }
      return;
    }
    try { await login({ username: email.trim(), password: pwd, inviteToken: invite || undefined }); }
    catch (e: any) {
      if (e?.mfaRequired) { setMfaChallenge({ token: e.challengeToken, account: e.account, verifyUrl: `${API_URL}/auth/mfa/verify`, isDoctor: false }); return; }
      // Conta não verificada → redireciona pra tela de ativação por e-mail
      if (e?.needsVerification) { notify('Sua conta ainda não foi ativada. Enviamos um código pro seu e-mail.', { type: 'warning' }); setMode('otp'); setLoading(false); return; }
      // Conta bloqueada → mensagem amigável (i18n) de contato com suporte (mesmo se errou a senha).
      if (e?.blocked) { notify(translate('auth.errors.blocked'), { type: 'error' }); setLoading(false); return; }
      notify(translate('auth.errors.invalidCredentials'), { type: 'error' });
    }
    finally { setLoading(false); }
  };

  const onMfaSuccess = (d: any) => {
    setMfaChallenge(null);
    if (mfaChallenge?.isDoctor) { localStorage.setItem('doctorToken', d.token); navigate('/doctor'); return; }
    localStorage.setItem('token', d.token);
    if (d.patientId) { localStorage.setItem('patientId', d.patientId); localStorage.setItem('selPatientId', d.patientId); }
    localStorage.setItem('user', JSON.stringify(d.user));
    window.dispatchEvent(new Event('selPatientChanged'));
    navigate('/', { replace: true });
  };

  const sendOtp = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!email.trim()) { notify('Informe o e-mail para enviarmos o token.', { type: 'error' }); return; }
    setLoading(true);
    try {
      const r = await fetch(`${API_URL}/auth/otp/request`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim() }),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); notify(d.error || 'Não conseguimos enviar o token agora.', { type: 'error' }); return; }
      notify('Enviamos o token no seu e-mail (cheque também o spam).', { type: 'success' });
      setMode('otp');
    } catch { notify('Falha ao enviar o token.', { type: 'error' }); }
    finally { setLoading(false); }
  };

  const verifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const r = await fetch(`${API_URL}/auth/otp/verify`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim(), code, deviceId: getDeviceId() }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Token inválido');
      localStorage.setItem('token', d.token);
      if (d.patientId) localStorage.setItem('patientId', d.patientId);
      localStorage.setItem('user', JSON.stringify(d.user));
      notify('Bem-vindo! 🎉', { type: 'success' });
      navigate('/', { replace: true });
    } catch (err: any) { notify(err.message, { type: 'error' }); }
    finally { setLoading(false); }
  };

  return (
    <Shell>
      {/* Toggle Paciente / Médico — segmented control premium */}
      <Box sx={{ display: 'flex', p: 0.5, mb: 2, gap: 0.5, borderRadius: 99, bgcolor: 'action.hover', border: '1px solid', borderColor: 'divider' }}>
        <Button onClick={() => { setRole('paciente'); setMode('password'); }} startIcon={<I.User />} fullWidth
          sx={{ py: 1, borderRadius: 99, textTransform: 'none', fontWeight: 800, fontSize: 13.5, minHeight: 40, transition: 'all .2s',
            background: role === 'paciente' ? 'linear-gradient(180deg,#20b2aa,#009688)' : 'transparent',
            color: role === 'paciente' ? '#fff' : '#178f89',
            boxShadow: role === 'paciente' ? '0 4px 12px rgba(0,150,136,.3)' : 'none',
            '&:hover': { background: role === 'paciente' ? 'linear-gradient(180deg,#1ca39e,#00897b)' : 'rgba(32,178,170,.08)' } }}>
          Paciente
        </Button>
        <Button onClick={() => { setRole('medico'); setMode('password'); }} startIcon={<I.Doctor />} fullWidth
          sx={{ py: 1, borderRadius: 99, textTransform: 'none', fontWeight: 800, fontSize: 13.5, minHeight: 40, transition: 'all .2s',
            background: role === 'medico' ? 'linear-gradient(180deg,#20b2aa,#009688)' : 'transparent',
            color: role === 'medico' ? '#fff' : '#178f89',
            boxShadow: role === 'medico' ? '0 4px 12px rgba(0,150,136,.3)' : 'none',
            '&:hover': { background: role === 'medico' ? 'linear-gradient(180deg,#1ca39e,#00897b)' : 'rgba(32,178,170,.08)' } }}>
          Médico
        </Button>
      </Box>
      {mode === 'password' ? (
        <Box component="form" onSubmit={submit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField
            placeholder={role === 'medico' ? 'E-mail ou CRM' : 'E-mail'} type={role === 'medico' ? 'text' : 'email'} required autoComplete="username" value={email}
            onChange={(e) => setEmail(e.target.value)} sx={fieldSx}
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><I.Mail /></InputAdornment> } }}
          />
          <TextField
            placeholder="Senha" type={showPwd ? 'text' : 'password'} required autoComplete="current-password" value={pwd}
            onChange={(e) => setPwd(e.target.value)} sx={fieldSx}
            slotProps={{ input: {
              startAdornment: <InputAdornment position="start"><I.Lock /></InputAdornment>,
              endAdornment: <InputAdornment position="end"><IconButton onClick={() => setShowPwd((s) => !s)} edge="end" size="small" aria-label="Mostrar senha">{showPwd ? <I.Eye /> : <I.EyeOff />}</IconButton></InputAdornment>,
            } }}
          />
          <Box sx={{ textAlign: 'right', mt: -0.5 }}>
            <Link component="button" type="button" variant="body2" sx={{ fontSize: 12.5, color: '#00897b', fontWeight: 600 }} onClick={() => navigate('/recuperar-senha')}>Esqueci minha senha</Link>
          </Box>
          {bioReady && (
            <Button type="button" fullWidth variant="outlined" startIcon={<I.Shield />} onClick={bioLogin} sx={{ ...tokenBtnSx, borderColor: '#20b2aa', color: '#178f89', mb: 1, py: 1.2 }}>
              🔐 Entrar com biometria
            </Button>
          )}
          <Button type="submit" variant="contained" size="large" fullWidth disabled={loading} endIcon={<I.ArrowRight />} sx={primaryBtnSx}>
            {loading ? <CircularProgress size={22} color="inherit" /> : 'Entrar'}
          </Button>
          {/* "Entrar com token" oculto por ora (OTP segue acessível p/ ativação de conta). */}
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', mt: 1, color: 'text.secondary' }}>
            <Box sx={{ mt: '1px' }}><I.Shield /></Box>
            <Box>
              <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: 'text.primary' }}>Acesso seguro</Typography>
              <Typography sx={{ fontSize: 11.5, color: 'text.secondary', lineHeight: 1.4 }}>Seus dados são protegidos com criptografia e armazenados em servidores seguros.</Typography>
            </Box>
          </Box>
          <Typography align="center" sx={{ mt: 1, fontSize: 13 }}>
            {role === 'medico' ? 'Ainda não tem conta médica?' : 'Não tem conta?'} <Link component="button" type="button" sx={{ fontWeight: 700, color: '#00897b' }} onClick={() => navigate(role === 'medico' ? '/doctor?mode=register' : '/registrar')}>{role === 'medico' ? 'Cadastrar' : 'Criar agora'}</Link>
          </Typography>
        </Box>
      ) : (
        <Box component="form" onSubmit={verifyOtp} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography color="text.secondary" sx={{ fontSize: 13.5 }}>Enviamos um token para <strong>{email}</strong></Typography>
          <OtpInput value={code} onChange={setCode} />
          <Button type="submit" variant="contained" size="large" fullWidth disabled={loading} endIcon={<I.ArrowRight />} sx={primaryBtnSx}>
            {loading ? <CircularProgress size={22} color="inherit" /> : 'Verificar e entrar'}
          </Button>
          <Stack direction="row" spacing={2} justifyContent="center" sx={{ mt: 0.5 }}>
            <Link component="button" type="button" variant="body2" sx={{ fontSize: 12.5, color: '#00897b' }} onClick={() => sendOtp()}>Reenviar token</Link>
            <Link component="button" type="button" variant="body2" sx={{ fontSize: 12.5, color: 'text.secondary' }} onClick={() => setMode('password')}>Voltar (senha)</Link>
          </Stack>
        </Box>
      )}
      <MfaChallengeDialog open={!!mfaChallenge} challengeToken={mfaChallenge?.token || ''} account={mfaChallenge?.account} verifyUrl={mfaChallenge?.verifyUrl || ''} onSuccess={onMfaSuccess} onClose={() => setMfaChallenge(null)} />
    </Shell>
  );
};

export const RegisterPage = () => {
  const navigate = useNavigate();
  const notify = useNotify();
  const [name, setName] = useState('');
  const [cpf, setCpf] = useState('');
  const [email, setEmail] = useState('');
  const [pwd, setPwd] = useState('');
  const [referral, setReferral] = useState(() => new URLSearchParams(window.location.hash.split('?')[1] || '').get('ref') || '');
  const [invite] = useState(() => new URLSearchParams(window.location.hash.split('?')[1] || '').get('invite') || '');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [verifyEmail, setVerifyEmail] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [accepted, setAccepted] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accepted) { notify('Você precisa aceitar os Termos de Uso e a Política de Privacidade.', { type: 'error' }); return; }
    if (!isValidCpf(cpf)) { notify('Informe um CPF válido.', { type: 'error' }); return; }
    setLoading(true);
    try {
      const r = await fetch(`${API_URL}/auth/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), cpf, email: email.trim(), password: pwd, referral: referral.trim() || undefined, inviteToken: invite || undefined, deviceId: getDeviceId() }),
      });
      const d = await r.json();
      if (r.status === 409) { notify('Este e-mail já tem conta. Use sua senha, "entrar com token" ou "esqueci a senha".', { type: 'warning' }); navigate('/'); return; }
      if (r.status === 429) { notify('Muitas tentativas de cadastro deste dispositivo. Aguarde alguns minutos e tente novamente.', { type: 'warning' }); return; }
      if (!r.ok) throw new Error(d.message || d.error || 'Falha no cadastro');
      if (d.needsVerification) { setVerifyEmail(d.email); notify('Enviamos um código de ativação no seu e-mail (cheque o spam).', { type: 'success' }); return; }
      localStorage.setItem('token', d.token);
      if (d.patientId) { localStorage.setItem('patientId', d.patientId); localStorage.setItem('selPatientId', d.patientId); }
      localStorage.setItem('user', JSON.stringify(d.user));
      notify('Conta criada! Bem-vindo! 🎉', { type: 'success' });
      navigate('/', { replace: true });
    } catch (err: any) { notify(err.message, { type: 'error' }); }
    finally { setLoading(false); }
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const r = await fetch(`${API_URL}/auth/verify-email`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: verifyEmail, code: verifyCode }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Código inválido');
      localStorage.setItem('token', d.token);
      if (d.patientId) { localStorage.setItem('patientId', d.patientId); localStorage.setItem('selPatientId', d.patientId); }
      localStorage.setItem('user', JSON.stringify(d.user));
      notify('Conta ativada! Bem-vindo! 🎉', { type: 'success' });
      navigate('/', { replace: true });
    } catch (err: any) { notify(err.message, { type: 'error' }); }
    finally { setLoading(false); }
  };

  return (
    <Shell>
      {verifyEmail ? (
        <Box component="form" onSubmit={verify} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography sx={{ fontSize: 14, color: 'text.secondary' }}>Enviamos um código de ativação para <strong>{verifyEmail}</strong>. Digite abaixo pra ativar sua conta.</Typography>
          <OtpInput value={verifyCode} onChange={setVerifyCode} />
          <Button type="submit" variant="contained" size="large" fullWidth disabled={loading} endIcon={<I.ArrowRight />} sx={primaryBtnSx}>{loading ? <CircularProgress size={22} color="inherit" /> : 'Ativar conta'}</Button>
          <Link component="button" type="button" variant="body2" sx={{ fontSize: 12.5, color: 'text.secondary' }} onClick={() => setVerifyEmail(null)}>Voltar ao cadastro</Link>
        </Box>
      ) : (
        <>
      <Box component="form" onSubmit={submit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography sx={{ fontSize: 14, color: 'text.secondary' }}>Crie sua conta gratuita em segundos.</Typography>
        <TextField placeholder="Seu nome" required value={name} onChange={(e) => setName(e.target.value)} sx={fieldSx}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><I.Person /></InputAdornment> } }} />
        <TextField placeholder="CPF" required value={cpf} onChange={(e) => setCpf(formatCpf(e.target.value))} sx={fieldSx} error={!!cpf && cpf.length === 14 && !isValidCpf(cpf)} helperText={!!cpf && cpf.length === 14 && !isValidCpf(cpf) ? 'CPF inválido.' : 'Usado para confirmar que o exame pertence ao perfil.'}
          slotProps={{ input: { inputMode: 'numeric', startAdornment: <InputAdornment position="start"><I.Shield /></InputAdornment> } }} />
        <TextField placeholder="E-mail" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} sx={fieldSx}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><I.Mail /></InputAdornment> } }} />
        <TextField placeholder="Senha (mín. 6 caracteres)" type={showPwd ? 'text' : 'password'} required value={pwd} onChange={(e) => setPwd(e.target.value)} sx={fieldSx}
          slotProps={{ input: {
            startAdornment: <InputAdornment position="start"><I.Lock /></InputAdornment>,
            endAdornment: <InputAdornment position="end"><IconButton onClick={() => setShowPwd((s) => !s)} edge="end" size="small">{showPwd ? <I.Eye /> : <I.EyeOff />}</IconButton></InputAdornment>,
          } }} />
        {referral ? (
          <Box sx={{ p: 1, borderRadius: 2, bgcolor: 'rgba(32,178,170,0.10)', border: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography sx={{ fontSize: 12, color: '#178f89', fontWeight: 700 }}>🎁 Indicado por <strong>{referral}</strong> — você ganha +30 créditos!</Typography>
          </Box>
        ) : (
          <TextField placeholder="Código de indicação (opcional)" value={referral} onChange={(e) => setReferral(e.target.value.toUpperCase())} sx={fieldSx} />
        )}
        <FormControlLabel
          control={<Checkbox checked={accepted} onChange={(e) => setAccepted(e.target.checked)} size="small" sx={{ color: '#20b2aa', '&.Mui-checked': { color: '#20b2aa' } }} />}
          label={<Typography sx={{ fontSize: 12.5, color: 'text.secondary' }}>Li e aceito os <Link component="a" href="#/termos" target="_blank" rel="noopener" sx={{ color: '#00897b', fontWeight: 700 }}>Termos de Uso e Política de Privacidade</Link>.</Typography>}
          sx={{ alignItems: 'flex-start', m: 0, '& .MuiCheckbox-root': { pt: 0.5 } }}
        />
        <Button type="submit" variant="contained" size="large" fullWidth disabled={loading} endIcon={<I.ArrowRight />} sx={primaryBtnSx}>
          {loading ? <CircularProgress size={22} color="inherit" /> : 'Criar conta'}
        </Button>
      </Box>
      <Typography align="center" sx={{ mt: 2, fontSize: 13 }}>
        Já tem conta? <Link component="button" type="button" sx={{ fontWeight: 700, color: '#00897b' }} onClick={() => navigate('/')}>Entrar</Link>
      </Typography>
        </>
      )}
    </Shell>
  );
};

export const ResetPage = () => {
  const navigate = useNavigate();
  const notify = useNotify();
  const hashQuery = window.location.hash.split('?')[1] || '';
  const params = new URLSearchParams(hashQuery || window.location.search);
  const token = params.get('token') || '';
  const [pwd, setPwd] = useState('');
  const [email, setEmail] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState<'request' | 'reset' | 'done'>(token ? 'reset' : 'request');

  const requestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch(`${API_URL}/auth/forgot`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      notify('Se o e-mail existir, enviamos o link de redefinição.', { type: 'success' });
      setStage('done');
    } finally { setLoading(false); }
  };

  const doReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const r = await fetch(`${API_URL}/auth/reset`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password: pwd }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Token inválido');
      notify('Senha redefinida! Faça login.', { type: 'success' });
      navigate('/');
    } catch (err: any) { notify(err.message, { type: 'error' }); }
    finally { setLoading(false); }
  };

  return (
    <Shell>
      {stage === 'done' ? (
        <Box sx={{ py: 2, textAlign: 'center' }}>
          <Typography sx={{ mb: 1 }}>📩 Se o e-mail existir, enviamos um link.</Typography>
          <Typography variant="body2" color="text.secondary">Abra o e-mail e clique no link para criar uma nova senha. Confira o <strong>spam</strong>.</Typography>
        </Box>
      ) : stage === 'reset' ? (
        <Box component="form" onSubmit={doReset} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField placeholder="Nova senha (mín. 6)" type={showPwd ? 'text' : 'password'} required value={pwd} onChange={(e) => setPwd(e.target.value)} sx={fieldSx}
            slotProps={{ input: {
              startAdornment: <InputAdornment position="start"><I.Lock /></InputAdornment>,
              endAdornment: <InputAdornment position="end"><IconButton onClick={() => setShowPwd((s) => !s)} edge="end" size="small">{showPwd ? <I.Eye /> : <I.EyeOff />}</IconButton></InputAdornment>,
            } }} />
          <Button type="submit" variant="contained" size="large" fullWidth disabled={loading} sx={primaryBtnSx}>{loading ? <CircularProgress size={22} color="inherit" /> : 'Redefinir senha'}</Button>
        </Box>
      ) : (
        <Box component="form" onSubmit={requestReset} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography sx={{ fontSize: 14, color: 'text.secondary' }}>Informe seu e-mail e enviaremos um link para redefinir a senha.</Typography>
          <TextField placeholder="Seu e-mail" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} sx={fieldSx}
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><I.Mail /></InputAdornment> } }} />
          <Button type="submit" variant="contained" size="large" fullWidth disabled={loading} endIcon={<I.ArrowRight />} sx={primaryBtnSx}>{loading ? <CircularProgress size={22} color="inherit" /> : 'Enviar link'}</Button>
        </Box>
      )}
      <Typography align="center" sx={{ mt: 2, fontSize: 13 }}>
        <Link component="button" type="button" sx={{ color: 'text.secondary' }} onClick={() => navigate('/')}>Voltar ao login</Link>
      </Typography>
    </Shell>
  );
};
