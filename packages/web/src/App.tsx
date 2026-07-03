import { Admin, Resource, CustomRoutes, Layout, AppBar, TitlePortal, AppBarProps, useLogout, useLocale, useSetLocale, useRefresh, useStore, LoadingIndicator } from 'react-admin';
import { Route, useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState, useRef, lazy, Suspense } from 'react';
import { Capacitor } from '@capacitor/core';
import { Box, Typography, IconButton, Button, useMediaQuery, useTheme, CircularProgress, Menu as MuiMenu, MenuItem, Divider, ListItemIcon, ListItemText, Collapse, ListItemButton, Dialog, DialogTitle, DialogContent, DialogActions, Chip, Drawer, Avatar, Stack } from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CloseIcon from '@mui/icons-material/Close';
import MenuIcon from '@mui/icons-material/Menu';
import HomeIcon from '@mui/icons-material/Home';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import InsightsIcon from '@mui/icons-material/Insights';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import AutoGraphIcon from '@mui/icons-material/AutoGraph';
import HistoryIcon from '@mui/icons-material/History';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import VaccinesIcon from '@mui/icons-material/Vaccines';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import HealthAndSafetyIcon from '@mui/icons-material/HealthAndSafety';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import WorkspacePremiumIcon from '@mui/icons-material/WorkspacePremium';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import LockIcon from '@mui/icons-material/Lock';
import MedicalInformationIcon from '@mui/icons-material/MedicalInformation';
import MedicalServicesIcon from '@mui/icons-material/MedicalServices';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Diversity3Icon from '@mui/icons-material/Diversity3';
import SummarizeIcon from '@mui/icons-material/Summarize';
import { DrExame } from './components/DrExame';
import { dataProvider } from './dataProvider';
import { API_URL, token } from './config';
import { authProvider } from './authProvider';
import { lightTheme, darkTheme } from './theme';
import { i18nProvider } from './i18n';
import { APP_BUILD_INFO } from './generated/buildInfo';
import { Dashboard } from './pages/Dashboard';
import { ExamList } from './resources/Exams/ExamList';
import { ExamShow } from './resources/Exams/ExamShow';
import { ExamCreate } from './resources/Exams/ExamCreate';
import { PatientList, PatientEdit } from './resources/Patients/Patients';
import { TrendsPage } from './pages/Trends';
// Code splitting — páginas pesadas carregam sob demanda (bundle inicial menor)
const ChatPage = lazy(() => import('./pages/Chat').then(m => ({ default: m.ChatPage })));
const DoctorPortalPage = lazy(() => import('./pages/DoctorPortal').then(m => ({ default: m.DoctorPortalPage })));
const LandingPage = lazy(() => import('./pages/Landing').then(m => ({ default: m.LandingPage })));
const PlansPage = lazy(() => import('./pages/Plans').then(m => ({ default: m.PlansPage })));
const RemindersPage = lazy(() => import('./pages/Reminders').then(m => ({ default: m.RemindersPage })));
import { MeasurementsPage } from './pages/Measurements';
import { VaccinesPage } from './pages/Vaccines';
import { EmergencyCardPage } from './pages/EmergencyCard';
import { TimelinePage } from './pages/Timeline';
import { ExpensesPage } from './pages/Expenses';
import { EvolutionPage } from './pages/Evolution';
import { FamilyPage } from './pages/Family';
import { ConsolidatedReportPage } from './pages/ConsolidatedReport';
import { ValoresAlteradosPage } from './pages/ValoresAlterados';
import { ProfilePage } from './pages/Profile';
import { SecurityPage } from './pages/Security';
import { PrivacyPage } from './pages/Privacy';
import { AdminPage } from './pages/admin';
import { NotFoundPage } from './pages/NotFound';
import { LoginPage, RegisterPage, ResetPage } from './pages/Auth';
import { TermsPage } from './pages/Terms';
import { PatientSwitcher } from './components/PatientSwitcher';
import { CreditsChip } from './components/CreditsChip';
import { FloatingChat } from './components/FloatingChat';
import { BootSplash } from './components/BootSplash';
import { MobileBottomNav } from './components/MobileBottomNav';
import { ExamCreateFab } from './components/ExamCreateFab';
import { BiometricGate } from './components/BiometricGate';
import { DrawerProvider, useAppDrawer } from './components/drawerState';
import { OfflineBanner } from './components/OfflineBanner';
import { ForceUpdate } from './components/ForceUpdate';
import { checkAppUpdate, checkPlayUpdate } from './utils/version';
import { decideBackAction } from './utils/backNavigation';
import { NotificationBell } from './components/NotificationBell';
import { NotificationPopup } from './components/NotificationPopup';
import { Onboarding } from './components/Onboarding';
import { CompleteProfileModal } from './components/CompleteProfileModal';
import { NotificationsPage } from './pages/Notifications';
import { MedicosPage } from './pages/Medicos';
import { SupportPage } from './pages/Support';
import { ConquistasPage } from './pages/Conquistas';
import { initPush } from './push';
import { syncCreditCosts } from './components/CreditBadge';

// AppBar: só o seletor de paciente (titular = quem loga) + botão Sair (sem conflito de avatares)
const CustomAppBar = (props: AppBarProps) => {
  const logout = useLogout();
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('sm'));
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const canBack = !isDesktop && pathname !== '/';
  const refresh = useRefresh();
  const locale = useLocale();
  const setLocale = useSetLocale();
  const { openDrawer } = useAppDrawer();
  const [themeMode, setThemeMode] = useStore<'light' | 'dark'>('theme', 'light');
  const [menuA, setMenuA] = useState<HTMLElement | null>(null);
  const toggleLang = () => { const l = locale === 'pt' ? 'en' : 'pt'; setLocale(l); try { localStorage.setItem('lang', l); } catch {} setMenuA(null); };
  return (
    // O ☰ nativo do react-admin (SidebarToggleButton) é escondido no mobile via CSS no AppLayout
    // (classe .RaAppBar-menuButton → display:none em telas pequenas). No mobile, o ☰ abaixo
    // abre o AppDrawer UNIFICADO (mesmo menu do "Mais" do rodapé). Desktop mantém o toggle nativo.
    <AppBar {...props} userMenu={false} toolbar={<LoadingIndicator />}>
      {!isDesktop && (
        <IconButton color="inherit" onClick={openDrawer} title="Menu" size="small" sx={{ mr: 0.5 }}>
          <MenuIcon fontSize="small" />
        </IconButton>
      )}
      {canBack && (
        <IconButton color="inherit" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))} title="Voltar" size="small" sx={{ mr: 0.5 }}>
          <ArrowBackIcon fontSize="small" />
        </IconButton>
      )}
      {isDesktop && <TitlePortal />}
      <Box sx={{ flex: 1 }} />
      <CreditsChip />
      <PatientSwitcher />
      <NotificationBell />
      <IconButton color="inherit" onClick={(e: any) => setMenuA(e.currentTarget)} title="Mais opções" size="small" sx={{ flexShrink: 0 }}>
        <MoreVertIcon fontSize="small" />
      </IconButton>
      <MuiMenu anchorEl={menuA} open={!!menuA} onClose={() => setMenuA(null)} slotProps={{ paper: { sx: { mt: 1, minWidth: 180, borderRadius: 2 } } }}>
        <MenuItem onClick={() => { setThemeMode(themeMode === 'dark' ? 'light' : 'dark'); setMenuA(null); }}>{themeMode === 'dark' ? '☀️ Modo claro' : '🌙 Modo escuro'}</MenuItem>
        <MenuItem onClick={toggleLang}>🌐 {locale === 'pt' ? 'Mudar para English' : 'Switch to Português'}</MenuItem>
        <MenuItem onClick={() => { refresh(); setMenuA(null); }}>↻ Atualizar</MenuItem>
        <MenuItem onClick={() => logout('/entrar')} sx={{ color: 'error.main' }}>↩ Sair</MenuItem>
      </MuiMenu>
    </AppBar>
  );
};

// Rota ativa? ('/' é exato; o resto é startsWith p/ cobrir sub-rotas)
const routeMatches = (route: string, pathname: string) => (route === '/' ? pathname === '/' : pathname.startsWith(route));

// Seção COLAPSÁVEL do menu (acordeão): header clicável + chevron + MUI Collapse.
// `routes` habilita o SMART-EXPAND: a seção que contém a rota ativa abre sozinha,
// então o usuário vê seu contexto sem procurar. Fechamento manual é respeitado
// enquanto ele permanece numa rota daquela seção (o effect só roda em pathname change).
const MenuSectionAccordion = ({ title, icon, routes, children }: { title: string; icon: React.ReactNode; routes: string[]; children: React.ReactNode }) => {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(() => routes.some((r) => routeMatches(r, pathname)));
  useEffect(() => { if (routes.some((r) => routeMatches(r, pathname))) setOpen(true); /* eslint-disable-next-line */ }, [pathname]);
  return (
    <Box>
      <ListItemButton onClick={() => setOpen((o) => !o)} sx={{ borderRadius: 1.5, m: '1px 8px', py: 0.4, pl: 2, minHeight: 40, '&:hover': { bgcolor: 'rgba(32,178,170,.06)' } }}>
        <ListItemIcon sx={{ minWidth: 34, color: 'text.secondary', '& svg': { fontSize: 19 } }}>{icon}</ListItemIcon>
        <ListItemText primary={title} primaryTypographyProps={{ fontSize: 12.5, fontWeight: 800, color: 'text.primary' }} />
        <ExpandMoreIcon sx={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform .2s', color: 'text.secondary', fontSize: 20 }} />
      </ListItemButton>
      <Collapse in={open} sx={{ pb: 0.5 }}>{children}</Collapse>
    </Box>
  );
};

// Item de navegação (MUI puro, monocromático, pill teal no ativo).
// `highlight` destaca as funcionalidades PRINCIPAIS (ícone teal + texto mais forte) — sem rótulo de paywall.
const NavItem = ({ to, primaryText, icon, highlight }: { to: string; primaryText: string; icon: React.ReactNode; highlight?: boolean }) => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const active = to === '/' ? pathname === '/' : pathname.startsWith(to);
  const iconColor = highlight ? '#178f89' : active ? 'text.primary' : 'text.secondary';
  return (
    <ListItemButton onClick={() => navigate(to)} selected={active}
      sx={{ borderRadius: 1.5, m: '1px 8px', py: 0.5, pl: 2.5, minHeight: 40, flex: '0 0 auto',
        '&.Mui-selected': { bgcolor: 'rgba(32,178,170,.12)' },
        '&.Mui-selected:hover': { bgcolor: 'rgba(32,178,170,.18)' },
        '&:hover': { bgcolor: 'rgba(32,178,170,.06)' } }}>
      <ListItemIcon sx={{ minWidth: 34, color: iconColor, '& svg': { fontSize: 19 } }}>{icon}</ListItemIcon>
      <ListItemText primary={primaryText} primaryTypographyProps={{ fontSize: 13, fontWeight: active || highlight ? 700 : 500, color: active || highlight ? 'text.primary' : 'text.secondary', noWrap: true }} />
    </ListItemButton>
  );
};

// Menu lateral — organizado como app profissional (headers de seção, sem acordeão)
const AppMenu = () => {
  const logout = useLogout();
  const [aboutOpen, setAboutOpen] = useState(false);
  const userStr = typeof localStorage !== 'undefined' ? localStorage.getItem('user') : null;
  const isAdmin = (() => { try { return userStr ? (JSON.parse(userStr)?.role === 'ADMIN') : false; } catch { return false; } })();
  return (
  <Box component="nav" sx={{ py: 1, display: 'flex', flexDirection: 'column', minHeight: '100%', '& .MuiListItemButton-root, & .MuiMenuItem-root': { flex: '0 0 auto' } }}>
    {/* PRINCIPAIS — sempre visíveis (os mais usados), sem precisar expandir nada */}
    <NavItem to="/" primaryText="Início" icon={<HomeIcon />} />
    <NavItem to="/exams" primaryText="Exames" icon={<MedicalInformationIcon />} />
    <NavItem to="/chat" primaryText="Dr. Exame (IA)" icon={<AutoAwesomeIcon />} highlight />
    <NavItem to="/relatorio" primaryText="Relatório completo" icon={<SummarizeIcon />} highlight />

    {/* Seções colapsáveis — a que contém a rota ativa abre sozinha (smart-expand) */}
    <MenuSectionAccordion title="Evolução & Conquistas" icon={<InsightsIcon />} routes={['/evolucao', '/conquistas']}>
      <NavItem to="/evolucao" primaryText="Evolução" icon={<InsightsIcon />} highlight />
      <NavItem to="/conquistas" primaryText="Minhas conquistas" icon={<EmojiEventsIcon />} />
    </MenuSectionAccordion>

    <MenuSectionAccordion title="Minha Saúde" icon={<MonitorHeartIcon />} routes={['/alterados', '/tendencias', '/linha-do-tempo', '/medicoes', '/vacinas', '/lembretes', '/emergencia']}>
      <NavItem to="/alterados" primaryText="Valores alterados" icon={<WarningAmberIcon />} highlight />
      <NavItem to="/tendencias" primaryText="Tendências" icon={<AutoGraphIcon />} highlight />
      <NavItem to="/linha-do-tempo" primaryText="Linha do tempo" icon={<HistoryIcon />} highlight />
      <NavItem to="/medicoes" primaryText="Medições" icon={<MonitorHeartIcon />} />
      <NavItem to="/vacinas" primaryText="Vacinas" icon={<VaccinesIcon />} />
      <NavItem to="/lembretes" primaryText="Lembretes" icon={<EventAvailableIcon />} />
      <NavItem to="/emergencia" primaryText="Cartão de emergência" icon={<HealthAndSafetyIcon />} />
    </MenuSectionAccordion>

    <MenuSectionAccordion title="Família & Médicos" icon={<Diversity3Icon />} routes={['/familia', '/patients', '/medicos', '/despesas']}>
      <NavItem to="/familia" primaryText="Família" icon={<Diversity3Icon />} />
      <NavItem to="/patients" primaryText="Dependentes" icon={<Diversity3Icon />} />
      <NavItem to="/medicos" primaryText="Meus Médicos" icon={<MedicalServicesIcon />} />
      <NavItem to="/despesas" primaryText="Despesas médicas" icon={<AccountBalanceWalletIcon />} />
    </MenuSectionAccordion>

    <MenuSectionAccordion title="Conta" icon={<AccountCircleIcon />} routes={['/perfil', '/seguranca', '/privacidade', '/planos', '/admin']}>
      <NavItem to="/perfil" primaryText="Meu perfil" icon={<AccountCircleIcon />} />
      <NavItem to="/seguranca" primaryText="Segurança" icon={<LockIcon />} />
      <NavItem to="/privacidade" primaryText="Privacidade e termos" icon={<HealthAndSafetyIcon />} />
      <NavItem to="/planos" primaryText="Planos e créditos" icon={<WorkspacePremiumIcon />} />
      {isAdmin && <NavItem to="/admin" primaryText="Painel Admin" icon={<AdminPanelSettingsIcon />} />}
    </MenuSectionAccordion>

    <Divider sx={{ my: 1 }} />

    {/* APOIO */}
    <NavItem to="/suporte" primaryText="Ajuda & Suporte" icon={<span style={{ fontSize: 18 }}>❓</span>} />
    <MenuItem onClick={() => setAboutOpen(true)} sx={{ mx: 0.5, borderRadius: 1, py: 0.75 }}>
      <ListItemIcon sx={{ minWidth: 36 }}>ℹ️</ListItemIcon>
      <ListItemText primaryTypographyProps={{ fontSize: 13, fontWeight: 600 }}>Sobre o app</ListItemText>
    </MenuItem>
    <MenuItem onClick={() => logout('/entrar')} sx={{ mx: 0.5, my: 0.25, borderRadius: 1, py: 0.75, color: 'error.main', '&:hover': { bgcolor: 'rgba(239,68,68,.08)' } }}>
      <ListItemIcon sx={{ color: 'error.main', minWidth: 36 }}><LogoutIcon fontSize="small" /></ListItemIcon>
      <ListItemText primaryTypographyProps={{ fontSize: 13, fontWeight: 600 }}>Sair da conta</ListItemText>
    </MenuItem>

    <Box sx={{ mt: 'auto', px: 2, py: 1.5, fontSize: 11, color: 'text.secondary', borderTop: '1px solid', borderColor: 'divider' }}>
      Meus Exames · {APP_BUILD_INFO.versionLabel}
    </Box>

    {/* POPUP "Sobre o App" */}
    <Dialog open={aboutOpen} onClose={() => setAboutOpen(false)} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ textAlign: 'center', pb: 0 }}>
        <Box sx={{ mb: 1.5, display: 'flex', justifyContent: 'center' }}><DrExame size={64} /></Box>
        Meus Exames
      </DialogTitle>
      <DialogContent sx={{ textAlign: 'center' }}>
        <Typography sx={{ fontWeight: 800, fontSize: 18, color: 'text.primary', mb: 0.5 }}>{APP_BUILD_INFO.versionLabel}</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2, fontFamily: 'monospace', fontSize: 11 }}>
          branch {APP_BUILD_INFO.branch} · build {new Date(APP_BUILD_INFO.builtAt).toLocaleString('pt-BR')}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Seu assistente de saúde com inteligência artificial.</Typography>
        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', flexWrap: 'wrap', mb: 2 }}>
          <Chip size="small" label="IA GLM-4.6" sx={{ bgcolor: 'rgba(32,178,170,0.15)', color: '#178f89', fontWeight: 700 }} />
          <Chip size="small" label="Scanner ML Kit" sx={{ bgcolor: 'rgba(32,178,170,0.15)', color: '#178f89', fontWeight: 700 }} />
          <Chip size="small" label="LGPD" sx={{ bgcolor: 'rgba(32,178,170,0.15)', color: '#178f89', fontWeight: 700 }} />
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
          📧 contato@janocaminho.com.br<br />
          🌐 janocaminho.com.br/minhasaude
        </Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary', mt: 1, display: 'block' }}>
          Conteúdo educativo. Não substitui consulta, diagnóstico ou tratamento médico.
        </Typography>
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'center', pb: 2 }}>
        <Button onClick={() => setAboutOpen(false)} variant="contained" sx={{ borderRadius: 99, px: 4, textTransform: 'none', fontWeight: 700, bgcolor: '#178f89' }}>Fechar</Button>
      </DialogActions>
    </Dialog>
  </Box>
  );
};

// Menu lateral UNIFICADO (mobile). O ☰ do AppBar e o "Mais" do rodapé abem o
// MESMO AppDrawer aqui — mesma fonte de verdade (AppMenu), zero divergência de layout.
// Fecha sozinho ao trocar de rota (mesmo comportamento do Sidebar nativo).
const AppDrawer = () => {
  const { open, closeDrawer } = useAppDrawer();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [credits, setCredits] = useState<number | null>(null);
  const userObj = (() => { try { const s = typeof localStorage !== 'undefined' ? localStorage.getItem('user') : null; return s ? JSON.parse(s) : null; } catch { return null; } })();
  const userName = (userObj?.name as string) || null;
  const userEmail = (userObj?.email as string) || null;
  const isPremium = !!(userObj?.planExpiresAt && new Date(userObj.planExpiresAt) > new Date());
  const patientId = typeof localStorage !== 'undefined' ? (localStorage.getItem('selPatientId') || localStorage.getItem('patientId')) : null;
  const userPhoto = patientId ? `${API_URL}/patients/${patientId}/photo` : undefined;
  // auto-close ao navegar (clica num item → rota muda → fecha)
  useEffect(() => { closeDrawer(); /* deps intencional: só pathname */ }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  // Espelha o estado do drawer pro handler global de voltar (App.tsx backButton): gesto/botão
  // de voltar fecha o drawer ANTES de navegar/sair. Sem isto, o branch do drawer no handler era
  // código morto (window.__drawerOpen nunca era setado pelo DrawerProvider, que usa contexto React).
  useEffect(() => {
    (window as any).__drawerOpen = open;
    const onClose = () => closeDrawer();
    window.addEventListener('app:closeDrawer', onClose);
    return () => { (window as any).__drawerOpen = false; window.removeEventListener('app:closeDrawer', onClose); };
  }, [open, closeDrawer]);
  // Saldo de créditos no header do drawer (reativo: recarrega quando muda).
  useEffect(() => {
    const load = () => fetch(`${API_URL}/billing/status`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setCredits(typeof d?.credits === 'number' ? d.credits : null))
      .catch(() => {});
    load();
    const h = () => load();
    window.addEventListener('creditsChanged', h);
    return () => window.removeEventListener('creditsChanged', h);
  }, []);
  return (
    <Drawer anchor="left" open={open} onClose={closeDrawer} keepMounted={false}
      PaperProps={{ sx: { width: { xs: '86vw', sm: 340 }, maxWidth: 360, display: 'flex', flexDirection: 'column', bgcolor: 'background.paper' } }}>
      {/* Header — PERFIL do usuário (clean: branco, avatar + nome + plano/email, X discreto). Sem bloco verde. */}
      <Box sx={{ position: 'relative', px: 2, pt: 'calc(env(safe-area-inset-top) + 16px)', pb: 2 }}>
        <IconButton onClick={closeDrawer} size="small" title="Fechar" sx={{ position: 'absolute', top: 'calc(env(safe-area-inset-top) + 10px)', right: 8, color: 'text.secondary', '&:hover': { color: 'text.primary', bgcolor: 'transparent' } }}><CloseIcon fontSize="small" /></IconButton>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <Avatar src={userPhoto} sx={{ width: 48, height: 48, bgcolor: 'rgba(32,178,170,0.15)', color: '#178f89', fontWeight: 800, border: '2px solid rgba(32,178,170,0.3)' }}>{userName?.charAt(0)?.toUpperCase() || '👤'}</Avatar>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography sx={{ fontWeight: 800, fontSize: 16, color: 'text.primary', lineHeight: 1.15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{userName || 'Olá!'}</Typography>
            <Typography sx={{ fontSize: 12.5, color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{isPremium ? '👑 Premium' : 'Plano grátis'}{userObj?.credits != null ? ` • 💎 ${userObj.credits}` : ''}</Typography>
            {credits != null && (
              <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mt: 0.25, flexWrap: 'wrap', rowGap: 0.5 }}>
                <Typography sx={{ fontSize: 11.5, color: 'text.secondary', fontWeight: 600, whiteSpace: 'nowrap' }}>⚡ {credits} créditos</Typography>
                <Box component="button" onClick={() => { closeDrawer(); navigate('/planos'); }} sx={{ fontSize: 11.5, color: '#059669', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', p: 0, whiteSpace: 'nowrap' }}>(+ Recarregar)</Box>
              </Stack>
            )}
          </Box>
        </Stack>
      </Box>
      <Divider sx={{ borderColor: 'divider' }} />
      {/* Corpo rolável — reutiliza o MESMO AppMenu do Sidebar (fonte única de verdade) */}
      <Box sx={{ flex: 1, overflowY: 'auto', pb: 2 }}><AppMenu /></Box>
    </Drawer>
  );
};

// Seletor de idioma PT/EN (persiste em localStorage)
const LangToggle = () => {
  const locale = useLocale();
  const setLocale = useSetLocale();
  return (
    <Button size="small" color="inherit"
      onClick={() => { const l = locale === 'pt' ? 'en' : 'pt'; setLocale(l); try { localStorage.setItem('lang', l); } catch {} }}
      sx={{ minWidth: 0, px: 1, fontSize: 12, fontWeight: 700, bgcolor: 'rgba(0,0,0,.06)', '&:hover': { bgcolor: 'rgba(0,0,0,.12)' } }}
      title="Trocar idioma">
      🌐 {locale === 'pt' ? 'EN' : 'PT'}
    </Button>
  );
};

// Pull-to-refresh no mobile: puxa a tela no topo e solta p/ recarregar
const PullToRefresh = () => {
  const [shown, setShown] = useState(0);
  const dist = useRef(0);
  const refresh = useRefresh();
  useEffect(() => {
    let startY = 0; let active = false;
    const onStart = (e: TouchEvent) => { if ((window.scrollY ?? 0) <= 0) { startY = e.touches[0].clientY; active = true; } };
    const onMove = (e: TouchEvent) => { if (!active) return; const d = Math.min(e.touches[0].clientY - startY, 100); dist.current = d; setShown(d); };
    // refresh() (refetch via dataProvider) em vez de window.location.reload():
    // reload recarrega o WebView inteiro e crasha o app nativo (Capacitor).
    const onEnd = () => { if (active && dist.current > 70) refresh(); active = false; dist.current = 0; setShown(0); };
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd);
    // touchcancel: se o toque é interrompido pelo sistema (scroll/gesto), reseta o
    // active — senão ele podia ficar true e o spinner pipocar nos toques seguintes.
    window.addEventListener('touchcancel', onEnd);
    return () => { window.removeEventListener('touchstart', onStart); window.removeEventListener('touchmove', onMove); window.removeEventListener('touchend', onEnd); window.removeEventListener('touchcancel', onEnd); };
  }, []);
  if (shown <= 5) return null;
  return (
    <Box sx={{ position: 'fixed', top: 0, left: 0, right: 0, display: 'flex', justifyContent: 'center', height: shown, zIndex: 1500, pointerEvents: 'none' }}>
      <CircularProgress size={26} sx={{ mt: 1, opacity: Math.min(shown / 70, 1), color: 'primary.main' }} />
    </Box>
  );
};

const AppLayout = (props: any) => {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('sm'));
  return (
    <DrawerProvider>
      <BiometricGate>
      {/* gap reduzido + espaço pra não cobrir conteúdo com o menu rodapé (mobile) */}
      <Layout {...props} menu={AppMenu} appBar={CustomAppBar}
        sx={{
          // Esconde o ☰ nativo do react-admin no mobile (vamos usar nosso AppDrawer unificado). Desktop mantém.
          '& .RaAppBar-menuButton': { display: { xs: 'none', sm: 'inline-flex' } },
          // TRAVA o frame na largura do viewport no mobile. O react-admin põe min-width:fit-content no
          // .layout (pensando na sidebar de desktop) — no mobile isso deixa o frame inflar além do
          // viewport (ex.: admin com 5 Tabs de 90px = 450px + AppBar) e CLIPA a direita (overflow hidden
          // corta em vez de caber). min-width:0 mata o fit-content no mobile; sm+ mantém p/ desktop.
          '&': { minWidth: { xs: '0 !important', sm: 'fit-content' }, maxWidth: '100vw' },
          '& .RaLayout-appFrame, & .RaLayout-contentWithSidebar': { minWidth: 0, maxWidth: '100%' },
          // CONTEÚDO do <List> (.RaList-main) TAMBÉM é flex-item com min-width:auto → sem min-width:0,
          // o card de exame infla além do viewport (medido: 627px numa tela de 360px) e o overflow-hidden
          // do .RaLayout-content CLIPA o canto direito (🗑 e › somem). Vale p/ TODA lista RA (exames,
          // dependentes…). Mesmo remédio do frame acima: min-width:0 libera p/ encolher.
          '& .RaList-main, & .RaList-main > .MuiPaper-root': { minWidth: 0, maxWidth: '100%' },
          // Espaço embaixo pra NÃO cobrir conteúdo com o menu rodapé (mobile). Usa a altura REAL medida do
          // MobileBottomNav (var publicada por ResizeObserver) — nunca px fixo (o robô elevado deixou o nav
          // maior que o chute antigo de 72px e cortava o rodapé de TODA tela, inclusive admin). +14px respiro.
          '& .RaLayout-content, & main': { padding: { xs: '2px 0 calc(var(--me-bottom-nav-h, 76px) + 14px)', sm: '6px 0 28px' } },
          '& .RaList-toolbar, [class*="List-toolbar"]': { minHeight: '40px !important', paddingBottom: '4px !important' },
        }} />
      {/* Menu lateral UNIFICADO (mobile) — ☰ e "Mais" abem o mesmo drawer */}
      <AppDrawer />
      <FloatingChat />
      <ExamCreateFab />
      <OfflineBanner />
      <PullToRefresh />
      <MobileBottomNav />
      <NotificationPopup />
      <Onboarding />
      <CompleteProfileModal />
      </BiometricGate>
    </DrawerProvider>
  );
};

// === Pilha de navegação IN-APP para o botão/gesto VOLTAR (Android/Capacitor) ===
// App.tsx é a raiz (fora do contexto do Router), então não temos useNavigate/useLocation.
// Em vez disso, rastreamos a navegação patcheando history.pushState/replaceState + popstate.
// Assim sabemos se existe uma tela anterior REAL dentro do app, e só chamamos history.back()
// quando faz sentido — nunca deixa o gesto levar o app de volta pra Google Play.
//
// BUG ANTERIOR: o handler lia window.location.hash, que é SEMPRE vazio no BrowserRouter do
// react-admin → acreditava estar sempre na raiz ("/") → NUNCA voltava; o gesto só saía do app.
const readPath = (): string => {
  // Suporta BrowserRouter (pathname) e HashRouter (hash) — whichever tiver conteúdo.
  const h = typeof window !== 'undefined' && window.location.hash ? window.location.hash.replace(/^#/, '') : '';
  if (h) return h;
  return (typeof window !== 'undefined' && window.location.pathname) || '/';
};
const inAppStack: string[] = [readPath()];
const recordPush = () => {
  const p = readPath();
  const last = inAppStack[inAppStack.length - 1];
  if (p === last) return;
  const idx = inAppStack.lastIndexOf(p); // voltou pra uma tela conhecida → trunca (evita crescer p/ sempre)
  if (idx >= 0) inAppStack.length = idx + 1;
  else inAppStack.push(p);
};
const recordReplace = () => { inAppStack[inAppStack.length - 1] = readPath(); }; // replaceState = mesma entrada
if (typeof window !== 'undefined' && !(window as any).__navPatched) {
  (window as any).__navPatched = true;
  const origPush = history.pushState.bind(history);
  const origReplace = history.replaceState.bind(history);
  history.pushState = function (data: any, unused: string, url?: string | URL | null) { const r = origPush(data, unused, url ?? null); setTimeout(recordPush, 0); return r; };
  history.replaceState = function (data: any, unused: string, url?: string | URL | null) { const r = origReplace(data, unused, url ?? null); setTimeout(recordReplace, 0); return r; };
  window.addEventListener('popstate', recordPush); // gesto/botão voltar nativo do browser → atualiza pilha
}

// Porta de entrada pública: o react-admin mostra o "loginPage" sempre que um anônimo
// cai em / (dashboard → checkAuth falha → Navigate /login) ou quando a sessão expira.
// Setamos loginPage = LandingPage, então o anônimo sempre vê a VITRINE. O formulário
// real de login fica numa rota dedicada /entrar (CustomRoutes noLayout), alcançável só
// via o botão "Entrar" — path dedicado é confiável (query param ?login=1 não funcionava:
// o react-admin normaliza /login e descarta a query).
export const App = () => {
  const [booted, setBooted] = useState(false);
  const [forceUpdate, setForceUpdate] = useState<string | null>(null);
  const isNativeApp = Capacitor.isNativePlatform();
  useEffect(() => {
    let cancelled = false; // previne setState após unmount (race condition)
    // WEB: anônimo na raiz → landing (porta pública/vitrine). APK: abre direto no LOGIN (app instalado não precisa de vitrine).
    // replaceState muda a URL em SILÊNCIO, sem reload — seguro no APK (reload recarrega o WebView e crasha o app nativo).
    try {
      const p = window.location.pathname || '/';
      if (!isNativeApp && (p === '/' || p === '') && !localStorage.getItem('token')) {
        window.history.replaceState({}, '', '/landing');
      }
    } catch { /* ignore */ }
    const bootTimer = setTimeout(() => { if (!cancelled) setBooted(true); }, 1100); // splash visível na abertura
    void initPush();
    void checkAppUpdate().then((r) => { if (!cancelled && r.required) setForceUpdate(r.latest); }); // força-update se versão instalada < mínima
    void checkPlayUpdate(); // in-app update NATIVO do Google Play (baixa e atualiza sozinho) — só em builds da Play Store
    // RE-CHECA atualização a cada 10 min enquanto o app tá aberto (Play Store publica versão nova → aparece sem precisar reiniciar)
    const updateInterval = setInterval(() => { if (!cancelled) void checkPlayUpdate(); }, 10 * 60 * 1000);
    void syncCreditCosts();
    // SELF-HEAL: sessão com token mas SEM user (ex.: login antigo por biometria que só guardou o token)
    // → busca /auth/me e popula user/paciente. Assim o drawer (nome+plano+admin) funciona sem re-login.
    const __tk = localStorage.getItem('token');
    if (__tk && !localStorage.getItem('user')) {
      fetch(`${API_URL}/auth/me`, { headers: { Authorization: `Bearer ${__tk}` } })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (!cancelled && d?.user) { localStorage.setItem('user', JSON.stringify(d.user)); if (d.patientId) { localStorage.setItem('patientId', d.patientId); localStorage.setItem('selPatientId', d.patientId); } window.dispatchEvent(new Event('selPatientChanged')); } })
        .catch(() => {});
    }
    // Botão/gesto de voltar do Android (Capacitor) — volta no histórico IN-APP ou engole o back na raiz (NUNCA sai do app).
    let remove: (() => void) | undefined;
    (async () => {
      try {
        const [{ App }, { Capacitor }] = await Promise.all([import('@capacitor/app'), import('@capacitor/core')]);
        if (Capacitor.isNativePlatform()) {
          const h = await App.addListener('backButton', () => {
            // Telas podem interceptar o back (ex.: portal médico fecha exame/paciente, dialogs fecham).
            const ev = new CustomEvent('app:back', { cancelable: true });
            window.dispatchEvent(ev);
            if (ev.defaultPrevented) return;
            // Drawer aberto? → fecha (AppDrawer via drawerState)
            if ((window as any).__drawerOpen) { window.dispatchEvent(new Event('app:closeDrawer')); return; }
            // Decisão (lógica pura, testada em utils/backNavigation.test.ts):
            //   back     → tem histórico in-app (idx > 0) → volta
            //   go-home  → sem histórico mas fora da raiz (deep link) → dashboard
            //   stay     → raiz → engole o back (NUNCA sai do app)
            // Sinal confiável: window.history.state.idx (índice real do react-router, DIMINUI ao
            // voltar). BUG ANTERIOR: window.history.length (nunca diminui) → após a 1ª navegação
            // ficava travado em > 1, e history.back() no índice 0 do WebView SAÍA do app no gesto.
            const action = decideBackAction({
              historyState: window.history.state as { idx?: number } | null,
              pathname: window.location.pathname,
              inAppStackLength: inAppStack.length,
            });
            if (action === 'back') { window.history.back(); return; }
            if (action === 'go-home') { window.history.pushState({}, '', '/'); window.dispatchEvent(new PopStateEvent('popstate')); return; }
            // action === 'stay' → já no dashboard: engole o back (sai só pelo botão home do Android).
          });
          remove = () => { h.remove(); };
        }
      } catch { /* web: sem @capacitor — browser back já funciona */ }
    })();
    return () => { cancelled = true; clearTimeout(bootTimer); clearInterval(updateInterval); remove?.(); };
  }, []);
  if (!booted) return <BootSplash messages={['Iniciando o Dr. Exame…', 'Carregando seus exames…', 'Preparando seu painel…', 'Quase lá…']} />;
  if (forceUpdate) return <ForceUpdate latest={forceUpdate} />;
  return (
  <>
  <Admin
    dataProvider={dataProvider}
    authProvider={authProvider}
    theme={lightTheme}
    darkTheme={darkTheme}
    defaultTheme="light"
    i18nProvider={i18nProvider}
    layout={AppLayout}
    dashboard={Dashboard}
    loginPage={isNativeApp ? LoginPage : LandingPage}
    title="Meus Exames"
    loading={() => <BootSplash />}
    disableTelemetry
  >
    <CustomRoutes noLayout>
      <Route path="/entrar" element={<LoginPage />} />
      <Route path="/landing" element={<Suspense fallback={<Box sx={{ display:'flex', justifyContent:'center', py: 8 }}><CircularProgress /></Box>}><LandingPage /></Suspense>} />
      <Route path="/termos" element={<TermsPage />} />
      <Route path="/registrar" element={<RegisterPage />} />
      <Route path="/recuperar-senha" element={<ResetPage />} />
      <Route path="/doctor" element={<Suspense fallback={<Box sx={{ display:'flex', justifyContent:'center', py: 8 }}><CircularProgress /></Box>}><DoctorPortalPage /></Suspense>} />
      {/* Backoffice ISOLADO do app do paciente: shell próprio (sem AppLayout/BottomNav/FloatingChat/menu de saúde). */}
      <Route path="/admin" element={<AdminPage />} />
    </CustomRoutes>

    <Resource name="exams" list={ExamList} show={ExamShow} create={ExamCreate} options={{ label: 'Exames' }} icon={MedicalInformationIcon} />
    <Resource name="patients" list={PatientList} edit={PatientEdit} options={{ label: 'Dependentes' }} icon={Diversity3Icon} />
    <Resource name="items" options={{ label: 'Itens' }} />
    <Resource name="analyses" options={{ label: 'Análises' }} />

    <CustomRoutes>
      <Route path="/perfil" element={<ProfilePage />} />
      <Route path="/seguranca" element={<SecurityPage />} />
      <Route path="/privacidade" element={<PrivacyPage />} />
      <Route path="*" element={<NotFoundPage />} />
      <Route path="/evolucao" element={<EvolutionPage />} />
      <Route path="/familia" element={<FamilyPage />} />
      <Route path="/tendencias" element={<TrendsPage />} />
      <Route path="/linha-do-tempo" element={<TimelinePage />} />
      <Route path="/relatorio" element={<ConsolidatedReportPage />} />
      <Route path="/alterados" element={<ValoresAlteradosPage />} />
      <Route path="/lembretes" element={<Suspense fallback={<Box sx={{ display:'flex', justifyContent:'center', py: 8 }}><CircularProgress /></Box>}><RemindersPage /></Suspense>} />
      <Route path="/medicoes" element={<MeasurementsPage />} />
      <Route path="/vacinas" element={<VaccinesPage />} />
      <Route path="/despesas" element={<ExpensesPage />} />
      <Route path="/emergencia" element={<EmergencyCardPage />} />
      <Route path="/chat" element={<Suspense fallback={<Box sx={{ display:'flex', justifyContent:'center', py: 8 }}><CircularProgress /></Box>}><ChatPage /></Suspense>} />
      <Route path="/notificacoes" element={<NotificationsPage />} />
      <Route path="/planos" element={<Suspense fallback={<Box sx={{ display:'flex', justifyContent:'center', py: 8 }}><CircularProgress /></Box>}><PlansPage /></Suspense>} />
      <Route path="/medicos" element={<MedicosPage />} />
      <Route path="/conquistas" element={<ConquistasPage />} />
      <Route path="/suporte" element={<SupportPage />} />
      <Route path="/suporte/:id" element={<SupportPage />} />
    </CustomRoutes>
  </Admin>
  </>
  );
};
