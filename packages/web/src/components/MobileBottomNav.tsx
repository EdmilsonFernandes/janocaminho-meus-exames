import { useState } from 'react';
import { Box, Typography, useMediaQuery, useTheme, Drawer, List, ListItemButton, ListItemIcon, ListItemText, Divider } from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';
import { DrExame } from './DrExame';

/** Menu rodapé fixo (só mobile) — 4 atalhos + "Mais" que abre o menu lateral (drawer). */
const NAV = [
  { icon: '🏠', label: 'Início', to: '/' },
  { icon: '📋', label: 'Exames', to: '/exams' },
  { icon: '🤖', label: 'Dr. Exame', to: '/chat' },
  { icon: '📈', label: 'Evolução', to: '/evolucao' },
];
const MORE = [
  { icon: '👤', label: 'Meu perfil', to: '/perfil' },
  { icon: '🩺', label: 'Meus Médicos', to: '/medicos' },
  { icon: '👨‍👩‍👧', label: 'Dependentes', to: '/patients' },
  { icon: '🌳', label: 'Família', to: '/familia' },
  { icon: '📊', label: 'Tendências', to: '/tendencias' },
  { icon: '🕒', label: 'Linha do tempo', to: '/linha-do-tempo' },
  { icon: '🧾', label: 'Relatório completo', to: '/relatorio' },
  { icon: '⚠️', label: 'Valores alterados', to: '/alterados' },
  { icon: '💰', label: 'Despesas médicas', to: '/despesas' },
  { icon: '💉', label: 'Vacinas', to: '/vacinas' },
  { icon: '📏', label: 'Medições', to: '/medicoes' },
  { icon: '🚨', label: 'Cartão de emergência', to: '/emergencia' },
  { icon: '🔔', label: 'Lembretes', to: '/lembretes' },
  { icon: '💎', label: 'Planos e créditos', to: '/planos' },
];

export const MobileBottomNav = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [mais, setMais] = useState(false);
  if (!isMobile) return null;
  const active = (to: string) => (to === '/' ? pathname === '/' : pathname.startsWith(to));
  const anyMoreActive = MORE.some((m) => active(m.to));

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
    <>
      <Box component="nav" sx={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1100, display: 'flex', justifyContent: 'space-around',
        bgcolor: 'rgba(238,247,246,.96)', backdropFilter: 'blur(14px)', borderTop: '1px solid #dceaea',
        pb: 'env(safe-area-inset-bottom)', boxShadow: '0 -6px 24px rgba(32,178,170,.10)',
      }}>
        {NAV.map((it) => item(it, undefined, active(it.to)))}
        {item({ icon: '☰', label: 'Mais', to: '#mais' }, () => setMais(true), anyMoreActive)}
      </Box>

      <Drawer open={mais} onClose={() => setMais(false)} PaperProps={{ sx: { width: 296, background: 'linear-gradient(180deg,#ffffff,#f1f9f8)' } }}>
        <Box sx={{ p: 2, pb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
          <DrExame size={36} sx={{ borderRadius: '22%', boxShadow: '0 2px 6px rgba(32,178,170,.25)' }} />
          <Box>
            <Typography sx={{ fontWeight: 800, color: '#178f89', lineHeight: 1.1 }}>Meus Exames</Typography>
            <Typography variant="caption" color="text.secondary">Mais opções</Typography>
          </Box>
        </Box>
        <Divider />
        <List sx={{ pt: 1, '& .MuiListItemButton-root': { borderRadius: 2, m: '2px 10px' } }}>
          {MORE.map((m) => (
            <ListItemButton key={m.to} onClick={() => { setMais(false); navigate(m.to); }} selected={active(m.to)}>
              <ListItemIcon sx={{ minWidth: 34, fontSize: 18 }}>{m.icon}</ListItemIcon>
              <ListItemText primary={m.label} primaryTypographyProps={{ fontSize: 14, fontWeight: active(m.to) ? 700 : 500 }} />
            </ListItemButton>
          ))}
        </List>
      </Drawer>
    </>
  );
};
