import { Admin, Resource, CustomRoutes, Layout, Menu } from 'react-admin';
import { Box } from '@mui/material';
import { Route } from 'react-router-dom';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import ChatIcon from '@mui/icons-material/MedicalServices';
import NotificationsIcon from '@mui/icons-material/NotificationsActive';
import StarIcon from '@mui/icons-material/Star';
import SpeedIcon from '@mui/icons-material/Speed';
import VaccinesIcon from '@mui/icons-material/Vaccines';
import EmergencyIcon from '@mui/icons-material/Emergency';
import TimelineIcon from '@mui/icons-material/Timeline';
import ReceiptIcon from '@mui/icons-material/Receipt';
import { dataProvider } from './dataProvider';
import { authProvider } from './authProvider';
import { theme } from './theme';
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
import { LoginPage, RegisterPage, ResetPage } from './pages/Auth';
import { LandingPage } from './pages/Landing';
import { PatientSwitcher } from './components/PatientSwitcher';

const AppMenu = () => (
  <Menu>
    <PatientSwitcher />
    <Menu.DashboardItem />
    <Menu.ResourceItems />
    <Menu.Item to="/tendencias" primaryText="Tendências" leftIcon={<ShowChartIcon />} />
    <Menu.Item to="/linha-do-tempo" primaryText="Linha do Tempo" leftIcon={<TimelineIcon />} />
    <Menu.Item to="/lembretes" primaryText="Lembretes" leftIcon={<NotificationsIcon />} />
    <Menu.Item to="/medicoes" primaryText="Medições" leftIcon={<SpeedIcon />} />
    <Menu.Item to="/vacinas" primaryText="Vacinas" leftIcon={<VaccinesIcon />} />
    <Menu.Item to="/despesas" primaryText="Despesas Médicas" leftIcon={<ReceiptIcon />} />
    <Menu.Item to="/emergencia" primaryText="Cartão de Emergência" leftIcon={<EmergencyIcon />} />
    <Menu.Item to="/chat" primaryText="Assistente de saúde" leftIcon={<ChatIcon />} />
    <Menu.Item to="/planos" primaryText="Planos / Assinar" leftIcon={<StarIcon />} />
  </Menu>
);

const AppLayout = (props: any) => <Layout {...props} menu={AppMenu} />;

export const App = () => {
  const base = import.meta.env.BASE_URL;
  const basename = base && base !== '/' ? base.replace(/\/$/, '') : undefined;
  return (
  <Admin
    dataProvider={dataProvider}
    authProvider={authProvider}
    theme={theme}
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

    <Resource name="exams" list={ExamList} show={ExamShow} create={ExamCreate} options={{ label: 'Exames' }} />
    <Resource name="patients" list={PatientList} edit={PatientEdit} options={{ label: 'Perfil' }} />
    <Resource name="items" options={{ label: 'Itens' }} />
    <Resource name="analyses" options={{ label: 'Análises' }} />

    <CustomRoutes>
      <Route path="/tendencias" element={<TrendsPage />} />
      <Route path="/linha-do-tempo" element={<TimelinePage />} />
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
