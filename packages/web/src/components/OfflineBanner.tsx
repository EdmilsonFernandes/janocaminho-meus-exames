import { useEffect, useState } from 'react';
import { Box, Typography, Slide } from '@mui/material';
import WifiOffIcon from '@mui/icons-material/WifiOff';

/** Indicador offline discreto (pílula no rodapé) — estilo app profissional. */
export const OfflineBanner = () => {
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return (
    <Slide direction="up" in={!online} mountOnEnter unmountOnExit>
      <Box sx={{ position: 'fixed', bottom: { xs: 76, sm: 20 }, left: '50%', transform: 'translateX(-50%)', zIndex: 9999, bgcolor: 'rgba(15,23,42,0.92)', color: '#fff', py: 0.7, px: 2.5, borderRadius: 99, display: 'flex', alignItems: 'center', gap: 0.75, boxShadow: '0 4px 16px rgba(0,0,0,.25)' }}>
        <WifiOffIcon sx={{ fontSize: 16, opacity: 0.8 }} />
        <Typography sx={{ fontSize: 12.5, fontWeight: 600 }}>Sem conexão</Typography>
      </Box>
    </Slide>
  );
};
