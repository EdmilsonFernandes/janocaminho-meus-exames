import { useEffect, useRef, useState } from 'react';
import { Box, Typography, useMediaQuery, useTheme } from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslate } from 'react-admin';
import { useAppDrawer } from './drawerState';
import { RobotOrb } from './RobotOrb';
// Uma família só (Material Symbols "Rounded" cheio na aba ativa, "Outlined" nas outras): mesmo
// traço, mesmo canto e mesma caixa de 24px — antes misturava Alarm/Videocam/Menu de famílias
// diferentes e cada ícone parecia de um app.
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import HomeRoundedIcon from '@mui/icons-material/HomeRounded';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import DescriptionRoundedIcon from '@mui/icons-material/DescriptionRounded';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import CalendarMonthRoundedIcon from '@mui/icons-material/CalendarMonthRounded';
import GridViewOutlinedIcon from '@mui/icons-material/GridViewOutlined';
import GridViewRoundedIcon from '@mui/icons-material/GridViewRounded';
import { hapticNav } from '../utils/haptic';
import { afterPaint } from '../utils/snappy';
import { NAV_PILL } from '../theme';

/**
 * MobileBottomNav Ultra-Premium — "Floating Glass Island" (Cápsula de Vidro Flutuante).
 * Design moderno em cápsula suspensa com lente óptica 3D, desfoque de fundo e micro-pontos de indicação.
 */
const NAV = [
  { icon: 'home', label: 'nav.home', to: '/' },
  { icon: 'exam', label: 'nav.exams', to: '/exams' },
  { icon: '', label: 'Dr. Exame', to: '/chat', robot: true },
  // Lembretes volta pra barra (dono 24/10: "sumiu" no drawer).
  { icon: 'lembretes', label: 'nav.reminders', to: '/lembretes' },
] as const;
// BARRA MAIS LIMPA (28/11/26, pedido do dono): Consultas saiu da barra — 2 abas de cada lado do
// robô, que agora fica no centro exato. Consultas continua no menu ("Consultas e médicos", com o
// selo "hoje"/"ao vivo") e na aba Consultas da Agenda; a teleconsulta do dia segue no Início.
const SECONDARY_ROUTES = ['/consultas', '/teleconsulta', '/alterados', '/tendencias', '/evolucao', '/linha-do-tempo', '/medicoes', '/composicao', '/medicamentos', '/vacinas', '/lembretes', '/emergencia', '/conquistas', '/familia', '/patients', '/medicos', '/perguntas', '/relatorio', '/despesas', '/perfil', '/seguranca', '/privacidade', '/planos', '/suporte', '/admin'];

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

  // ABA ACENDE NO TOQUE: a tela nova pode levar centenas de ms para montar; sem isto a barra só
  // mudava quando a tela inteira ficava pronta ("toquei e demorou"). A aba tocada acende já, a
  // navegação começa no quadro seguinte, e o estado otimista sai quando a rota muda de fato.
  const [pendingTo, setPendingTo] = useState<string | null>(null);
  useEffect(() => { setPendingTo(null); }, [pathname]);
  const go = (to: string) => {
    if (to === pathname) return;
    setPendingTo(to);
    afterPaint(() => navigate(to));
  };

  if (!isMobile) return null;
  const shownPath = pendingTo ?? pathname;
  const active = (to: string) => (to === '/' ? shownPath === '/' : shownPath.startsWith(to));
  // "Mais" só acende quando a rota NÃO é uma das abas principais (antes /lembretes acendia Agenda e Mais juntos).
  const maisActive = !NAV.some((it) => active(it.to)) && SECONDARY_ROUTES.some((r) => active(r));

  const item = (it: { icon: string; label: string; to: string; robot?: boolean }, onClick?: () => void, on?: boolean) => (
    <Box key={it.to} component="button" type="button" aria-current={on ? 'page' : undefined}
      aria-label={it.robot ? 'Dr. Exame — conversar com a IA' : translate(it.label)}
      onClick={() => { hapticNav(); (onClick ?? (() => go(it.to)))(); }} sx={{
      // 5 colunas iguais: o robô fica no centro exato e cada ícone na mesma posição em toda tela.
      flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      py: 0.5, cursor: 'pointer', userSelect: 'none',
      background: 'transparent', border: 'none', fontFamily: 'inherit', textAlign: 'center',
      borderRadius: '12px', outline: 'none',
      '&:focus-visible': { boxShadow: '0 0 0 3px rgba(32,178,170,0.55)' },
      color: on ? (isDark ? '#5fc9c3' : '#178f89') : (isDark ? 'rgba(255,255,255,0.55)' : 'rgba(30,41,59,0.68)'),
      position: 'relative',
      transition: 'color .18s ease, transform .12s ease, background-color .25s cubic-bezier(.16,1,.3,1), padding .25s cubic-bezier(.16,1,.3,1), border-radius .25s cubic-bezier(.16,1,.3,1)',
      '&:active': { transform: 'scale(.94)' },
      // Pill da tab ativa (polish 10/26): fundo teal translúcido + padding generoso.
      // O robô não ganha a pílula: o "aceso" dele é a própria aura (RobotOrb).
      ...(on && !it.robot ? { background: NAV_PILL.bg, padding: NAV_PILL.padding, borderRadius: NAV_PILL.radius, alignSelf: 'stretch' } : {}),
    }}>
      {it.robot ? (
        <RobotOrb on={!!on} dark={isDark} />
      ) : (
        <Box sx={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          height: 24,
          transform: on ? 'scale(1.12) translateY(-1px)' : 'scale(1)',
          filter: on ? 'drop-shadow(0 2px 8px rgba(32,178,170,0.45))' : 'none',
          transition: 'transform .2s cubic-bezier(.16,1,.3,1), filter .2s ease',
          '& svg': { fontSize: 22 }
        }}>
          {it.icon === 'home' && (on ? <HomeRoundedIcon /> : <HomeOutlinedIcon />)}
          {it.icon === 'exam' && (on ? <DescriptionRoundedIcon /> : <DescriptionOutlinedIcon />)}
          {it.icon === 'lembretes' && (on ? <CalendarMonthRoundedIcon /> : <CalendarMonthOutlinedIcon />)}
        </Box>
      )}
      <Typography sx={{
        fontSize: 12, // floor de leitura do design system (antes xs:10 — 6 slots × 61px comportam 12px)
        fontWeight: on ? 800 : 500,
        mt: it.robot ? 0 : 0.2,
        fontFamily: 'Poppins, sans-serif',
        textAlign: 'center',
        // FONTE AMPLIADA (27/11/26, Android a 130%): com 'visible' os rótulos invadiam o vizinho
        // ("ExamesConsultas", "AgendaMais"). Agora cada rótulo fica na sua coluna e, se não couber,
        // termina em "…" — o ícone e o nome completo (aria-label) continuam lá.
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        maxWidth: '100%',
        px: 0.25,
        letterSpacing: '-0.03em',
        display: it.robot ? 'none' : 'block',
      }}>
        {translate(it.label)}
      </Typography>
    </Box>
  );

  const maisItem = (on: boolean, onClick?: () => void) => (
    <Box component="button" type="button" aria-label={translate('nav.more')} onClick={() => { hapticNav(); onClick?.(); }} sx={{
      // 5 colunas iguais: o robô fica no centro exato e cada ícone na mesma posição em toda tela.
      flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
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
        transform: on ? 'scale(1.12) translateY(-1px)' : 'scale(1)',
        filter: on ? 'drop-shadow(0 2px 8px rgba(32,178,170,0.45))' : 'none',
        transition: 'transform .25s cubic-bezier(.16,1,.3,1), filter .25s ease',
        '& svg': { fontSize: 22 }
      }}>
        {on ? <GridViewRoundedIcon /> : <GridViewOutlinedIcon />}
      </Box>
      <Typography sx={{
        fontSize: 12, // floor de leitura (antes xs:10)
        fontWeight: on ? 800 : 500,
        mt: 0.2,
        fontFamily: 'Poppins, sans-serif',
        letterSpacing: '-0.03em',
        textAlign: 'center',
        // FONTE AMPLIADA (27/11/26, Android a 130%): com 'visible' os rótulos invadiam o vizinho
        // ("ExamesConsultas", "AgendaMais"). Agora cada rótulo fica na sua coluna e, se não couber,
        // termina em "…" — o ícone e o nome completo (aria-label) continuam lá.
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        maxWidth: '100%',
        px: 0.25,
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
      '@media (max-width:359.95px)': { left: 6, right: 6 },
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
