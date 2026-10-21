import { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Typography,
  Button,
  Stack,
  IconButton,
  Drawer,
  Fade,
  Paper,
  Divider,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import CloseIcon from '@mui/icons-material/Close';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import FavoriteIcon from '@mui/icons-material/Favorite';
import ScienceIcon from '@mui/icons-material/Science';
import FitnessCenterIcon from '@mui/icons-material/FitnessCenter';
import PsychologyIcon from '@mui/icons-material/Psychology';
import MedicalServicesIcon from '@mui/icons-material/MedicalServices';
import BloodtypeIcon from '@mui/icons-material/Bloodtype';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import DescriptionIcon from '@mui/icons-material/Description';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { useNavigate } from 'react-router-dom';
import { DrExame } from '../DrExame';

const TEAL = '#20b2aa';
const TEAL_DARK = '#178f89';
const INK = '#0f5f5a';

interface LandingNavbarProps {
  scrolled: boolean;
  isSports?: boolean;
  onGoToSection: (id: string) => void;
}

export const LandingNavbar = ({ scrolled, isSports = false, onGoToSection }: LandingNavbarProps) => {
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Fecha o dropdown ao clicar fora ou ao scrollar
  useEffect(() => {
    const close = () => setMenuOpen(false);
    window.addEventListener('scroll', close, { passive: true });
    return () => window.removeEventListener('scroll', close);
  }, []);

  const recursos = [
    {
      title: 'Mapa do Corpo & Órgãos',
      desc: 'Visualização anatômica por sistemas e exames associados',
      icon: <FavoriteIcon sx={{ color: TEAL_DARK, fontSize: 20 }} />,
      tag: 'Novo',
      action: () => {
        setMenuOpen(false);
        setMobileOpen(false);
        navigate('/features');
      },
    },
    {
      title: 'Cálculos Clínicos',
      desc: 'HOMA-IR, Castelli, TG/HDL, FIB-4 e eGFR determinísticos',
      icon: <ScienceIcon sx={{ color: TEAL_DARK, fontSize: 20 }} />,
      tag: 'Diretrizes',
      action: () => {
        setMenuOpen(false);
        setMobileOpen(false);
        navigate('/features');
      },
    },
    {
      title: 'Saúde Esportiva',
      desc: 'Hormônios, hematócrito e metas para quem treina',
      icon: <FitnessCenterIcon sx={{ color: TEAL_DARK, fontSize: 20 }} />,
      tag: 'Atletas',
      action: () => {
        setMenuOpen(false);
        setMobileOpen(false);
        navigate('/saude-esportiva');
      },
    },
    {
      title: 'Biomarcadores de Sangue',
      desc: 'Hemograma completo, lipidograma, glicose e vitaminas',
      icon: <BloodtypeIcon sx={{ color: TEAL_DARK, fontSize: 20 }} />,
      action: () => {
        setMenuOpen(false);
        setMobileOpen(false);
        onGoToSection('demo');
      },
    },
    {
      title: 'Saúde Mental Integrada',
      desc: 'PHQ-9 e GAD-7 cruzados com histórico clínico',
      icon: <PsychologyIcon sx={{ color: TEAL_DARK, fontSize: 20 }} />,
      action: () => {
        setMenuOpen(false);
        setMobileOpen(false);
        navigate('/features');
      },
    },
    {
      title: 'Portal do Médico',
      desc: 'Área dedicada a médicos e nutricionistas',
      icon: <MedicalServicesIcon sx={{ color: TEAL_DARK, fontSize: 20 }} />,
      action: () => {
        setMenuOpen(false);
        setMobileOpen(false);
        navigate('/doctor');
      },
    },
  ];

  return (
    <>
      <Box
        component="header"
        sx={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 1100,
          transition: 'background-color .25s ease, border-color .25s ease, box-shadow .25s ease',
          paddingTop: 'env(safe-area-inset-top)',
          // Mode-aware: quem salva theme=dark não pode ganhar navbar branca com texto claro.
          bgcolor: (t) => (scrolled
            ? (t.palette.mode === 'dark' ? 'rgba(26,36,36,0.92)' : 'rgba(255,255,255,0.92)')
            : 'transparent'),
          backdropFilter: scrolled ? 'blur(20px) saturate(1.4)' : 'none',
          WebkitBackdropFilter: scrolled ? 'blur(20px) saturate(1.4)' : 'none',
          borderBottom: scrolled ? '1px solid rgba(32,178,170,0.12)' : '1px solid transparent',
          boxShadow: scrolled ? '0 1px 16px rgba(15,95,90,0.06)' : 'none',
        }}
      >
        <Container maxWidth="lg" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 1.25 }}>
          {/* Logo / Brand */}
          <Stack
            direction="row"
            alignItems="center"
            spacing={1.25}
            sx={{ cursor: 'pointer', userSelect: 'none' }}
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          >
            <DrExame
              size={38}
              sx={{ borderRadius: '14px', boxShadow: '0 2px 8px rgba(32,178,170,0.2)' }}
            />
            <Typography variant="h6" sx={{ color: 'text.primary', fontWeight: 800, fontSize: 19, letterSpacing: '-0.02em', fontFamily: 'Poppins, sans-serif' }}>
              Dr. Exame
            </Typography>
          </Stack>

          {/* Desktop Nav Items */}
          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ display: { xs: 'none', md: 'flex' } }}>
            {/* Mega Menu Trigger */}
            <Box
              onMouseEnter={() => setMenuOpen(true)}
              onMouseLeave={() => setMenuOpen(false)}
              sx={{ position: 'relative' }}
            >
              <Button
                onClick={() => setMenuOpen((o) => !o)}
                endIcon={<KeyboardArrowDownIcon sx={{ transition: 'transform .2s', transform: menuOpen ? 'rotate(180deg)' : 'none' }} />}
                sx={{
                  color: menuOpen ? TEAL_DARK : 'text.primary',
                  fontWeight: 700,
                  fontSize: 14,
                  textTransform: 'none',
                  px: 1.5,
                  py: 1,
                  borderRadius: '10px',
                  '&:hover': { bgcolor: 'rgba(32,178,170,0.08)', color: TEAL_DARK },
                }}
              >
                Recursos & Órgãos
              </Button>

              {/* Mega Menu Dropdown */}
              <Fade in={menuOpen} timeout={180}>
                <Paper
                  elevation={8}
                  sx={{
                    position: 'absolute',
                    top: 'calc(100% + 4px)',
                    left: -20,
                    width: 580,
                    p: 2,
                    borderRadius: '20px',
                    bgcolor: 'background.paper',
                    border: '1px solid rgba(32,178,170,0.16)',
                    boxShadow: '0 20px 48px rgba(15,95,90,0.14)',
                    display: menuOpen ? 'grid' : 'none',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: 1.5,
                  }}
                >
                  {recursos.map((item) => (
                    <Box
                      key={item.title}
                      component="button"
                      onClick={item.action}
                      sx={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 1.5,
                        p: 1.25,
                        borderRadius: '12px',
                        border: 'none',
                        bgcolor: 'transparent',
                        textAlign: 'left',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        transition: 'all .15s ease',
                        '&:hover': { bgcolor: 'rgba(32,178,170,0.08)' },
                      }}
                    >
                      <Box
                        sx={{
                          width: 36,
                          height: 36,
                          borderRadius: '10px',
                          bgcolor: 'rgba(32,178,170,0.12)',
                          display: 'grid',
                          placeItems: 'center',
                          flexShrink: 0,
                          mt: 0.25,
                        }}
                      >
                        {item.icon}
                      </Box>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Stack direction="row" spacing={0.75} alignItems="center">
                          <Typography sx={{ fontWeight: 800, fontSize: 13.5, color: 'text.primary', fontFamily: 'Poppins, sans-serif' }}>
                            {item.title}
                          </Typography>
                          {item.tag && (
                            <Box
                              component="span"
                              sx={{
                                fontSize: 10,
                                fontWeight: 800,
                                px: 0.75,
                                py: 0.2,
                                borderRadius: '999px',
                                bgcolor: 'rgba(32,178,170,0.16)',
                                color: TEAL_DARK,
                              }}
                            >
                              {item.tag}
                            </Box>
                          )}
                        </Stack>
                        <Typography sx={{ fontSize: 12, color: 'text.secondary', lineHeight: 1.35, mt: 0.25 }}>
                          {item.desc}
                        </Typography>
                      </Box>
                    </Box>
                  ))}
                </Paper>
              </Fade>
            </Box>

            <Button
              onClick={() => onGoToSection('demo')}
              sx={{ color: 'text.primary', fontWeight: 600, fontSize: 14, textTransform: 'none', px: 1.5, py: 1, borderRadius: '10px', '&:hover': { bgcolor: 'rgba(32,178,170,0.08)', color: TEAL_DARK } }}
            >
              Como funciona
            </Button>
            <Button
              onClick={() => onGoToSection('planos')}
              sx={{ color: 'text.primary', fontWeight: 600, fontSize: 14, textTransform: 'none', px: 1.5, py: 1, borderRadius: '10px', '&:hover': { bgcolor: 'rgba(32,178,170,0.08)', color: TEAL_DARK } }}
            >
              Planos
            </Button>
            <Button
              onClick={() => navigate('/doctor')}
              sx={{ color: 'text.primary', fontWeight: 600, fontSize: 14, textTransform: 'none', px: 1.5, py: 1, borderRadius: '10px', '&:hover': { bgcolor: 'rgba(32,178,170,0.08)', color: TEAL_DARK } }}
            >
              Para Médicos
            </Button>
            <Button
              onClick={() => navigate('/faq')}
              sx={{ color: 'text.primary', fontWeight: 600, fontSize: 14, textTransform: 'none', px: 1.5, py: 1, borderRadius: '10px', '&:hover': { bgcolor: 'rgba(32,178,170,0.08)', color: TEAL_DARK } }}
            >
              Dúvidas
            </Button>
          </Stack>

          {/* Action CTAs */}
          <Stack direction="row" spacing={1} alignItems="center">
            <Button
              onClick={() => navigate('/entrar')}
              sx={{ color: INK, fontWeight: 700, textTransform: 'none', minHeight: 40, px: 1.75, fontSize: 14 }}
            >
              Entrar
            </Button>
            {/* Outlined (não gradiente): a 1ª dobra tem UM CTA primário — o do hero. */}
            <Button
              variant="outlined"
              onClick={() => navigate('/registrar')}
              sx={{
                borderRadius: '999px',
                px: 2.5,
                py: 0.75,
                textTransform: 'none',
                fontWeight: 700,
                fontSize: 14,
                borderColor: 'primary.main',
                color: 'primary.dark',
                '&:hover': { borderColor: 'primary.dark', bgcolor: 'rgba(32,178,170,0.08)' },
              }}
            >
              Criar conta
            </Button>

            {/* Mobile Hamburger Button */}
            <IconButton
              onClick={() => setMobileOpen(true)}
              aria-label="Abrir menu"
              sx={{ display: { xs: 'flex', md: 'none' }, color: 'text.primary', ml: 0.5 }}
            >
              <MenuIcon />
            </IconButton>
          </Stack>
        </Container>
      </Box>

      {/* Drawer Mobile & APK (WebView safe, touch targets >= 48px) */}
      <Drawer
        anchor="right"
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        PaperProps={{
          sx: {
            width: '85vw',
            maxWidth: 360,
            p: 3,
            bgcolor: 'background.paper',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          },
        }}
      >
        <Box>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
            <Stack direction="row" spacing={1.25} alignItems="center">
              <DrExame size={32} sx={{ borderRadius: '10px' }} />
              <Typography sx={{ fontWeight: 800, fontSize: 18, fontFamily: 'Poppins, sans-serif' }}>Dr. Exame</Typography>
            </Stack>
            <IconButton onClick={() => setMobileOpen(false)} aria-label="Fechar menu">
              <CloseIcon />
            </IconButton>
          </Stack>

          <Typography sx={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: TEAL_DARK, mb: 1.5 }}>
            Recursos Clínicos & Órgãos
          </Typography>

          <Stack spacing={1} sx={{ mb: 3 }}>
            {recursos.map((item) => (
              <Box
                key={item.title}
                component="button"
                onClick={item.action}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  minHeight: 48,
                  p: 1,
                  borderRadius: '12px',
                  border: 'none',
                  bgcolor: 'transparent',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  '&:active': { bgcolor: 'rgba(32,178,170,0.1)' },
                }}
              >
                <Box sx={{ width: 32, height: 32, borderRadius: '8px', bgcolor: 'rgba(32,178,170,0.12)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                  {item.icon}
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Typography sx={{ fontWeight: 700, fontSize: 14, color: 'text.primary' }}>{item.title}</Typography>
                </Box>
                <ArrowForwardIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
              </Box>
            ))}
          </Stack>

          <Divider sx={{ my: 2 }} />

          <Stack spacing={1}>
            <Button
              fullWidth
              startIcon={<DescriptionIcon sx={{ color: TEAL_DARK }} />}
              onClick={() => { setMobileOpen(false); onGoToSection('demo'); }}
              sx={{ justifyContent: 'flex-start', minHeight: 48, fontWeight: 700, color: 'text.primary', textTransform: 'none', fontSize: 15 }}
            >
              Como funciona (Teste Grátis)
            </Button>
            <Button
              fullWidth
              startIcon={<CreditCardIcon sx={{ color: TEAL_DARK }} />}
              onClick={() => { setMobileOpen(false); onGoToSection('planos'); }}
              sx={{ justifyContent: 'flex-start', minHeight: 48, fontWeight: 700, color: 'text.primary', textTransform: 'none', fontSize: 15 }}
            >
              Planos & Preços
            </Button>
            <Button
              fullWidth
              startIcon={<MedicalServicesIcon sx={{ color: TEAL_DARK }} />}
              onClick={() => { setMobileOpen(false); navigate('/doctor'); }}
              sx={{ justifyContent: 'flex-start', minHeight: 48, fontWeight: 700, color: 'text.primary', textTransform: 'none', fontSize: 15 }}
            >
              Para Médicos & Nutricionistas
            </Button>
            <Button
              fullWidth
              startIcon={<HelpOutlineIcon sx={{ color: TEAL_DARK }} />}
              onClick={() => { setMobileOpen(false); navigate('/faq'); }}
              sx={{ justifyContent: 'flex-start', minHeight: 48, fontWeight: 700, color: 'text.primary', textTransform: 'none', fontSize: 15 }}
            >
              Dúvidas Frequentes
            </Button>
          </Stack>
        </Box>

        <Box sx={{ pt: 3 }}>
          <Button
            fullWidth
            variant="contained"
            onClick={() => { setMobileOpen(false); navigate('/registrar'); }}
            sx={{
              borderRadius: '12px',
              py: 1.5,
              fontWeight: 800,
              fontSize: 15,
              bgcolor: TEAL_DARK,
              textTransform: 'none',
              mb: 1.5,
            }}
          >
            Criar conta grátis
          </Button>
          <Button
            fullWidth
            onClick={() => { setMobileOpen(false); navigate('/entrar'); }}
            sx={{
              borderRadius: '12px',
              py: 1.2,
              fontWeight: 700,
              fontSize: 14,
              color: INK,
              textTransform: 'none',
            }}
          >
            Já tenho conta · Entrar
          </Button>
        </Box>
      </Drawer>
    </>
  );
};
