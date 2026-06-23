import { useState } from 'react';
import { Box, Typography, useMediaQuery, useTheme, Drawer, List, ListItemButton, ListItemIcon, ListItemText, Divider, Collapse, Stack } from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';
import { useLogout } from 'react-admin';
import { DrExame } from './DrExame';

/** Menu rodapé fixo (só mobile) — 4 atalhos + "Mais" que abre o menu lateral (drawer). */
const NAV = [
  { icon: '🏠', label: 'Início', to: '/' },
  { icon: '📋', label: 'Exames', to: '/exams' },
  { icon: '🤖', label: 'Dr. Exame', to: '/chat' },
  { icon: '📈', label: 'Evolução', to: '/evolucao' },
];
// Menu "Mais" = ESPELHO do menu lateral (AppMenu). Mesmas opções/rotas, mesma ordem.
// (Início/Evolução/Exames/Chat também ficam aqui pra ter paridade total com a sidebar.)
const MORE = [
  { icon: '🏠', label: 'Início', to: '/' },
  { icon: '👤', label: 'Meu perfil', to: '/perfil' },
  { icon: '📈', label: 'Evolução', to: '/evolucao' },
  { icon: '📋', label: 'Exames', to: '/exams' },
  { icon: '👨‍👩‍👧', label: 'Dependentes', to: '/patients' },
  { icon: '🌳', label: 'Família', to: '/familia' },
  { icon: '🩺', label: 'Meus Médicos', to: '/medicos' },
  { icon: '📊', label: 'Tendências', to: '/tendencias' },
  { icon: '🕒', label: 'Linha do tempo', to: '/linha-do-tempo' },
  { icon: '🧾', label: 'Relatório completo', to: '/relatorio' },
  { icon: '⚠️', label: 'Valores alterados', to: '/alterados' },
  { icon: '🔔', label: 'Lembretes', to: '/lembretes' },
  { icon: '📏', label: 'Medições', to: '/medicoes' },
  { icon: '💉', label: 'Vacinas', to: '/vacinas' },
  { icon: '💰', label: 'Despesas médicas', to: '/despesas' },
  { icon: '🚨', label: 'Cartão de emergência', to: '/emergencia' },
  { icon: '🤖', label: 'Chat (Dr. Exame)', to: '/chat' },
  { icon: '💎', label: 'Planos e créditos', to: '/planos' },
];
const NAV_TO = new Set(NAV.map((n) => n.to));

export const MobileBottomNav = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const logout = useLogout();
  const [mais, setMais] = useState(false);
  // Admin só aparece pra ADMIN (lê do localStorage — salvo no login, igual ao AppMenu)
  const userStr = typeof localStorage !== 'undefined' ? localStorage.getItem('user') : null;
  const isAdmin = userStr ? (JSON.parse(userStr)?.role === 'ADMIN') : false;
  if (!isMobile) return null;
  const active = (to: string) => (to === '/' ? pathname === '/' : pathname.startsWith(to));
  // "Mais" fica destacado só numa rota SECUNDÁRIA (não nas 4 do rodapé) — evita destaque duplo
  const anyMoreActive = MORE.some((m) => !NAV_TO.has(m.to) && active(m.to));

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
            <Typography variant="caption" color="text.secondary">Menu completo</Typography>
          </Box>
        </Box>
        <Divider />
        <List sx={{ pt: 1, pb: 1, '& .MuiListItemButton-root': { borderRadius: 2, m: '0 10px' } }}>
          {/* Início + Chat direto */}
          <ListItemButton onClick={() => { setMais(false); navigate('/'); }} selected={active('/')}><ListItemIcon sx={{ minWidth: 30, fontSize: 16 }}>🏠</ListItemIcon><ListItemText primary="Início" primaryTypographyProps={{ fontSize: 14, fontWeight: active('/') ? 700 : 500 }} /></ListItemButton>
          <ListItemButton onClick={() => { setMais(false); navigate('/chat'); }} selected={active('/chat')}><ListItemIcon sx={{ minWidth: 30, fontSize: 16 }}>🤖</ListItemIcon><ListItemText primary="Dr. Exame (IA)" primaryTypographyProps={{ fontSize: 14, fontWeight: active('/chat') ? 700 : 500 }} /></ListItemButton>

          {/* 📋 EXAMES */}
          <Typography sx={{ px: 3, pt: 1.5, pb: 0.25, fontSize: 11, fontWeight: 800, color: '#94a3b8', letterSpacing: 0.5 }}>📋 EXAMES</Typography>
          {[['📋', 'Todos os exames', '/exams'], ['⚠️', 'Valores alterados', '/alterados'], ['🕒', 'Linha do tempo', '/linha-do-tempo']].map(([icon, label, to]) => (
            <ListItemButton key={to} onClick={() => { setMais(false); navigate(to); }} selected={active(to)} sx={{ pl: 3 }}><ListItemIcon sx={{ minWidth: 30, fontSize: 16 }}>{icon}</ListItemIcon><ListItemText primary={label} primaryTypographyProps={{ fontSize: 13.5, fontWeight: active(to) ? 700 : 500 }} /></ListItemButton>
          ))}

          {/* 📊 MINHA SAÚDE */}
          <Typography sx={{ px: 3, pt: 1.5, pb: 0.25, fontSize: 11, fontWeight: 800, color: '#94a3b8', letterSpacing: 0.5 }}>📊 MINHA SAÚDE</Typography>
          {[['📈', 'Evolução', '/evolucao'], ['📊', 'Tendências', '/tendencias'], ['📏', 'Medições', '/medicoes'], ['💉', 'Vacinas', '/vacinas'], ['🔔', 'Lembretes', '/lembretes'], ['🚨', 'Emergência', '/emergencia']].map(([icon, label, to]) => (
            <ListItemButton key={to} onClick={() => { setMais(false); navigate(to); }} selected={active(to)} sx={{ pl: 3 }}><ListItemIcon sx={{ minWidth: 30, fontSize: 16 }}>{icon}</ListItemIcon><ListItemText primary={label} primaryTypographyProps={{ fontSize: 13.5, fontWeight: active(to) ? 700 : 500 }} /></ListItemButton>
          ))}

          {/* 👨‍👩‍👧 FAMÍLIA & MÉDICOS */}
          <Typography sx={{ px: 3, pt: 1.5, pb: 0.25, fontSize: 11, fontWeight: 800, color: '#94a3b8', letterSpacing: 0.5 }}>👨‍👩‍👧 FAMÍLIA & MÉDICOS</Typography>
          {[['👨‍👩‍👧', 'Dependentes', '/patients'], ['🌳', 'Família', '/familia'], ['🩺', 'Meus Médicos', '/medicos']].map(([icon, label, to]) => (
            <ListItemButton key={to} onClick={() => { setMais(false); navigate(to); }} selected={active(to)} sx={{ pl: 3 }}><ListItemIcon sx={{ minWidth: 30, fontSize: 16 }}>{icon}</ListItemIcon><ListItemText primary={label} primaryTypographyProps={{ fontSize: 13.5, fontWeight: active(to) ? 700 : 500 }} /></ListItemButton>
          ))}

          {/* 📄 RELATÓRIOS */}
          <Typography sx={{ px: 3, pt: 1.5, pb: 0.25, fontSize: 11, fontWeight: 800, color: '#94a3b8', letterSpacing: 0.5 }}>📄 RELATÓRIOS</Typography>
          {[['🧾', 'Relatório completo', '/relatorio'], ['💰', 'Despesas', '/despesas']].map(([icon, label, to]) => (
            <ListItemButton key={to} onClick={() => { setMais(false); navigate(to); }} selected={active(to)} sx={{ pl: 3 }}><ListItemIcon sx={{ minWidth: 30, fontSize: 16 }}>{icon}</ListItemIcon><ListItemText primary={label} primaryTypographyProps={{ fontSize: 13.5, fontWeight: active(to) ? 700 : 500 }} /></ListItemButton>
          ))}

          {/* ⚙️ CONTA */}
          <Typography sx={{ px: 3, pt: 1.5, pb: 0.25, fontSize: 11, fontWeight: 800, color: '#94a3b8', letterSpacing: 0.5 }}>⚙️ CONTA</Typography>
          <ListItemButton onClick={() => { setMais(false); navigate('/perfil'); }} selected={active('/perfil')} sx={{ pl: 3 }}><ListItemIcon sx={{ minWidth: 30, fontSize: 16 }}>👤</ListItemIcon><ListItemText primary="Meu perfil" primaryTypographyProps={{ fontSize: 13.5, fontWeight: active('/perfil') ? 700 : 500 }} /></ListItemButton>
          <ListItemButton onClick={() => { setMais(false); navigate('/planos'); }} selected={active('/planos')} sx={{ pl: 3 }}><ListItemIcon sx={{ minWidth: 30, fontSize: 16 }}>💎</ListItemIcon><ListItemText primary="Planos e créditos" primaryTypographyProps={{ fontSize: 13.5, fontWeight: active('/planos') ? 700 : 500 }} /></ListItemButton>
          {isAdmin && <ListItemButton onClick={() => { setMais(false); navigate('/admin'); }} selected={active('/admin')} sx={{ pl: 3 }}><ListItemIcon sx={{ minWidth: 30, fontSize: 16 }}>🛠️</ListItemIcon><ListItemText primary="Painel Admin" primaryTypographyProps={{ fontSize: 13.5, fontWeight: active('/admin') ? 700 : 500 }} /></ListItemButton>}
        </List>
        <Divider />
        <List sx={{ pt: 1, '& .MuiListItemButton-root': { borderRadius: 2, m: '2px 10px' } }}>
          <ListItemButton onClick={() => { setMais(false); logout('/entrar'); }} sx={{ color: 'error.main' }}>
            <ListItemIcon sx={{ minWidth: 34, fontSize: 18, color: 'error.main' }}>↩</ListItemIcon>
            <ListItemText primary="Sair da conta" primaryTypographyProps={{ fontSize: 14, fontWeight: 600 }} />
          </ListItemButton>
        </List>
      </Drawer>
    </>
  );
};
