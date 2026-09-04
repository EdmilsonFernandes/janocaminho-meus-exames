import { useState, useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLogin, useNotify, useTranslate } from 'react-admin';
import { GoogleLogin } from '@react-oauth/google';
import { Box, Typography, Button, Link, CircularProgress, Stack, TextField, InputAdornment, IconButton, Checkbox, FormControlLabel } from '@mui/material';
import { keyframes } from '@mui/material/styles';
import { DrExame } from '../components/DrExame';
import { API_URL, fetchPublicConfig } from '../config';
import { Capacitor } from '@capacitor/core';
import { nativeGoogleLogin } from '../utils/nativeGoogleAuth';
import { OtpInput } from '../components/OtpInput';
import { MfaChallengeDialog } from '../components/mfa/MfaChallengeDialog';
import { BiometricService, getDeviceId } from '../components/BiometricService';
import { formatCpf, isValidCpf } from '../utils/cpf';

/* ---------- ícones inline (sem dependência de @mui/icons-material) ---------- */
const I = {
  Person: (p?: any) => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="8" r="4" /><path d="M4 20c0-3.3 3.6-5 8-5s8 1.7 8 5" /></svg>),
  Mail: (p?: any) => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>),
  Lock: (p?: any) => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>),
  Eye: (p?: any) => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>),
  EyeOff: (p?: any) => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M3 3l18 18" /><path d="M10.6 5.1A10.9 10.9 0 0 1 12 5c6.5 0 10 7 10 7a18 18 0 0 1-3.2 4M6.6 6.6A18 18 0 0 0 2 12s3.5 7 10 7a10.8 10.8 0 0 0 5.4-1.5" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>),
  ArrowRight: (p?: any) => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M5 12h14M13 6l6 6-6 6" /></svg>),
  Key: (p?: any) => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="8" cy="15" r="4" /><path d="M10.8 12.2 21 2m-4 4 3 3m-6 1 3 3" /></svg>),
  Shield: (p?: any) => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#178f89" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3Z" /><path d="m9 12 2 2 4-4" /></svg>),
  Doctor: (p?: any) => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M5 3v5a4 4 0 0 0 8 0V3" /><path d="M9 12v2.5A5.5 5.5 0 0 0 20 14.5V13" /><circle cx="20" cy="11" r="2" /></svg>),
  User: (p?: any) => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="8" r="4" /><path d="M4 20c0-3.3 3.6-5 8-5s8 1.7 8 5" /></svg>),
  GoogleG: (p?: any) => (<svg width="20" height="20" viewBox="0 0 48 48" {...p}><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.5 2.6 30.1 0 24 0 14.6 0 6.4 5.4 2.6 13.3l7.8 6.1C12.2 13.7 17.6 9.5 24 9.5z" /><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.5 3-2.2 5.5-4.7 7.2l7.3 5.7C43.9 38 46.5 31.8 46.5 24.5z" /><path fill="#FBBC05" d="M10.4 28.6c-.5-1.4-.7-2.9-.7-4.6s.3-3.2.7-4.6l-7.8-6.1C1.6 16.5 0 20 0 24s1.6 7.5 2.6 8.7l7.8-6.1z" /><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.3-5.7c-2 1.4-4.6 2.2-8.6 2.2-6.4 0-11.8-4.2-13.6-9.9l-7.8 6.1C6.4 42.6 14.6 48 24 48z" /></svg>),
};

// Micro-animações premium: mascote "respira" (vivo, não estático) + card entra suave.
const breathe = keyframes`0%,100%{transform:scale(1);box-shadow:0 0 0 0 rgba(32,178,170,0)}50%{transform:scale(1.035);box-shadow:0 0 0 7px rgba(32,178,170,.10)}`;
const cardIn = keyframes`from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}`;

/* Contraste WCAG: o teal assinatura #20b2aa fica em aura/mascote/acentos; superfícies que
 * CARREGAM TEXTO BRANCO usam o intervalo escuro da mesma família (#178f89 ≈ 5.3:1, #0f766e ≈ 6.6:1).
 * Links em #178f89 (5.3:1) substituem #178f89 (4.3:1, reprovava por pouco). */
const CTA_BG = 'linear-gradient(135deg, #178f89, #0f766e)';
const CTA_BG_HOVER = 'linear-gradient(135deg, #006a5f, #00564e)';
const LINK = '#178f89';
/** Eco editorial da landing v2: subtítulo-claim em Instrument Serif itálica (única marca da voz na tela de login). */
const SERIF_I = { fontFamily: "'Instrument Serif', Georgia, serif", fontStyle: 'italic', fontWeight: 400 } as const;

/** Card centralizado sobre fundo teal com profundidade (radial + linear). Mascote respirando,
 *  card com fade-in, sombra/glow teal — feel premium clínico (sem poluir com marketing).
 *  100dvh + margin:auto (em vez de align-center): quando o card for mais alto que a viewport
 *  (teclado aberto em tela curta), a página rola sem cortar o topo. */
const Shell = ({ children, subtitle }: { children: ReactNode; subtitle?: string }) => {
  const translate = useTranslate();
  return (
  <Box sx={{ minHeight: '100dvh', display: 'flex', p: 2,
    background: 'radial-gradient(circle at 50% 18%, rgba(32,178,170,.20), rgba(32,178,170,.05) 55%, transparent 80%), linear-gradient(160deg, rgba(32,178,170,.10), rgba(32,178,170,.02))' }}>
    <Box sx={{ width: '100%', maxWidth: 410, m: 'auto', bgcolor: 'background.paper', borderRadius: '16px',
      boxShadow: '0 24px 60px rgba(0,80,70,.14), 0 2px 8px rgba(0,80,70,.06)',
      border: '1px solid', borderColor: 'rgba(32,178,170,.10)',
      p: { xs: 3, sm: 4.5 }, animation: `${cardIn} .42s cubic-bezier(.16,1,.3,1) both` }}>
      <Stack alignItems="center" spacing={1.25} sx={{ mb: 3.5 }}>
        <Box sx={{ width: 86, height: 86, borderRadius: '50%',
          background: 'radial-gradient(circle at 50% 40%, rgba(32,178,170,.24), rgba(32,178,170,.05) 72%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: `${breathe} 3.6s ease-in-out infinite` }}>
          <DrExame size={60} sx={{ borderRadius: '50%' }} />
        </Box>
        <Box sx={{ textAlign: 'center', mt: 0.5 }}>
          <Typography sx={{ fontWeight: 800, color: 'text.primary', fontFamily: '"Poppins",sans-serif', letterSpacing: '-0.02em', lineHeight: 1.15, fontSize: { xs: 24, sm: 26 } }}>Meus Exames</Typography>
          <Typography sx={{ ...SERIF_I, fontSize: 15, color: '#178f89', mt: 0.25 }}>{subtitle ?? translate('auth.subtitle')}</Typography>
        </Box>
      </Stack>
      {children}
      <Box sx={{ mt: 3, p: 1.25, borderRadius: '12px', bgcolor: 'background.default', border: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
          <Box sx={{ mt: '2px', flexShrink: 0 }}><I.Shield /></Box>
          <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'text.primary', lineHeight: 1.45 }}>{translate('auth.lgpd')}</Typography>
        </Box>
        <Typography sx={{ fontSize: 12, color: 'text.secondary', lineHeight: 1.45, mt: 0.75 }}>
          <strong>{translate('auth.disclaimer_strong')}</strong> {translate('auth.disclaimer')}
        </Typography>
      </Box>
    </Box>
  </Box>
  );
};

const fieldSx = {
  '& .MuiOutlinedInput-root': {
    borderRadius: '12px', bgcolor: 'background.paper',
    '& fieldset': { borderColor: 'divider' },
    '&:hover fieldset': { borderColor: '#7fcfc6' },
    '&.Mui-focused fieldset': { borderColor: '#178f89', borderWidth: '1.5px' },
  },
} as const;

const primaryBtnSx = {
  borderRadius: '12px', py: 1.35, fontWeight: 800, textTransform: 'none', fontSize: 16,
  background: CTA_BG, boxShadow: '0 6px 18px rgba(0,105,92,.32)',
  '&:hover': { background: CTA_BG_HOVER, boxShadow: '0 8px 22px rgba(0,105,92,.4)' },
} as const;

const tokenBtnSx = {
  borderRadius: '12px', py: 1.2, fontWeight: 700, textTransform: 'none', fontSize: 15, color: LINK, borderColor: '#178f89',
  '&:hover': { borderColor: '#178f89', bgcolor: 'rgba(0,121,107,.06)' },
} as const;

export const LoginPage = ({ fixedRole }: { fixedRole?: 'paciente' | 'medico' }) => {
  const login = useLogin();
  const notify = useNotify();
  const translate = useTranslate();
  const navigate = useNavigate();
  // Deep-link pós-login: fluxos públicos (ex.: painel da API sem login) guardam o destino em
  // dxAfterLogin — o login devolve o usuário PRA ONDE ele estava indo, não pro dashboard.
  const afterLogin = () => {
    let dest = '/';
    try {
      const d = localStorage.getItem('dxAfterLogin');
      if (d) localStorage.removeItem('dxAfterLogin');
      if (d && d.startsWith('/') && !d.startsWith('//')) dest = d;
    } catch { /* */ }
    navigate(dest, { replace: true });
  };
  const [email, setEmail] = useState('');
  const [pwd, setPwd] = useState('');
  const [code, setCode] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [mode, setMode] = useState<'password' | 'otp'>('password');
  const [loading, setLoading] = useState(false);
  const [role, setRole] = useState<'paciente' | 'medico'>(fixedRole ?? (new URLSearchParams(window.location.hash.split('?')[1] || '').get('role') === 'medico' ? 'medico' : 'paciente'));
  const [errs, setErrs] = useState<{ email?: string; pwd?: string }>({});
  const [capsOn, setCapsOn] = useState(false);
  const [showForm, setShowForm] = useState(false); // biometria primeiro: form de senha começa recolhido quando há enrolment
  const [mfaChallenge, setMfaChallenge] = useState<{ token: string; account?: string; verifyUrl: string; isDoctor: boolean } | null>(null);
  const [invite] = useState(() => new URLSearchParams(window.location.hash.split('?')[1] || '').get('invite') || '');
  // Quick-login só aparece se a aba atual bate com o role matriculado (paciente ≠ médico)
  const enrolledRole = BiometricService.getEnrolledRole();
  const bioReady = BiometricService.isSupported() && BiometricService.hasEnrollment() && enrolledRole === (role === 'medico' ? 'doctor' : 'patient');

  const trackCaps = (e: React.KeyboardEvent) => { try { setCapsOn(!!e.getModifierState?.('CapsLock')); } catch { /* alguns WebView não expõem */ } };

  const bioLogin = async () => {
    setLoading(true);
    try {
      const r = await BiometricService.loginWithBiometric();
      if (!r) { notify(translate('auth.bio_cancel'), { type: 'error' }); return; }
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
            afterLogin();
          } else {
            // 401 = token do Keystore expirou. Limpa pra não reusar; usuário re-loga por senha.
            localStorage.removeItem('token');
            BiometricService.forget();
            notify(translate('auth.bio_expired'), { type: 'warning' });
            setShowForm(true); // biometria inutilizável → mostra o caminho de senha
          }
        } catch {
          localStorage.removeItem('token');
          notify(translate('auth.bio_fail'), { type: 'error' });
        }
      }
    } finally { setLoading(false); }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Validação INLINE antes de tudo — erro mora no campo, não num toast que some
    const nextErrs: { email?: string; pwd?: string } = {};
    if (!email.trim()) nextErrs.email = translate('auth.err_email');
    if (!pwd) nextErrs.pwd = translate('auth.err_pwd');
    if (nextErrs.email || nextErrs.pwd) { setErrs(nextErrs); return; }
    setErrs({});
    setLoading(true);
    if (role === 'medico') {
      try {
        const r = await fetch(`${API_URL}/doctor/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim(), password: pwd }) });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Falha');
        if (d.mfaRequired) { setMfaChallenge({ token: d.challengeToken, account: d.account, verifyUrl: `${API_URL}/doctor/mfa/verify`, isDoctor: true }); return; }
        localStorage.setItem('doctorToken', d.token);
        localStorage.setItem('doctorPhotoToken', d.token); // token ESTÁVEL p/ cache de fotos (não rotaciona c/ a sessão)
        navigate('/doctor');
      } catch (err: any) { setErrs({ pwd: err.message }); }
      finally { setLoading(false); }
      return;
    }
    try { await login({ username: email.trim(), password: pwd, inviteToken: invite || undefined }); }
    catch (e: any) {
      if (e?.mfaRequired) { setMfaChallenge({ token: e.challengeToken, account: e.account, verifyUrl: `${API_URL}/auth/mfa/verify`, isDoctor: false }); return; }
      // Conta não verificada → redireciona pra tela de ativação por e-mail
      if (e?.needsVerification) { notify(translate('auth.otp_sent'), { type: 'warning' }); setMode('otp'); setLoading(false); return; }
      // Conta bloqueada → mensagem amigável (i18n) de contato com suporte (mesmo se errou a senha).
      if (e?.blocked) { notify(translate('auth.errors.blocked'), { type: 'error' }); setLoading(false); return; }
      setErrs({ pwd: translate('auth.err_wrong') });
    }
    finally { setLoading(false); }
  };

  const onMfaSuccess = (d: any) => {
    setMfaChallenge(null);
    if (mfaChallenge?.isDoctor) { localStorage.setItem('doctorToken', d.token); localStorage.setItem('doctorPhotoToken', d.token); navigate('/doctor'); return; }
    localStorage.setItem('token', d.token);
    if (d.patientId) { localStorage.setItem('patientId', d.patientId); localStorage.setItem('selPatientId', d.patientId); }
    localStorage.setItem('user', JSON.stringify(d.user));
    window.dispatchEvent(new Event('selPatientChanged'));
    afterLogin();
  };

  const sendOtp = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!email.trim()) { setErrs({ email: translate('auth.otp_need_email') }); return; }
    setLoading(true);
    try {
      const r = await fetch(`${API_URL}/auth/otp/request`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim() }),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); notify(d.error || translate('auth.otp_send_fail'), { type: 'error' }); return; }
      notify(translate('auth.otp_sent'), { type: 'success' });
      setMode('otp');
    } catch { notify(translate('auth.otp_send_fail2'), { type: 'error' }); }
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
      notify(translate('auth.welcome'), { type: 'success' });
      afterLogin();
    } catch (err: any) { notify(err.message, { type: 'error' }); }
    finally { setLoading(false); }
  };

  // Google Sign-in — troca o idToken (web GIS ou nativo Capgo) pela sessão do app.
  // Mesmo /auth/google p/ ambas as plataformas; o server valida o JWT id_token igual.
  // SÓ para paciente: médico autentica por CRM (o Google não valida CRM).
  const exchangeGoogleCredential = async (idToken: string, isDoctor = false) => {
    try {
      setLoading(true);
      const endpoint = isDoctor ? `${API_URL}/doctor/google` : `${API_URL}/auth/google`;
      const r = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: idToken }),
      });
      const d = await r.json();
      if (d.token) {
        if (isDoctor) {
          localStorage.setItem('doctorToken', d.token);
          localStorage.setItem('doctorPhotoToken', d.token);
          navigate('/doctor');
        } else {
          localStorage.setItem('token', d.token);
          if (d.user) localStorage.setItem('user', JSON.stringify(d.user));
          if (d.patientId) { localStorage.setItem('patientId', d.patientId); localStorage.setItem('selPatientId', d.patientId); }
          window.dispatchEvent(new Event('selPatientChanged'));
          navigate('/', { replace: true });
        }
      }
      else { notify(d.error || translate('auth.google_fail'), { type: 'error' }); }
    } catch { notify(translate('auth.conn_fail'), { type: 'error' }); }
    finally { setLoading(false); }
  };

  const handleNativeGoogle = async () => {
    const tok = await nativeGoogleLogin();
    if (!tok) { notify(translate('auth.google_fail'), { type: 'error' }); return; }
    await exchangeGoogleCredential(tok);
  };

  return (
    <Shell subtitle={role === 'medico' ? translate('auth.doctor_portal') : undefined}>
      {mode === 'password' ? (
        <>
        {/* Toggle Paciente / Médico — segmented control. Ativo CHAPADO em #178f89 (branco
            5.3:1 ✓ WCAG, SEM gradiente/shadow) para não disputar o posto de ação primária
            com o botão Entrar — era o defeito real do toggle antigo. */}
        <Box sx={{ display: 'flex', p: 0.5, mb: 2, gap: 0.5, borderRadius: '999px', bgcolor: 'action.hover', border: '1px solid', borderColor: 'divider' }}>
          <Button onClick={() => { setRole('paciente'); setErrs({}); }} startIcon={<I.User />} fullWidth
            sx={{ py: 1, borderRadius: '999px', textTransform: 'none', fontWeight: 800, fontSize: 14, minHeight: 40, transition: 'all .2s',
              background: role === 'paciente' ? '#178f89' : 'transparent',
              color: role === 'paciente' ? '#fff' : '#0e6f68',
              '&:hover': { background: role === 'paciente' ? '#0f766e' : 'rgba(0,121,107,.08)' } }}>
            Paciente
          </Button>
          <Button onClick={() => { setRole('medico'); setErrs({}); }} startIcon={<I.Doctor />} fullWidth
            sx={{ py: 1, borderRadius: '999px', textTransform: 'none', fontWeight: 800, fontSize: 14, minHeight: 40, transition: 'all .2s',
              background: role === 'medico' ? '#178f89' : 'transparent',
              color: role === 'medico' ? '#fff' : '#0e6f68',
              '&:hover': { background: role === 'medico' ? '#0f766e' : 'rgba(0,121,107,.08)' } }}>
            Médico
          </Button>
        </Box>
        {bioReady && !showForm ? (
          /* Caminho de zero-fricção (padrão app de banco): com biometria matriculada, ela É a
           * ação primária; o form de senha fica a um toque — não na frente do usuário. */
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Button variant="contained" size="large" fullWidth startIcon={<I.Shield />} disabled={loading} onClick={bioLogin} sx={primaryBtnSx}>
              {loading ? <CircularProgress size={22} color="inherit" /> : translate('auth.biometry_cta')}
            </Button>
            <Button type="button" variant="outlined" size="large" fullWidth startIcon={<I.Lock />} onClick={() => setShowForm(true)} sx={tokenBtnSx}>
              {translate('auth.use_password')}
            </Button>
          </Box>
        ) : (
        <Box component="form" noValidate onSubmit={submit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField
            label={role === 'medico' ? translate('auth.email_or_crm') : translate('auth.email')} type={role === 'medico' ? 'text' : 'email'} required autoComplete="username" value={email}
            error={!!errs.email} helperText={errs.email ?? (role === 'medico' ? translate('auth.crm_hint') : undefined)}
            onChange={(e) => { setEmail(e.target.value); if (errs.email) setErrs({ ...errs, email: undefined }); }} sx={fieldSx}
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><I.Mail /></InputAdornment> } }}
          />
          <TextField
            label={translate('auth.password')} type={showPwd ? 'text' : 'password'} required autoComplete="current-password" value={pwd}
            error={!!errs.pwd}
            helperText={capsOn ? translate('auth.capslock') : errs.pwd ?? undefined}
            onChange={(e) => { setPwd(e.target.value); if (errs.pwd) setErrs({ ...errs, pwd: undefined }); }}
            onKeyDown={trackCaps} onKeyUp={trackCaps} sx={fieldSx}
            slotProps={{ input: {
              startAdornment: <InputAdornment position="start"><I.Lock /></InputAdornment>,
              endAdornment: <InputAdornment position="end"><IconButton onClick={() => setShowPwd((s) => !s)} edge="end" size="small" aria-label={translate('auth.show_password')}>{showPwd ? <I.EyeOff /> : <I.Eye />}</IconButton></InputAdornment>,
            } }}
          />
          <Box sx={{ textAlign: 'right', mt: -0.5 }}>
            <Link component="button" type="button" variant="body2" sx={{ fontSize: 13, color: LINK, fontWeight: 600 }} onClick={() => navigate('/recuperar-senha')}>{translate('auth.forgot')}</Link>
          </Box>
          {bioReady && (
            <Button type="button" fullWidth variant="outlined" startIcon={<I.Shield />} onClick={bioLogin} disabled={loading} sx={tokenBtnSx}>
              {translate('auth.biometry_cta')}
            </Button>
          )}
          <Button type="submit" variant="contained" size="large" fullWidth disabled={loading} endIcon={<I.ArrowRight />} sx={primaryBtnSx}>
            {loading ? <CircularProgress size={22} color="inherit" /> : translate('auth.signin')}
          </Button>
          {/* Google Sign-in — só paciente (médico precisa de CRM, Google não valida) e só se
              VITE_GOOGLE_CLIENT_ID configurado. No APK (WebView) o botão GIS não renderiza
              (origem https://localhost não autorizada) → plugin nativo Capgo; no browser, GIS web. */}
          {role === 'paciente' && import.meta.env.VITE_GOOGLE_CLIENT_ID && (
            <>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, my: 0.5 }}>
                <Box sx={{ flex: 1, height: 1, bgcolor: 'divider' }} />
                <Typography variant="caption" color="text.secondary">ou</Typography>
                <Box sx={{ flex: 1, height: 1, bgcolor: 'divider' }} />
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                {Capacitor.isNativePlatform() ? (
                  <Button
                    type="button" variant="outlined" size="large"
                    startIcon={<I.GoogleG />} onClick={() => handleNativeGoogle()} disabled={loading}
                    sx={{ borderRadius: '12px', borderColor: 'divider', color: 'text.primary', textTransform: 'none', fontWeight: 600, py: 1.2, width: '100%', maxWidth: 320 }}
                  >
                    {translate('auth.google')}
                  </Button>
                ) : (
                  <GoogleLogin
                    onSuccess={async (cred) => { if (cred.credential) await exchangeGoogleCredential(cred.credential); }}
                    onError={() => notify(translate('auth.google_fail'), { type: 'error' })}
                    text="continue_with" shape="pill" size="large"
                  />
                )}
              </Box>
            </>
          )}
          <Typography align="center" sx={{ mt: 1, fontSize: 13 }}>
            {translate('auth.no_account')} <Link component="button" type="button" sx={{ fontWeight: 700, color: LINK }} onClick={() => navigate(role === 'medico' ? '/doctor?mode=register' : '/registrar')}>{translate('auth.create_account')}</Link>
          </Typography>
        </Box>
        )}
        </>
      ) : (
        <Box component="form" onSubmit={verifyOtp} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography color="text.secondary" sx={{ fontSize: 14 }}>{translate('auth.otp_sent_to')} <strong>{email}</strong></Typography>
          <OtpInput value={code} onChange={setCode} />
          <Button type="submit" variant="contained" size="large" fullWidth disabled={loading} endIcon={<I.ArrowRight />} sx={primaryBtnSx}>
            {loading ? <CircularProgress size={22} color="inherit" /> : translate('auth.otp_verify')}
          </Button>
          <Stack direction="row" spacing={2} justifyContent="center" sx={{ mt: 0.5 }}>
            <Link component="button" type="button" variant="body2" sx={{ fontSize: 13, color: LINK }} onClick={() => sendOtp()}>{translate('auth.otp_resend')}</Link>
            <Link component="button" type="button" variant="body2" sx={{ fontSize: 13, color: 'text.secondary' }} onClick={() => setMode('password')}>{translate('auth.otp_back')}</Link>
          </Stack>
        </Box>
      )}
      <MfaChallengeDialog open={!!mfaChallenge} challengeToken={mfaChallenge?.token || ''} account={mfaChallenge?.account} verifyUrl={mfaChallenge?.verifyUrl || ''} onSuccess={onMfaSuccess} onClose={() => setMfaChallenge(null)} />
    </Shell>
  );
};

export const RegisterPage = () => {
  const navigate = useNavigate();
  const translate = useTranslate();
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
  const [refBonus, setRefBonus] = useState(10);
  useEffect(() => { fetchPublicConfig().then((c) => setRefBonus(c.referralBonus)); }, []);

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
          <Link component="button" type="button" variant="body2" sx={{ fontSize: 13, color: 'text.secondary' }} onClick={() => setVerifyEmail(null)}>Voltar ao cadastro</Link>
        </Box>
      ) : (
        <>
      <Box component="form" onSubmit={submit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography sx={{ fontSize: 14, color: 'text.secondary' }}>Crie sua conta gratuita em segundos.</Typography>
        <TextField label="Seu nome" required value={name} autoComplete="name" onChange={(e) => setName(e.target.value)} sx={fieldSx}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><I.Person /></InputAdornment> } }} />
        <TextField label="CPF" required value={cpf} autoComplete="off" onChange={(e) => setCpf(formatCpf(e.target.value))} sx={fieldSx} error={!!cpf && cpf.length === 14 && !isValidCpf(cpf)} helperText={!!cpf && cpf.length === 14 && !isValidCpf(cpf) ? 'CPF inválido.' : 'Usado para confirmar que o exame pertence ao perfil.'}
          slotProps={{ input: { inputMode: 'numeric', startAdornment: <InputAdornment position="start"><I.Shield /></InputAdornment> } }} />
        <TextField label="E-mail" type="email" required value={email} autoComplete="email" onChange={(e) => setEmail(e.target.value)} sx={fieldSx}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><I.Mail /></InputAdornment> } }} />
        <TextField label="Senha (mín. 6 caracteres)" type={showPwd ? 'text' : 'password'} required value={pwd} autoComplete="new-password" onChange={(e) => setPwd(e.target.value)} sx={fieldSx}
          slotProps={{ input: {
            startAdornment: <InputAdornment position="start"><I.Lock /></InputAdornment>,
            endAdornment: <InputAdornment position="end"><IconButton onClick={() => setShowPwd((s) => !s)} edge="end" size="small" aria-label={translate('auth.show_password')}>{showPwd ? <I.Eye /> : <I.EyeOff />}</IconButton></InputAdornment>,
          } }} />
        {referral ? (
          <Box sx={{ p: 1, borderRadius: '12px', bgcolor: 'rgba(32,178,170,0.10)', border: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography sx={{ fontSize: 12, color: '#178f89', fontWeight: 700 }}>🎁 Indicado por <strong>{referral}</strong>: você ganha +{refBonus} créditos!</Typography>
          </Box>
        ) : (
          <TextField label="Código de indicação (opcional)" value={referral} onChange={(e) => setReferral(e.target.value.toUpperCase())} sx={fieldSx} />
        )}
        <FormControlLabel
          control={<Checkbox checked={accepted} onChange={(e) => setAccepted(e.target.checked)} size="small" sx={{ color: '#20b2aa', '&.Mui-checked': { color: '#20b2aa' } }} />}
          label={<Typography sx={{ fontSize: 13, color: 'text.secondary' }}>Li e aceito os <Link component="a" href="#/termos" target="_blank" rel="noopener" sx={{ color: LINK, fontWeight: 700 }}>Termos de Uso e Política de Privacidade</Link>.</Typography>}
          sx={{ alignItems: 'flex-start', m: 0, '& .MuiCheckbox-root': { pt: 0.5 } }}
        />
        <Button type="submit" variant="contained" size="large" fullWidth disabled={loading} endIcon={<I.ArrowRight />} sx={primaryBtnSx}>
          {loading ? <CircularProgress size={22} color="inherit" /> : 'Criar conta'}
        </Button>
      </Box>
      <Typography align="center" sx={{ mt: 2, fontSize: 13 }}>
        {translate('auth.have_account')} <Link component="button" type="button" sx={{ fontWeight: 700, color: LINK }} onClick={() => navigate('/')}>{translate('auth.signin')}</Link>
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
          <TextField label="Nova senha (mín. 6)" type={showPwd ? 'text' : 'password'} required value={pwd} autoComplete="new-password" onChange={(e) => setPwd(e.target.value)} sx={fieldSx}
            slotProps={{ input: {
              startAdornment: <InputAdornment position="start"><I.Lock /></InputAdornment>,
              endAdornment: <InputAdornment position="end"><IconButton onClick={() => setShowPwd((s) => !s)} edge="end" size="small" aria-label="Mostrar senha">{showPwd ? <I.Eye /> : <I.EyeOff />}</IconButton></InputAdornment>,
            } }} />
          <Button type="submit" variant="contained" size="large" fullWidth disabled={loading} sx={primaryBtnSx}>{loading ? <CircularProgress size={22} color="inherit" /> : 'Redefinir senha'}</Button>
        </Box>
      ) : (
        <Box component="form" onSubmit={requestReset} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography sx={{ fontSize: 14, color: 'text.secondary' }}>Informe seu e-mail e enviaremos um link para redefinir a senha.</Typography>
          <TextField label="Seu e-mail" type="email" required value={email} autoComplete="email" onChange={(e) => setEmail(e.target.value)} sx={fieldSx}
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
