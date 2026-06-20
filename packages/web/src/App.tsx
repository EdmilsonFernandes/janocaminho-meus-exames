import { Admin, Resource, CustomRoutes, Layout, Menu, AppBar, TitlePortal, AppBarProps, useLogout, useTranslate, useLocale, useSetLocale, useRefresh } from 'react-admin';
import { Route, useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState, useRef } from 'react';
import { Box, Typography, IconButton, Button, useMediaQuery, useTheme, CircularProgress, Menu as MuiMenu, MenuItem, Divider, ListItemIcon, ListItemText } from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
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
import MedicalInformationIcon from '@mui/icons-material/MedicalInformation';
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
import { ChatPage } from './pages/Chat';
import { RemindersPage } from './pages/Reminders';
import { PlansPage } from './pages/Plans';
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
import { LandingPage } from './pages/Landing';
import { TermsPage } from './pages/Terms';
import { PatientSwitcher } from './components/PatientSwitcher';
import { CreditsChip } from './components/CreditsChip';
import { FloatingChat } from './components/FloatingChat';
import { BootSplash } from './components/BootSplash';
import { MobileBottomNav } from './components/MobileBottomNav';
import { ForceUpdate } from './components/ForceUpdate';
import { checkAppUpdate } from './utils/version';
import { NotificationBell } from './components/NotificationBell';
import { NotificationsPage } from './pages/Notifications';
import { DoctorPortalPage } from './pages/DoctorPortal';
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
  const [menuA, setMenuA] = useState<HTMLElement | null>(null);
  const toggleLang = () => { const l = locale === 'pt' ? 'en' : 'pt'; setLocale(l); try { localStorage.setItem('lang', l); } catch {} setMenuA(null); };
  return (
    <AppBar {...props} userMenu={false}>
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
        <MenuItem onClick={() => logout()} sx={{ color: 'error.main' }}>↩ Sair</MenuItem>
      </MuiMenu>
    </AppBar>
  );
};

// Ícones coloridos (cada item com sua cor) — menu traduzível (PT/EN)
const AppMenu = () => {
  const t = useTranslate();
  const logout = useLogout();
  // Verifica se é admin (lê do localStorage — salvo no login)
  const userStr = typeof localStorage !== 'undefined' ? localStorage.getItem('user') : null;
  const isAdmin = userStr ? (JSON.parse(userStr)?.role === 'ADMIN') : false;
  return (
  <Menu>
    <Menu.DashboardItem />
    <Menu.Item to="/perfil" primaryText={t('menu.profile')} leftIcon={<AccountCircleIcon sx={{ color: '#8b5cf6' }} />} />
    <Menu.Item to="/evolucao" primaryText={t('menu.evolution')} leftIcon={<InsightsIcon sx={{ color: '#0ea5e9' }} />} />
    <Menu.Item to="/exams" primaryText={t('menu.exams')} leftIcon={<MedicalInformationIcon sx={{ color: '#d4a574' }} />} />
    <Menu.Item to="/patients" primaryText={t('menu.dependents')} leftIcon={<Diversity3Icon sx={{ color: '#f59e0b' }} />} />
    <Menu.Item to="/familia" primaryText={t('menu.family')} leftIcon={<Diversity3Icon sx={{ color: '#f59e0b' }} />} />
    <Menu.Item to="/tendencias" primaryText={t('menu.trends')} leftIcon={<AutoGraphIcon sx={{ color: '#10b981' }} />} />
    <Menu.Item to="/linha-do-tempo" primaryText={t('menu.timeline')} leftIcon={<HistoryIcon sx={{ color: '#6366f1' }} />} />
    <Menu.Item to="/relatorio" primaryText={t('menu.report')} leftIcon={<SummarizeIcon sx={{ color: '#0891b2' }} />} />
    <Menu.Item to="/lembretes" primaryText={t('menu.reminders')} leftIcon={<EventAvailableIcon sx={{ color: '#eab308' }} />} />
    <Menu.Item to="/medicoes" primaryText={t('menu.measurements')} leftIcon={<MonitorHeartIcon sx={{ color: '#ec4899' }} />} />
    <Menu.Item to="/vacinas" primaryText={t('menu.vaccines')} leftIcon={<VaccinesIcon sx={{ color: '#14b8a6' }} />} />
    <Menu.Item to="/despesas" primaryText={t('menu.expenses')} leftIcon={<AccountBalanceWalletIcon sx={{ color: '#22c55e' }} />} />
    <Menu.Item to="/emergencia" primaryText={t('menu.emergency')} leftIcon={<HealthAndSafetyIcon sx={{ color: '#ef4444' }} />} />
    <Menu.Item to="/chat" primaryText={t('menu.chat')} leftIcon={<AutoAwesomeIcon sx={{ color: '#a855f7' }} />} />
    <Menu.Item to="/planos" primaryText={t('menu.plans')} leftIcon={<WorkspacePremiumIcon sx={{ color: '#f97316' }} />} />
    {isAdmin && <Menu.Item to="/admin" primaryText="Painel Admin" leftIcon={<AdminPanelSettingsIcon sx={{ color: '#ef4444' }} />} />}
    <Divider sx={{ my: 1 }} />
    <MenuItem onClick={() => logout()} sx={{ mx: 0.5, my: 0.25, borderRadius: 1, py: 1, color: 'error.main', '&:hover': { bgcolor: 'rgba(239,68,68,.08)' } }}>
      <ListItemIcon sx={{ color: 'error.main', minWidth: 36 }}><LogoutIcon fontSize="small" /></ListItemIcon>
      <ListItemText primaryTypographyProps={{ fontSize: 14, fontWeight: 500 }}>{t('menu.logout', 'Sair da conta')}</ListItemText>
    </MenuItem>
    <Box sx={{ mt: 'auto', px: 2, py: 1.5, fontSize: 11, color: 'text.secondary', borderTop: '1px solid #e2e8f0' }}>
      Meus Exames v{pkg.version}
    </Box>
  </Menu>
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
    <>
      {/* gap reduzido + espaço pra não cobrir conteúdo com o menu rodapé (mobile) */}
      <Layout {...props} menu={AppMenu} appBar={CustomAppBar}
        sx={{ '& .RaLayout-content, & main': { padding: { xs: '2px 0 64px', sm: '6px 0 28px' } }, '& .RaList-toolbar, [class*="List-toolbar"]': { minHeight: '40px !important', paddingBottom: '4px !important' } }} />
      <FloatingChat />
      <PullToRefresh />
      <MobileBottomNav />
    </>
  );
};

export const App = () => {
  const [booted, setBooted] = useState(false);
  const [forceUpdate, setForceUpdate] = useState<string | null>(null);
  useEffect(() => {
    const bootTimer = setTimeout(() => setBooted(true), 1100); // splash visível na abertura
    void initPush();
    void checkAppUpdate().then((r) => { if (r.required) setForceUpdate(r.latest); }); // força-update se versão instalada < mínima
    void syncCreditCosts();
    // Botão/gesto de voltar do Android (Capacitor) — volta no histórico ou sai do app na raiz
    let remove: (() => void) | undefined;
    (async () => {
      try {
        const [{ App }, { Capacitor }] = await Promise.all([import('@capacitor/app'), import('@capacitor/core')]);
        if (Capacitor.isNativePlatform()) {
          const h = await App.addListener('backButton', ({ canGoBack }) => { if (canGoBack) window.history.back(); else App.exitApp(); });
          remove = () => { h.remove(); };
        }
      } catch { /* web: sem @capacitor — browser back já funciona */ }
    })();
    return () => { clearTimeout(bootTimer); remove?.(); };
  }, []);
  if (!booted) return <BootSplash messages={['Iniciando o Dr. Exame…', 'Carregando seus exames…', 'Preparando seu painel…', 'Quase lá…']} />;
  if (forceUpdate) return <ForceUpdate latest={forceUpdate} />;
  return (
  <Admin
    dataProvider={dataProvider}
    authProvider={authProvider}
    theme={theme}
    i18nProvider={i18nProvider}
    layout={AppLayout}
    dashboard={Dashboard}
    loginPage={LoginPage}
    title="Meus Exames"
    loading={() => <BootSplash />}
    disableTelemetry
  >
    <CustomRoutes noLayout>
      <Route path="/landing" element={<LandingPage />} />
      <Route path="/termos" element={<TermsPage />} />
      <Route path="/registrar" element={<RegisterPage />} />
      <Route path="/recuperar-senha" element={<ResetPage />} />
      <Route path="/doctor" element={<DoctorPortalPage />} />
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
      <Route path="/lembretes" element={<RemindersPage />} />
      <Route path="/medicoes" element={<MeasurementsPage />} />
      <Route path="/vacinas" element={<VaccinesPage />} />
      <Route path="/despesas" element={<ExpensesPage />} />
      <Route path="/emergencia" element={<EmergencyCardPage />} />
      <Route path="/chat" element={<ChatPage />} />
      <Route path="/notificacoes" element={<NotificationsPage />} />
      <Route path="/planos" element={<PlansPage />} />
      <Route path="/medicos" element={<MedicosPage />} />
    </CustomRoutes>
  </Admin>
  );
};
