import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLogin, useNotify } from 'react-admin';
import { Box, Card, CardContent, Typography, Button, Link, CircularProgress, Stack } from '@mui/material';
import { DrExame } from '../components/DrExame';

const Shell = ({ children, title }: any) => (
  <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2, background: 'linear-gradient(135deg,#0b5cab,#1565c0)' }}>
    <Card sx={{ maxWidth: 400, width: '100%' }}>
      <CardContent sx={{ p: 3 }}>
        <Stack alignItems="center" spacing={0.5} sx={{ mb: 1 }}>
          <DrExame size={76} />
          <Typography variant="h5" align="center">Meus Exames</Typography>
        </Stack>
        {children}
        <Typography variant="caption" align="center" sx={{ display: 'block', mt: 2, color: 'text.secondary' }}>
          {title}
        </Typography>
      </CardContent>
    </Card>
  </Box>
);

const inputSx = { width: '100%', '& .MuiOutlinedInput-root': { fontSize: 16 } } as const;

export const LoginPage = () => {
  const login = useLogin();
  const notify = useNotify();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [pwd, setPwd] = useState('');
  const [code, setCode] = useState('');
  const [mode, setMode] = useState<'password' | 'otp-code'>('password');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login({ username: email.trim(), password: pwd });
    } catch {
      notify('E-mail ou senha incorretos.', { type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const sendOtp = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!email.trim()) { notify('Informe o e-mail.', { type: 'error' }); return; }
    setLoading(true);
    try {
      const r = await fetch(`${import.meta.env.VITE_API_URL}/auth/otp/request`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim() }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        notify(d.error || 'Não conseguimos enviar o código agora.', { type: 'error' });
        return;
      }
      notify('Enviamos o código no seu e-mail (cheque também o spam).', { type: 'success' });
      setMode('otp-code');
    } catch { notify('Falha ao enviar o código.', { type: 'error' }); }
    finally { setLoading(false); }
  };

  const verifyOtpCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const r = await fetch(`${import.meta.env.VITE_API_URL}/auth/otp/verify`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim(), code }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Código inválido');
      localStorage.setItem('token', d.token);
      if (d.patientId) localStorage.setItem('patientId', d.patientId);
      localStorage.setItem('user', JSON.stringify(d.user));
      notify('Bem-vindo! 🎉', { type: 'success' });
      window.location.href = '/'; // navegação completa garante que o react-admin reinicia logado
    } catch (err: any) {
      notify(err.message, { type: 'error' });
    } finally { setLoading(false); }
  };

  return (
    <Shell title="Análise educativa — não substitui o médico">
      {mode === 'password' ? (
        <Box component="form" onSubmit={submit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box component="input" type="email" required placeholder="E-mail" autoComplete="username" value={email}
            onChange={(e: any) => setEmail(e.target.value)} style={{ width: '100%', padding: '12px', fontSize: 16, borderRadius: 8, border: '1px solid #c4d0e0' }} />
          <Box component="input" type="password" required placeholder="Senha" autoComplete="current-password" value={pwd}
            onChange={(e: any) => setPwd(e.target.value)} style={{ width: '100%', padding: '12px', fontSize: 16, borderRadius: 8, border: '1px solid #c4d0e0' }} />
          <Button type="submit" variant="contained" size="large" fullWidth disabled={loading}>
            {loading ? <CircularProgress size={22} /> : 'Entrar'}
          </Button>
        </Box>
      ) : (
        <Box component="form" onSubmit={verifyOtpCode} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography color="text.secondary" sx={{ fontSize: 14 }}>Enviamos um código para <strong>{email}</strong></Typography>
          <Box component="input" required placeholder="Código de 6 dígitos" inputMode="numeric" value={code}
            onChange={(e: any) => setCode(e.target.value)} style={{ width: '100%', padding: '12px', fontSize: 18, letterSpacing: 4, borderRadius: 8, border: '1px solid #c4d0e0', textAlign: 'center' }} />
          <Button type="submit" variant="contained" size="large" fullWidth disabled={loading}>
            {loading ? <CircularProgress size={22} /> : 'Verificar e entrar'}
          </Button>
          <Link component="button" variant="body2" onClick={() => sendOtp()}>Reenviar código</Link>
        </Box>
      )}
      <Stack direction="row" spacing={2} justifyContent="center" sx={{ mt: 2, flexWrap: 'wrap', gap: 1 }}>
        {mode === 'password' && (
          <Link component="button" variant="body2" onClick={() => sendOtp()}>Entrar com código no e-mail</Link>
        )}
        {mode === 'otp-code' && (
          <Link component="button" variant="body2" onClick={() => setMode('password')}>Voltar (senha)</Link>
        )}
        <Link component="button" variant="body2" onClick={() => navigate('/registrar')}>Criar conta</Link>
        <Link component="button" variant="body2" onClick={() => navigate('/recuperar-senha')}>Esqueci a senha</Link>
      </Stack>
    </Shell>
  );
};

export const RegisterPage = () => {
  const navigate = useNavigate();
  const notify = useNotify();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pwd, setPwd] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // /register cria a conta e já devolve token + patientId → entra direto.
      // (Antes exigia confirmação por OTP; se a pessoa saía sem confirmar, ficava presa.
      //  Login por e-mail/senha continua valendo; "entrar com código" segue disponível.)
      const r = await fetch(`${import.meta.env.VITE_API_URL}/auth/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), password: pwd }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Falha no cadastro');
      localStorage.setItem('token', d.token);
      if (d.patientId) { localStorage.setItem('patientId', d.patientId); localStorage.setItem('selPatientId', d.patientId); }
      localStorage.setItem('user', JSON.stringify(d.user));
      notify('Conta criada! Bem-vindo! 🎉', { type: 'success' });
      window.location.href = '/';
    } catch (err: any) {
      notify(err.message, { type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Shell title="Crie sua conta gratuita">
      <Box component="form" onSubmit={submit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box component="input" required placeholder="Seu nome" value={name} onChange={(e: any) => setName(e.target.value)} style={{ width: '100%', padding: '12px', fontSize: 16, borderRadius: 8, border: '1px solid #c4d0e0' }} />
        <Box component="input" type="email" required placeholder="E-mail" value={email} onChange={(e: any) => setEmail(e.target.value)} style={{ width: '100%', padding: '12px', fontSize: 16, borderRadius: 8, border: '1px solid #c4d0e0' }} />
        <Box component="input" type="password" required placeholder="Senha (mín. 6 caracteres)" value={pwd} onChange={(e: any) => setPwd(e.target.value)} style={{ width: '100%', padding: '12px', fontSize: 16, borderRadius: 8, border: '1px solid #c4d0e0' }} />
        <Button type="submit" variant="contained" size="large" fullWidth disabled={loading}>
          {loading ? <CircularProgress size={22} /> : 'Criar conta'}
        </Button>
      </Box>
      <Typography align="center" sx={{ mt: 2 }}>
        <Link component="button" variant="body2" onClick={() => navigate('/')}>Já tenho conta</Link>
      </Typography>
    </Shell>
  );
};

export const ResetPage = () => {
  const navigate = useNavigate();
  const notify = useNotify();
  // HashRouter: o token vem DEPOIS do #/ (ex: .../#/recuperar-senha?token=X). Lê do hash; fallback p/ search.
  const hashQuery = window.location.hash.split('?')[1] || '';
  const params = new URLSearchParams(hashQuery || window.location.search);
  const token = params.get('token') || '';
  const [pwd, setPwd] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState<'request' | 'reset' | 'done'>(token ? 'reset' : 'request');

  const requestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch(`${import.meta.env.VITE_API_URL}/auth/forgot`, {
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
      const r = await fetch(`${import.meta.env.VITE_API_URL}/auth/reset`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password: pwd }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Token inválido');
      notify('Senha redefinida! Faça login.', { type: 'success' });
      navigate('/');
    } catch (err: any) {
      notify(err.message, { type: 'error' });
    } finally { setLoading(false); }
  };

  return (
    <Shell title="Redefinição de senha">
      {stage === 'done' ? (
        <Typography align="center" sx={{ py: 2 }}>Verifique seu e-mail (e o console do servidor em dev) e clique no link recebido.</Typography>
      ) : stage === 'reset' ? (
        <Box component="form" onSubmit={doReset} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box component="input" type="password" required placeholder="Nova senha (mín. 6)" value={pwd} onChange={(e: any) => setPwd(e.target.value)} style={{ width: '100%', padding: '12px', fontSize: 16, borderRadius: 8, border: '1px solid #c4d0e0' }} />
          <Button type="submit" variant="contained" size="large" fullWidth disabled={loading}>{loading ? <CircularProgress size={22} /> : 'Redefinir senha'}</Button>
        </Box>
      ) : (
        <Box component="form" onSubmit={requestReset} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box component="input" type="email" required placeholder="Seu e-mail" value={email} onChange={(e: any) => setEmail(e.target.value)} style={{ width: '100%', padding: '12px', fontSize: 16, borderRadius: 8, border: '1px solid #c4d0e0' }} />
          <Button type="submit" variant="contained" size="large" fullWidth disabled={loading}>{loading ? <CircularProgress size={22} /> : 'Enviar link'}</Button>
        </Box>
      )}
      <Typography align="center" sx={{ mt: 2 }}>
        <Link component="button" variant="body2" onClick={() => navigate('/')}>Voltar ao login</Link>
      </Typography>
    </Shell>
  );
};
