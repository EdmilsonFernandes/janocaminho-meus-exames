import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Typography, Stack, Card, CardContent, Button, Fade, alpha } from '@mui/material';
import GiftOutlinedIcon from '@mui/icons-material/CardGiftcard';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { API_URL, token, fetchPublicConfig } from '../config';
import { DrExame } from '../components/DrExame';
import { ReferralCard } from '../components/ReferralCard';
import { PageContainer } from '../components/layout/PageContainer';
import { hapticLight } from '../utils/haptic';

/** Página "Indique e ganhe" (padrão MGM de apps maduros): o referral vivia escondido no
 *  Perfil — agora tem casa própria (/indique, menu Conta) e faixa de descoberta na Carteira.
 *  Reaproveita o ReferralCard (código/share/stats); aqui entra o "porquê" (hero + passos). */

const STEPS = [
  { n: 1, title: 'Compartilhe seu código', sub: 'WhatsApp, Instagram, onde quiser' },
  { n: 2, title: 'Seu amigo cria a conta grátis', sub: 'Ele já ganha créditos de bônus no cadastro' },
  { n: 3, title: 'Os dois ganham', sub: 'Créditos caem direto na carteira de cada um' },
];

export const InvitePage = () => {
  const navigate = useNavigate();
  // undefined = carregando · null = sem código · string = tem
  const [code, setCode] = useState<string | null | undefined>(undefined);
  const [refBonus, setRefBonus] = useState(10);

  useEffect(() => {
    fetchPublicConfig().then((c) => setRefBonus(c.referralBonus)).catch(() => {});
    fetch(`${API_URL}/auth/referrals/stats`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setCode(d?.code ?? null))
      .catch(() => setCode(null));
  }, []);

  return (
    <Fade in timeout={300}>
      <PageContainer width={640} sx={{ pb: { xs: 10, sm: 4 } }}>
        {/* HERO — por que indicar (o ReferralCard embaixo tem o COMO) */}
        <Card elevation={0} sx={{
          position: 'relative', overflow: 'hidden', borderRadius: '18px', color: '#fff', mb: 2,
          background: 'linear-gradient(135deg,#20b2aa,#178f89)',
          boxShadow: '0 12px 32px rgba(32,178,170,.28)',
          '&::after': {
            content: '""', position: 'absolute', inset: 0, pointerEvents: 'none',
            background: 'linear-gradient(115deg, rgba(255,255,255,.14) 0%, transparent 42%)',
          },
        }}>
          <CardContent sx={{ p: { xs: 2.5, sm: 3 }, position: 'relative', textAlign: 'center' }}>
            <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1 }}><DrExame size={56} sx={{ borderRadius: '28%' }} /></Box>
            <Typography sx={{ fontFamily: '"Poppins",sans-serif', fontWeight: 800, fontSize: 22, letterSpacing: '-0.01em' }}>
              Indique e ganhe {refBonus} créditos
            </Typography>
            <Typography sx={{ fontSize: 13.5, opacity: 0.9, mt: 0.75, maxWidth: 380, mx: 'auto' }}>
              Seu amigo ganha <strong>+{refBonus}</strong> ao criar a conta com seu código — e você ganha <strong>+{refBonus}</strong> quando ele ativar. Saúde que se espalha é saúde melhor. 💚
            </Typography>
          </CardContent>
        </Card>

        {/* COMO FUNCIONA — 3 passos */}
        <Card elevation={0} sx={{ borderRadius: '16px', mb: 2, border: (t) => `1px solid ${alpha(t.palette.divider, 0.6)}` }}>
          <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
            <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 1.5 }}>
              <GiftOutlinedIcon sx={{ color: '#178f89' }} />
              <Typography sx={{ fontFamily: '"Poppins",sans-serif', fontWeight: 700, fontSize: 15 }}>Como funciona</Typography>
            </Stack>
            <Stack spacing={1.25}>
              {STEPS.map((s) => (
                <Stack key={s.n} direction="row" alignItems="center" spacing={1.5}>
                  <Box sx={{
                    width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'linear-gradient(135deg,#20b2aa,#178f89)', color: '#fff',
                    fontSize: 13, fontWeight: 800, fontFamily: '"Poppins",sans-serif',
                  }}>{s.n}</Box>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontSize: 13.5, fontWeight: 700 }}>{s.title}</Typography>
                    <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{s.sub}</Typography>
                  </Box>
                </Stack>
              ))}
            </Stack>
          </CardContent>
        </Card>

        {/* CÓDIGO + SHARE + STATS (ReferralCard reaproveitado — fonte única) */}
        {code === undefined ? null : <ReferralCard code={code ?? undefined} />}

        {/* CTA cruzado: onde o bônus cai */}
        <Button
          fullWidth variant="outlined" endIcon={<ArrowForwardIcon />}
          onClick={() => { hapticLight(); navigate('/carteira'); }}
          sx={{ mt: 2, textTransform: 'none', fontWeight: 800, borderRadius: '12px', py: 1.25, borderColor: 'rgba(32,178,170,.4)', color: '#0f6e68' }}
        >
          Ver onde os créditos caem (Carteira)
        </Button>
      </PageContainer>
    </Fade>
  );
};
