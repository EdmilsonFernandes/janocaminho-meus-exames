import { useEffect, useState } from 'react';
import { Box, Typography, Button, CircularProgress } from '@mui/material';
import { Capacitor } from '@capacitor/core';
import { BiometricService } from './BiometricService';

/**
 * Porta de biometria na abertura e no retorno (foreground) do app.
 * Se a biometria está ativada (hasEnrollment), bloqueia a tela com um overlay
 * até o usuário autenticar. Resolve a inconsistência entre versões do Android
 * (antes o app entrava direto usando o token do localStorage, sem nunca pedir
 * a biometria — agora pede sempre que o app abre ou volta do background).
 */
export const BiometricGate = ({ children }: { children: React.ReactNode }) => {
  const enrolled = BiometricService.hasEnrollment();
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);

  const prompt = async () => {
    setBusy(true);
    const ok = await BiometricService.verify();
    setBusy(false);
    if (ok) setLocked(false);
  };

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !enrolled) return;
    setLocked(true);
    void prompt();
    let remove: (() => void) | undefined;
    (async () => {
      try {
        const { App } = await import('@capacitor/app');
        const h = await App.addListener('appStateChange', ({ isActive }: { isActive: boolean }) => {
          if (isActive) { setLocked(true); void prompt(); }
        });
        remove = () => { h.remove(); };
      } catch { /* web */ }
    })();
    return () => { remove?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!locked) return <>{children}</>;
  return (
    <Box sx={{ position: 'fixed', inset: 0, zIndex: 9999, bgcolor: 'rgba(15,61,58,.98)', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1.5, p: 3, textAlign: 'center' }}>
      <Box sx={{ fontSize: 60, mb: 1, animation: 'drBob 1.6s ease-in-out infinite' }}>🔐</Box>
      <Typography sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif', fontSize: 21 }}>Meus Exames está bloqueado</Typography>
      <Typography sx={{ opacity: 0.85, fontSize: 14, mb: 1.5, maxWidth: 300 }}>Confirme sua biometria (digital ou rosto) para continuar.</Typography>
      {busy
        ? <CircularProgress sx={{ color: '#20b2aa' }} />
        : <Button variant="contained" onClick={() => void prompt()} sx={{ borderRadius: 99, px: 4, py: 1.1, textTransform: 'none', fontWeight: 800, fontSize: 15, bgcolor: '#20b2aa', '&:hover': { bgcolor: '#0f7670' } }}>Usar biometria</Button>}
    </Box>
  );
};
