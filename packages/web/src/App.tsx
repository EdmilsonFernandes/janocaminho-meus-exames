import { Admin, Resource, CustomRoutes, Layout, AppBar, TitlePortal, AppBarProps, useLogout, useLocale, useSetLocale, useRefresh, useTranslate, LoadingIndicator } from 'react-admin';
import { ConfirmDialogProvider } from './components/ConfirmDialog';
import { Route, useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState, useRef, lazy, Suspense } from 'react';
import { Capacitor } from '@capacitor/core';
import { Box, Typography, IconButton, Button, useMediaQuery, useTheme, CircularProgress, MenuItem, Divider, ListItemIcon, ListItemText, Collapse, ListItemButton, Dialog, DialogTitle, DialogContent, DialogActions, Chip, Drawer, Avatar, Stack } from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CloseIcon from '@mui/icons-material/Close';
import MenuIcon from '@mui/icons-material/Menu';
import HomeIcon from '@mui/icons-material/Home';
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
import QuestionAnswerIcon from '@mui/icons-material/QuestionAnswer';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import InfoIcon from '@mui/icons-material/Info';
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
const QuestionsPage = lazy(() => import('./pages/Questions').then(m => ({ default: m.QuestionsPage })));
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
import { InviteLandingPage } from './pages/InviteLanding';
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
import { WhatsNew } from './components/WhatsNew';
import { PageSkeleton } from './components/PageSkeleton';
import { CompleteProfileModal } from './components/CompleteProfileModal';
import { NotificationsPage } from './pages/Notifications';
import { MedicosPage } from './pages/Medicos';
import { SupportPage } from './pages/Support';
import { ConquistasPage } from './pages/Conquistas';
import { initPush } from './push';
import { syncCreditCosts } from './components/CreditBadge';

// AppBar premium: esquerda = ☰/Voltar + MARCA OFICIAL (robô Dr.Exame integrado, preenche o gap que
// ficava vazio); direita = 🔔 + avatar (menu ÚNICO: dependentes, tema, idioma, sair). Sem ⋮ separado
// e sem refresh duplicado (atualizar = arrastar a tela / pull-to-refresh).
const CustomAppBar = (props: AppBarProps) => {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('sm'));
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const canBack = !isDesktop && pathname !== '/';
  const { openDrawer } = useAppDrawer();
  return (
    <AppBar {...props} userMenu={false} toolbar={<LoadingIndicator />}>
      {/* Mobile: ☰ e Voltar são MUTUAMENTE EXCLUSIVOS. Em sub-rota → Voltar; na raiz → ☰ (drawer unificado). */}
      {!isDesktop && (
        canBack ? (
          <IconButton color="inherit" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))} title="Voltar" size="small" sx={{ mr: 0.25 }}>
            <ArrowBackIcon fontSize="small" />
          </IconButton>
        ) : (
          <IconButton color="inherit" onClick={openDrawer} title="Menu" size="small" sx={{ mr: 0.25 }}>
            <MenuIcon fontSize="small" />
          </IconButton>
        )
      )}
      {/* LOGO "chip" teal (estilo iFood): robô oficial DENTRO de um container arredondado com
          gradiente da marca. Substitui a borda branca dura (parecia adesivo, sem identidade) por
          um frame teal — integrado e com presença de marca. Preenche a esquerda (acabou o gap). */}
      {!isDesktop && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <Box sx={{ width: 36, height: 36, borderRadius: '32%', flexShrink: 0, display: 'grid', placeItems: 'center', background: 'linear-gradient(145deg,#20b2aa 0%,#178f89 55%,#0f5f5a 100%)', boxShadow: '0 3px 10px rgba(15,95,90,.45)', overflow: 'hidden' }}>
            <DrExame size={28} sx={{ borderRadius: '22%' }} />
          </Box>
          <Typography sx={{ fontWeight: 800, fontFamily: '"Poppins", sans-serif', fontSize: 16, letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>Dr. Exame</Typography>
        </Box>
      )}
      {isDesktop && <TitlePortal />}
      <Box sx={{ flex: 1 }} />
      {isDesktop && <CreditsChip />}
      <NotificationBell />
      <PatientSwitcher />
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
  const navigate = useNavigate();
  const translate = useTranslate();
  const { pathname } = useLocation();
  const [aboutOpen, setAboutOpen] = useState(false);
  const userStr = typeof localStorage !== 'undefined' ? localStorage.getItem('user') : null;
  const isAdmin = (() => { try { return userStr ? (JSON.parse(userStr)?.role === 'ADMIN') : false; } catch { return false; } })();
  return (
  <Box component="nav" sx={{ py: 1, display: 'flex', flexDirection: 'column', minHeight: '100%', width: '100%', minWidth: 0, maxWidth: '100%', containerType: 'inline-size', overflowX: 'hidden', overflowY: 'auto', maxHeight: '100vh', '& .MuiListItemButton-root, & .MuiMenuItem-root': { flex: '0 0 auto' } }}>
    {/* GRID de atalhos — estilo app nativo (tile premium c/ gradiente teal).
       Container query: 2 colunas quando estreito (sidebar desktop ~240px → tiles maiores, premium),
       3 colunas quando largo (drawer mobile ~336px). minmax(0,1fr) garante encolher sem transbordar.
       Antes era repeat(3,1fr) fixo → estourava 66px sobre o conteúdo no sidebar desktop. */}
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 0.75, p: 1, pb: 0.5, minWidth: 0, '@container (max-width: 300px)': { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' } }}>
      {([
        { to: '/', icon: <HomeIcon />, label: 'nav.home' },
        { to: '/exams', icon: <MedicalInformationIcon />, label: 'menu.exams' },
        { to: '/alterados', icon: <WarningAmberIcon />, label: 'menu.alterados' },
        { to: '/evolucao', icon: <InsightsIcon />, label: 'menu.evolution' },
        { to: '/tendencias', icon: <AutoGraphIcon />, label: 'menu.trends' },
        { to: '/linha-do-tempo', icon: <HistoryIcon />, label: 'menu.timeline' },
        { to: '/relatorio', icon: <SummarizeIcon />, label: 'menu.report' },
        { to: '/perguntas', icon: <QuestionAnswerIcon />, label: 'menu.questions' },
        { to: '/familia', icon: <Diversity3Icon />, label: 'menu.family' },
      ]).map((it) => {
        const on = it.to === '/' ? pathname === '/' : pathname.startsWith(it.to);
        return (
          <Box key={it.to} onClick={() => navigate(it.to)} sx={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.75, py: 1.25, borderRadius: 2.5, cursor: 'pointer',
            transition: 'all .18s cubic-bezier(.4,0,.2,1)', '&:active': { transform: 'scale(.92)' },
          }}>
            <Box sx={{
              width: 42, height: 42, display: 'grid', placeItems: 'center', borderRadius: 2.5,
              background: on ? 'linear-gradient(135deg,#20b2aa,#178f89)' : 'linear-gradient(135deg, rgba(32,178,170,.14), rgba(212,165,116,.12))',
              color: on ? '#fff' : '#178f89',
              boxShadow: on ? '0 6px 16px -6px rgba(32,178,170,.6)' : 'none',
              transition: 'all .18s', '& svg': { fontSize: 22 },
            }}>{it.icon}</Box>
            <Typography sx={{ fontSize: 10.5, fontWeight: on ? 800 : 600, color: on ? '#178f89' : 'text.secondary', textAlign: 'center', lineHeight: 1.15 }}>{translate(it.label)}</Typography>
          </Box>
        );
      })}
    </Box>

    {/* 3 categorias por acordeão (smart-expand: abre a que contém a rota ativa) */}
    <MenuSectionAccordion title={translate('menu.section.health')} icon={<MonitorHeartIcon />} routes={['/alterados', '/tendencias', '/linha-do-tempo', '/medicoes', '/vacinas', '/lembretes', '/emergencia', '/conquistas']}>
      <NavItem to="/alterados" primaryText={translate('menu.alterados')} icon={<WarningAmberIcon />} highlight />
      <NavItem to="/tendencias" primaryText={translate('menu.trends')} icon={<AutoGraphIcon />} highlight />
      <NavItem to="/linha-do-tempo" primaryText={translate('menu.timeline')} icon={<HistoryIcon />} highlight />
      <NavItem to="/medicoes" primaryText={translate('menu.measurements')} icon={<MonitorHeartIcon />} />
      <NavItem to="/vacinas" primaryText={translate('menu.vaccines')} icon={<VaccinesIcon />} />
      <NavItem to="/lembretes" primaryText={translate('menu.reminders')} icon={<EventAvailableIcon />} />
      <NavItem to="/emergencia" primaryText={translate('menu.emergency')} icon={<HealthAndSafetyIcon />} />
      <NavItem to="/conquistas" primaryText={translate('menu.achievements')} icon={<EmojiEventsIcon />} />
    </MenuSectionAccordion>

    <MenuSectionAccordion title={translate('menu.section.familydocs')} icon={<Diversity3Icon />} routes={['/patients', '/medicos', '/despesas']}>
      <NavItem to="/patients" primaryText={translate('menu.dependents')} icon={<Diversity3Icon />} />
      <NavItem to="/medicos" primaryText={translate('menu.doctors')} icon={<MedicalServicesIcon />} />
      <NavItem to="/despesas" primaryText={translate('menu.expenses')} icon={<AccountBalanceWalletIcon />} />
    </MenuSectionAccordion>

    <MenuSectionAccordion title={translate('menu.section.account')} icon={<AccountCircleIcon />} routes={['/perfil', '/seguranca', '/privacidade', '/planos', '/admin']}>
      <NavItem to="/perfil" primaryText={translate('menu.profile')} icon={<AccountCircleIcon />} />
      <NavItem to="/seguranca" primaryText={translate('menu.security')} icon={<LockIcon />} />
      <NavItem to="/privacidade" primaryText={translate('menu.privacy')} icon={<HealthAndSafetyIcon />} />
      <NavItem to="/planos" primaryText={translate('menu.plans')} icon={<WorkspacePremiumIcon />} />
      {isAdmin && <NavItem to="/admin" primaryText={translate('menu.admin')} icon={<AdminPanelSettingsIcon />} />}
    </MenuSectionAccordion>

    <Divider sx={{ my: 1 }} />

    {/* APOIO */}
    <NavItem to="/suporte" primaryText={translate('menu.support')} icon={<HelpOutlineIcon />} />
    <MenuItem onClick={() => setAboutOpen(true)} sx={{ mx: 0.5, borderRadius: 1, py: 0.75 }}>
      <ListItemIcon sx={{ minWidth: 36 }}><InfoIcon fontSize="small" /></ListItemIcon>
      <ListItemText primaryTypographyProps={{ fontSize: 13, fontWeight: 600 }}>{translate('menu.about')}</ListItemText>
    </MenuItem>
    <MenuItem onClick={() => logout('/entrar')} sx={{ mx: 0.5, my: 0.25, borderRadius: 1, py: 0.75, color: 'error.main', '&:hover': { bgcolor: 'rgba(239,68,68,.08)' } }}>
      <ListItemIcon sx={{ color: 'error.main', minWidth: 36 }}><LogoutIcon fontSize="small" /></ListItemIcon>
      <ListItemText primaryTypographyProps={{ fontSize: 13, fontWeight: 600 }}>{translate('menu.logout')}</ListItemText>
    </MenuItem>

    {/* POPUP "Sobre o App" */}
    <Dialog open={aboutOpen} onClose={() => setAboutOpen(false)} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ textAlign: 'center', pb: 0 }}>
        <Box sx={{ mb: 1.5, display: 'flex', justifyContent: 'center' }}><DrExame size={64} /></Box>
        Meus Exames
      </DialogTitle>
      <DialogContent sx={{ textAlign: 'center' }}>
        <Typography sx={{ fontWeight: 800, fontSize: 20, color: '#178f89', mb: 2 }}>v{APP_BUILD_INFO.version}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{translate('about.tagline')}</Typography>
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
          {translate('about.disclaimer')}
        </Typography>
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'center', pb: 2 }}>
        <Button onClick={() => setAboutOpen(false)} variant="contained" sx={{ borderRadius: 99, px: 4, textTransform: 'none', fontWeight: 700, bgcolor: '#178f89' }}>{translate('ra.action.close')}</Button>
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
          <Avatar src={userPhoto} sx={{ width: 56, height: 56, fontSize: 22, bgcolor: 'rgba(32,178,170,0.15)', color: '#178f89', fontWeight: 800, border: '2px solid rgba(32,178,170,0.3)' }}>{userName?.charAt(0)?.toUpperCase() || '👤'}</Avatar>
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
    <ConfirmDialogProvider>
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
          // SHELL CENTRADO em telas largas (premium): app inteiro (topo+menu+content) num bloco de
          // até 1728px centrado → gutters simétricos nas BORDAS (intencional, estilo Linear/GitHub),
          // NÃO espaço morto entre menu e dashboard. Em laptop (≤1728) preenche tudo; em ultrawide
          // (≥1920) centraliza c/ margens premium. Mobile (xs) continua 100% (intocado).
          '& .RaLayout-appFrame': { maxWidth: { xs: '100%', sm: 1728 }, mx: { sm: 'auto' } },
          // Menu lateral: constraine o conteúdo ao sidebar (min-width:0 + clip) — sem isto o grid
          // de atalhos (e itens largos) escapa da largura do sidebar e transborda sobre a página.
          '& .RaLayout-menu': { minWidth: 0, maxWidth: '100%', overflowX: 'hidden' },
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
      <WhatsNew />
      <CompleteProfileModal />
      </BiometricGate>
    </DrawerProvider>
    </ConfirmDialogProvider>
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
      const hasHashRoute = window.location.hash.startsWith('#/');
      if (!isNativeApp && !hasHashRoute && (p === '/' || p === '') && !localStorage.getItem('token')) {
        window.history.replaceState({}, '', '/landing');
      }
    } catch { /* ignore */ }
    // COLD-START FIX (web): o react-admin roteia por HASH (HashRouter). Quem cai direto numa
    // rota real — deep-link de push, reload F5 em /alterados — viaja pro Dashboard default porque
    // o router não casa (o caminho está em location.pathname, não em location.hash). Redireciona
    // path→hash ANTES do boot; no reload o hash casa a rota certa e o ida-e-volta some. APK abre
    // em '/' e navega por SPA (hash nativo), então o shim é só web.
    try {
      if (!isNativeApp) {
        const { pathname, hash, search } = window.location;
        // Em produção o app é servido em /minhasaude (basename); em dev/localhost, na raiz.
        // Stripa o basename do pathname pra achar a ROTA e redireciona MANTENDO o basename.
        // BUG ANTERIOR: mandava pra `origin/#${pathname}` = `origin/#/minhasaude/rota` = RAIZ
        // (app do EdEspeto) com hash — perdia o basename e o usuário caía no app errado (sem
        // labels, layout quebrado) ao acessar janocaminho.com.br/minhasaude/.
        const base = pathname.startsWith('/minhasaude') ? '/minhasaude' : '';
        const rota = base ? (pathname.slice(base.length) || '/') : pathname;
        if (rota && rota !== '/' && !hash) {
          window.location.replace(`${window.location.origin}${base}/#${rota}${search}`);
          return; // a página recarrega no replace — ignora o resto (remonta limpo)
        }
      }
    } catch { /* ignore */ }
    const bootTimer = setTimeout(() => { if (!cancelled) setBooted(true); }, 1100); // splash visível na abertura
    void initPush();
    void checkAppUpdate().then((r) => { if (!cancelled && r.required) setForceUpdate(r.latest); }); // força-update se versão instalada < mínima
    void checkPlayUpdate(); // in-app update NATIVO do Google Play (baixa e atualiza sozinho) — só em builds da Play Store
    // RE-CHECA atualização a cada 10 min enquanto o app tá aberto (Play Store publica versão nova → aparece sem precisar reiniciar)
    const updateInterval = setInterval(() => { if (!cancelled) void checkPlayUpdate(); }, 10 * 60 * 1000);
    void syncCreditCosts();
    // SLIDING SESSION no boot: sempre que há token, busca /auth/me para (a) renovar o token
    // fresco que o server devolve (previne expiração pra quem volta após dias sem usar),
    // (b) popular user/paciente se faltar (login antigo por biometria só guardava o token) e
    // (c) SE o token já expirou (401), limpar a sessão stale — sem isso o usuário fica
    // "logado" com token morto e toda request falha (ex.: upload "Token inválido ou expirado").
    const __tk = localStorage.getItem('token');
    if (__tk) {
      fetch(`${API_URL}/auth/me`, { headers: { Authorization: `Bearer ${__tk}` } })
        .then(async (r) => {
          if (r && r.ok) return r.json();
          // 401 = token expirado/inválido → limpa sessão stale (não limpa em 5xx: pode ser blip do server)
          if (r && r.status === 401) { try { localStorage.removeItem('token'); localStorage.removeItem('user'); } catch {} }
          return null;
        })
        .then((d) => { if (!cancelled && d?.user) { localStorage.setItem('user', JSON.stringify(d.user)); if (d.token) { try { localStorage.setItem('token', d.token); } catch {} } if (d.patientId) { localStorage.setItem('patientId', d.patientId); localStorage.setItem('selPatientId', d.patientId); } window.dispatchEvent(new Event('selPatientChanged')); } })
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
      <Route path="/landing" element={<Suspense fallback={<PageSkeleton />}><LandingPage /></Suspense>} />
      <Route path="/convite/:token" element={<InviteLandingPage />} />
      <Route path="/termos" element={<TermsPage />} />
      <Route path="/registrar" element={<RegisterPage />} />
      <Route path="/recuperar-senha" element={<ResetPage />} />
      <Route path="/doctor" element={<Suspense fallback={<PageSkeleton />}><DoctorPortalPage /></Suspense>} />
      {/* Backoffice ISOLADO do app do paciente: shell próprio (sem AppLayout/BottomNav/FloatingChat/menu de saúde). */}
      <Route path="/admin" element={<AdminPage />} />
    </CustomRoutes>

    <Resource name="exams" list={ExamList} show={ExamShow} create={ExamCreate} options={{ label: 'Exames' }} icon={MedicalInformationIcon} />
    <Resource name="patients" list={PatientList} edit={PatientEdit} options={{ label: 'Dependentes' }} icon={Diversity3Icon} />
    <Resource name="items" options={{ label: 'Itens' }} />
    <Resource name="analyses" options={{ label: 'Análises' }} />

    <CustomRoutes>
      <Route path="/perfil" element={<ProfilePage />} />
      <Route path="/perguntas" element={<Suspense fallback={<PageSkeleton />}><QuestionsPage /></Suspense>} />
      <Route path="/seguranca" element={<SecurityPage />} />
      <Route path="/privacidade" element={<PrivacyPage />} />
      <Route path="*" element={<NotFoundPage />} />
      <Route path="/evolucao" element={<EvolutionPage />} />
      <Route path="/familia" element={<FamilyPage />} />
      <Route path="/tendencias" element={<TrendsPage />} />
      <Route path="/linha-do-tempo" element={<TimelinePage />} />
      <Route path="/relatorio" element={<ConsolidatedReportPage />} />
      <Route path="/alterados" element={<ValoresAlteradosPage />} />
      <Route path="/lembretes" element={<Suspense fallback={<PageSkeleton />}><RemindersPage /></Suspense>} />
      <Route path="/medicoes" element={<MeasurementsPage />} />
      <Route path="/vacinas" element={<VaccinesPage />} />
      <Route path="/despesas" element={<ExpensesPage />} />
      <Route path="/emergencia" element={<EmergencyCardPage />} />
      <Route path="/chat" element={<Suspense fallback={<PageSkeleton />}><ChatPage /></Suspense>} />
      <Route path="/notificacoes" element={<NotificationsPage />} />
      <Route path="/planos" element={<Suspense fallback={<PageSkeleton />}><PlansPage /></Suspense>} />
      <Route path="/medicos" element={<MedicosPage />} />
      <Route path="/conquistas" element={<ConquistasPage />} />
      <Route path="/suporte" element={<SupportPage />} />
      <Route path="/suporte/:id" element={<SupportPage />} />
    </CustomRoutes>
  </Admin>
  </>
  );
};
