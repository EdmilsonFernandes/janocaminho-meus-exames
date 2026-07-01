import { useEffect, useRef } from 'react';
import { Box, Typography, useMediaQuery, useTheme } from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAppDrawer } from './drawerState';
import { DrExame } from './DrExame';

/** Menu rodapé fixo (só mobile) — 4 atalhos + "Mais". O Dr. Exame tem o ROBÔ em destaque (círculo teal elevado). */
const NAV = [
  { icon: '🏠', label: 'Início', to: '/' },
  { icon: '📋', label: 'Exames', to: '/exams' },
  { icon: '', label: 'Dr. Exame', to: '/chat', robot: true },
  { icon: '📈', label: 'Evolução', to: '/evolucao' },
] as const;
const SECONDARY_ROUTES = ['/alterados', '/tendencias', '/linha-do-tempo', '/medicoes', '/vacinas', '/lembretes', '/emergencia', '/familia', '/patients', '/medicos', '/relatorio', '/despesas', '/perfil', '/planos', '/admin'];

export const MobileBottomNav = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { openDrawer } = useAppDrawer();
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
    <Box key={it.to} onClick={onClick ?? (() => navigate(it.to))} sx={{
      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      py: 0.7, cursor: 'pointer', userSelect: 'none', color: on ? '#178f89' : '#8a979c',
      transition: 'color .15s, transform .1s', '&:active': { transform: 'scale(.92)' },
    }}>
      {it.robot ? (
        // Robô Dr. Exame em destaque: círculo teal + anel branco + halo, levemente elevado
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
        <Box sx={{ fontSize: 21, lineHeight: 1, transform: on ? 'translateY(-1px)' : 'none', transition: 'transform .15s' }}>{it.icon}</Box>
      )}
      <Typography sx={{ fontSize: 10, fontWeight: on ? 800 : 600, mt: 0.25, fontFamily: 'Poppins, sans-serif', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', px: 0.5 }}>{it.label}</Typography>
      <Box sx={{ height: 3, width: on ? 22 : 0, borderRadius: 9, bgcolor: '#20b2aa', mt: 0.3, transition: 'width .2s' }} />
    </Box>
  );

  return (
    <Box ref={navRef} component="nav" sx={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1100, display: 'flex', justifyContent: 'space-around',
      bgcolor: 'rgba(238,247,246,.96)', backdropFilter: 'blur(14px)', borderTop: '1px solid #dceaea',
      pb: 'env(safe-area-inset-bottom)', boxShadow: '0 -6px 24px rgba(32,178,170,.10)',
    }}>
      {NAV.map((it) => item(it, undefined, active(it.to)))}
      {item({ icon: '☰', label: 'Mais', to: '#mais' }, () => openDrawer(), maisActive)}
    </Box>
  );
};
