import { Admin, Resource, CustomRoutes, Layout, Menu, AppBar, TitlePortal, AppBarProps, useLogout } from 'react-admin';
import { Route } from 'react-router-dom';
import { useEffect } from 'react';
import { Box, Typography, IconButton, useMediaQuery, useTheme } from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';
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
import { ProfilePage } from './pages/Profile';
import { LoginPage, RegisterPage, ResetPage } from './pages/Auth';
import { LandingPage } from './pages/Landing';
import { PatientSwitcher } from './components/PatientSwitcher';
import { initPush } from './push';

// AppBar: só o seletor de paciente (titular = quem loga) + botão Sair (sem conflito de avatares)
const CustomAppBar = (props: AppBarProps) => {
  const logout = useLogout();
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('sm'));
  return (
    <AppBar {...props} userMenu={false}>
      {isDesktop && <TitlePortal />}
      <Box sx={{ flex: 1 }} />
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

const AppLayout = (props: any) => <Layout {...props} menu={AppMenu} appBar={CustomAppBar} />;

export const App = () => {
  useEffect(() => { void initPush(); }, []);
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
