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
import MenuIcon from '@mui/icons-material/Menu';
import { hapticLight } from '../utils/haptic';

/** Menu rodapé premium — ícones MUI (filled quando ativo, outlined quando não). Sem emojis. */
const NAV = [
  { icon: 'home', label: 'nav.home', to: '/' },
  { icon: 'exam', label: 'nav.exams', to: '/exams' },
  { icon: '', label: 'Dr. Exame', to: '/chat', robot: true },
  { icon: 'trend', label: 'nav.evolution', to: '/evolucao' },
] as const;
const SECONDARY_ROUTES = ['/alterados', '/tendencias', '/linha-do-tempo', '/medicoes', '/vacinas', '/lembretes', '/emergencia', '/familia', '/patients', '/medicos', '/relatorio', '/despesas', '/perfil', '/planos', '/admin'];

export const MobileBottomNav = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const isDark = theme.palette.mode === 'dark';
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { openDrawer } = useAppDrawer();
  const translate = useTranslate();
  const navRef = useRef<HTMLDivElement>(null);
  // Publica a altura REAL do rodapé numa CSS var — quem flutua (ex.: FAB "+") usa pra nunca ficar por baixo.
  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const update = () => document.documentElement.style.setProperty('--me-bottom-nav-h', `${el.offsetHeight}px`);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => { ro.disconnect(); document.documentElement.style.removeProperty('--me-bottom-nav-h'); };
  }, []);
  if (!isMobile) return null;
  const active = (to: string) => (to === '/' ? pathname === '/' : pathname.startsWith(to));
  const maisActive = SECONDARY_ROUTES.some((r) => active(r));

  const item = (it: { icon: string; label: string; to: string; robot?: boolean }, onClick?: () => void, on?: boolean) => (
    <Box key={it.to} onClick={() => { hapticLight(); (onClick ?? (() => navigate(it.to)))(); }} sx={{
      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      py: 0.7, cursor: 'pointer', userSelect: 'none', color: on ? '#178f89' : 'text.secondary',
      borderRadius: 2, bgcolor: on ? 'rgba(32,178,170,.10)' : 'transparent',
      transition: 'background-color .2s, color .15s, transform .1s', '&:active': { transform: 'scale(.90)' },
    }}>
      {it.robot ? (
        <Box sx={{
          width: 44, height: 44, borderRadius: '50%', bgcolor: '#20b2aa',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: '2.5px solid #fff', boxShadow: '0 5px 14px rgba(32,178,170,.40)',
          transform: on ? 'translateY(-6px) scale(1.04)' : 'translateY(-3px)',
          transition: 'transform .18s ease',
        }}>
          <DrExame size={32} sx={{ borderRadius: '50%' }} />
        </Box>
      ) : (
        // Ícones MUI premium (filled quando ativo, outlined quando não) — sem emojis
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 24, transform: on ? 'scale(1.12)' : 'scale(1)', transition: 'transform .18s ease', '& svg': { fontSize: 22 } }}>
          {it.icon === 'home' && (on ? <HomeIcon /> : <HomeOutlinedIcon />)}
          {it.icon === 'exam' && (on ? <DescriptionIcon /> : <DescriptionOutlinedIcon />)}
          {it.icon === 'trend' && (on ? <TrendingUpIcon /> : <TrendingUpOutlinedIcon />)}
        </Box>
      )}
      <Typography sx={{ fontSize: 10, fontWeight: on ? 800 : 600, mt: 0.25, fontFamily: 'Poppins, sans-serif', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', px: 0.5 }}>{it.robot ? 'Dr. Exame' : translate(it.label)}</Typography>
      <Box sx={{ height: 3, width: on ? 22 : 0, borderRadius: 9, bgcolor: '#20b2aa', mt: 0.3, transition: 'width .2s' }} />
    </Box>
  );

  // Botão "Mais" usa ícone MUI (não emoji ☰)
  const maisItem = (on: boolean, onClick?: () => void) => (
    <Box onClick={() => { hapticLight(); onClick?.(); }} sx={{
      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      py: 0.7, cursor: 'pointer', userSelect: 'none', color: on ? '#178f89' : 'text.secondary',
      borderRadius: 2, bgcolor: on ? 'rgba(32,178,170,.10)' : 'transparent',
      transition: 'background-color .2s, color .15s, transform .1s', '&:active': { transform: 'scale(.90)' },
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 24, transform: on ? 'scale(1.12)' : 'scale(1)', transition: 'transform .18s ease', '& svg': { fontSize: 22 } }}>
        {on ? <MenuIcon /> : <MenuIcon sx={{ opacity: 0.5 }} />}
      </Box>
      <Typography sx={{ fontSize: 10, fontWeight: on ? 800 : 600, mt: 0.25, fontFamily: 'Poppins, sans-serif' }}>{translate('nav.more')}</Typography>
      <Box sx={{ height: 3, width: on ? 22 : 0, borderRadius: 9, bgcolor: '#20b2aa', mt: 0.3, transition: 'width .2s' }} />
    </Box>
  );

  return (
    <Box ref={navRef} component="nav" sx={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1100, display: 'flex', justifyContent: 'space-around',
      bgcolor: isDark ? 'rgba(26,36,36,.97)' : 'rgba(255,255,255,.97)', backdropFilter: 'blur(16px)', borderTop: '1px solid', borderColor: 'divider',
      pb: 'env(safe-area-inset-bottom)', boxShadow: isDark ? '0 -2px 16px rgba(0,0,0,.5)' : '0 -2px 12px rgba(0,0,0,.04)',
    }}>
      {NAV.map((it) => item(it, undefined, active(it.to)))}
      {maisItem(maisActive, () => openDrawer())}
    </Box>
  );
};
