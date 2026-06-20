import { Box, Typography, Button } from '@mui/material';
import { DrExame } from './DrExame';

const PLAY_URL = 'https://play.google.com/store/apps/details?id=com.janocaminho.drexame';

/** Tela bloqueante: versão instalada abaixo da mínima exigida pelo backend. */
export const ForceUpdate = ({ latest }: { latest: string }) => (
  <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', p: 3, background: 'linear-gradient(160deg,#20b2aa,#178f89)', color: '#fff' }}>
    <DrExame size={110} sx={{ borderRadius: '24%', boxShadow: '0 16px 40px rgba(0,0,0,.25)', mb: 2 }} />
    <Typography variant="h5" sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif', mb: 1 }}>Atualização necessária 🔄</Typography>
    <Typography sx={{ opacity: 0.92, maxWidth: 360, mb: 3, lineHeight: 1.6 }}>
      Liberamos uma versão nova do Meus Exames ({latest}) com melhorias importantes. Atualize pra continuar usando com segurança.
    </Typography>
    <Button variant="contained" size="large" onClick={() => window.open(PLAY_URL, '_blank')}
      sx={{ bgcolor: '#fff', color: '#178f89', fontWeight: 800, borderRadius: 3, px: 4, textTransform: 'none', fontSize: 16, '&:hover': { bgcolor: '#f0f9f8' } }}>
      ⬇ Atualizar agora
    </Button>
    <Typography variant="caption" sx={{ opacity: 0.7, mt: 2 }}>Depois de instalar, abra novamente.</Typography>
  </Box>
);
