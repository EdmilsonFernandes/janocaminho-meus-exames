import { useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Box, Typography, Stack, Chip, Drawer, List, ListItemButton, ListItemIcon, ListItemText,
  IconButton, AppBar, Toolbar, Divider, useMediaQuery, useTheme, TextField, InputAdornment,
  Container,
} from '@mui/material';
import { Title } from 'react-admin';
import MenuIcon from '@mui/icons-material/Menu';
import MenuOutlinedIcon from '@mui/icons-material/MenuOutlined';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined';
import CardGiftcardOutlinedIcon from '@mui/icons-material/CardGiftcardOutlined';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';
import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined';
import MedicalServicesOutlinedIcon from '@mui/icons-material/MedicalServicesOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import MonitorHeartOutlinedIcon from '@mui/icons-material/MonitorHeartOutlined';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import SupportAgentOutlinedIcon from '@mui/icons-material/SupportAgentOutlined';
import ApiOutlinedIcon from '@mui/icons-material/ApiOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import LogoutIcon from '@mui/icons-material/Logout';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import { API_URL, token } from '../../config';
import { OverviewTab } from './OverviewTab';
import { UsersTab } from './UsersTab';
import { FinanceiroTab } from './FinanceiroTab';
import { PushTab } from './PushTab';
import { DoctorsTab } from './DoctorsTab';
import { ExamsTab } from './ExamsTab';
import { IaTab } from './IaTab';
import { UsageTab } from './UsageTab';
import { UsabilityTab } from './UsabilityTab';
import { ReferralTab } from './ReferralTab';
import { RiskTab } from './RiskTab';
import { TechTab } from './TechTab';
import { AuditTab } from './AuditTab';
import { SupportTab } from './SupportTab';
import { ApiTab } from './ApiTab';
import { PricingTab } from './PricingTab';
import { PiiTab } from './PiiTab';
import { LabsTab } from './LabsTab';
import { PharmaciesTab } from './PharmaciesTab';

/** Backoffice Dr. Exame — ISOLADO do app do paciente (/admin é noLayout).
 *  Shell próprio (topbar + sidebar categorizada) com 19 módulos de controle.
 *  Guard: exclusivo para administradores (role = ADMIN). */
export type ModuleId =
  | 'overview'
  | 'usabilidade'
  | 'referrals'
  | 'users'
  | 'doctors'
  | 'exams'
  | 'support'
  | 'usage'
  | 'ia'
  | 'risk'
  | 'financeiro'
  | 'config'
  | 'labs'
  | 'pharmacies'
  | 'api'
  | 'push'
  | 'tech'
  | 'audit'
  | 'pii';

export interface AdminModule {
  id: ModuleId;
  label: string;
  icon: ReactElement;
  group: string;
  badge?: string;
}

const MODULES: AdminModule[] = [
  // 1. Visão Geral & Growth
  { id: 'overview', label: 'Dashboard Executivo', icon: <DashboardOutlinedIcon />, group: 'Visão Geral & Growth' },
  { id: 'usabilidade', label: 'Adoção de Funcionalidades', icon: <InsightsOutlinedIcon />, group: 'Visão Geral & Growth' },
  { id: 'referrals', label: 'Indicações & MGM', icon: <CardGiftcardOutlinedIcon />, group: 'Visão Geral & Growth' },

  // 2. Pessoas & Clínico
  { id: 'users', label: 'Usuários / Pacientes', icon: <PeopleOutlinedIcon />, group: 'Pessoas & Clínico' },
  { id: 'doctors', label: 'Médicos & Portais', icon: <MedicalServicesOutlinedIcon />, group: 'Pessoas & Clínico' },
  { id: 'exams', label: 'Exames Processados', icon: <DescriptionOutlinedIcon />, group: 'Pessoas & Clínico' },
  { id: 'support', label: 'Suporte & Chamados', icon: <SupportAgentOutlinedIcon />, group: 'Pessoas & Clínico' },

  // 3. Inteligência Artificial
  { id: 'usage', label: 'Consumo de IA & Créditos', icon: <BoltOutlinedIcon />, group: 'Inteligência Artificial' },
  { id: 'ia', label: 'Provedores & Modelos', icon: <AutoAwesomeOutlinedIcon />, group: 'Inteligência Artificial' },
  { id: 'risk', label: 'Risco Clínico & Qualidade', icon: <MonitorHeartOutlinedIcon />, group: 'Inteligência Artificial' },

  // 4. Negócio & Ecossistema
  { id: 'financeiro', label: 'Planos & Receita (PIX/Cartão)', icon: <PaymentsOutlinedIcon />, group: 'Comercial & Negócio' },
  { id: 'config', label: 'Preços & Pacotes de Créditos', icon: <SettingsOutlinedIcon />, group: 'Comercial & Negócio' },
  { id: 'labs', label: 'Laboratórios Parceiros', icon: <ScienceOutlinedIcon />, group: 'Comercial & Negócio' },
  { id: 'pharmacies', label: 'Farmácias & Parcerias', icon: <StorefrontOutlinedIcon />, group: 'Comercial & Negócio' },
  { id: 'api', label: 'API Pública & Integrações', icon: <ApiOutlinedIcon />, group: 'Comercial & Negócio' },

  // 5. Segurança & Operação
  { id: 'push', label: 'Push & Campanhas', icon: <CampaignOutlinedIcon />, group: 'Segurança & Operação' },
  { id: 'tech', label: 'Saúde Técnica & Infra', icon: <MonitorHeartOutlinedIcon />, group: 'Segurança & Operação' },
  { id: 'audit', label: 'Auditoria & Logs', icon: <ShieldOutlinedIcon />, group: 'Segurança & Operação' },
  { id: 'pii', label: 'LGPD & Consulta PII/CPF', icon: <ShieldOutlinedIcon />, group: 'Segurança & Operação' },
];

// Rodapé (mobile): atalhos rápidos + ☰ que abre TODOS os módulos no drawer categorizado.
const FOOTER: { id: ModuleId; short: string; icon: ReactElement }[] = [
  { id: 'overview', short: 'Início', icon: <DashboardOutlinedIcon /> },
  { id: 'usabilidade', short: 'Features', icon: <InsightsOutlinedIcon /> },
  { id: 'referrals', short: 'Indicações', icon: <CardGiftcardOutlinedIcon /> },
  { id: 'users', short: 'Usuários', icon: <PeopleOutlinedIcon /> },
];

const authH = () => ({ Authorization: `Bearer ${token()}` });

export const AdminPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [filterText, setFilterText] = useState('');

  const urlMod = searchParams.get('tab') as ModuleId | null;
  const [mod, setMod] = useState<ModuleId>(MODULES.some((m) => m.id === urlMod) ? (urlMod as ModuleId) : 'overview');

  const logout = () => {
    try {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('patientId');
      localStorage.removeItem('selPatientId');
    } catch {}
    navigate('/entrar', { replace: true });
  };

  // Guard client: só ADMIN.
  useEffect(() => {
    try {
      if (JSON.parse(localStorage.getItem('user') || '{}').role !== 'ADMIN') navigate('/', { replace: true });
    } catch {
      navigate('/', { replace: true });
    }
  }, [navigate]);

  const select = (id: ModuleId) => {
    setMod(id);
    setSearchParams({ tab: id });
    setDrawerOpen(false);
  };

  // KPIs rápidos no topbar (stats do /admin/users?limit=1)
  const [stats, setStats] = useState<any>(null);
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API_URL}/admin/users?limit=1`, { headers: authH() });
        if (r.ok) setStats((await r.json()).stats);
      } catch {}
    })();
  }, []);

  // Módulos filtrados pela busca rápida
  const filteredModules = useMemo(() => {
    const q = filterText.toLowerCase().trim();
    if (!q) return MODULES;
    return MODULES.filter((m) => m.label.toLowerCase().includes(q) || m.group.toLowerCase().includes(q));
  }, [filterText]);

  const Sidebar = (
    <Box sx={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', bgcolor: 'background.paper' }}>
      {/* Topo do drawer */}
      <Box sx={{ p: 2, pb: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography sx={{ fontWeight: 900, fontFamily: '"Poppins",sans-serif', color: '#178f89', fontSize: 17, letterSpacing: '-0.02em' }}>
            ⚙️ Backoffice
          </Typography>
          <Typography variant="caption" color="text.secondary">Dr. Exame · Gestão & Controle</Typography>
        </Box>
        {!isDesktop && (
          <IconButton size="small" onClick={() => setDrawerOpen(false)} sx={{ color: 'text.secondary' }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        )}
      </Box>

      {/* Campo de busca rápida no drawer */}
      <Box sx={{ px: 1.5, pb: 1.25 }}>
        <TextField
          size="small"
          fullWidth
          placeholder="Buscar módulo..."
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                </InputAdornment>
              ),
              endAdornment: filterText ? (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setFilterText('')}>
                    <CloseIcon sx={{ fontSize: 14 }} />
                  </IconButton>
                </InputAdornment>
              ) : undefined,
            },
          }}
          sx={{
            '& .MuiOutlinedInput-root': {
              borderRadius: '10px',
              bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
              fontSize: 13,
            },
          }}
        />
      </Box>

      <Divider />

      {/* Lista agrupada de módulos */}
      <Box sx={{ flex: 1, overflowY: 'auto', py: 1, WebkitOverflowScrolling: 'touch' }}>
        {(() => {
          let lastGroup = '';
          return filteredModules.map((m) => {
            const showGroup = m.group !== lastGroup;
            lastGroup = m.group;
            const on = mod === m.id;
            return (
              <Box key={m.id}>
                {showGroup && (
                  <Typography
                    sx={{
                      px: 2,
                      pt: 1.5,
                      pb: 0.5,
                      fontSize: 11,
                      fontWeight: 800,
                      color: 'text.disabled',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                    }}
                  >
                    {m.group}
                  </Typography>
                )}
                <ListItemButton
                  onClick={() => select(m.id)}
                  selected={on}
                  sx={{
                    mx: 1,
                    mb: 0.25,
                    borderRadius: '10px',
                    py: 0.75,
                    borderLeft: on ? '3px solid #178f89' : '3px solid transparent',
                    '&.Mui-selected': { bgcolor: 'rgba(32,178,170,.14)' },
                    '&.Mui-selected .MuiListItemIcon-root': { color: '#178f89' },
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 34, color: on ? '#178f89' : 'text.secondary', '& svg': { fontSize: 20 } }}>
                    {m.icon}
                  </ListItemIcon>
                  <ListItemText
                    primary={m.label}
                    primaryTypographyProps={{
                      fontSize: 13.5,
                      fontWeight: on ? 800 : 500,
                      color: on ? 'text.primary' : 'text.secondary',
                      noWrap: true,
                    }}
                  />
                  {m.badge && (
                    <Chip size="small" label={m.badge} sx={{ height: 18, fontSize: 10, fontWeight: 700 }} />
                  )}
                </ListItemButton>
              </Box>
            );
          });
        })()}
        {filteredModules.length === 0 && (
          <Box sx={{ py: 4, px: 2, textAlign: 'center' }}>
            <Typography variant="caption" color="text.secondary">Nenhum módulo encontrado com "{filterText}".</Typography>
          </Box>
        )}
      </Box>

      <Divider />

      {/* Ações de rodapé do drawer */}
      <List disablePadding sx={{ p: 0.75 }}>
        <ListItemButton onClick={() => navigate('/')} sx={{ borderRadius: '10px', py: 0.75 }}>
          <ListItemIcon sx={{ minWidth: 34, color: 'text.secondary' }}><ArrowBackIcon sx={{ fontSize: 19 }} /></ListItemIcon>
          <ListItemText primary="Voltar ao app do paciente" primaryTypographyProps={{ fontSize: 13, fontWeight: 600 }} />
        </ListItemButton>
        <ListItemButton onClick={logout} sx={{ borderRadius: '10px', py: 0.75, color: 'error.main' }}>
          <ListItemIcon sx={{ minWidth: 34, color: 'error.main' }}><LogoutIcon sx={{ fontSize: 19 }} /></ListItemIcon>
          <ListItemText primary="Sair do backoffice" primaryTypographyProps={{ fontSize: 13, fontWeight: 700 }} />
        </ListItemButton>
      </List>
    </Box>
  );

  const active = MODULES.find((m) => m.id === mod);

  return (
    <Box sx={{ display: 'flex', minHeight: '100dvh', bgcolor: 'background.default' }}>
      <Title title="Backoffice · Dr. Exame" />

      {/* Sidebar Desktop / Drawer Mobile */}
      {isDesktop ? (
        <Box component="aside" sx={{ width: 260, position: 'sticky', top: 0, height: '100dvh', flexShrink: 0, borderRight: 1, borderColor: 'divider' }}>
          {Sidebar}
        </Box>
      ) : (
        <Drawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          PaperProps={{
            sx: {
              width: { xs: '84vw', sm: 290 },
              maxWidth: 320,
              pt: 'env(safe-area-inset-top)',
              pb: 'env(safe-area-inset-bottom)',
            },
          }}
        >
          {Sidebar}
        </Drawer>
      )}

      {/* Conteúdo Principal */}
      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {/* Topbar */}
        <AppBar
          position="sticky"
          elevation={0}
          sx={{
            bgcolor: 'background.paper',
            color: 'text.primary',
            borderBottom: 1,
            borderColor: 'divider',
            pt: 'env(safe-area-inset-top)',
          }}
        >
          <Toolbar variant="dense" sx={{ gap: 1, minHeight: { xs: 54, sm: 58 }, px: { xs: 1.5, sm: 2.5 } }}>
            {!isDesktop && (
              <IconButton onClick={() => setDrawerOpen(true)} sx={{ color: 'text.secondary' }} aria-label="Abrir menu">
                <MenuIcon />
              </IconButton>
            )}

            <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
              <Box sx={{ color: '#178f89', display: 'flex', alignItems: 'center', '& svg': { fontSize: 20 } }}>
                {active?.icon}
              </Box>
              <Typography noWrap sx={{ fontWeight: 800, fontSize: { xs: 14.5, sm: 16 } }}>
                {active?.label}
              </Typography>
            </Stack>

            <Box sx={{ flex: 1 }} />

            {stats && (
              <Stack direction="row" spacing={0.75} useFlexGap flexWrap="nowrap" sx={{ overflowX: 'auto' }}>
                <Chip size="small" label={`👤 ${stats.users}`} sx={{ fontWeight: 700, height: 24, fontSize: 11.5 }} />
                <Chip size="small" label={`📋 ${stats.exams}`} color="secondary" sx={{ fontWeight: 700, height: 24, fontSize: 11.5 }} />
                <Chip size="small" label={`💰 R$ ${(stats.revenue ?? 0).toFixed(0)}`} color="success" sx={{ fontWeight: 700, height: 24, fontSize: 11.5 }} />
              </Stack>
            )}
          </Toolbar>
        </AppBar>

        {/* Conteúdo do módulo envolvido em Container responsivo */}
        <Box component="main" sx={{ flex: 1, minWidth: 0, bgcolor: 'background.default', pb: { xs: '84px', md: 4 } }}>
          <Container maxWidth="xl" sx={{ px: { xs: 1.5, sm: 2.5, md: 3 }, py: { xs: 2, md: 3 }, maxWidth: '100% !important' }}>
            {mod === 'overview' && <OverviewTab />}
            {mod === 'usabilidade' && <UsabilityTab />}
            {mod === 'referrals' && <ReferralTab onGoToConfig={() => select('config')} />}
            {mod === 'users' && <UsersTab />}
            {mod === 'doctors' && <DoctorsTab />}
            {mod === 'exams' && <ExamsTab />}
            {mod === 'labs' && <LabsTab />}
            {mod === 'pharmacies' && <PharmaciesTab />}
            {mod === 'ia' && <IaTab />}
            {mod === 'usage' && <UsageTab />}
            {mod === 'risk' && <RiskTab />}
            {mod === 'financeiro' && <FinanceiroTab />}
            {mod === 'push' && <PushTab />}
            {mod === 'tech' && <TechTab />}
            {mod === 'audit' && <AuditTab />}
            {mod === 'pii' && <PiiTab />}
            {mod === 'support' && <SupportTab />}
            {mod === 'api' && <ApiTab />}
            {mod === 'config' && <PricingTab />}
          </Container>
        </Box>
      </Box>

      {/* Rodapé Mobile: atalhos rápidos + ☰ Mais */}
      <Box
        component="footer"
        sx={{
          display: { xs: 'flex', md: 'none' },
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 1100,
          bgcolor: 'background.paper',
          borderTop: 1,
          borderColor: 'divider',
          pb: 'env(safe-area-inset-bottom)',
          boxShadow: '0 -2px 10px rgba(0,0,0,0.06)',
        }}
      >
        {FOOTER.map((f) => {
          const on = mod === f.id;
          return (
            <Box
              key={f.id}
              onClick={() => select(f.id)}
              sx={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                py: 0.6,
                cursor: 'pointer',
                color: on ? '#178f89' : 'text.secondary',
                '& svg': { fontSize: 20 },
              }}
            >
              {f.icon}
              <Typography sx={{ fontSize: 11, fontWeight: on ? 800 : 600, mt: 0.25, fontFamily: '"Poppins",sans-serif' }}>
                {f.short}
              </Typography>
              <Box sx={{ height: 3, width: on ? 20 : 0, borderRadius: '12px', bgcolor: '#178f89', mt: 0.3, transition: 'width .2s' }} />
            </Box>
          );
        })}
        {/* Botão Mais que abre o Drawer com todos os 19 módulos */}
        <Box
          onClick={() => setDrawerOpen(true)}
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            py: 0.6,
            cursor: 'pointer',
            color: drawerOpen ? '#178f89' : 'text.secondary',
          }}
        >
          <MenuOutlinedIcon sx={{ fontSize: 21 }} />
          <Typography sx={{ fontSize: 11, fontWeight: 700, mt: 0.25, fontFamily: '"Poppins",sans-serif' }}>Mais</Typography>
          <Box sx={{ height: 3 }} />
        </Box>
      </Box>
    </Box>
  );
};
