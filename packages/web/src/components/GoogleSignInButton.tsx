/**
 * GoogleSignInButton — Google Sign-in reutilizável (paciente).
 *
 * 02/10: extraído do LoginPage — o REGISTRO também precisa (antes só o login
 * tinha; quem chegava em /registrar via Google não tinha como entrar).
 *
 * Backend: /auth/google CRIA a conta se não existir (user 'google-oauth' +
 * paciente titular + termsAcceptedAt carimbado) — o botão serve pros dois fluxos.
 * WebView (APK): plugin nativo Capgo (GIS não renderiza em https://localhost).
 * Navegador: GoogleLogin GIS web.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotify, useTranslate } from 'react-admin';
import { Button, Box, Typography } from '@mui/material';
import { GoogleLogin } from '@react-oauth/google';
import { Capacitor } from '@capacitor/core';
import { API_URL } from '../config';
import { nativeGoogleLogin } from '../utils/nativeGoogleAuth';

const GoogleG = () => (<svg width="20" height="20" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.5 2.6 30.1 0 24 0 14.6 0 6.4 5.4 2.6 13.3l7.8 6.1C12.2 13.7 17.6 9.5 24 9.5z" /><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.5 3-2.2 5.5-4.7 7.2l7.3 5.7C43.9 38 46.5 31.8 46.5 24.5z" /><path fill="#FBBC05" d="M10.4 28.6c-.5-1.4-.7-2.9-.7-4.6s.3-3.2.7-4.6l-7.8-6.1C1.6 16.5 0 20 0 24s1.6 7.5 2.6 8.7l7.8-6.1z" /><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.3-5.7c-2 1.4-4.6 2.2-8.6 2.2-6.4 0-11.8-4.2-13.6-9.9l-7.8 6.1C6.4 42.6 14.6 48 24 48z" /></svg>);

export const GoogleSignInButton = ({ label }: { label?: string }) => {
  const navigate = useNavigate();
  const notify = useNotify();
  const translate = useTranslate();
  const [loading, setLoading] = useState(false);

  const exchange = async (idToken: string) => {
    try {
      setLoading(true);
      const r = await fetch(`${API_URL}/auth/google`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: idToken }),
      });
      const d = await r.json();
      if (d.token) {
        localStorage.setItem('token', d.token);
        localStorage.setItem('photoToken', d.token); // igual authProvider.login — ?t= estável pro avatar
        if (d.user) localStorage.setItem('user', JSON.stringify(d.user));
        if (d.patientId) { localStorage.setItem('patientId', d.patientId); localStorage.setItem('selPatientId', d.patientId); }
        window.dispatchEvent(new Event('selPatientChanged'));
        navigate('/', { replace: true });
      } else { notify(d.error || translate('auth.google_fail'), { type: 'error' }); }
    } catch { notify(translate('auth.conn_fail'), { type: 'error' }); }
    finally { setLoading(false); }
  };

  const handleNative = async () => {
    const tok = await nativeGoogleLogin();
    if (!tok) { notify(translate('auth.google_fail'), { type: 'error' }); return; }
    await exchange(tok);
  };

  if (!import.meta.env.VITE_GOOGLE_CLIENT_ID && !Capacitor.isNativePlatform()) return null;

  return (
    <Box sx={{ width: '100%', mt: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, my: 1 }}>
        <Box sx={{ flex: 1, height: 1, bgcolor: 'divider' }} />
        <Typography variant="caption" color="text.secondary">ou</Typography>
        <Box sx={{ flex: 1, height: 1, bgcolor: 'divider' }} />
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'center' }}>
        {Capacitor.isNativePlatform() ? (
          <Button type="button" variant="outlined" size="large" startIcon={<GoogleG />} onClick={handleNative} disabled={loading}
            sx={{ borderRadius: '12px', borderColor: 'divider', color: 'text.primary', textTransform: 'none', fontWeight: 600, py: 1.2, width: '100%', maxWidth: 320 }}>
            {label ?? translate('auth.google')}
          </Button>
        ) : (
          <GoogleLogin
            onSuccess={async (cred) => { if (cred.credential) await exchange(cred.credential); }}
            onError={() => notify(translate('auth.google_fail'), { type: 'error' })}
            text="continue_with" shape="pill" size="large"
          />
        )}
      </Box>
    </Box>
  );
};
