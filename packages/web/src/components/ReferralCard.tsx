import { useEffect, useState } from 'react';
import { Card, CardContent, Typography, Box, Button, Stack, Chip, CircularProgress } from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ShareIcon from '@mui/icons-material/Share';
import GiftIcon from '@mui/icons-material/CardGiftcard';
import { API_URL, token } from '../config';

/** Card de indicação — mostra código, copia, compartilha e estatísticas. */
export const ReferralCard = ({ code }: { code?: string }) => {
  const [stats, setStats] = useState<{ count: number; creditsEarned: number; friends: any[] } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!code) return;
    fetch(`${API_URL}/auth/referrals/stats`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => r.json()).then((d) => setStats(d)).catch(() => {});
  }, [code]);

  if (!code) return null;
  const link = `https://janocaminho.com.br/minhasaude/#/registrar?ref=${code}`;

  const copy = () => { navigator.clipboard?.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  const share = async () => {
    const text = `📱 Meus Exames — sua saúde com IA! Cadastre-se com meu código ${code} e ganhe +30 créditos: ${link}`;
    // No celular (Capacitor): usa o plugin nativo @capacitor/share (abre WhatsApp, Instagram, etc)
    try {
      const { Capacitor } = await import('@capacitor/core');
      if (Capacitor.isNativePlatform()) {
        const { Share } = await import('@capacitor/share');
        await Share.share({ title: 'Meus Exames', text, dialogTitle: 'Compartilhar indicação' });
        return;
      }
    } catch { /* cai pro web share */ }
    // Web: navigator.share (Chrome/Edge) ou copiar
    try { if (navigator.share) { await navigator.share({ title: 'Meus Exames', text }); return; } } catch {}
    navigator.clipboard?.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card sx={{ mt: 2, borderRadius: 4, overflow: 'hidden', background: 'linear-gradient(135deg,#f0f9f7,#e8f5f3)', border: '1px solid #bfe7e3' }}>
      <CardContent>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
          <GiftIcon sx={{ color: '#178f89' }} />
          <Typography variant="h6" sx={{ fontWeight: 800, color: '#0f3d3a' }}>Indique e ganhe créditos</Typography>
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Cada amigo que se cadastrar com seu código ganha <strong>+30 créditos</strong>. Você também ganha <strong>+30</strong>!</Typography>

        {/* Código */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <Box sx={{ flex: 1, p: 1.5, borderRadius: 2, bgcolor: '#fff', border: '2px dashed #20b2aa', textAlign: 'center' }}>
            <Typography sx={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 18, color: '#178f89', letterSpacing: 1 }}>{code}</Typography>
          </Box>
          <Button variant="outlined" startIcon={<ContentCopyIcon />} onClick={copy} sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 700, borderColor: '#20b2aa', color: '#178f89' }}>
            {copied ? '✓ Copiado!' : 'Copiar'}
          </Button>
        </Box>

        {/* Compartilhar */}
        <Button variant="contained" fullWidth startIcon={<ShareIcon />} onClick={share} sx={{ mb: 2, borderRadius: 2, textTransform: 'none', fontWeight: 800, background: 'linear-gradient(180deg,#20b2aa,#009688)', '&:hover': { background: 'linear-gradient(180deg,#1ca39e,#00897b)' } }}>
          Compartilhar link
        </Button>

        {/* Stats */}
        {stats && (
          <Stack direction="row" spacing={2} useFlexGap flexWrap="wrap">
            <Box sx={{ textAlign: 'center', flex: '1 1 80px' }}>
              <Typography sx={{ fontSize: 24, fontWeight: 900, color: '#178f89' }}>{stats.count}</Typography>
              <Typography variant="caption" color="text.secondary">amigos indicados</Typography>
            </Box>
            <Box sx={{ textAlign: 'center', flex: '1 1 80px' }}>
              <Typography sx={{ fontSize: 24, fontWeight: 900, color: '#178f89' }}>+{stats.creditsEarned}</Typography>
              <Typography variant="caption" color="text.secondary">créditos ganhos</Typography>
            </Box>
            {stats.friends?.length > 0 && (
              <Box sx={{ flex: '1 1 100%' }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>Indicados:</Typography>
                <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
                  {stats.friends.slice(0, 8).map((f: any, i: number) => <Chip key={i} size="small" label={f.name} sx={{ bgcolor: '#e0f2f1', color: '#178f89', fontWeight: 600 }} />)}
                </Stack>
              </Box>
            )}
          </Stack>
        )}
        {stats === null && code && <Box sx={{ textAlign: 'center' }}><CircularProgress size={20} sx={{ color: '#178f89' }} /></Box>}
      </CardContent>
    </Card>
  );
};
