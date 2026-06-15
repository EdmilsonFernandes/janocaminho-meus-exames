import { Admin, Resource, CustomRoutes, Layout, Menu } from 'react-admin';
import { Route } from 'react-router-dom';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import ChatIcon from '@mui/icons-material/MedicalServices';
import NotificationsIcon from '@mui/icons-material/NotificationsActive';
import StarIcon from '@mui/icons-material/Star';
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
import { LoginPage, RegisterPage, ResetPage } from './pages/Auth';
import { PatientSwitcher } from './components/PatientSwitcher';

const AppMenu = () => (
  <Menu>
    <PatientSwitcher />
    <Menu.DashboardItem />
    <Menu.ResourceItems />
    <Menu.Item to="/tendencias" primaryText="Tendências" leftIcon={<ShowChartIcon />} />
    <Menu.Item to="/lembretes" primaryText="Lembretes" leftIcon={<NotificationsIcon />} />
    <Menu.Item to="/chat" primaryText="Assistente de saúde" leftIcon={<ChatIcon />} />
    <Menu.Item to="/planos" primaryText="Planos / Assinar" leftIcon={<StarIcon />} />
  </Menu>
);

const AppLayout = (props: any) => <Layout {...props} menu={AppMenu} />;

export const App = () => {
  // Em produção o app roda em /meus-exames; em dev, na raiz.
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
    {/* Páginas públicas (sem login) */}
    <CustomRoutes noLayout>
      <Route path="/registrar" element={<RegisterPage />} />
      <Route path="/recuperar-senha" element={<ResetPage />} />
    </CustomRoutes>

    <Resource name="exams" list={ExamList} show={ExamShow} create={ExamCreate} options={{ label: 'Exames' }} />
    <Resource name="patients" list={PatientList} edit={PatientEdit} options={{ label: 'Perfil' }} />
    <Resource name="items" options={{ label: 'Itens' }} />
    <Resource name="analyses" options={{ label: 'Análises' }} />

    {/* Páginas internas */}
    <CustomRoutes>
      <Route path="/tendencias" element={<TrendsPage />} />
      <Route path="/lembretes" element={<RemindersPage />} />
      <Route path="/chat" element={<ChatPage />} />
      <Route path="/planos" element={<PlansPage />} />
    </CustomRoutes>
  </Admin>
  );
};
