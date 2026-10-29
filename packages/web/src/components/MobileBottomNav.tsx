import { useEffect, useRef } from 'react';
import { Box, Typography, useMediaQuery, useTheme } from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslate } from 'react-admin';
import { useAppDrawer } from './drawerState';
import { DrExame } from './DrExame';
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import HomeIcon from '@mui/icons-material/Home';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import DescriptionIcon from '@mui/icons-material/Description';
import TrendingUpOutlinedIcon from '@mui/icons-material/TrendingUpOutlined';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import VideocamOutlinedIcon from '@mui/icons-material/VideocamOutlined';
import VideocamRoundedIcon from '@mui/icons-material/VideocamRounded';
import MenuIcon from '@mui/icons-material/Menu';
import AlarmOnIcon from '@mui/icons-material/AlarmOn';
import AlarmOutlinedIcon from '@mui/icons-material/AlarmOutlined';
import { hapticNav } from '../utils/haptic';
import { NAV_PILL } from '../theme';

/**
 * MobileBottomNav Ultra-Premium — "Floating Glass Island" (Cápsula de Vidro Flutuante).
 * Design moderno em cápsula suspensa com lente óptica 3D, desfoque de fundo e micro-pontos de indicação.
 */
const NAV = [
  { icon: 'home', label: 'nav.home', to: '/' },
  { icon: 'exam', label: 'nav.exams', to: '/exams' },
  // Minhas Consultas (mock aprovado): posição 3 da nav — teleconsultas do paciente.
  { icon: 'consultas', label: 'nav.consultas', to: '/consultas' },
  { icon: '', label: 'Dr. Exame', to: '/chat', robot: true },
  // Lembretes volta pra barra (dono 24/10: "sumiu" no drawer). 5 abas + Mais = o limite
  // do pill em 390px (6 slots × ~61px): com a 6ª aba o "Mais" era espremido a 37px e
  // saía 100px da tela (incidente 25/10). Evolução fica no menu vertical (AppMenu).
  { icon: 'lembretes', label: 'nav.reminders', to: '/lembretes' },
] as const;
const SECONDARY_ROUTES = ['/alterados', '/tendencias', '/evolucao', '/linha-do-tempo', '/medicoes', '/medicamentos', '/vacinas', '/lembretes', '/emergencia', '/conquistas', '/familia', '/patients', '/medicos', '/perguntas', '/relatorio', '/despesas', '/perfil', '/seguranca', '/privacidade', '/planos', '/suporte', '/admin'];

export const MobileBottomNav = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const isDark = theme.palette.mode === 'dark';
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { openDrawer } = useAppDrawer();
  const translate = useTranslate();
  const navRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const update = () => document.documentElement.style.setProperty('--me-bottom-nav-h', `${el.offsetHeight + 16}px`);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => { ro.disconnect(); document.documentElement.style.removeProperty('--me-bottom-nav-h'); };
  }, []);

  if (!isMobile) return null;
  const active = (to: string) => (to === '/' ? pathname === '/' : pathname.startsWith(to));
  const maisActive = SECONDARY_ROUTES.some((r) => active(r));

  const item = (it: { icon: string; label: string; to: string; robot?: boolean }, onClick?: () => void, on?: boolean) => (
    <Box key={it.to} component="button" type="button" aria-current={on ? 'page' : undefined}
      aria-label={it.robot ? 'Dr. Exame — conversar com a IA' : translate(it.label)}
      onClick={() => { hapticNav(); (onClick ?? (() => navigate(it.to)))(); }} sx={{
      flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      py: 0.5, cursor: 'pointer', userSelect: 'none',
      background: 'transparent', border: 'none', fontFamily: 'inherit', textAlign: 'center',
      borderRadius: '12px', outline: 'none',
      '&:focus-visible': { boxShadow: '0 0 0 3px rgba(32,178,170,0.55)' },
      color: on ? (isDark ? '#5fc9c3' : '#178f89') : (isDark ? 'rgba(255,255,255,0.55)' : 'rgba(30,41,59,0.68)'),
      position: 'relative',
      transition: 'color .18s ease, transform .12s ease, background-color .25s cubic-bezier(.16,1,.3,1), padding .25s cubic-bezier(.16,1,.3,1), border-radius .25s cubic-bezier(.16,1,.3,1)',
      '&:active': { transform: 'scale(.94)' },
      // Pill da tab ativa (polish 10/26): fundo teal translúcido + padding generoso.
      ...(on ? { background: NAV_PILL.bg, padding: NAV_PILL.padding, borderRadius: NAV_PILL.radius, alignSelf: 'stretch' } : {}),
    }}>
      {it.robot ? (
        <Box sx={{
          width: 48, height: 48, borderRadius: '50%',
          background: 'linear-gradient(135deg, #20b2aa, #178f89)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: '2.5px solid', borderColor: isDark ? 'rgba(20,30,30,0.9)' : '#ffffff',
          boxShadow: '0 8px 22px rgba(32,178,170,.5), 0 2px 6px rgba(32,178,170,.3)',
          transform: on ? 'translateY(-12px) scale(1.08)' : 'translateY(-8px)',
          transition: 'transform .22s cubic-bezier(.16,1,.3,1), box-shadow .2s ease',
        }}>
          <DrExame size={34} sx={{ borderRadius: '50%' }} />
        </Box>
      ) : (
        <Box sx={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          height: 24,
          transform: on ? 'scale(1.12) translateY(-1px)' : 'scale(1)',
          filter: on ? 'drop-shadow(0 2px 8px rgba(32,178,170,0.45))' : 'none',
          transition: 'transform .2s cubic-bezier(.16,1,.3,1), filter .2s ease',
          '& svg': { fontSize: 22 }
        }}>
          {it.icon === 'home' && (on ? <HomeIcon /> : <HomeOutlinedIcon />)}
          {it.icon === 'exam' && (on ? <DescriptionIcon /> : <DescriptionOutlinedIcon />)}
          {it.icon === 'consultas' && (on ? <VideocamRoundedIcon /> : <VideocamOutlinedIcon />)}
          {it.icon === 'lembretes' && (on ? <AlarmOnIcon /> : <AlarmOutlinedIcon />)}
          {it.icon === 'trend' && (on ? <TrendingUpIcon /> : <TrendingUpOutlinedIcon />)}
        </Box>
      )}
      <Typography sx={{
        fontSize: { xs: 9, sm: 11.5 },
        fontWeight: on ? 800 : 500,
        mt: it.robot ? 0 : 0.2,
        fontFamily: 'Poppins, sans-serif',
        maxWidth: '100%',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        px: 0,
        letterSpacing: '-0.04em',
        display: it.robot ? 'none' : 'block',
      }}>
        {translate(it.label)}
      </Typography>
    </Box>
  );

  const maisItem = (on: boolean, onClick?: () => void) => (
    <Box component="button" type="button" aria-label={translate('nav.more')} onClick={() => { hapticNav(); onClick?.(); }} sx={{
      flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      py: 0.5, cursor: 'pointer', userSelect: 'none',
      background: 'transparent', border: 'none', fontFamily: 'inherit', textAlign: 'center',
      borderRadius: '12px', outline: 'none',
      '&:focus-visible': { boxShadow: '0 0 0 3px rgba(32,178,170,0.55)' },
      color: on ? (isDark ? '#5fc9c3' : '#178f89') : (isDark ? 'rgba(255,255,255,0.55)' : 'rgba(30,41,59,0.68)'),
      position: 'relative',
      transition: 'color .18s ease, transform .12s ease, background-color .25s cubic-bezier(.16,1,.3,1), padding .25s cubic-bezier(.16,1,.3,1), border-radius .25s cubic-bezier(.16,1,.3,1)',
      '&:active': { transform: 'scale(.94)' },
      // Pill da tab ativa (polish 10/26): fundo teal translúcido + padding generoso.
      ...(on ? { background: NAV_PILL.bg, padding: NAV_PILL.padding, borderRadius: NAV_PILL.radius, alignSelf: 'stretch' } : {}),
    }}>
      <Box sx={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: 24,
        transform: on ? 'scale(1.05)' : 'scale(1)',
        filter: on ? 'drop-shadow(0 2px 8px rgba(32,178,170,0.45))' : 'none',
        transition: 'transform .25s cubic-bezier(.16,1,.3,1), filter .25s ease',
        '& svg': { fontSize: 22 }
      }}>
        {on ? <MenuIcon /> : <MenuIcon sx={{ opacity: 0.65 }} />}
      </Box>
      <Typography sx={{
        fontSize: { xs: 9, sm: 11.5 },
        fontWeight: on ? 800 : 500,
        mt: 0.2,
        fontFamily: 'Poppins, sans-serif',
        letterSpacing: '-0.04em',
        maxWidth: '100%',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        px: 0,
      }}>
        {translate('nav.more')}
      </Typography>
    </Box>
  );

  return (
    <Box ref={navRef} component="nav" sx={{
      position: 'fixed',
      bottom: 'max(10px, env(safe-area-inset-bottom))',
      left: { xs: 12, sm: 24 },
      right: { xs: 12, sm: 24 },
      maxWidth: 460,
      margin: '0 auto',
      height: 60,
      borderRadius: '16px',
      zIndex: 1100,
      display: 'flex', justifyContent: 'space-around', alignItems: 'center',
      // Vidro Flutuante 3D (Floating Island Lens):
      bgcolor: isDark ? 'rgba(18, 28, 28, 0.75)' : 'rgba(255, 255, 255, 0.72)',
      backdropFilter: 'blur(28px) saturate(200%)',
      WebkitBackdropFilter: 'blur(28px) saturate(200%)',
      border: '1px solid',
      borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.7)',
      boxShadow: isDark
        ? '0 12px 36px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.12)'
        : '0 12px 36px rgba(32,178,170,0.15), 0 4px 12px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.85)',
    }}>
      {NAV.map((it) => item(it, undefined, active(it.to)))}
      {maisItem(maisActive, () => openDrawer())}
    </Box>
  );
};
