import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Box, Typography, Stack, Chip, Drawer, List, ListItemButton, ListItemIcon, ListItemText, IconButton, AppBar, Toolbar, Divider, useMediaQuery, useTheme } from '@mui/material';
import { Title } from 'react-admin';
import MenuIcon from '@mui/icons-material/Menu';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined';
import MedicalServicesOutlinedIcon from '@mui/icons-material/MedicalServicesOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import MonitorHeartOutlinedIcon from '@mui/icons-material/MonitorHeartOutlined';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import SupportAgentOutlinedIcon from '@mui/icons-material/SupportAgentOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import LogoutIcon from '@mui/icons-material/Logout';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { API_URL, token } from '../../config';
import { OverviewTab } from './OverviewTab';
import { UsersTab } from './UsersTab';
import { FinanceiroTab } from './FinanceiroTab';
import { PushTab } from './PushTab';
import { DoctorsTab } from './DoctorsTab';
import { ExamsTab } from './ExamsTab';
import { IaTab } from './IaTab';
import { TechTab } from './TechTab';
import { AuditTab } from './AuditTab';
import { SupportTab } from './SupportTab';
import { ConfigTab } from './ConfigTab';

/** Backoffice Dr. Exame — ISOLADO do app do paciente (/admin é noLayout).
 *  Shell próprio (topbar + sidebar) com os 11 módulos de gestão. Sem chrome de paciente
 *  (sem MobileBottomNav, FloatingChat, menu de saúde). Guard: só ADMIN. */
type ModuleId = 'overview' | 'users' | 'doctors' | 'exams' | 'ia' | 'financeiro' | 'push' | 'tech' | 'audit' | 'support' | 'config';

const MODULES: { id: ModuleId; label: string; icon: ReactElement; group: string }[] = [
  { id: 'overview', label: 'Dashboard', icon: <DashboardOutlinedIcon />, group: 'Visão geral' },
  { id: 'users', label: 'Usuários', icon: <PeopleOutlinedIcon />, group: 'Gestão' },
  { id: 'doctors', label: 'Médicos', icon: <MedicalServicesOutlinedIcon />, group: 'Gestão' },
  { id: 'exams', label: 'Exames', icon: <DescriptionOutlinedIcon />, group: 'Gestão' },
  { id: 'ia', label: 'IA & Alertas', icon: <AutoAwesomeOutlinedIcon />, group: 'Gestão' },
  { id: 'financeiro', label: 'Planos & Financ.', icon: <PaymentsOutlinedIcon />, group: 'Negócio' },
  { id: 'push', label: 'Push & Comunic.', icon: <CampaignOutlinedIcon />, group: 'Negócio' },
  { id: 'tech', label: 'Saúde técnica', icon: <MonitorHeartOutlinedIcon />, group: 'Operação' },
  { id: 'audit', label: 'Auditoria', icon: <ShieldOutlinedIcon />, group: 'Operação' },
  { id: 'support', label: 'Suporte', icon: <SupportAgentOutlinedIcon />, group: 'Operação' },
  { id: 'config', label: 'Configurações', icon: <SettingsOutlinedIcon />, group: 'Sistema' },
];

const authH = () => ({ Authorization: `Bearer ${token()}` });
const logout = () => { try { localStorage.removeItem('token'); localStorage.removeItem('user'); localStorage.removeItem('patientId'); localStorage.removeItem('selPatientId'); } catch {} window.location.href = import.meta.env.BASE_URL; };

export const AdminPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const [drawerOpen, setDrawerOpen] = useState(false);
  const urlMod = searchParams.get('tab') as ModuleId | null;
  const [mod, setMod] = useState<ModuleId>(MODULES.some(m => m.id === urlMod) ? (urlMod as ModuleId) : 'overview');

  // Guard client: só ADMIN. (O server já bloqueia via requireAdmin; isto evita renderizar o shell.)
  useEffect(() => {
    try { if (JSON.parse(localStorage.getItem('user') || '{}').role !== 'ADMIN') navigate('/', { replace: true }); } catch { navigate('/', { replace: true }); }
  }, [navigate]);

  const select = (id: ModuleId) => { setMod(id); setSearchParams({ tab: id }); setDrawerOpen(false); };

  // KPIs rápidos no topbar (stats do /admin/users?limit=1)
  const [stats, setStats] = useState<any>(null);
  useEffect(() => { (async () => { try { const r = await fetch(`${API_URL}/admin/users?limit=1`, { headers: authH() }); if (r.ok) setStats((await r.json()).stats); } catch {} })(); }, []);

  const Sidebar = (
    <Box sx={{ width: 248, height: '100%', display: 'flex', flexDirection: 'column', bgcolor: 'background.paper', borderRight: 1, borderColor: 'divider' }}>
      <Box sx={{ p: 2, pb: 1.5 }}>
        <Typography sx={{ fontWeight: 800, fontFamily: '"Poppins",sans-serif', color: '#178f89', fontSize: 17 }}>⚙️ Backoffice</Typography>
        <Typography variant="caption" color="text.secondary">Dr. Exame · gestão</Typography>
      </Box>
      <Divider />
      <Box sx={{ flex: 1, overflowY: 'auto', py: 1 }}>
        {(() => {
          let lastGroup = '';
          return MODULES.map((m) => {
            const showGroup = m.group !== lastGroup; lastGroup = m.group;
            const on = mod === m.id;
            return (
              <Box key={m.id}>
                {showGroup && <Typography sx={{ px: 2.5, pt: 1.5, pb: 0.25, fontSize: 10, fontWeight: 800, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.5 }}>{m.group}</Typography>}
                <ListItemButton onClick={() => select(m.id)} selected={on} sx={{ mx: 1, borderRadius: 1.5, py: 0.7, '&.Mui-selected': { bgcolor: 'rgba(32,178,170,.14)' }, '&.Mui-selected .MuiListItemIcon-root': { color: '#178f89' } }}>
                  <ListItemIcon sx={{ minWidth: 36, color: on ? '#178f89' : 'text.secondary', '& svg': { fontSize: 20 } }}>{m.icon}</ListItemIcon>
                  <ListItemText primary={m.label} primaryTypographyProps={{ fontSize: 13.5, fontWeight: on ? 700 : 500, color: on ? 'text.primary' : 'text.secondary' }} />
                </ListItemButton>
              </Box>
            );
          });
        })()}
      </Box>
      <Divider />
      <List disablePadding>
        <ListItemButton onClick={() => navigate('/')} sx={{ mx: 1, my: 0.5, borderRadius: 1.5 }}>
          <ListItemIcon sx={{ minWidth: 36, color: 'text.secondary' }}><ArrowBackIcon /></ListItemIcon>
          <ListItemText primary="Voltar ao app" primaryTypographyProps={{ fontSize: 13 }} />
        </ListItemButton>
        <ListItemButton onClick={logout} sx={{ mx: 1, mb: 0.5, borderRadius: 1.5, color: 'error.main' }}>
          <ListItemIcon sx={{ minWidth: 36, color: 'error.main' }}><LogoutIcon /></ListItemIcon>
          <ListItemText primary="Sair" primaryTypographyProps={{ fontSize: 13 }} />
        </ListItemButton>
      </List>
    </Box>
  );

  const active = MODULES.find((m) => m.id === mod);

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <Title title="Backoffice · Dr. Exame" />
      {isDesktop ? (
        <Box component="aside" sx={{ position: 'sticky', top: 0, height: '100vh', flexShrink: 0 }}>{Sidebar}</Box>
      ) : (
        <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} PaperProps={{ sx: { width: 248 } }}>{Sidebar}</Drawer>
      )}
      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {/* Topbar */}
        <AppBar position="sticky" elevation={0} sx={{ bgcolor: 'background.paper', color: 'text.primary', borderBottom: 1, borderColor: 'divider', pt: 'env(safe-area-inset-top)' }}>
          <Toolbar variant="dense" sx={{ gap: 1 }}>
            {!isDesktop && (
              <IconButton onClick={() => setDrawerOpen(true)} sx={{ color: 'text.secondary' }}><MenuIcon /></IconButton>
            )}
            <Typography sx={{ fontWeight: 800, fontSize: 16 }}>{active?.icon} {active?.label}</Typography>
            <Box sx={{ flex: 1 }} />
            {stats && (
              <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                <Chip size="small" label={`👤 ${stats.users}`} />
                <Chip size="small" label={`📋 ${stats.exams}`} color="secondary" />
                <Chip size="small" label={`💰 R$ ${(stats.revenue ?? 0).toFixed(0)}`} color="success" />
              </Stack>
            )}
          </Toolbar>
        </AppBar>
        {/* Conteúdo do módulo */}
        <Box sx={{ flex: 1, p: { xs: 1.5, md: 3 }, maxWidth: 1180, width: '100%', mx: 'auto' }}>
          {mod === 'overview' && <OverviewTab />}
          {mod === 'users' && <UsersTab />}
          {mod === 'doctors' && <DoctorsTab />}
          {mod === 'exams' && <ExamsTab />}
          {mod === 'ia' && <IaTab />}
          {mod === 'financeiro' && <FinanceiroTab />}
          {mod === 'push' && <PushTab />}
          {mod === 'tech' && <TechTab />}
          {mod === 'audit' && <AuditTab />}
          {mod === 'support' && <SupportTab />}
          {mod === 'config' && <ConfigTab />}
        </Box>
      </Box>
    </Box>
  );
};
