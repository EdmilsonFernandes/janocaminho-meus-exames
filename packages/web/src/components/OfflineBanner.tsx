import { useEffect, useState } from 'react';
import { Box, Typography } from '@mui/material';
import { Capacitor } from '@capacitor/core';

/**
 * OfflineBanner (G5 — padrão app grande): chip global "sem conexão" quando a rede cai.
 * No APK usa @capacitor/network (evento nativo, instantâneo); no web, `navigator.onLine`
 * + listeners (mais grosseiro — suficiente como fallback). O app continua USÁVEL
 * (offline-first do fetch-cache); o chip só informa, não bloqueia.
 */
export const OfflineBanner = () => {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    if (Capacitor.isNativePlatform()) {
      let h: any = null;
      import('@capacitor/network').then(({ Network }) => {
        Network.getStatus().then((s) => setOffline(!s.connected));
        h = Network.addListener('networkStatusChange', (s) => setOffline(!s.connected));
      }).catch(() => {});
      cleanup = () => { try { h?.remove?.(); } catch { /* */ } };
    } else {
      const on = () => setOffline(!navigator.onLine);
      on();
      window.addEventListener('online', on);
      window.addEventListener('offline', on);
      cleanup = () => { window.removeEventListener('online', on); window.removeEventListener('offline', on); };
    }
    return () => cleanup?.();
  }, []);
  if (!offline) return null;
  return (
    <Box role="status" aria-live="polite" sx={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1300,
      pt: 'calc(env(safe-area-inset-top, 0px) + 6px)', pb: 1, px: 2,
      bgcolor: 'rgba(180,83,9,.95)', color: '#fff',
      textAlign: 'center', boxShadow: '0 2px 10px rgba(0,0,0,.25)',
    }}>
      <Typography sx={{ fontSize: 12.5, fontWeight: 700 }}>
        📴 Sem conexão — você está vendo seus dados salvos. Suas ações voltam quando a internet retornar.
      </Typography>
    </Box>
  );
};
