import { Box, Button, Container, Stack, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { useNavigate } from 'react-router-dom';
import { DrExame } from '../components/DrExame';
import { LandingBodyMapSection } from '../components/landing/LandingBodyMapSection';
import { TeleconsultaShowcase } from '../components/landing/TeleconsultaShowcase';
import { HealthPackageShowcaseCard } from '../components/landing/HealthPackageShowcaseCard';
import { ClinicalDecisionCard } from '../components/landing/ClinicalDecisionCard';

const TEAL_DARK = '#178f89';
const SERIF_I = { fontFamily: "'Instrument Serif', Georgia, serif", fontStyle: 'italic', fontWeight: 400 } as const;

/**
 * /features — para onde migraram as seções pesadas da landing (BodyMap, showcase
 * clínico, telemedicina). A home volta a ser um funil enxuto; quem quer ver o
 * produto por dentro entra aqui pelo telestrip ou pelo menu "Recursos".
 */
export const FeaturesPage = () => {
  const navigate = useNavigate();

  return (
    <Box sx={{ bgcolor: 'background.default', minHeight: '100dvh' }}>
      {/* Header enxuto — volta pra home sem competir com CTAs da página */}
      <Box sx={{ borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
        <Container maxWidth="lg" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 1.5 }}>
          <Stack direction="row" spacing={1.25} alignItems="center" sx={{ cursor: 'pointer' }} onClick={() => navigate('/')}>
            <DrExame size={38} sx={{ borderRadius: '14px', boxShadow: '0 2px 8px rgba(32,178,170,0.2)' }} />
            <Typography variant="h6" sx={{ color: 'text.primary', fontWeight: 800, fontSize: 19, letterSpacing: '-0.02em', fontFamily: 'Poppins, sans-serif' }}>
              Dr. Exame
            </Typography>
          </Stack>
          <Button
            startIcon={<ArrowBackIcon />}
            onClick={() => navigate('/')}
            sx={{ textTransform: 'none', fontWeight: 700, color: 'primary.dark', '&:hover': { bgcolor: 'rgba(32,178,170,0.08)' } }}
          >
            Voltar pra home
          </Button>
        </Container>
      </Box>

      {/* Abertura */}
      <Box sx={{ py: { xs: 5, md: 7 }, textAlign: 'center' }}>
        <Container maxWidth="md">
          <Typography variant="h1" sx={{ fontSize: { xs: '2rem', md: '2.8rem' }, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.15, color: 'text.primary', mb: 1.5 }}>
            Todo o Dr. Exame, <Box component="span" sx={{ ...SERIF_I, color: TEAL_DARK }}>por dentro</Box>
          </Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: { xs: 16, md: 17.5 }, maxWidth: 560, mx: 'auto', lineHeight: 1.6 }}>
            Mapa do corpo com cálculos clínicos, síntese de voz do seu laudo e a teleconsulta que acontece sem sair do app.
          </Typography>
        </Container>
      </Box>

      {/* 1. Mapa do corpo + cálculos clínicos (âncoras #mapa-do-corpo / #calculos-clinicos) */}
      <LandingBodyMapSection />

      {/* 2. Showcase clínico — player de áudio + decisão clínica */}
      <Box sx={{ bgcolor: 'background.default', py: { xs: 7, md: 10 }, borderTop: '1px solid', borderColor: 'divider' }}>
        <Container maxWidth="lg">
          <Box sx={{ textAlign: 'center', mb: { xs: 4, md: 6 } }}>
            <Typography variant="h2" sx={{ fontSize: { xs: '1.9rem', md: '2.6rem' }, fontWeight: 800, color: 'text.primary', mb: 1.5, letterSpacing: '-0.02em' }}>
              Seus exames explicados com <Box component="span" sx={{ ...SERIF_I, color: TEAL_DARK }}>precisão e voz humanizada</Box>
            </Typography>
            <Typography sx={{ color: 'text.secondary', fontSize: 17, maxWidth: 620, mx: 'auto' }}>
              Experimente a síntese clínica do Dr. Exame: ouça o laudo em 1 minuto, navegue pelos órgãos e entenda as prioridades para a sua próxima consulta.
            </Typography>
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: { xs: 3.5, md: 4.5 }, alignItems: 'stretch', justifyContent: 'center' }}>
            <HealthPackageShowcaseCard onCtaClick={() => navigate('/registrar')} ctaText="Começar grátis agora" />
            <ClinicalDecisionCard />
          </Box>
        </Container>
      </Box>

      {/* 3. Telemedicina (âncora #teleconsulta; simulação pausa fora da viewport) */}
      <TeleconsultaShowcase onCta={() => navigate('/registrar')} />

      {/* CTA final */}
      <Box sx={{ py: { xs: 6, md: 9 }, bgcolor: 'background.paper', borderTop: '1px solid', borderColor: 'divider' }}>
        <Container maxWidth="sm" sx={{ textAlign: 'center' }}>
          <Typography variant="h2" sx={{ fontSize: { xs: '1.7rem', md: '2.2rem' }, fontWeight: 800, letterSpacing: '-0.02em', color: 'text.primary', mb: 1.5 }}>
            Pronto pra entender <Box component="span" sx={SERIF_I}>sua saúde?</Box>
          </Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: 16, mb: 3 }}>
            Crie sua conta grátis e envie seu primeiro exame em menos de 1 minuto.
          </Typography>
          <Button
            variant="contained"
            size="large"
            onClick={() => navigate('/registrar')}
            endIcon={<ArrowForwardIcon />}
            sx={{
              borderRadius: '999px', px: 4, py: 1.5, textTransform: 'none', fontWeight: 800, fontSize: 16,
              bgcolor: 'primary.dark',
              background: 'linear-gradient(90deg, #178f89 0%, #20b2aa 50%, #178f89 100%)',
              boxShadow: '0 8px 24px rgba(32,178,170,.35)',
              '&:hover': { boxShadow: '0 10px 28px rgba(32,178,170,.45)' },
            }}
          >
            Começar agora — é grátis
          </Button>
        </Container>
      </Box>
    </Box>
  );
};
