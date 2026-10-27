// GymAudienceSection — seção de aquisição "para quem treina" da landing esportiva
// (pedido do dono 27/10: academia/musculação/hormônios pra atrair o público).
// Os 3 perfis do blueprint AAS §2 (SEMPRE por declaração, nunca presumidos);
// arte vetorial autoral PremiumGymArt; linguagem sem julgamento, sem marca,
// SEM os termos vedados do §6/§8 (o lint do CI vigia esta pasta).
import { Box, Container, Stack, Typography, Chip, Button, useTheme } from '@mui/material';
import FitnessCenterIcon from '@mui/icons-material/FitnessCenter';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { PremiumGymArt } from './PremiumGymArt';
import { useNavigate } from 'react-router-dom';

const PROFILES = [
  {
    icon: <FitnessCenterIcon />,
    title: 'Musculação sem hormônios',
    body: 'Linha de base sólida: hemograma, lipídios, creatinina e CK lidos no contexto do treino — pra performance e saúde andarem juntas.',
    tone: 'teal',
  },
  {
    icon: <VerifiedUserIcon />,
    title: 'TRT prescrito',
    body: 'Metas definidas pelo SEU médico, brief clínico completo pras consultas e histórico organizado de acompanhamento.',
    tone: 'teal',
  },
  {
    icon: <MonitorHeartIcon />,
    title: 'Uso declarado, sem julgamento',
    body: 'O que você usa, você declara — o app lê seus exames com esse contexto (hematócrito, HDL, eixo) e prepara perguntas pro médico. Exames acompanham; não tornam o uso seguro.',
    tone: 'copper',
  },
] as const;

export const GymAudienceSection = () => {
  const navigate = useNavigate();
  const dark = useTheme().palette.mode === 'dark';
  return (
    <Box
      component="section"
      id="para-quem-treina"
      sx={{
        py: { xs: 7, md: 10 },
        bgcolor: (t) => (t.palette.mode === 'dark' ? '#101b1b' : '#f4faf9'),
      }}
    >
      <Container maxWidth="lg">
        <Stack direction={{ xs: 'column', lg: 'row' }} spacing={{ xs: 4, lg: 6 }} alignItems="center">
          {/* Arte premium */}
          <Box sx={{ flex: { lg: '0 0 46%' }, width: { xs: '100%', lg: '46%' }, order: { xs: 2, lg: 1 } }}>
            <Box sx={{ borderRadius: '24px', overflow: 'hidden', boxShadow: dark ? '0 24px 60px rgba(0,0,0,.45)' : '0 24px 60px rgba(15,95,90,.16)' }}>
              <PremiumGymArt />
            </Box>
          </Box>

          {/* Copy */}
          <Box sx={{ flex: 1, minWidth: 0, order: { xs: 1, lg: 2 } }}>
            <Chip
              label="PARA QUEM TREINA"
              sx={{ mb: 1.5, fontWeight: 800, fontSize: 11.5, letterSpacing: '.08em', bgcolor: 'rgba(212,165,116,.16)', color: '#d4a574', borderRadius: '8px' }}
              size="small"
            />
            <Typography
              component="h2"
              sx={{ fontFamily: 'Poppins, sans-serif', fontWeight: 800, fontSize: { xs: '1.65rem', sm: '2rem', md: '2.4rem' }, lineHeight: 1.15, letterSpacing: '-0.02em', mb: 1.5 }}
            >
              Você acompanha suas cargas.
              <Box component="span" sx={{ display: 'block', color: '#20b2aa' }}>Seus exames também.</Box>
            </Typography>
            <Typography sx={{ color: 'text.secondary', fontSize: { xs: 15, md: 16.5 }, maxWidth: 560, mb: 3 }}>
              Musculação é constância — e exame também. Centralize laudos, veja o que mudou entre uma coleta e outra e
              declare o que você usa (suplementos, TRT, hormônios) pra leitura levar seu contexto real à consulta.
            </Typography>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.75} sx={{ mb: 3, flexWrap: 'wrap' }}>
              {PROFILES.map((p) => (
                <Box
                  key={p.title}
                  sx={{
                    flex: { sm: '1 1 160px' },
                    minWidth: 0,
                    p: 2,
                    borderRadius: '16px',
                    bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(255,255,255,.03)' : '#fff'),
                    border: '1px solid',
                    borderColor: p.tone === 'copper' ? 'rgba(212,165,116,.35)' : 'rgba(32,178,170,.22)',
                  }}
                >
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.75 }}>
                    <Box sx={{ color: p.tone === 'copper' ? '#d4a574' : '#20b2aa', display: 'flex' }}>{p.icon}</Box>
                    <Typography sx={{ fontWeight: 800, fontSize: 13.5 }}>{p.title}</Typography>
                  </Stack>
                  <Typography sx={{ fontSize: 12.5, color: 'text.secondary', lineHeight: 1.5 }}>{p.body}</Typography>
                </Box>
              ))}
            </Stack>

            <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
              <Button
                variant="contained"
                size="large"
                endIcon={<ArrowForwardIcon />}
                onClick={() => navigate('/registrar')}
                sx={{ textTransform: 'none', fontWeight: 800, borderRadius: '999px', px: 3 }}
              >
                Criar minha conta grátis
              </Button>
              <Button
                variant="outlined"
                onClick={() => document.getElementById('simulador')?.scrollIntoView({ behavior: 'smooth' })}
                sx={{ textTransform: 'none', fontWeight: 700, borderRadius: '999px' }}
              >
                Ver como funciona
              </Button>
            </Stack>
            <Typography sx={{ fontSize: 11.5, color: 'text.secondary', fontStyle: 'italic', mt: 2 }}>
              Educacional — o Dr. Exame organiza e contextualiza exames; nunca prescreve, sugere dose ou substitui seu médico.
            </Typography>
          </Box>
        </Stack>
      </Container>
    </Box>
  );
};
