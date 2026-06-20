import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLogin, useNotify } from 'react-admin';
import { Box, Typography, Button, Link, CircularProgress, Stack, TextField, InputAdornment, IconButton } from '@mui/material';
import { DrExame } from '../components/DrExame';
import { API_URL } from '../config';
import { OtpInput } from '../components/OtpInput';

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
};

/** Card centralizado sobre fundo menta (layout loginIdea). */
const Shell = ({ children }: { children: ReactNode }) => (
  <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2, background: 'linear-gradient(135deg, #e6f7f5, #d4f0ec)' }}>
    <Box sx={{ width: '100%', maxWidth: 400, bgcolor: '#fff', borderRadius: '16px', boxShadow: '0 10px 40px rgba(0,80,70,.10)', p: { xs: 3, sm: 4 } }}>
      <Stack alignItems="center" spacing={1} sx={{ mb: 3 }}>
        <Box sx={{ width: 78, height: 78, borderRadius: '50%', bgcolor: '#e0f2f1', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'inset 0 0 0 1px rgba(32,178,170,.15)' }}>
          <DrExame size={56} sx={{ borderRadius: '50%' }} />
        </Box>
        <Box sx={{ textAlign: 'center' }}>
          <Typography variant="h5" sx={{ fontWeight: 800, color: '#0f3d3a', fontFamily: 'Poppins, sans-serif', lineHeight: 1.2 }}>Meus Exames</Typography>
          <Typography sx={{ fontSize: 13, color: '#757575' }}>Seu assistente de saúde com IA</Typography>
        </Box>
      </Stack>
      {children}
      <Box sx={{ mt: 3, display: 'flex', gap: 1, alignItems: 'flex-start', p: 1.25, borderRadius: 2, background: '#f0f9f7', border: '1px solid #d6ece8' }}>
        <Box sx={{ fontSize: 16, lineHeight: 1.3, flexShrink: 0 }}>🩺</Box>
        <Typography sx={{ fontSize: 11.5, color: '#4a6b66', lineHeight: 1.45 }}>
          <strong>Conteúdo educativo.</strong> Não substitui consulta, diagnóstico ou tratamento médico. Em urgências, procure um serviço de saúde.
        </Typography>
      </Box>
    </Box>
  </Box>
);

const fieldSx = {
  '& .MuiOutlinedInput-root': {
    borderRadius: '8px', bgcolor: '#fff',
    '& fieldset': { borderColor: '#dde3e8' },
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
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [pwd, setPwd] = useState('');
  const [code, setCode] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [mode, setMode] = useState<'password' | 'otp'>('password');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try { await login({ username: email.trim(), password: pwd }); }
    catch { notify('E-mail ou senha incorretos.', { type: 'error' }); }
    finally { setLoading(false); }
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
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim(), code }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Token inválido');
      localStorage.setItem('token', d.token);
      if (d.patientId) localStorage.setItem('patientId', d.patientId);
      localStorage.setItem('user', JSON.stringify(d.user));
      notify('Bem-vindo! 🎉', { type: 'success' });
      window.location.href = import.meta.env.BASE_URL;
    } catch (err: any) { notify(err.message, { type: 'error' }); }
    finally { setLoading(false); }
  };

  return (
    <Shell>
      {mode === 'password' ? (
        <Box component="form" onSubmit={submit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField
            placeholder="E-mail" type="email" required autoComplete="username" value={email}
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
          <Button type="submit" variant="contained" size="large" fullWidth disabled={loading} endIcon={<I.ArrowRight />} sx={primaryBtnSx}>
            {loading ? <CircularProgress size={22} color="inherit" /> : 'Entrar'}
          </Button>
          <Button type="button" variant="outlined" fullWidth startIcon={<I.Key />} onClick={() => sendOtp()} sx={tokenBtnSx}>
            Entrar com token
          </Button>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', mt: 1, color: '#46555a' }}>
            <Box sx={{ mt: '1px' }}><I.Shield /></Box>
            <Box>
              <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: '#0f3d3a' }}>Acesso seguro</Typography>
              <Typography sx={{ fontSize: 11.5, color: '#6b7b80', lineHeight: 1.4 }}>Seus dados são protegidos com criptografia e armazenados em servidores seguros.</Typography>
            </Box>
          </Box>
          <Typography align="center" sx={{ mt: 1, fontSize: 13 }}>
            Não tem conta? <Link component="button" type="button" sx={{ fontWeight: 700, color: '#00897b' }} onClick={() => navigate('/registrar')}>Criar agora</Link>
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
            <Link component="button" type="button" variant="body2" sx={{ fontSize: 12.5, color: '#757575' }} onClick={() => setMode('password')}>Voltar (senha)</Link>
          </Stack>
        </Box>
      )}
    </Shell>
  );
};

export const RegisterPage = () => {
  const navigate = useNavigate();
  const notify = useNotify();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pwd, setPwd] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [verifyEmail, setVerifyEmail] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const r = await fetch(`${API_URL}/auth/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), password: pwd }),
      });
      const d = await r.json();
      if (r.status === 409) { notify('Este e-mail já tem conta. Use sua senha, "entrar com token" ou "esqueci a senha".', { type: 'warning' }); navigate('/'); return; }
      if (!r.ok) throw new Error(d.error || 'Falha no cadastro');
      if (d.needsVerification) { setVerifyEmail(d.email); notify('Enviamos um código de ativação no seu e-mail (cheque o spam).', { type: 'success' }); return; }
      localStorage.setItem('token', d.token);
      if (d.patientId) { localStorage.setItem('patientId', d.patientId); localStorage.setItem('selPatientId', d.patientId); }
      localStorage.setItem('user', JSON.stringify(d.user));
      notify('Conta criada! Bem-vindo! 🎉', { type: 'success' });
      window.location.href = import.meta.env.BASE_URL;
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
      window.location.href = import.meta.env.BASE_URL;
    } catch (err: any) { notify(err.message, { type: 'error' }); }
    finally { setLoading(false); }
  };

  return (
    <Shell>
      {verifyEmail ? (
        <Box component="form" onSubmit={verify} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography sx={{ fontSize: 14, color: '#46555a' }}>Enviamos um código de ativação para <strong>{verifyEmail}</strong>. Digite abaixo pra ativar sua conta.</Typography>
          <OtpInput value={verifyCode} onChange={setVerifyCode} />
          <Button type="submit" variant="contained" size="large" fullWidth disabled={loading} endIcon={<I.ArrowRight />} sx={primaryBtnSx}>{loading ? <CircularProgress size={22} color="inherit" /> : 'Ativar conta'}</Button>
          <Link component="button" type="button" variant="body2" sx={{ fontSize: 12.5, color: '#757575' }} onClick={() => setVerifyEmail(null)}>Voltar ao cadastro</Link>
        </Box>
      ) : (
        <>
      <Box component="form" onSubmit={submit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography sx={{ fontSize: 14, color: '#46555a' }}>Crie sua conta gratuita em segundos.</Typography>
        <TextField placeholder="Seu nome" required value={name} onChange={(e) => setName(e.target.value)} sx={fieldSx}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><I.Person /></InputAdornment> } }} />
        <TextField placeholder="E-mail" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} sx={fieldSx}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><I.Mail /></InputAdornment> } }} />
        <TextField placeholder="Senha (mín. 6 caracteres)" type={showPwd ? 'text' : 'password'} required value={pwd} onChange={(e) => setPwd(e.target.value)} sx={fieldSx}
          slotProps={{ input: {
            startAdornment: <InputAdornment position="start"><I.Lock /></InputAdornment>,
            endAdornment: <InputAdornment position="end"><IconButton onClick={() => setShowPwd((s) => !s)} edge="end" size="small">{showPwd ? <I.Eye /> : <I.EyeOff />}</IconButton></InputAdornment>,
          } }} />
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
          <Typography sx={{ fontSize: 14, color: '#46555a' }}>Informe seu e-mail e enviaremos um link para redefinir a senha.</Typography>
          <TextField placeholder="Seu e-mail" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} sx={fieldSx}
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><I.Mail /></InputAdornment> } }} />
          <Button type="submit" variant="contained" size="large" fullWidth disabled={loading} endIcon={<I.ArrowRight />} sx={primaryBtnSx}>{loading ? <CircularProgress size={22} color="inherit" /> : 'Enviar link'}</Button>
        </Box>
      )}
      <Typography align="center" sx={{ mt: 2, fontSize: 13 }}>
        <Link component="button" type="button" sx={{ color: '#757575' }} onClick={() => navigate('/')}>Voltar ao login</Link>
      </Typography>
    </Shell>
  );
};
