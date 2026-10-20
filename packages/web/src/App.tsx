import { tealText } from './theme';
import { Admin, Resource, CustomRoutes, Layout, AppBar, TitlePortal, AppBarProps, useLogout, useLocale, useSetLocale, useRefresh, useNotify, useTranslate, useSidebarState, LoadingIndicator } from 'react-admin';
import { ConfirmDialogProvider } from './components/ConfirmDialog';
import { Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useEffect, useState, useRef, lazy, Suspense } from 'react';
import { Capacitor } from '@capacitor/core';
import { Box, Typography, IconButton, Button, useMediaQuery, useTheme, CircularProgress, MenuItem, Divider, ListItemIcon, ListItemText, Collapse, ListItemButton, Dialog, DialogTitle, DialogContent, DialogActions, Chip, Drawer, Avatar, Stack, Link as MuiLink } from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CloseIcon from '@mui/icons-material/Close';
import MenuIcon from '@mui/icons-material/Menu';
// Menu V2 seção E — família Outlined consistente no AppMenu (audit navegação: peso visual
// irregular com filled misturado; Emergência≠Privacidade resolvem o ícone duplicado).
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined';
import QueryStatsOutlinedIcon from '@mui/icons-material/QueryStatsOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import SummarizeOutlinedIcon from '@mui/icons-material/SummarizeOutlined';
import MonitorHeartOutlinedIcon from '@mui/icons-material/MonitorHeartOutlined';
import MedicationOutlinedIcon from '@mui/icons-material/MedicationOutlined';
import VaccinesOutlinedIcon from '@mui/icons-material/VaccinesOutlined';
import PsychologyOutlinedIcon from '@mui/icons-material/PsychologyOutlined';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import EmergencyOutlinedIcon from '@mui/icons-material/EmergencyOutlined';
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';
import CardGiftcardOutlinedIcon from '@mui/icons-material/CardGiftcardOutlined';
import EmojiEventsOutlinedIcon from '@mui/icons-material/EmojiEventsOutlined';
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import Diversity3OutlinedIcon from '@mui/icons-material/Diversity3Outlined';
import MedicalServicesOutlinedIcon from '@mui/icons-material/MedicalServicesOutlined';
import QuestionAnswerOutlinedIcon from '@mui/icons-material/QuestionAnswerOutlined';
import ManageAccountsOutlinedIcon from '@mui/icons-material/ManageAccountsOutlined';
import AccountCircleOutlinedIcon from '@mui/icons-material/AccountCircleOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import HealthAndSafetyOutlinedIcon from '@mui/icons-material/HealthAndSafetyOutlined';
import WorkspacePremiumOutlinedIcon from '@mui/icons-material/WorkspacePremiumOutlined';
import AdminPanelSettingsOutlinedIcon from '@mui/icons-material/AdminPanelSettingsOutlined';
import HelpOutlineOutlinedIcon from '@mui/icons-material/HelpOutlineOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import VideocamIcon from '@mui/icons-material/Videocam';
import { DrExame } from './components/DrExame';
import { MascotPulse } from './components/MascotPulse';
import { dataProvider } from './dataProvider';
import { API_URL, token, photoUrlFor } from './config';
import { authProvider } from './authProvider';
import { useUpcomingTeleconsulta } from './hooks/useUpcomingTeleconsulta';
import { openTelemedicinaRoom } from './utils/telemedicina';
import { lightTheme, darkTheme, lightThemeLarge, darkThemeLarge } from './theme';
import { alpha } from '@mui/material/styles';
import { i18nProvider } from './i18n';
import { APP_BUILD_INFO } from './generated/buildInfo';
import { DashboardV2 as Dashboard } from './components/dashboard/DashboardV2';
import { ExamList } from './resources/Exams/ExamList';
import { ExamShow } from './resources/Exams/ExamShow';
import { ExamCreate } from './resources/Exams/ExamCreate';
import { PatientList, PatientEdit, PatientCreate } from './resources/Patients/Patients';
import { TrendsPage } from './pages/Trends';
import { hapticLight } from './utils/haptic';
// Code splitting — páginas pesadas carregam sob demanda (bundle inicial menor)
const ChatPage = lazy(() => import('./pages/Chat').then(m => ({ default: m.ChatPage })));
const DoctorPortalPage = lazy(() => import('./pages/DoctorPortal').then(m => ({ default: m.DoctorPortalPage })));
const LandingPage = lazy(() => import('./pages/Landing').then(m => ({ default: m.LandingPage })));
const SportsLandingPage = lazy(() => import('./pages/SportsLanding').then(m => ({ default: m.SportsLandingPage })));
const PlansPage = lazy(() => import('./pages/Plans').then(m => ({ default: m.PlansPage })));
const WalletPage = lazy(() => import('./pages/Wallet').then(m => ({ default: m.WalletPage })));
const InvitePage = lazy(() => import('./pages/Invite').then(m => ({ default: m.InvitePage })));
const RemindersPage = lazy(() => import('./pages/Reminders').then(m => ({ default: m.RemindersPage })));
const QuestionsPage = lazy(() => import('./pages/Questions').then(m => ({ default: m.QuestionsPage })));
const FaqPage = lazy(() => import('./pages/Faq').then(m => ({ default: m.FaqPage })));
const HowWeValidatePage = lazy(() => import('./pages/HowWeValidate').then(m => ({ default: m.HowWeValidatePage })));
import { MeasurementsPage } from './pages/Measurements';
const MedicationsPage = lazy(() => import('./pages/Medications').then(m => ({ default: m.MedicationsPage })));
const MeasurementHistoryPage = lazy(() => import('./pages/MeasurementHistory').then(m => ({ default: m.MeasurementHistoryPage })));
const SaudeMentalPage = lazy(() => import('./pages/SaudeMental').then(m => ({ default: m.SaudeMentalPage })));
const SinaisPage = lazy(() => import('./pages/Sinais').then(m => ({ default: m.SinaisPage })));
// Teleconsulta LiveKit (F2) — página imersiva (fora do AppLayout, sem bottom-nav).
const TeleconsultaPage = lazy(() => import('./pages/Teleconsulta').then(m => ({ default: m.TeleconsultaPage })));
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
import { BootSplash } from './components/BootSplash';
import { MobileBottomNav } from './components/MobileBottomNav';
import { ExamCreateFab } from './components/ExamCreateFab';
import { BiometricGate } from './components/BiometricGate';
import { DrawerProvider, useAppDrawer } from './components/drawerState';
import { NudgeQueueProvider } from './hooks/useNudgeQueue';
import { ForceUpdate } from './components/ForceUpdate';
import { checkAppUpdate, checkPlayUpdate } from './utils/version';
import { decideBackAction } from './utils/backNavigation';
import { NotificationBell } from './components/NotificationBell';
import { NotificationPopup } from './components/NotificationPopup';
import { OfflineBanner } from './components/OfflineBanner';
import { initDeepLinks } from './utils/deepLinks';
import { Onboarding } from './components/Onboarding';
import { WhatsNew } from './components/WhatsNew';
import { PageSkeleton } from './components/PageSkeleton';
import { CompleteProfileModal } from './components/CompleteProfileModal';
import { GoalQuiz } from './components/GoalQuiz';
import { Motd } from './components/Motd';
import { CreditRewardFx } from './components/CreditRewardFx';
import { CelebrateFx } from './components/CelebrateFx';
import { useCredits } from './hooks/useCredits';
import { InsufficientCreditsDialog } from './components/InsufficientCreditsDialog';
import { NotificationsPage } from './pages/Notifications';
import { MedicosPage } from './pages/Medicos';
import { SupportPage } from './pages/Support';
import { ApiPanelPage } from './pages/ApiPanel';
const ApiDocsPage = lazy(() => import('./pages/ApiDocs').then(m => ({ default: m.ApiDocsPage })));
import { ConquistasPage } from './pages/Conquistas';
import { initPush } from './push';
import { syncCreditCosts } from './components/CreditBadge';

// AppBar premium: esquerda = ☰/Voltar + MARCA OFICIAL (robô Dr.Exame integrado, preenche o gap que
// ficava vazio); direita = 🔔 + avatar (menu ÚNICO: dependentes, tema, idioma, sair). Sem ⋮ separado
// e sem refresh duplicado (atualizar = arrastar a tela / pull-to-refresh).
const CustomAppBar = (props: AppBarProps) => {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('sm'));
  const isDark = theme.palette.mode === 'dark';
  const showWordmark = useMediaQuery(theme.breakpoints.up(360));
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const canBack = !isDesktop && pathname !== '/';
  const { openDrawer } = useAppDrawer();
  const tele = useUpcomingTeleconsulta();

  const [patientName, setPatientName] = useState('Edmilson');
  useEffect(() => {
    const update = () => {
      try {
        const u = typeof localStorage !== 'undefined' ? localStorage.getItem('user') : null;
        const parsed = u ? JSON.parse(u) : null;
        setPatientName(parsed?.name || parsed?.fullName || 'Paciente');
      } catch {}
    };
    update();
    window.addEventListener('storage', update);
    window.addEventListener('userChanged', update);
    return () => {
      window.removeEventListener('storage', update);
      window.removeEventListener('userChanged', update);
    };
  }, []);

  return (
    <AppBar
      {...props}
      userMenu={false}
      toolbar={isDesktop ? <LoadingIndicator /> : <span />}
      sx={{
        bgcolor: isDark ? 'rgba(15, 24, 24, 0.85)' : 'rgba(255, 255, 255, 0.88)',
        backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        borderBottom: '1px solid',
        borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(32, 178, 170, 0.16)',
        boxShadow: isDark ? '0 4px 20px rgba(0,0,0,0.45)' : '0 2px 14px rgba(11,58,55,0.06)',
        color: 'text.primary',
        px: { xs: 1, sm: 2.5 },
      }}
    >
      {!isDesktop && (
        canBack ? (
          <IconButton color="inherit" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))} title="Voltar" sx={{ p: 1.25, mr: 0.25 }}>
            <ArrowBackIcon fontSize="small" />
          </IconButton>
        ) : (
          <IconButton color="inherit" onClick={openDrawer} title="Menu" sx={{ p: 1.25, mr: 0.25 }}>
            <MenuIcon fontSize="small" />
          </IconButton>
        )
      )}
      {!isDesktop && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexShrink: 0 }}>
          <Box sx={{
            width: 32, height: 32, borderRadius: '8px', flexShrink: 0, display: 'grid', placeItems: 'center',
            background: 'linear-gradient(135deg,#20b2aa 0%,#178f89 100%)',
            boxShadow: '0 3px 10px rgba(32,178,170,.35)', overflow: 'hidden'
          }}>
            <DrExame size={24} sx={{ borderRadius: '22%' }} />
          </Box>
          {showWordmark && (
            <Typography sx={{ fontWeight: 800, fontFamily: '"Poppins", sans-serif', fontSize: { xs: 14, sm: 16 }, letterSpacing: '-0.01em', whiteSpace: 'nowrap', color: 'text.primary' }}>
              Dr. Exame
            </Typography>
          )}
        </Box>
      )}
      {isDesktop && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0, py: 0.5 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <TitlePortal />
            </Box>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 11.5, fontWeight: 500, lineHeight: 1.2 }}>
              {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })} · dados de {patientName} (titular)
            </Typography>
          </Box>
        </Box>
      )}
      <Box sx={{ flex: 1, minWidth: 8 }} />
      <Stack direction="row" alignItems="center" spacing={{ xs: 0.5, sm: 1.25 }} sx={{ ml: 0.5, flexShrink: 0 }}>
        {/* Pílula de Teleconsulta Viva / Hoje */}
        {tele.isLive && tele.item && (
          <Button
            size="small"
            variant="contained"
            onClick={() => {
              if (tele.item?.linkUrl) void openTelemedicinaRoom(tele.item.linkUrl);
              else navigate(`/teleconsulta/${tele.item?.id}`);
            }}
            startIcon={<Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#fff', boxShadow: '0 0 0 3px rgba(255,255,255,0.4)', animation: 'dxPulseLive 1.6s infinite' }} />}
            sx={{
              borderRadius: '999px',
              bgcolor: '#b91c1c',
              color: '#fff',
              fontSize: { xs: 11, sm: 12.5 },
              fontWeight: 800,
              textTransform: 'none',
              px: { xs: 1.2, sm: 1.8 },
              height: 34,
              boxShadow: '0 4px 14px rgba(185,28,28,.4)',
              '&:hover': { bgcolor: '#991b1b' },
              '@keyframes dxPulseLive': {
                '0%': { transform: 'scale(0.8)', opacity: 1 },
                '100%': { transform: 'scale(2.2)', opacity: 0 },
              },
            }}
          >
            Entrar na consulta
          </Button>
        )}
        {tele.isToday && !tele.isLive && tele.item && (
          <Chip
            size="small"
            icon={<VideocamIcon sx={{ fontSize: 16, color: '#20b2aa !important' }} />}
            label={`Consulta ${tele.startsInText || 'hoje'}`}
            onClick={() => navigate('/lembretes')}
            clickable
            sx={{
              height: 32,
              borderRadius: '999px',
              bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(32,178,170,.18)' : 'rgba(11,58,55,.08)',
              color: (t) => t.palette.mode === 'dark' ? '#5fc9c3' : '#0b3a37',
              border: '1px solid',
              borderColor: 'rgba(32,178,170,.3)',
              fontWeight: 700,
              fontSize: 12,
              '&:hover': { bgcolor: 'rgba(32,178,170,.22)' },
            }}
          />
        )}
        <CreditsChip />
        <NotificationBell />
        <PatientSwitcher />
      </Stack>
      {/* 402 de qualquer feature de IA → dialog animado com o pack mais barato (portal). */}
      <InsufficientCreditsDialog />
    </AppBar>
  );
};

// Rota ativa? ('/' é exato; o resto é startsWith p/ cobrir sub-rotas)
const routeMatches = (route: string, pathname: string) => (route === '/' ? pathname === '/' : pathname.startsWith(route));

// Seção COLAPSÁVEL do menu (acordeão) estilo Consultório Premium (Direção A):
// Header discreto e elegante com chip de ícone e chevron suave, contrastando sobre o rail profundo.
const MenuSectionAccordion = ({
  title,
  icon,
  children,
  routes,
  badge,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  routes: string[];
  badge?: string;
}) => {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const hasActiveChild = routes.some((r) => routeMatches(r, pathname));

  useEffect(() => {
    if (hasActiveChild) setOpen(true);
  }, [pathname, hasActiveChild]);

  return (
    <Box sx={{ mb: 0.5 }}>
      <ListItemButton
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        sx={{
          borderRadius: '12px',
          m: '2px 6px',
          pl: 1.25,
          pr: 1,
          minHeight: 38,
          bgcolor: open ? 'rgba(255, 255, 255, 0.07)' : 'rgba(255, 255, 255, 0.02)',
          border: '1px solid',
          borderColor: open ? 'rgba(32, 178, 170, 0.28)' : 'rgba(255, 255, 255, 0.04)',
          transition: 'all .2s ease',
          '&:hover': {
            bgcolor: 'rgba(255, 255, 255, 0.1)',
            borderColor: 'rgba(32, 178, 170, 0.4)',
          },
        }}
      >
        <Box
          component="span"
          sx={{
            width: 26,
            height: 26,
            borderRadius: '8px',
            mr: 1.25,
            flexShrink: 0,
            display: 'grid',
            placeItems: 'center',
            background: open ? 'linear-gradient(135deg, #20b2aa, #178f89)' : 'rgba(255, 255, 255, 0.08)',
            color: open ? '#fff' : '#93d3cd',
            transition: 'all .2s ease',
            '& svg': { fontSize: 16 },
          }}
        >
          {icon}
        </Box>
        <ListItemText
          primary={title}
          primaryTypographyProps={{
            fontSize: 12.5,
            fontWeight: 700,
            color: open ? '#ffffff' : '#a3cdc8',
            letterSpacing: '0.01em',
          }}
        />
        {badge && (
          <Chip
            size="small"
            label={badge}
            sx={{
              mr: 0.5,
              height: 18,
              fontSize: 10.5,
              fontWeight: 800,
              bgcolor: badge === 'ao vivo' ? '#ef4444' : 'rgba(212, 165, 116, 0.28)',
              color: badge === 'ao vivo' ? '#ffffff' : '#f3d3ac',
              borderRadius: '99px',
            }}
          />
        )}
        <ExpandMoreIcon
          sx={{
            transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
            transition: 'transform .25s cubic-bezier(.34,1.56,.64,1)',
            color: open ? '#5fc9c3' : 'rgba(231, 245, 243, 0.45)',
            fontSize: 18,
          }}
        />
      </ListItemButton>
      <Collapse in={open} timeout={280} easing="cubic-bezier(.34,1.56,.64,1)" sx={{ pb: 0.25 }}>
        <Box
          sx={{
            ml: '18px',
            pl: 1,
            borderLeft: '2px solid rgba(32, 178, 170, 0.28)',
          }}
        >
          {children}
        </Box>
      </Collapse>
    </Box>
  );
};

// Item de navegação Direção A (Consultório Premium):
// Ativo = fundo creme quente (#fbf3e8), texto escuro #0b3a37, ícone cobre #9a6b36 com sombra elegante.
const NavItem = ({
  to,
  primaryText,
  icon,
  highlight,
  badge,
  isSos,
}: {
  to: string;
  primaryText: string;
  icon: React.ReactNode;
  highlight?: boolean;
  badge?: string;
  isSos?: boolean;
}) => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const active = to === '/' ? pathname === '/' : pathname.startsWith(to);

  if (isSos) {
    return (
      <ListItemButton
        onClick={() => navigate(to)}
        selected={active}
        sx={{
          borderRadius: '12px',
          m: '4px 6px',
          py: 0.8,
          px: 1.25,
          minHeight: 44,
          bgcolor: 'rgba(239, 68, 68, 0.12)',
          border: '1px solid rgba(248, 113, 113, 0.35)',
          color: '#fecaca',
          transition: 'all .15s ease',
          '&:hover': {
            bgcolor: 'rgba(239, 68, 68, 0.22)',
            color: '#fff',
            transform: 'translateX(3px)',
          },
        }}
      >
        <ListItemIcon sx={{ minWidth: 32, color: '#fca5a5', '& svg': { fontSize: 20 } }}>
          {icon}
        </ListItemIcon>
        <ListItemText
          primary={primaryText}
          primaryTypographyProps={{ fontSize: 13, fontWeight: 700, color: '#fecaca' }}
        />
      </ListItemButton>
    );
  }

  return (
    <ListItemButton
      onClick={() => navigate(to)}
      selected={active}
      sx={{
        borderRadius: '12px',
        m: '2px 6px',
        py: 0.6,
        pl: 1.25,
        pr: 1,
        minHeight: 40,
        flex: '0 0 auto',
        borderLeft: 'none',
        transition: 'all .15s ease, transform .15s ease',
        color: active ? '#0b3a37' : 'rgba(231, 245, 243, 0.72)',
        ...(active
          ? {
              bgcolor: '#fbf3e8 !important',
              color: '#0b3a37 !important',
              boxShadow: '0 4px 14px rgba(0,0,0,0.22)',
            }
          : {
              bgcolor: 'transparent',
              '&:hover': {
                bgcolor: 'rgba(255, 255, 255, 0.08)',
                color: '#ffffff',
                transform: 'translateX(3px)',
              },
            }),
      }}
    >
      <ListItemIcon
        sx={{
          minWidth: 30,
          color: active ? '#9a6b36' : highlight ? '#5fc9c3' : 'rgba(231, 245, 243, 0.55)',
          '& svg': { fontSize: 19, transition: 'transform .2s ease' },
          ...(active ? { '& svg': { fontSize: 19, transform: 'scale(1.12)' } } : {}),
        }}
      >
        {icon}
      </ListItemIcon>
      <ListItemText
        primary={primaryText}
        primaryTypographyProps={{
          fontSize: 13,
          fontWeight: active ? 800 : 500,
          color: active ? '#0b3a37' : highlight ? '#ffffff' : 'rgba(231, 245, 243, 0.78)',
          noWrap: true,
        }}
      />
      {badge && (
        <Chip
          size="small"
          label={badge}
          sx={{
            height: 19,
            fontSize: 10.5,
            fontWeight: 800,
            bgcolor: badge === 'ao vivo' ? '#ef4444' : 'rgba(212, 165, 116, 0.28)',
            color: badge === 'ao vivo' ? '#ffffff' : '#f3d3ac',
            borderRadius: '99px',
          }}
        />
      )}
    </ListItemButton>
  );
};

// Card de perfil do usuário — perfeitamente harmonizado com a sidebar de Consultório
const UserProfileCard = ({ onClose }: { onClose?: () => void }) => {
  const navigate = useNavigate();
  const { credits } = useCredits();
  const [userInfo, setUserInfo] = useState<{ name: string; photo?: string; isPremium: boolean }>({
    name: 'Usuário',
    isPremium: false,
  });

  const updateUserInfo = () => {
    try {
      const s = typeof localStorage !== 'undefined' ? localStorage.getItem('user') : null;
      const u = s ? JSON.parse(s) : null;
      const pid = typeof localStorage !== 'undefined' ? (localStorage.getItem('selPatientId') || localStorage.getItem('patientId')) : null;
      const photo = pid ? photoUrlFor(pid) : undefined;
      const name = u?.name || u?.fullName || u?.email?.split('@')[0] || 'Usuário';
      const isPrem = !!(u?.planExpiresAt && new Date(u.planExpiresAt) > new Date());
      setUserInfo({ name, photo, isPremium: isPrem });
    } catch {
      setUserInfo({ name: 'Usuário', isPremium: false });
    }
  };

  useEffect(() => {
    updateUserInfo();
    window.addEventListener('storage', updateUserInfo);
    window.addEventListener('userChanged', updateUserInfo);
    return () => {
      window.removeEventListener('storage', updateUserInfo);
      window.removeEventListener('userChanged', updateUserInfo);
    };
  }, []);

  return (
    <Box sx={{ px: 1.25, pb: 1, pt: onClose ? 0.75 : 1 }}>
      <Box
        sx={{
          p: 1.25,
          borderRadius: '16px',
          bgcolor: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: '0 4px 14px rgba(0,0,0,0.2)',
          transition: 'background .15s ease',
          '&:hover': {
            bgcolor: 'rgba(255, 255, 255, 0.08)',
          },
        }}
      >
        <Stack direction="row" alignItems="center" spacing={1.25}>
          <Box
            component="button"
            onClick={() => {
              onClose?.();
              navigate('/perfil');
            }}
            aria-label="Abrir meu perfil"
            title="Ver e editar meu perfil"
            sx={{
              p: 0,
              border: 'none',
              bgcolor: 'transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 1.25,
              flex: 1,
              minWidth: 0,
              textAlign: 'left',
              color: 'inherit',
              borderRadius: '12px',
              '&:hover': {
                '& .dx-user-name': { color: '#5fc9c3' },
                '& .dx-profile-chevron': { color: '#5fc9c3', transform: 'translateX(2px)' },
              },
            }}
          >
            <Box sx={{ position: 'relative', flexShrink: 0 }}>
              <Avatar
                src={userInfo.photo}
                sx={{
                  width: 42,
                  height: 42,
                  fontSize: 16,
                  bgcolor: 'rgba(32,178,170,0.25)',
                  color: '#fff',
                  fontWeight: 800,
                  border: '2px solid rgba(95,201,195,0.4)',
                }}
              >
                {userInfo.name.charAt(0)?.toUpperCase() || '👤'}
              </Avatar>
            </Box>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Stack direction="row" alignItems="center" spacing={0.5} sx={{ minWidth: 0 }}>
                <Typography
                  className="dx-user-name"
                  sx={{
                    fontWeight: 800,
                    fontSize: 14.5,
                    color: '#e7f5f3',
                    lineHeight: 1.2,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1,
                    transition: 'color .15s ease',
                  }}
                >
                  {userInfo.name}
                </Typography>
                <ChevronRightIcon
                  className="dx-profile-chevron"
                  sx={{ fontSize: 18, color: 'rgba(231,245,243,0.4)', flexShrink: 0, transition: 'all .15s ease' }}
                />
              </Stack>
              <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mt: 0.5, flexWrap: 'wrap', gap: 0.5 }}>
                <Chip
                  size="small"
                  label={userInfo.isPremium ? '👑 Premium' : 'Plano grátis'}
                  sx={{
                    height: 20,
                    fontSize: 11,
                    fontWeight: 800,
                    bgcolor: userInfo.isPremium ? 'rgba(212,165,116,0.22)' : 'rgba(255,255,255,0.08)',
                    color: userInfo.isPremium ? '#f3d3ac' : 'rgba(231,245,243,0.7)',
                  }}
                />
                {credits != null && (
                  <Chip
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      onClose?.();
                      navigate('/planos');
                    }}
                    label={`⚡ ${credits}`}
                    sx={{
                      height: 20,
                      fontSize: 11,
                      fontWeight: 700,
                      bgcolor: 'rgba(32,178,170,0.2)',
                      color: '#5fc9c3',
                      cursor: 'pointer',
                      '&:hover': { bgcolor: 'rgba(32,178,170,0.35)' },
                    }}
                  />
                )}
              </Stack>
            </Box>
          </Box>
          {onClose && (
            <IconButton
              onClick={onClose}
              size="small"
              title="Fechar menu"
              sx={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                flexShrink: 0,
                bgcolor: 'rgba(255,255,255,0.06)',
                color: 'rgba(231,245,243,0.7)',
                '&:hover': { bgcolor: 'rgba(32,178,170,0.2)', color: '#fff' },
              }}
            >
              <CloseIcon sx={{ fontSize: 18 }} />
            </IconButton>
          )}
        </Stack>
      </Box>
    </Box>
  );
};

// Menu lateral — com agrupamento clínico de alta clareza e autoridade
const AppMenu = () => {
  const logout = useLogout();
  const navigate = useNavigate();
  const translate = useTranslate();
  const { pathname } = useLocation();
  const [aboutOpen, setAboutOpen] = useState(false);
  const tele = useUpcomingTeleconsulta();
  const userStr = typeof localStorage !== 'undefined' ? localStorage.getItem('user') : null;
  const isAdmin = (() => { try { return userStr ? (JSON.parse(userStr)?.role === 'ADMIN') : false; } catch { return false; } })();
  const isDesktop = useMediaQuery((t: any) => t.breakpoints.up('sm'));

  return (
  <Box
    component="nav"
    sx={{
      py: 1,
      display: 'flex',
      flexDirection: 'column',
      minHeight: '100%',
      width: '100%',
      minWidth: 0,
      maxWidth: '100%',
      containerType: 'inline-size',
      overflowX: 'hidden',
      overflowY: 'auto',
      maxHeight: '100dvh',
      color: '#e7f5f3',
      '& .MuiListItemButton-root, & .MuiMenuItem-root': { flex: '0 0 auto' },
    }}
  >
    {isDesktop && (
      <Box sx={{ px: 2, pt: 1.25, pb: 1, display: 'flex', alignItems: 'center', gap: 1.25 }}>
        <Box sx={{
          width: 36, height: 36, borderRadius: '10px', flexShrink: 0, display: 'grid', placeItems: 'center',
          background: 'linear-gradient(135deg,#2cc4bb 0%,#178f89 100%)',
          boxShadow: '0 4px 14px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.3)', overflow: 'hidden'
        }}>
          <DrExame size={26} sx={{ borderRadius: '22%' }} />
        </Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography sx={{ fontWeight: 800, fontFamily: '"Poppins", sans-serif', fontSize: 16, letterSpacing: '-0.02em', color: '#fff', lineHeight: 1.1 }}>
            Dr. Exame
          </Typography>
          <Typography sx={{ fontSize: 11, color: 'rgba(231,245,243,0.6)', fontWeight: 500, mt: 0.2 }}>
            Saúde Inteligente
          </Typography>
        </Box>
      </Box>
    )}

    {isDesktop && <UserProfileCard />}
    {isDesktop && <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)', mx: 2, mb: 1 }} />}

    {/* Início fora dos acordeões: acesso direto */}
    <NavItem to="/" primaryText={translate('menu.home', { _: 'Início' })} icon={<HomeOutlinedIcon />} />

    {/* Grupo 1: Meus Exames */}
    <MenuSectionAccordion
      title={translate('menu.section.exams', { _: 'Meus exames' })}
      icon={<FactCheckOutlinedIcon />}
      routes={['/exams', '/alterados', '/evolucao', '/tendencias', '/linha-do-tempo', '/relatorio']}
    >
      <NavItem to="/exams" primaryText={translate('menu.exams', { _: 'Todos os exames' })} icon={<FactCheckOutlinedIcon />} />
      <NavItem to="/alterados" primaryText={translate('menu.alterados', { _: 'Valores alterados' })} icon={<WarningAmberOutlinedIcon />} highlight />
      <NavItem to="/evolucao" primaryText={translate('menu.evolution', { _: 'Evolução' })} icon={<InsightsOutlinedIcon />} />
      <NavItem to="/tendencias" primaryText={translate('menu.trends', { _: 'Tendências' })} icon={<QueryStatsOutlinedIcon />} />
      <NavItem to="/linha-do-tempo" primaryText={translate('menu.timeline', { _: 'Linha do tempo' })} icon={<HistoryOutlinedIcon />} />
      <NavItem to="/relatorio" primaryText={translate('menu.report', { _: 'Relatório completo' })} icon={<SummarizeOutlinedIcon />} />
    </MenuSectionAccordion>

    {/* Grupo 2: Consultas & Médicos (Teleconsulta integrada!) */}
    <MenuSectionAccordion
      title="Consultas e médicos"
      icon={<MedicalServicesOutlinedIcon />}
      routes={['/lembretes', '/medicos', '/perguntas']}
      badge={tele.isLive ? 'ao vivo' : tele.isToday ? 'hoje' : tele.item ? 'agendada' : undefined}
    >
      <NavItem
        to="/lembretes"
        primaryText="Agenda & teleconsultas"
        icon={<EventAvailableOutlinedIcon />}
        highlight={tele.isToday || tele.isLive}
        badge={tele.isLive ? 'ao vivo' : tele.isToday ? 'hoje' : undefined}
      />
      <NavItem to="/medicos" primaryText={translate('menu.doctors', { _: 'Meus médicos' })} icon={<MedicalServicesOutlinedIcon />} />
      <NavItem to="/perguntas" primaryText={translate('menu.questions', { _: 'Perguntas para o médico' })} icon={<QuestionAnswerOutlinedIcon />} />
    </MenuSectionAccordion>

    {/* Grupo 3: Rotina de Saúde */}
    <MenuSectionAccordion
      title="Rotina de saúde"
      icon={<MonitorHeartOutlinedIcon />}
      routes={['/sinais', '/medicoes', '/medicamentos', '/saude-mental', '/vacinas', '/despesas', '/conquistas']}
    >
      <NavItem to="/sinais" primaryText="Sinais Vitais" icon={<MonitorHeartOutlinedIcon />} highlight />
      <NavItem to="/medicoes" primaryText={translate('menu.measurements', { _: 'Medições corporais' })} icon={<MonitorHeartOutlinedIcon />} />
      <NavItem to="/medicamentos" primaryText={translate('menu.medications', { _: 'Medicamentos' })} icon={<MedicationOutlinedIcon />} />
      <NavItem to="/saude-mental" primaryText="Saúde Mental & Humor" icon={<PsychologyOutlinedIcon />} />
      <NavItem to="/vacinas" primaryText={translate('menu.vaccines', { _: 'Vacinas' })} icon={<VaccinesOutlinedIcon />} />
      <NavItem to="/despesas" primaryText={translate('menu.expenses', { _: 'Despesas médicas' })} icon={<AccountBalanceWalletOutlinedIcon />} />
      <NavItem to="/conquistas" primaryText={translate('menu.achievements', { _: 'Conquistas' })} icon={<EmojiEventsOutlinedIcon />} />
    </MenuSectionAccordion>

    {/* Grupo 4: Família e Dependentes */}
    <NavItem to="/familia" primaryText="Família e dependentes" icon={<Diversity3OutlinedIcon />} />

    {/* Cartão de Emergência SOS */}
    <Box sx={{ my: 0.5 }}>
      <NavItem
        to="/emergencia"
        primaryText="Cartão de emergência"
        icon={<EmergencyOutlinedIcon />}
        isSos
      />
    </Box>

    {/* Grupo 5: Conta & Configurações */}
    <MenuSectionAccordion
      title="Conta e planos"
      icon={<ManageAccountsOutlinedIcon />}
      routes={['/perfil', '/carteira', '/indique', '/seguranca', '/privacidade', '/planos', '/admin']}
    >
      <NavItem to="/perfil" primaryText={translate('menu.profile', { _: 'Meu perfil' })} icon={<AccountCircleOutlinedIcon />} />
      <NavItem to="/carteira" primaryText={translate('menu.wallet', { _: 'Carteira & créditos' })} icon={<BoltOutlinedIcon />} highlight />
      <NavItem to="/indique" primaryText={translate('menu.invite', { _: 'Indique e ganhe 🎁' })} icon={<CardGiftcardOutlinedIcon />} highlight />
      <NavItem to="/seguranca" primaryText={translate('menu.security_pwd', { _: 'Segurança e senha' })} icon={<LockOutlinedIcon />} />
      <NavItem to="/privacidade" primaryText={translate('menu.privacy', { _: 'Privacidade (LGPD)' })} icon={<HealthAndSafetyOutlinedIcon />} />
      <NavItem to="/planos" primaryText={translate('menu.plans', { _: 'Planos' })} icon={<WorkspacePremiumOutlinedIcon />} />
      {isAdmin && <NavItem to="/admin" primaryText={translate('menu.admin', { _: 'Painel Admin' })} icon={<AdminPanelSettingsOutlinedIcon />} />}
    </MenuSectionAccordion>

    {/* Divisor suave */}
    <Box sx={{ mx: 2, my: 1, height: '1px', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,.12) 30%, rgba(255,255,255,.12) 70%, transparent)' }} />

    <NavItem to="/faq" primaryText={translate('menu.faq', { _: 'Dúvidas frequentes' })} icon={<HelpOutlineOutlinedIcon />} />
    <MenuItem onClick={() => setAboutOpen(true)} sx={{ mx: 1, borderRadius: '10px', py: 0.75, color: 'rgba(231,245,243,0.72)', '&:hover': { bgcolor: 'rgba(255,255,255,.07)', color: '#fff' } }}>
      <ListItemIcon sx={{ minWidth: 32, color: 'rgba(231,245,243,0.55)' }}><InfoOutlinedIcon fontSize="small" /></ListItemIcon>
      <ListItemText primaryTypographyProps={{ fontSize: 13, fontWeight: 600 }}>{translate('menu.about')}</ListItemText>
    </MenuItem>
    <MenuItem onClick={() => logout('/entrar')} sx={{
      mx: 1, my: 0.25, borderRadius: '10px', py: 0.75, color: '#fca5a5',
      transition: 'background-color .15s ease',
      '&:hover': { bgcolor: 'rgba(239,68,68,.15)', color: '#fecaca', '& .MuiListItemIcon-root svg': { animation: 'dxShake .4s ease' } },
      '@keyframes dxShake': {
        '0%, 100%': { transform: 'rotate(0)' },
        '25%': { transform: 'rotate(-8deg)' },
        '75%': { transform: 'rotate(8deg)' },
      },
    }}>
      <ListItemIcon sx={{ color: '#fca5a5', minWidth: 32 }}><LogoutIcon fontSize="small" /></ListItemIcon>
      <ListItemText primaryTypographyProps={{ fontSize: 13, fontWeight: 600 }}>{translate('menu.logout')}</ListItemText>
    </MenuItem>

    <Box sx={{ px: 2, pt: 1.5, pb: 1.5, textAlign: 'center' }}>
      <Box sx={{
        display: 'inline-flex', alignItems: 'center', gap: 0.75,
        px: 1.5, py: 0.5, borderRadius: 99,
        bgcolor: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}>
        <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: '#20b2aa', boxShadow: '0 0 6px #20b2aa' }} />
        <Typography variant="caption" sx={{ fontSize: 11, fontWeight: 700, color: 'rgba(231,245,243,0.7)', letterSpacing: '0.01em' }}>
          Dr. Exame · Saúde
        </Typography>
        <Typography variant="caption" sx={{ fontSize: 10, fontWeight: 600, color: 'rgba(231,245,243,0.4)' }}>
          v{APP_BUILD_INFO.version}
        </Typography>
      </Box>
    </Box>

    <Dialog open={aboutOpen} onClose={() => setAboutOpen(false)} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ textAlign: 'center', pb: 0 }}>
        {/* Mascote com aura pulsante (mesmo efeito do login — presença viva da marca) */}
        <Box sx={{ mb: 1.5, display: 'flex', justifyContent: 'center' }}>
          <MascotPulse size={84} ringColor="rgba(32,178,170,.45)">
            <Box sx={{
              width: 84, height: 84, borderRadius: '50%',
              background: 'radial-gradient(circle at 50% 38%, rgba(32,178,170,.22), rgba(32,178,170,.06) 72%)',
              border: '1px solid rgba(32,178,170,.35)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <DrExame size={58} sx={{ borderRadius: '50%' }} />
            </Box>
          </MascotPulse>
        </Box>
        Meus Exames
      </DialogTitle>
      <DialogContent sx={{ textAlign: 'center' }}>
        <Typography sx={{ fontWeight: 800, fontSize: 20, color: (t) => tealText(t.palette.mode), mb: 2 }}>v{APP_BUILD_INFO.version}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{translate('about.tagline')}</Typography>
        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', flexWrap: 'wrap', mb: 2 }}>
          <Chip size="small" label="IA GLM-4.6" sx={{ bgcolor: 'rgba(32,178,170,0.15)', color: (t) => tealText(t.palette.mode), fontWeight: 700 }} />
          <Chip size="small" label="Scanner ML Kit" sx={{ bgcolor: 'rgba(32,178,170,0.15)', color: (t) => tealText(t.palette.mode), fontWeight: 700 }} />
          <Chip size="small" label="LGPD" sx={{ bgcolor: 'rgba(32,178,170,0.15)', color: (t) => tealText(t.palette.mode), fontWeight: 700 }} />
        </Box>
        <Stack spacing={0.5} sx={{ mb: 1 }}>
          <MuiLink href="mailto:contato@janocaminho.com.br" sx={{ fontSize: 13, fontWeight: 700 }}>📧 contato@janocaminho.com.br</MuiLink>
          <MuiLink href="https://drexame.janocaminho.com.br" target="_blank" rel="noopener noreferrer" sx={{ fontSize: 13, fontWeight: 700 }}>🌐 drexame.janocaminho.com.br</MuiLink>
        </Stack>
        <Typography variant="caption" sx={{ color: 'text.secondary', mt: 1, display: 'block' }}>
          {translate('about.disclaimer')}
        </Typography>
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'center', pb: 2 }}>
        <Button onClick={() => setAboutOpen(false)} variant="contained" sx={{ borderRadius: '999px', px: 4, textTransform: 'none', fontWeight: 700, bgcolor: '#178f89' }}>{translate('ra.action.close')}</Button>
      </DialogActions>
    </Dialog>
  </Box>
  );
};

// Menu lateral UNIFICADO (mobile). O ☰ do AppBar e o "Mais" do rodapé abem o
// MESMO AppDrawer aqui — mesma fonte de verdade (AppMenu), zero divergência de layout.
const AppDrawer = () => {
  const { open, closeDrawer } = useAppDrawer();
  const { pathname } = useLocation();

  useEffect(() => { closeDrawer(); }, [pathname]);
  useEffect(() => {
    (window as any).__drawerOpen = open;
    const onClose = () => closeDrawer();
    window.addEventListener('app:closeDrawer', onClose);
    return () => { (window as any).__drawerOpen = false; window.removeEventListener('app:closeDrawer', onClose); };
  }, [open, closeDrawer]);

  return (
    <Drawer anchor="left" open={open} onClose={closeDrawer} keepMounted={false}
      PaperProps={{
        sx: {
          width: { xs: '84vw', sm: 340 }, maxWidth: 360, display: 'flex', flexDirection: 'column',
          background: 'linear-gradient(180deg, #0b3a37 0%, #072a28 100%)',
          color: '#e7f5f3',
          backdropFilter: 'blur(24px) saturate(180%)',
          WebkitBackdropFilter: 'blur(24px) saturate(180%)',
          borderRadius: '0 24px 24px 0',
          borderRight: '1px solid rgba(255,255,255,0.1)',
          boxShadow: '0 20px 50px rgba(0,0,0,0.4)',
        }
      }}>
      <UserProfileCard onClose={closeDrawer} />
      <Divider sx={{ borderColor: (t) => alpha(t.palette.primary.main, 0.12), mx: 2 }} />
      <Box sx={{
        flex: 1, overflowY: 'auto', px: 1, py: 1,
        '& > *': {
          animation: 'dxDrawerItemFade 0.35s cubic-bezier(0.16, 1, 0.3, 1) backwards',
        },
        '& > *:nth-of-type(1)': { animationDelay: '0.04s' },
        '& > *:nth-of-type(2)': { animationDelay: '0.08s' },
        '& > *:nth-of-type(3)': { animationDelay: '0.12s' },
        '& > *:nth-of-type(4)': { animationDelay: '0.16s' },
        '& > *:nth-of-type(5)': { animationDelay: '0.20s' },
        '& > *:nth-of-type(6)': { animationDelay: '0.24s' },
        '@keyframes dxDrawerItemFade': {
          '0%': { opacity: 0, transform: 'translateX(-12px)' },
          '100%': { opacity: 1, transform: 'translateX(0)' },
        },
      }}>
        <AppMenu />
      </Box>
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
  const fired = useRef(false); // haptic dispara 1x por gesto (ao cruzar o limite), não a cada frame
  const refresh = useRefresh();
  useEffect(() => {
    let startY = 0; let active = false;
    const onStart = (e: TouchEvent) => { if ((window.scrollY ?? 0) <= 0) { startY = e.touches[0].clientY; active = true; fired.current = false; } };
    const onMove = (e: TouchEvent) => {
      if (!active) return;
      const d = Math.min(e.touches[0].clientY - startY, 100);
      dist.current = d; setShown(d);
      // Tátil estilo PTR nativo (padrão observado em apps maduros): um "tique" ao
      // cruzar o gatilho — o usuário sente que soltar ali atualiza.
      if (d > 70 && !fired.current) { fired.current = true; hapticLight(); }
    };
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
      {/* Indicador gira COM o puxar (feedback de progresso, como o nativo);
          após soltar, o CircularProgress anima a rotação indefinida sozinho. */}
      <CircularProgress
        variant={shown > 70 ? 'indeterminate' : 'determinate'}
        value={Math.min((shown / 70) * 100, 100)}
        size={26}
        sx={{ mt: 1, opacity: Math.min(shown / 70, 1), color: 'primary.main' }}
      />
    </Box>
  );
};

/** Notificação persistente "relatório pronto" — sobrevive a trocar de tela (listener global).
 *  As páginas de geração despacham 'me:reportReady' quando a IA termina. Se o usuário saiu da
 *  tela, ele ainda fica sabendo (o resultado já tá salvo no servidor; é só voltar pra ver). */
const ReportReadyToast = () => {
  const notify = useNotify();
  useEffect(() => {
    const h = (e: any) => notify(e?.detail?.message || '✅ Seu relatório está pronto.', { type: 'success' });
    window.addEventListener('me:reportReady', h);
    return () => window.removeEventListener('me:reportReady', h);
  }, [notify]);
  return null;
};

/**
 * Wallpaper do app (camada "vidro premium"): gradiente fixo ATRÁS de todo o shell.
 * O vidro das barras (AppBar/BottomNav frostados) só lê como vidro quando há COR
 * passando por trás — com o bg chapado o blur não tinha nada pra desfocar.
 * Div FIXED (não background-attachment:fixed, que o iOS Safari renderiza mal):
 * uma camada só, não repinta no scroll, zero custo de interação.
 * Alfas 0.06-0.13: muda o tom, não o contraste AA dos dados clínicos.
 */
const ScreenBackdrop = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  return (
    <Box aria-hidden sx={{
      position: 'fixed', inset: 0, zIndex: -1, pointerEvents: 'none',
      background: isDark
        ? `radial-gradient(ellipse 70% 45% at 18% -6%, rgba(32,178,170,0.13), transparent 60%),
           radial-gradient(ellipse 60% 40% at 88% 108%, rgba(99,102,241,0.08), transparent 55%),
           #0f1818`
        : `radial-gradient(ellipse 70% 45% at 18% -6%, rgba(32,178,170,0.12), transparent 60%),
           radial-gradient(ellipse 55% 38% at 90% 106%, rgba(212,165,116,0.10), transparent 55%),
           #eef7f6`,
    }} />
  );
};

const AppLayout = (props: any) => {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('sm'));
  // WEB/DESKTOP: a Sidebar nativa do react-admin vinha FECHADA por default → o AppMenu ficava c/ width 0
  // e o menu lateral sumia (5ª vez). Força aberta no desktop; no mobile o menu é o AppDrawer (☰), não esta Sidebar.
  const [sidebarOpen, setSidebarOpen] = useSidebarState();
  useEffect(() => { if (isDesktop && !sidebarOpen) setSidebarOpen(true); }, [isDesktop]); // eslint-disable-line react-hooks/exhaustive-deps
  // GUARD (bug do dono: deslogado entrava na área do usuário e via telas vazias): sem token,
  // nenhuma tela autenticada renderiza — vai pro login (que volta pro destino via dxAfterLogin).
  // Rotas públicas vivem no CustomRoutes noLayout (fora deste shell).
  if (!token()) return <Navigate to="/entrar" replace />;
  return (
    <ConfirmDialogProvider>
    {/* FILA DE NUDGES (05/10): serializa modais de cold-load (MOTD/WhatsNew/…) —
        um por vez, prioridade, gap 400ms. Morde só a ORDEM de abrir, não o conteúdo. */}
    <NudgeQueueProvider>
    <DrawerProvider>
      <BiometricGate>
      <ScreenBackdrop />
      {/* gap reduzido + espaço pra não cobrir conteúdo com o menu rodapé (mobile) */}
      <Layout {...props} menu={AppMenu} appBar={CustomAppBar}
        sx={{
          // Esconde o ☰ nativo do react-admin (menuButton). Mobile usa o AppDrawer (☰ do CustomAppBar);
          // Desktop NÃO tem toggle — a Sidebar fica sempre aberta (useSidebarState força). Antes o ☰ no desktop
          // colapsava a Sidebar p/ um rail estreito e o AppMenu (c/ texto) era "esmagado" mostrando parte dos itens.
          '& .RaAppBar-menuButton': { display: 'none' },
          // TRAVA o frame na largura do viewport no mobile. O react-admin põe min-width:fit-content no
          // .layout (pensando na sidebar de desktop) — no mobile isso deixa o frame inflar além do
          // viewport (ex.: admin com 5 Tabs de 90px = 450px + AppBar) e CLIPA a direita (overflow hidden
          // corta em vez de caber). min-width:0 mata o fit-content no mobile; sm+ mantém p/ desktop.
          // bg TRANSPARENTE no root/appFrame: deixa o ScreenBackdrop (wallpaper glass) aparecer —
          // o bg chapado do RA cobria o gradiente inteiro.
          '&': { minWidth: { xs: '0 !important', sm: 'fit-content' }, maxWidth: '100vw', backgroundColor: 'transparent' },
          // SHELL CENTRADO em telas largas (premium): app inteiro (topo+menu+content) num bloco de
          // até 1728px centrado → gutters simétricos nas BORDAS (intencional, estilo Linear/GitHub),
          // NÃO espaço morto entre menu e dashboard. Em laptop (≤1728) preenche tudo; em ultrawide
          // (≥1920) centraliza c/ margens premium. Mobile (xs) continua 100% (intocado).
          // APPFRAME preenche (width 100%!) no desktop — antes era flex-item c/ mx:auto → shrink-to-fit ao conteúdo
          // (dashboard largo=1115, listas estreitas=648 → "página encolhe ao clicar"). Agora preenche até o cap 1728
          // e centraliza além. !important bate o maxWidth:100% que o react-admin põe no appFrame.
          // bg transparente: deixa o ScreenBackdrop (wallpaper glass) aparecer por trás do shell.
          '& .RaLayout-appFrame': { backgroundColor: 'transparent', width: { sm: '100% !important' }, maxWidth: { xs: '100%', sm: '1728px !important' }, mx: { sm: 'auto' } },
          // Menu lateral: constraine o conteúdo ao sidebar (min-width:0 + clip) — sem isto o grid
          // de atalhos (e itens largos) escapa da largura do sidebar e transborda sobre a página.
          '& .RaLayout-menu': { minWidth: 0, maxWidth: '100%', overflowX: 'hidden' },
          // SIDEBAR DESKTOP (Consultório Premium): in-flow + width 268px + fundo profundo elegante
          '& .RaSidebar-root': { width: { sm: '268px !important' }, minWidth: { sm: '268px !important' }, flexShrink: 0 },
          '& .RaSidebar-fixed, & .RaSidebar-paper, & .RaSidebar-root .MuiPaper-root': {
            position: { sm: 'static !important' },
            width: { sm: '268px !important' },
            minWidth: { sm: '268px !important' },
            maxWidth: { sm: '268px !important' },
            height: { sm: 'auto !important' },
            minHeight: { sm: '100dvh' },
            background: 'linear-gradient(180deg, #0b3a37 0%, #072a28 100%) !important',
            color: '#e7f5f3 !important',
            borderRight: '1px solid rgba(255,255,255,0.08) !important',
            boxShadow: '4px 0 24px rgba(0,0,0,0.12)',
          },
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
      {/* Notificação "relatório pronto" (sobrevive a trocar de tela durante a geração). */}
      <ReportReadyToast />
      {/* Menu lateral UNIFICADO (mobile) — ☰ e "Mais" abem o mesmo drawer */}
      <AppDrawer />
      {/* FloatingChat REMOVIDO (pedido do dono): o robô flutuante ocupava tela em
          todas as páginas — o acesso à IA já existe no rodapé (Dr. Exame) e no menu. */}
      <ExamCreateFab />
      <OfflineBanner />
      <PullToRefresh />
      <MobileBottomNav />
      <NotificationPopup />
      <OfflineBanner />
      <Onboarding />
      <WhatsNew />
      <CompleteProfileModal />
      <GoalQuiz />
      <Motd />
      <CreditRewardFx />
      <CelebrateFx />
      </BiometricGate>
    </DrawerProvider>
    </NudgeQueueProvider>
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
  const [bootExiting, setBootExiting] = useState(false);
  const [forceUpdate, setForceUpdate] = useState<string | null>(null);
  const isNativeApp = Capacitor.isNativePlatform();
  // G2 — App Links https abrem o app direto na rota (convite de médico, e-mails).
  useEffect(() => { initDeepLinks(); }, []);
  // F7 (29/09) — "Aa Texto grande" (Perfil → Preferências): px não escala com o "Tamanho da
  // fonte" do Android no WebView, então a escolha é no app. O toggle grava dx_text_large no
  // localStorage e dispara 'dx-text-large' (padrão dx-profile-updated); aqui trocamos o PAR
  // de temas do react-admin pela variante com raiz rem maior (html 16→18px = ×1,125).
  const [textLarge, setTextLarge] = useState(() => { try { return localStorage.getItem('dx_text_large') === '1'; } catch { return false; } });
  useEffect(() => {
    const read = () => setTextLarge(() => { try { return localStorage.getItem('dx_text_large') === '1'; } catch { return false; } });
    window.addEventListener('dx-text-large', read); // toggle no Perfil (mesma sessão)
    window.addEventListener('storage', read); // mudou em outra aba/janela
    return () => { window.removeEventListener('dx-text-large', read); window.removeEventListener('storage', read); };
  }, []);
  useEffect(() => {
    let cancelled = false; // previne setState após unmount (race condition)
    // WEB: anônimo na raiz → landing (porta pública/vitrine). APK: abre direto no LOGIN (app instalado não precisa de vitrine).
    // replaceState muda a URL em SILÊNCIO, sem reload — seguro no APK (reload recarrega o WebView e crasha o app nativo).
    try {
      const p = window.location.pathname || '/';
      const hasHashRoute = window.location.hash.startsWith('#/');
      // ROOT sob basename: o app é servido em /minhasaude/ — a condição antiga (p === '/')
      // nunca casava em produção e o anônimo caía no LOGIN em vez da vitrine (critique
      // 2026-08-26). Também corrige o destino: '/landing' absoluto dava 404 no refresh
      // sob o subpath — o replace precisa manter o prefixo real.
      const isAppRoot = p === '/' || p === '' || /\/minhasaude\/?$/i.test(p);
      if (!isNativeApp && !hasHashRoute && isAppRoot && !localStorage.getItem('token')) {
        const base = p.replace(/\/+$/, '');
        window.history.replaceState({}, '', `${base}/landing`);
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
    const bootTimer = setTimeout(() => {
      if (!cancelled) {
        setBootExiting(true);
        setTimeout(() => { if (!cancelled) setBooted(true); }, 420);
      }
    }, 1100); // splash visível na abertura
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
        .then((d) => { if (!cancelled && d?.user) { localStorage.setItem('user', JSON.stringify(d.user)); if (d.token) { try { localStorage.setItem('token', d.token); } catch {} } if (d.patientId) { localStorage.setItem('patientId', d.patientId); // selPatientId só se FALTAR (comentário prometia "popular se faltar"): sobrescrever sempre
              // no boot jogava o usuário de volta no TITULAR — modo cuidador (dependente selecionado) se perdia a cada reabertura.
              if (!localStorage.getItem('selPatientId')) { localStorage.setItem('selPatientId', d.patientId); window.dispatchEvent(new Event('selPatientChanged')); } } } })
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
  if (forceUpdate) return <ForceUpdate latest={forceUpdate} />;
  return (
  <>
  {!booted && <BootSplash isExiting={bootExiting} messages={['Iniciando o Dr. Exame…', 'Carregando seus exames…', 'Preparando seu painel…', 'Quase lá…']} />}
  <Admin
    dataProvider={dataProvider}
    authProvider={authProvider}
    theme={textLarge ? lightThemeLarge : lightTheme}
    darkTheme={textLarge ? darkThemeLarge : darkTheme}
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
      <Route path="/entrar" element={<LoginPage key="paciente" />} />
      <Route path="/entrar/medico" element={<LoginPage key="medico" fixedRole="medico" />} />
      <Route path="/landing" element={<Suspense fallback={<PageSkeleton />}><LandingPage /></Suspense>} />
      {/* Rotas Públicas de SEO e Aquisição (Saúde Esportiva, Atletas, Como Funciona) */}
      <Route path="/saude-esportiva" element={<Suspense fallback={<PageSkeleton />}><SportsLandingPage /></Suspense>} />
      <Route path="/exames-para-atletas" element={<Suspense fallback={<PageSkeleton />}><SportsLandingPage /></Suspense>} />
      <Route path="/como-funciona" element={<Suspense fallback={<PageSkeleton />}><LandingPage /></Suspense>} />
      <Route path="/entender-exames-de-sangue" element={<Suspense fallback={<PageSkeleton />}><LandingPage /></Suspense>} />
      <Route path="/convite/:token" element={<InviteLandingPage />} />
      <Route path="/termos" element={<TermsPage />} />
      <Route path="/faq" element={<Suspense fallback={<PageSkeleton />}><FaqPage /></Suspense>} />
      <Route path="/como-validamos" element={<Suspense fallback={<PageSkeleton />}><HowWeValidatePage /></Suspense>} />
      {/* Portal de documentação da API: PÚBLICO (prospects leem antes de solicitar) — fora do shell autenticado. */}
      <Route path="/api-docs" element={<Suspense fallback={<PageSkeleton />}><ApiDocsPage /></Suspense>} />
      <Route path="/registrar" element={<RegisterPage />} />
      <Route path="/recuperar-senha" element={<ResetPage />} />
      <Route path="/doctor" element={<Suspense fallback={<PageSkeleton />}><DoctorPortalPage /></Suspense>} />
      <Route path="/para-medicos" element={<Suspense fallback={<PageSkeleton />}><DoctorPortalPage /></Suspense>} />
      {/* Teleconsulta in-app (LiveKit): imersiva, SEM layout/menu/bottom-nav. Paciente e médico. */}
      <Route path="/teleconsulta/:id" element={<Suspense fallback={<PageSkeleton />}><TeleconsultaPage /></Suspense>} />
      {/* Backoffice ISOLADO do app do paciente: shell próprio (sem AppLayout/BottomNav/FloatingChat/menu de saúde). */}
      <Route path="/admin" element={<AdminPage />} />
    </CustomRoutes>

    <Resource name="exams" list={ExamList} show={ExamShow} create={ExamCreate} options={{ label: 'Exames' }} icon={FactCheckOutlinedIcon} />
    {/* create é OBRIGATÓRIO: sem ele /patients/create caía na rota de EDIT com id="create" →
        403 da guarda de PII → checkError derrubava a sessão (bug do dono 28/09: biometria + expulso). */}
    <Resource name="patients" list={PatientList} edit={PatientEdit} create={PatientCreate} options={{ label: 'Dependentes' }} icon={Diversity3OutlinedIcon} />
    <Resource name="items" options={{ label: 'Itens' }} />
    <Resource name="analyses" options={{ label: 'Análises' }} />

    <CustomRoutes>
      <Route path="/perfil" element={<ProfilePage />} />
      <Route path="/carteira" element={<Suspense fallback={<PageSkeleton />}><WalletPage /></Suspense>} />
      <Route path="/indique" element={<Suspense fallback={<PageSkeleton />}><InvitePage /></Suspense>} />
      <Route path="/perguntas" element={<Suspense fallback={<PageSkeleton />}><QuestionsPage /></Suspense>} />
      <Route path="/seguranca" element={<SecurityPage />} />
      <Route path="/privacidade" element={<PrivacyPage />} />
      {/* FAQ dentro do layout (era noLayout = "tela solta": sem voltar/menu/rodapé, e o link
          "voltar" jogava pra /landing). Agora é tela do app, com CTA de suporte in-app. */}
      <Route path="/faq" element={<Suspense fallback={<PageSkeleton />}><FaqPage /></Suspense>} />
      <Route path="*" element={<NotFoundPage />} />
      <Route path="/evolucao" element={<EvolutionPage />} />
      <Route path="/familia" element={<FamilyPage />} />
      <Route path="/tendencias" element={<TrendsPage />} />
      <Route path="/linha-do-tempo" element={<TimelinePage />} />
      <Route path="/relatorio" element={<ConsolidatedReportPage />} />
      <Route path="/alterados" element={<ValoresAlteradosPage />} />
      <Route path="/lembretes" element={<Suspense fallback={<PageSkeleton />}><RemindersPage /></Suspense>} />
      <Route path="/medicoes" element={<MeasurementsPage />} />
      {/* Histórico por métrica — detalhe da central de sinais (sub-rota: back-gesture
          Android funciona nativo; gráfico+períodos+tabela não cabem em dialog 360px). */}
      <Route path="/medicoes/historico/:type" element={<Suspense fallback={<PageSkeleton />}><MeasurementHistoryPage /></Suspense>} />
      {/* Saúde mental (PHQ-9/GAD-7) — entra pelo card da página Medições (sem item de menu). */}
      <Route path="/saude-mental" element={<Suspense fallback={<PageSkeleton />}><SaudeMentalPage /></Suspense>} />
      {/* Sinais Vitais (hub Health Connect) — PORTA pelo ActivityCard conectado: sem item
          de menu de propósito (exclusiva de quem conecta o celular; sem dado → convite). */}
      <Route path="/sinais" element={<Suspense fallback={<PageSkeleton />}><SinaisPage /></Suspense>} />
      <Route path="/medicamentos" element={<MedicationsPage />} />
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
      <Route path="/api" element={<ApiPanelPage />} />
    </CustomRoutes>
  </Admin>
  </>
  );
};
