import { Admin, Resource, CustomRoutes, Layout, Menu, AppBar, TitlePortal, AppBarProps, useLogout } from 'react-admin';
import { Route, useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState, useRef } from 'react';
import { Box, Typography, IconButton, useMediaQuery, useTheme, CircularProgress } from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
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
import { LoginPage, RegisterPage, ResetPage } from './pages/Auth';
import { LandingPage } from './pages/Landing';
import { TermsPage } from './pages/Terms';
import { PatientSwitcher } from './components/PatientSwitcher';
import { CreditsChip } from './components/CreditsChip';
import { FloatingChat } from './components/FloatingChat';
import { initPush } from './push';

// AppBar: só o seletor de paciente (titular = quem loga) + botão Sair (sem conflito de avatares)
const CustomAppBar = (props: AppBarProps) => {
  const logout = useLogout();
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('sm'));
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const canBack = !isDesktop && pathname !== '/'; // sub-páginas no mobile têm seta de voltar
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
      <IconButton color="inherit" onClick={() => logout()} title="Sair" size="small"
        sx={{ ml: 0.5, bgcolor: 'rgba(0,0,0,0.05)', '&:hover': { bgcolor: 'rgba(0,0,0,0.1)' } }}>
        <LogoutIcon fontSize="small" />
      </IconButton>
    </AppBar>
  );
};

// Ícones coloridos (cada item com sua cor) — menu mais vivo e premium
const AppMenu = () => (
  <Menu>
    <Menu.DashboardItem />
    <Menu.Item to="/perfil" primaryText="Meu perfil" leftIcon={<AccountCircleIcon sx={{ color: '#8b5cf6' }} />} />
    <Menu.Item to="/evolucao" primaryText="Evolução da saúde" leftIcon={<InsightsIcon sx={{ color: '#0ea5e9' }} />} />
    <Menu.ResourceItems />
    <Menu.Item to="/familia" primaryText="Saúde da Família" leftIcon={<Diversity3Icon sx={{ color: '#f59e0b' }} />} />
    <Menu.Item to="/tendencias" primaryText="Tendências" leftIcon={<AutoGraphIcon sx={{ color: '#10b981' }} />} />
    <Menu.Item to="/linha-do-tempo" primaryText="Linha do Tempo" leftIcon={<HistoryIcon sx={{ color: '#6366f1' }} />} />
    <Menu.Item to="/relatorio" primaryText="Relatório completo" leftIcon={<SummarizeIcon sx={{ color: '#0891b2' }} />} />
    <Menu.Item to="/lembretes" primaryText="Lembretes" leftIcon={<EventAvailableIcon sx={{ color: '#eab308' }} />} />
    <Menu.Item to="/medicoes" primaryText="Medições" leftIcon={<MonitorHeartIcon sx={{ color: '#ec4899' }} />} />
    <Menu.Item to="/vacinas" primaryText="Vacinas" leftIcon={<VaccinesIcon sx={{ color: '#14b8a6' }} />} />
    <Menu.Item to="/despesas" primaryText="Despesas Médicas" leftIcon={<AccountBalanceWalletIcon sx={{ color: '#22c55e' }} />} />
    <Menu.Item to="/emergencia" primaryText="Cartão de Emergência" leftIcon={<HealthAndSafetyIcon sx={{ color: '#ef4444' }} />} />
    <Menu.Item to="/chat" primaryText="Assistente de saúde" leftIcon={<AutoAwesomeIcon sx={{ color: '#a855f7' }} />} />
    <Menu.Item to="/planos" primaryText="Planos e Créditos" leftIcon={<WorkspacePremiumIcon sx={{ color: '#f97316' }} />} />
    <Box sx={{ mt: 'auto', px: 2, py: 1.5, fontSize: 11, color: 'text.secondary', borderTop: '1px solid #e2e8f0' }}>
      Meus Exames v{pkg.version}
    </Box>
  </Menu>
);

// Pull-to-refresh no mobile: puxa a tela no topo e solta p/ recarregar
const PullToRefresh = () => {
  const [shown, setShown] = useState(0);
  const dist = useRef(0);
  useEffect(() => {
    let startY = 0; let active = false;
    const onStart = (e: TouchEvent) => { if ((window.scrollY ?? 0) <= 0) { startY = e.touches[0].clientY; active = true; } };
    const onMove = (e: TouchEvent) => { if (!active) return; const d = Math.min(e.touches[0].clientY - startY, 100); dist.current = d; setShown(d); };
    const onEnd = () => { if (active && dist.current > 70) window.location.reload(); active = false; dist.current = 0; setShown(0); };
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

const AppLayout = (props: any) => (
  <>
    <Layout {...props} menu={AppMenu} appBar={CustomAppBar} />
    <FloatingChat />
    <PullToRefresh />
  </>
);

export const App = () => {
  useEffect(() => {
    void initPush();
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
    return () => { remove?.(); };
  }, []);
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
    disableTelemetry
  >
    <CustomRoutes noLayout>
      <Route path="/landing" element={<LandingPage />} />
      <Route path="/termos" element={<TermsPage />} />
      <Route path="/registrar" element={<RegisterPage />} />
      <Route path="/recuperar-senha" element={<ResetPage />} />
    </CustomRoutes>

    <Resource name="exams" list={ExamList} show={ExamShow} create={ExamCreate} options={{ label: 'Exames' }} icon={MedicalInformationIcon} />
    <Resource name="patients" list={PatientList} edit={PatientEdit} options={{ label: 'Dependentes' }} icon={Diversity3Icon} />
    <Resource name="items" options={{ label: 'Itens' }} />
    <Resource name="analyses" options={{ label: 'Análises' }} />

    <CustomRoutes>
      <Route path="/perfil" element={<ProfilePage />} />
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
      <Route path="/planos" element={<PlansPage />} />
    </CustomRoutes>
  </Admin>
  );
};
