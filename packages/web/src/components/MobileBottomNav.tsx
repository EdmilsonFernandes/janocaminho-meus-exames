import { Box, Typography, useMediaQuery, useTheme } from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSidebarState } from 'react-admin';

/** Menu rodapé fixo (só mobile) — 4 atalhos + "Mais" que abre o MESMO sidebar do react-admin (unificado com o ☰). */
const NAV = [
  { icon: '🏠', label: 'Início', to: '/' },
  { icon: '📋', label: 'Exames', to: '/exams' },
  { icon: '🤖', label: 'Dr. Exame', to: '/chat' },
  { icon: '📈', label: 'Evolução', to: '/evolucao' },
];
const SECONDARY_ROUTES = ['/alterados', '/tendencias', '/linha-do-tempo', '/medicoes', '/vacinas', '/lembretes', '/emergencia', '/familia', '/patients', '/medicos', '/relatorio', '/despesas', '/perfil', '/planos', '/admin'];

export const MobileBottomNav = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const sidebarState = useSidebarState();
  const setSidebarOpen = sidebarState[1];
  if (!isMobile) return null;
  const active = (to: string) => (to === '/' ? pathname === '/' : pathname.startsWith(to));
  const maisActive = SECONDARY_ROUTES.some((r) => active(r));

  const item = (it: { icon: string; label: string; to: string }, onClick?: () => void, on?: boolean) => (
    <Box key={it.to} onClick={onClick ?? (() => navigate(it.to))} sx={{
      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      py: 0.95, cursor: 'pointer', userSelect: 'none', color: on ? '#178f89' : '#8a979c',
      transition: 'color .15s, transform .1s', '&:active': { transform: 'scale(.92)' },
    }}>
      <Box sx={{ fontSize: 21, lineHeight: 1, transform: on ? 'translateY(-1px)' : 'none', transition: 'transform .15s' }}>{it.icon}</Box>
      <Typography sx={{ fontSize: 10, fontWeight: on ? 800 : 600, mt: 0.25, fontFamily: 'Poppins, sans-serif' }}>{it.label}</Typography>
      <Box sx={{ height: 3, width: on ? 22 : 0, borderRadius: 9, bgcolor: '#20b2aa', mt: 0.3, transition: 'width .2s' }} />
    </Box>
  );

  return (
    <Box component="nav" sx={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1100, display: 'flex', justifyContent: 'space-around',
      bgcolor: 'rgba(238,247,246,.96)', backdropFilter: 'blur(14px)', borderTop: '1px solid #dceaea',
      pb: 'env(safe-area-inset-bottom)', boxShadow: '0 -6px 24px rgba(32,178,170,.10)',
    }}>
      {NAV.map((it) => item(it, undefined, active(it.to)))}
      {/* "Mais" abre o MESMO sidebar do react-admin (AppMenu com grupos, Ajuda, Sobre, Sair) */}
      {item({ icon: '☰', label: 'Mais', to: '#mais' }, () => setSidebarOpen(true), maisActive)}
    </Box>
  );
};
