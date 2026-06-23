import { useEffect, useState } from 'react';
import { Box, Typography, Slide } from '@mui/material';
import WifiOffIcon from '@mui/icons-material/WifiOff';

/** Banner fixo no topo quando o dispositivo fica offline (3G caiu, sem wi-fi, etc). */
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
    <Slide direction="down" in={!online} mountOnEnter unmountOnExit>
      <Box sx={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999, bgcolor: '#b91c1c', color: '#fff', py: 0.75, px: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, boxShadow: 2 }}>
        <WifiOffIcon fontSize="small" />
        <Typography sx={{ fontSize: 13, fontWeight: 700 }}>Sem conexão — verificando... Alguns recursos podem estar indisponíveis.</Typography>
      </Box>
    </Slide>
  );
};
