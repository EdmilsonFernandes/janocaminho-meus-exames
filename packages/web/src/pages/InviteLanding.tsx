import { useEffect, useState } from 'react';
import { Box, Typography, Button, Stack, CircularProgress, Chip } from '@mui/material';
import { useNavigate, useParams } from 'react-router-dom';
import { API_URL } from '../config';
import { DrExame } from '../components/DrExame';

// Landing pública do convite do médico: paciente clica no link (WhatsApp/email), vê quem convidou,
// cria conta/entra carregando o token — o aceite ativa o share médico↔paciente (backend).
const PLAY_STORE = 'https://play.google.com/store/apps/details?id=com.janocaminho.drexame';

const Shell = ({ children }: { children: React.ReactNode }) => (
  <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', p: 3, bgcolor: '#eef7f6' }}>{children}</Box>
);

export const InviteLandingPage = () => {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const [inv, setInv] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/doctor/invites/by-token/${token}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setInv(d || { notFound: true }))
      .catch(() => setInv({ notFound: true }))
      .finally(() => setLoading(false));
  }, [token]);

  const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
  const isAndroid = /android/i.test(ua);
  const isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1);

  if (loading) return <Box sx={{ display: 'grid', placeItems: 'center', minHeight: '100vh', bgcolor: '#eef7f6' }}><CircularProgress sx={{ color: '#20b2aa' }} /></Box>;

  if (inv?.notFound || inv?.expired) {
    return (
      <Shell>
        <DrExame size={72} />
        <Typography sx={{ fontWeight: 800, fontSize: 22, mt: 2, fontFamily: 'Poppins, sans-serif' }}>Convite inválido ou expirado</Typography>
        <Typography color="text.secondary" sx={{ mt: 1, textAlign: 'center' }}>Peça ao seu médico um novo link de convite.</Typography>
      </Shell>
    );
  }

  const firstName = (inv?.patientName as string)?.split(' ')[0] || '';

  return (
    <Shell>
      <DrExame size={80} />
      <Typography sx={{ fontWeight: 800, fontSize: 14, color: '#178f89', mt: 2, letterSpacing: 2 }}>DR. EXAME</Typography>
      <Typography sx={{ fontWeight: 800, fontSize: 24, mt: 0.5, fontFamily: 'Poppins, sans-serif', textAlign: 'center', lineHeight: 1.2 }}>
        {inv?.doctorName || 'Seu médico'} te convidou 👋
      </Typography>
      {inv?.specialty && <Chip label={inv.specialty} sx={{ mt: 1.5, bgcolor: 'rgba(32,178,170,.12)', color: '#178f89', fontWeight: 700 }} />}
      <Typography color="text.secondary" sx={{ mt: 2, textAlign: 'center', maxWidth: 360, lineHeight: 1.6 }}>
        {firstName ? `${firstName}, ` : ''}seu médico quer acompanhar seus exames pelo app. Crie sua conta e o compartilhamento com {inv?.doctorName ? String(inv.doctorName).split(' ')[0] : 'ele'} <b>já fica ativo</b> — você não configura nada.
      </Typography>
      <Stack spacing={1.25} sx={{ mt: 3, width: '100%', maxWidth: 320 }}>
        <Button variant="contained" size="large" onClick={() => navigate(`/registrar?invite=${token}`)} sx={{ borderRadius: 99, textTransform: 'none', fontWeight: 800, py: 1.3 }}>Criar minha conta</Button>
        <Button variant="outlined" size="large" onClick={() => navigate(`/entrar?invite=${token}`)} sx={{ borderRadius: 99, textTransform: 'none', fontWeight: 700, py: 1.3, borderColor: '#20b2aa', color: '#178f89' }}>Já tenho conta</Button>
        {isAndroid && <Button href={PLAY_STORE} target="_blank" size="small" sx={{ textTransform: 'none', fontWeight: 700, color: '#178f89' }}>📱 Baixar app na Google Play</Button>}
        {isIOS && <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', mt: 1, lineHeight: 1.5 }}>📱 No iPhone: após criar a conta, no Safari toque em <b>Compartilhar → Adicionar à Tela de Início</b> para instalar como app.</Typography>}
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ mt: 3, textAlign: 'center', maxWidth: 340 }}>Conteúdo educativo. Você controla o que compartilha com seu médico.</Typography>
    </Shell>
  );
};
