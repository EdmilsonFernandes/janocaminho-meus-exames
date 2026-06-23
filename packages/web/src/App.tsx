import { Admin, Resource, CustomRoutes, Layout, Menu, AppBar, TitlePortal, AppBarProps, useLogout, useTranslate, useLocale, useSetLocale, useRefresh } from 'react-admin';
import { Route, useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState, useRef, lazy, Suspense } from 'react';
import { Capacitor } from '@capacitor/core';
import { Box, Typography, IconButton, Button, useMediaQuery, useTheme, CircularProgress, Menu as MuiMenu, MenuItem, Divider, ListItemIcon, ListItemText, Collapse, ListItemButton, Dialog, DialogTitle, DialogContent, DialogActions, Chip, Drawer, Avatar, Stack } from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CloseIcon from '@mui/icons-material/Close';
import MenuIcon from '@mui/icons-material/Menu';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import InsightsIcon from '@mui/icons-material/Insights';
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
import Diversity3Icon from '@mui/icons-material/Diversity3';
import SummarizeIcon from '@mui/icons-material/Summarize';
import { dataProvider } from './dataProvider';
import { authProvider } from './authProvider';
import { theme } from './theme';
import { i18nProvider } from './i18n';
import pkg from '../package.json';
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
import { AdminPage } from './pages/Admin';
import { NotFoundPage } from './pages/NotFound';
import { LoginPage, RegisterPage, ResetPage } from './pages/Auth';
import { TermsPage } from './pages/Terms';
import { PatientSwitcher } from './components/PatientSwitcher';
import { CreditsChip } from './components/CreditsChip';
import { FloatingChat } from './components/FloatingChat';
import { BootSplash } from './components/BootSplash';
import { MobileBottomNav } from './components/MobileBottomNav';
import { DrawerProvider, useAppDrawer } from './components/drawerState';
import { OfflineBanner } from './components/OfflineBanner';
import { ForceUpdate } from './components/ForceUpdate';
import { checkAppUpdate, checkPlayUpdate } from './utils/version';
import { NotificationBell } from './components/NotificationBell';
import { NotificationPopup } from './components/NotificationPopup';
import { Onboarding } from './components/Onboarding';
import { NotificationsPage } from './pages/Notifications';
import { MedicosPage } from './pages/Medicos';
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
  const [menuA, setMenuA] = useState<HTMLElement | null>(null);
  const toggleLang = () => { const l = locale === 'pt' ? 'en' : 'pt'; setLocale(l); try { localStorage.setItem('lang', l); } catch {} setMenuA(null); };
  return (
    // O ☰ nativo do react-admin (SidebarToggleButton) é escondido no mobile via CSS no AppLayout
    // (classe .RaAppBar-menuButton → display:none em telas pequenas). No mobile, o ☰ abaixo
    // abre o AppDrawer UNIFICADO (mesmo menu do "Mais" do rodapé). Desktop mantém o toggle nativo.
    <AppBar {...props} userMenu={false}>
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
        <MenuItem onClick={toggleLang}>🌐 {locale === 'pt' ? 'Mudar para English' : 'Switch to Português'}</MenuItem>
        <MenuItem onClick={() => { refresh(); setMenuA(null); }}>↻ Atualizar</MenuItem>
        <MenuItem onClick={() => logout('/entrar')} sx={{ color: 'error.main' }}>↩ Sair</MenuItem>
      </MuiMenu>
    </AppBar>
  );
};

// Grupo colapsável do menu (accordion — clica no título, expande os itens)
const ChevronIcon = ({ open }: { open: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}><path d="m6 9 6 6 6-6" /></svg>
);
const MenuGroup = ({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) => {
  const [open, setOpen] = useState(true); // EXPANDIDO por padrão (EdEspeto-style)
  return (
    <>
      <ListItemButton onClick={() => setOpen(!open)} sx={{ borderRadius: 1, m: '0 8px', py: 0.5, '&:hover': { bgcolor: 'rgba(32,178,170,.06)' } }}>
        <ListItemIcon sx={{ minWidth: 34 }}>{icon}</ListItemIcon>
        <ListItemText primary={title} primaryTypographyProps={{ fontSize: 13, fontWeight: 700, color: '#0f3d3a' }} />
        <ChevronIcon open={open} />
      </ListItemButton>
      <Collapse in={open} timeout="auto" sx={{ '& .MuiMenuItem-root, & .MuiListItem-root': { py: 0.25 } }}>{children}</Collapse>
    </>
  );
};

// Menu lateral — organizado como app profissional (EdEspeto-style)
const AppMenu = () => {
  const t = useTranslate();
  const logout = useLogout();
  const [aboutOpen, setAboutOpen] = useState(false);
  const userStr = typeof localStorage !== 'undefined' ? localStorage.getItem('user') : null;
  const isAdmin = (() => { try { return userStr ? (JSON.parse(userStr)?.role === 'ADMIN') : false; } catch { return false; } })();
  return (
  <Menu>
    <Menu.DashboardItem />
    <Menu.Item to="/exams" primaryText="Exames" leftIcon={<MedicalInformationIcon sx={{ color: '#d4a574' }} />} />
    <Menu.Item to="/evolucao" primaryText="Evolução" leftIcon={<InsightsIcon sx={{ color: '#0ea5e9' }} />} />
    <Menu.Item to="/chat" primaryText="Dr. Exame (IA)" leftIcon={<AutoAwesomeIcon sx={{ color: '#a855f7' }} />} />

    <MenuGroup title="📊 Minha Saúde" icon={<MonitorHeartIcon sx={{ color: '#ec4899' }} />}>
      <Menu.Item to="/alterados" primaryText="Valores alterados" leftIcon={<WarningAmberIcon sx={{ color: '#f59e0b', fontSize: 18 }} />} />
      <Menu.Item to="/tendencias" primaryText="Tendências" leftIcon={<AutoGraphIcon sx={{ color: '#10b981', fontSize: 18 }} />} />
      <Menu.Item to="/linha-do-tempo" primaryText="Linha do tempo" leftIcon={<HistoryIcon sx={{ color: '#6366f1', fontSize: 18 }} />} />
      <Menu.Item to="/medicoes" primaryText="Medições" leftIcon={<MonitorHeartIcon sx={{ color: '#ec4899', fontSize: 18 }} />} />
      <Menu.Item to="/vacinas" primaryText="Vacinas" leftIcon={<VaccinesIcon sx={{ color: '#14b8a6', fontSize: 18 }} />} />
      <Menu.Item to="/lembretes" primaryText="Lembretes" leftIcon={<EventAvailableIcon sx={{ color: '#eab308', fontSize: 18 }} />} />
      <Menu.Item to="/emergencia" primaryText="Cartão de emergência" leftIcon={<HealthAndSafetyIcon sx={{ color: '#ef4444', fontSize: 18 }} />} />
    </MenuGroup>

    <MenuGroup title="👨‍👩‍👧 Família & Médicos" icon={<Diversity3Icon sx={{ color: '#f59e0b' }} />}>
      <Menu.Item to="/familia" primaryText="Família" leftIcon={<Diversity3Icon sx={{ color: '#f59e0b', fontSize: 18 }} />} />
      <Menu.Item to="/patients" primaryText="Dependentes" leftIcon={<Diversity3Icon sx={{ color: '#f59e0b', fontSize: 18 }} />} />
      <Menu.Item to="/medicos" primaryText="Meus Médicos" leftIcon={<MedicalServicesIcon sx={{ color: '#0b5cab', fontSize: 18 }} />} />
    </MenuGroup>

    <MenuGroup title="📄 Documentos" icon={<SummarizeIcon sx={{ color: '#0891b2' }} />}>
      <Menu.Item to="/relatorio" primaryText="Relatório completo" leftIcon={<SummarizeIcon sx={{ color: '#0891b2', fontSize: 18 }} />} />
      <Menu.Item to="/despesas" primaryText="Despesas médicas" leftIcon={<AccountBalanceWalletIcon sx={{ color: '#22c55e', fontSize: 18 }} />} />
    </MenuGroup>

    <MenuGroup title="⚙️ Conta" icon={<AccountCircleIcon sx={{ color: '#8b5cf6' }} />}>
      <Menu.Item to="/perfil" primaryText="Meu perfil" leftIcon={<AccountCircleIcon sx={{ color: '#8b5cf6', fontSize: 18 }} />} />
      <Menu.Item to="/perfil" primaryText="🔐 Segurança da conta (MFA + biometria)" leftIcon={<LockIcon sx={{ color: '#8b5cf6', fontSize: 18 }} />} />
      <Menu.Item to="/planos" primaryText="Planos e créditos" leftIcon={<WorkspacePremiumIcon sx={{ color: '#f97316', fontSize: 18 }} />} />
      {isAdmin && <Menu.Item to="/admin" primaryText="Painel Admin" leftIcon={<AdminPanelSettingsIcon sx={{ color: '#ef4444', fontSize: 18 }} />} />}
    </MenuGroup>

    <Divider sx={{ my: 1 }} />

    {/* APOIO */}
    <MenuItem component="a" href="mailto:contato@janocaminho.com.br?subject=Ajuda%20-%20Meus%20Exames" sx={{ mx: 0.5, borderRadius: 1, py: 0.75 }}>
      <ListItemIcon sx={{ minWidth: 36 }}>❓</ListItemIcon>
      <ListItemText primaryTypographyProps={{ fontSize: 13, fontWeight: 600 }}>Ajuda & Suporte</ListItemText>
    </MenuItem>
    <MenuItem onClick={() => setAboutOpen(true)} sx={{ mx: 0.5, borderRadius: 1, py: 0.75 }}>
      <ListItemIcon sx={{ minWidth: 36 }}>ℹ️</ListItemIcon>
      <ListItemText primaryTypographyProps={{ fontSize: 13, fontWeight: 600 }}>Sobre o app</ListItemText>
    </MenuItem>
    <MenuItem onClick={() => logout('/entrar')} sx={{ mx: 0.5, my: 0.25, borderRadius: 1, py: 0.75, color: 'error.main', '&:hover': { bgcolor: 'rgba(239,68,68,.08)' } }}>
      <ListItemIcon sx={{ color: 'error.main', minWidth: 36 }}><LogoutIcon fontSize="small" /></ListItemIcon>
      <ListItemText primaryTypographyProps={{ fontSize: 13, fontWeight: 600 }}>Sair da conta</ListItemText>
    </MenuItem>

    <Box sx={{ mt: 'auto', px: 2, py: 1.5, fontSize: 11, color: 'text.secondary', borderTop: '1px solid #e2e8f0' }}>
      Meus Exames v{pkg.version}
    </Box>

    {/* POPUP "Sobre o App" */}
    <Dialog open={aboutOpen} onClose={() => setAboutOpen(false)} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ textAlign: 'center', pb: 0 }}>
        <Box sx={{ fontSize: 48, mb: 1 }}>🤖</Box>
        Meus Exames
      </DialogTitle>
      <DialogContent sx={{ textAlign: 'center' }}>
        <Typography sx={{ fontWeight: 800, fontSize: 18, color: '#0f3d3a', mb: 0.5 }}>Versão {pkg.version}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Seu assistente de saúde com inteligência artificial.</Typography>
        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', flexWrap: 'wrap', mb: 2 }}>
          <Chip size="small" label="IA GLM-4.6" sx={{ bgcolor: '#e0f2f1', color: '#178f89', fontWeight: 700 }} />
          <Chip size="small" label="Scanner ML Kit" sx={{ bgcolor: '#e0f2f1', color: '#178f89', fontWeight: 700 }} />
          <Chip size="small" label="LGPD" sx={{ bgcolor: '#e0f2f1', color: '#178f89', fontWeight: 700 }} />
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
          📧 contato@janocaminho.com.br<br />
          🌐 janocaminho.com.br/minhasaude
        </Typography>
        <Typography variant="caption" sx={{ color: '#94a3b8', mt: 1, display: 'block' }}>
          Conteúdo educativo. Não substitui consulta, diagnóstico ou tratamento médico.
        </Typography>
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'center', pb: 2 }}>
        <Button onClick={() => setAboutOpen(false)} variant="contained" sx={{ borderRadius: 99, px: 4, textTransform: 'none', fontWeight: 700, bgcolor: '#178f89' }}>Fechar</Button>
      </DialogActions>
    </Dialog>
  </Menu>
  );
};

// Menu lateral UNIFICADO (mobile). O ☰ do AppBar e o "Mais" do rodapé abem o
// MESMO AppDrawer aqui — mesma fonte de verdade (AppMenu), zero divergência de layout.
// Fecha sozinho ao trocar de rota (mesmo comportamento do Sidebar nativo).
const AppDrawer = () => {
  const { open, closeDrawer } = useAppDrawer();
  const { pathname } = useLocation();
  const userStr = typeof localStorage !== 'undefined' ? localStorage.getItem('user') : null;
  const userName = (() => { try { return userStr ? (JSON.parse(userStr)?.name as string) : null; } catch { return null; } })();
  // auto-close ao navegar (clica num item → rota muda → fecha)
  useEffect(() => { closeDrawer(); /* deps intencional: só pathname */ }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Drawer anchor="left" open={open} onClose={closeDrawer} keepMounted={false}
      PaperProps={{ sx: { width: { xs: '86vw', sm: 340 }, maxWidth: 360, display: 'flex', flexDirection: 'column', bgcolor: '#fff' } }}>
      {/* Header teal — identidade visual do app (mesmo padrão do portal/landing) */}
      <Box sx={{ background: 'linear-gradient(135deg,#20b2aa,#178f89)', color: '#fff', px: 2, pt: 'calc(env(safe-area-inset-top) + 14px)', pb: 2, boxShadow: '0 4px 16px rgba(32,178,170,.22)' }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <Avatar sx={{ bgcolor: 'rgba(255,255,255,.2)', fontWeight: 800, border: '2px solid rgba(255,255,255,.5)' }}>{userName?.charAt(0)?.toUpperCase() || '🤖'}</Avatar>
            <Box>
              <Typography sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif', lineHeight: 1.1 }}>Meus Exames</Typography>
              <Typography sx={{ fontSize: 12, opacity: 0.9 }}>Menu completo</Typography>
            </Box>
          </Stack>
          <IconButton onClick={closeDrawer} size="small" title="Fechar" sx={{ color: '#fff', bgcolor: 'rgba(255,255,255,.15)', '&:hover': { bgcolor: 'rgba(255,255,255,.25)' } }}><CloseIcon fontSize="small" /></IconButton>
        </Stack>
      </Box>
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
    return () => { window.removeEventListener('touchstart', onStart); window.removeEventListener('touchmove', onMove); window.removeEventListener('touchend', onEnd); };
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
      {/* gap reduzido + espaço pra não cobrir conteúdo com o menu rodapé (mobile) */}
      <Layout {...props} menu={AppMenu} appBar={CustomAppBar}
        sx={{
          // Esconde o ☰ nativo do react-admin no mobile (vamos usar nosso AppDrawer unificado). Desktop mantém.
          '& .RaAppBar-menuButton': { display: { xs: 'none', sm: 'inline-flex' } },
          '& .RaLayout-content, & main': { padding: { xs: '2px 0 64px', sm: '6px 0 28px' } },
          '& .RaList-toolbar, [class*="List-toolbar"]': { minHeight: '40px !important', paddingBottom: '4px !important' },
        }} />
      {/* Menu lateral UNIFICADO (mobile) — ☰ e "Mais" abem o mesmo drawer */}
      <AppDrawer />
      <FloatingChat />
      <OfflineBanner />
      <PullToRefresh />
      <MobileBottomNav />
      <NotificationPopup />
      <Onboarding />
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
  const [exitHint, setExitHint] = useState(false);
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
    // Botão/gesto de voltar do Android (Capacitor) — volta no histórico IN-APP ou sai do app na raiz.
    let remove: (() => void) | undefined;
    (async () => {
      try {
        const [{ App }, { Capacitor }] = await Promise.all([import('@capacitor/app'), import('@capacitor/core')]);
        if (Capacitor.isNativePlatform()) {
          let lastBack = 0;
          const h = await App.addListener('backButton', () => {
            // Telas podem interceptar o back (ex.: portal médico fecha exame/paciente, dialogs fecham).
            const ev = new CustomEvent('app:back', { cancelable: true });
            window.dispatchEvent(ev);
            if (ev.defaultPrevented) return;
            // Existe uma tela anterior DENTRO do app? → volta pra ela (history.back é seguro aqui,
            // porque a pilha só contém telas do app — nunca o referrer do Google Play).
            if (inAppStack.length > 1) {
              window.history.back();
              return;
            }
            // Chegou na base da pilha (raiz do app) → double-tap pra sair (evita saída acidental).
            const now = Date.now();
            if (now - lastBack < 2500) { lastBack = 0; App.exitApp(); }
            else { lastBack = now; setExitHint(true); setTimeout(() => setExitHint(false), 2500); }
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
  {exitHint && (
    <Box sx={{ position: 'fixed', bottom: 84, left: '50%', transform: 'translateX(-50%)', bgcolor: 'rgba(15,61,58,.96)', color: '#fff', px: 2.5, py: 1.2, borderRadius: 99, zIndex: 3000, fontSize: 13.5, fontWeight: 700, boxShadow: '0 8px 24px rgba(0,0,0,.3)' }}>Pressione voltar de novo para sair</Box>
  )}
  <Admin
    dataProvider={dataProvider}
    authProvider={authProvider}
    theme={theme}
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
    </CustomRoutes>

    <Resource name="exams" list={ExamList} show={ExamShow} create={ExamCreate} options={{ label: 'Exames' }} icon={MedicalInformationIcon} />
    <Resource name="patients" list={PatientList} edit={PatientEdit} options={{ label: 'Dependentes' }} icon={Diversity3Icon} />
    <Resource name="items" options={{ label: 'Itens' }} />
    <Resource name="analyses" options={{ label: 'Análises' }} />

    <CustomRoutes>
      <Route path="/perfil" element={<ProfilePage />} />
      <Route path="*" element={<NotFoundPage />} />
      <Route path="/admin" element={<AdminPage />} />
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
    </CustomRoutes>
  </Admin>
  </>
  );
};
