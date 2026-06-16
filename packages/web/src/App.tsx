import { Admin, Resource, CustomRoutes, Layout, Menu, AppBar, TitlePortal, AppBarProps } from 'react-admin';
import { Route } from 'react-router-dom';
import { useEffect } from 'react';
import { Box, Typography } from '@mui/material';
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
import { LoginPage, RegisterPage, ResetPage } from './pages/Auth';
import { LandingPage } from './pages/Landing';
import { PatientSwitcher } from './components/PatientSwitcher';
import { initPush } from './push';

// AppBar com o switcher no topo (sempre visível, não quebra quando menu colapsa)
const CustomAppBar = (props: AppBarProps) => (
  <AppBar {...props}>
    <TitlePortal />
    <Box sx={{ flex: 1 }} />
    <PatientSwitcher />
  </AppBar>
);

const AppMenu = () => (
  <Menu>
    <Menu.DashboardItem />
    <Menu.Item to="/evolucao" primaryText="Evolução da saúde" leftIcon={<InsightsIcon />} />
    <Menu.ResourceItems />
    <Menu.Item to="/familia" primaryText="Saúde da Família" leftIcon={<Diversity3Icon />} />
    <Menu.Item to="/tendencias" primaryText="Tendências" leftIcon={<AutoGraphIcon />} />
    <Menu.Item to="/linha-do-tempo" primaryText="Linha do Tempo" leftIcon={<HistoryIcon />} />
    <Menu.Item to="/relatorio" primaryText="Relatório completo" leftIcon={<SummarizeIcon />} />
    <Menu.Item to="/lembretes" primaryText="Lembretes" leftIcon={<EventAvailableIcon />} />
    <Menu.Item to="/medicoes" primaryText="Medições" leftIcon={<MonitorHeartIcon />} />
    <Menu.Item to="/vacinas" primaryText="Vacinas" leftIcon={<VaccinesIcon />} />
    <Menu.Item to="/despesas" primaryText="Despesas Médicas" leftIcon={<AccountBalanceWalletIcon />} />
    <Menu.Item to="/emergencia" primaryText="Cartão de Emergência" leftIcon={<HealthAndSafetyIcon />} />
    <Menu.Item to="/chat" primaryText="Assistente de saúde" leftIcon={<AutoAwesomeIcon />} />
    <Menu.Item to="/planos" primaryText="Planos / Assinar" leftIcon={<WorkspacePremiumIcon />} />
  </Menu>
);

const AppLayout = (props: any) => <Layout {...props} menu={AppMenu} appBar={CustomAppBar} />;

export const App = () => {
  const base = import.meta.env.BASE_URL;
  const basename = base && base !== '/' ? base.replace(/\/$/, '') : undefined;
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
    basename={basename}
    title="Meus Exames"
    disableTelemetry
  >
    <CustomRoutes noLayout>
      <Route path="/landing" element={<LandingPage />} />
      <Route path="/registrar" element={<RegisterPage />} />
      <Route path="/recuperar-senha" element={<ResetPage />} />
    </CustomRoutes>

    <Resource name="exams" list={ExamList} show={ExamShow} create={ExamCreate} options={{ label: 'Exames' }} icon={MedicalInformationIcon} />
    <Resource name="patients" list={PatientList} edit={PatientEdit} options={{ label: 'Perfil' }} icon={AccountCircleIcon} />
    <Resource name="items" options={{ label: 'Itens' }} />
    <Resource name="analyses" options={{ label: 'Análises' }} />

    <CustomRoutes>
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
