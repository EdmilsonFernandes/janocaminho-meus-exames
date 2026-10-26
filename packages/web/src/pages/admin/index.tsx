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
import PrivacyTipOutlinedIcon from '@mui/icons-material/PrivacyTipOutlined';
import DnsOutlinedIcon from '@mui/icons-material/DnsOutlined';
import SupportAgentOutlinedIcon from '@mui/icons-material/SupportAgentOutlined';
import ApiOutlinedIcon from '@mui/icons-material/ApiOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import LogoutIcon from '@mui/icons-material/Logout';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import { DrExame } from '../../components/DrExame';
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
import { TechTab } from './TechTab';
import { AuditTab } from './AuditTab';
import { SupportTab } from './SupportTab';
import { ApiTab } from './ApiTab';
import { PricingTab } from './PricingTab';
import { PiiTab } from './PiiTab';
import { LabsTab } from './LabsTab';
import { PharmaciesTab } from './PharmaciesTab';
import { TeleconsultasTab } from './TeleconsultasTab';
import { TeleFinanceTab } from './TeleFinanceTab';
import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined';
import VideoCameraFrontOutlinedIcon from '@mui/icons-material/VideoCameraFrontOutlined';

/** Backoffice Dr. Exame — ISOLADO do app do paciente (/admin é noLayout).
 *  Shell próprio (topbar + sidebar categorizada) com 20 módulos de controle.
 *  Guard: exclusivo para administradores (role = ADMIN). */
export type ModuleId =
  | 'overview'
  | 'usabilidade'
  | 'referrals'
  | 'users'
  | 'doctors'
  | 'exams'
  | 'teleconsultas'
  | 'telefinance'
  | 'support'
  | 'usage'
  | 'ia'
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
  /** Título curto p/ topbar mobile (390px) — full fica p/ sidebar/drawer. */
  short: string;
  icon: ReactElement;
  group: string;
  badge?: string;
}

const MODULES: AdminModule[] = [
  // 1. Visão Geral & Growth
  { id: 'overview', label: 'Dashboard Executivo', short: 'Dashboard', icon: <DashboardOutlinedIcon />, group: 'Visão Geral & Growth' },
  { id: 'usabilidade', label: 'Adoção de Funcionalidades', short: 'Adoção', icon: <InsightsOutlinedIcon />, group: 'Visão Geral & Growth' },
  { id: 'referrals', label: 'Indicações & MGM', short: 'Indicações', icon: <CardGiftcardOutlinedIcon />, group: 'Visão Geral & Growth' },

  // 2. Pessoas & Clínico
  { id: 'users', label: 'Usuários / Pacientes', short: 'Usuários', icon: <PeopleOutlinedIcon />, group: 'Pessoas & Clínico' },
  { id: 'doctors', label: 'Médicos & Portais', short: 'Médicos', icon: <MedicalServicesOutlinedIcon />, group: 'Pessoas & Clínico' },
  { id: 'exams', label: 'Exames Processados', short: 'Exames', icon: <DescriptionOutlinedIcon />, group: 'Pessoas & Clínico' },
  { id: 'teleconsultas', label: 'Teleconsultas & Feedbacks', short: 'Teleconsultas', icon: <VideoCameraFrontOutlinedIcon />, group: 'Pessoas & Clínico' },
  { id: 'support', label: 'Suporte & Chamados', short: 'Suporte', icon: <SupportAgentOutlinedIcon />, group: 'Pessoas & Clínico' },

  // 3. Inteligência Artificial
  { id: 'usage', label: 'Consumo de IA & Créditos', short: 'Consumo IA', icon: <BoltOutlinedIcon />, group: 'Inteligência Artificial' },
  { id: 'ia', label: 'Provedores & Modelos', short: 'Provedores', icon: <AutoAwesomeOutlinedIcon />, group: 'Inteligência Artificial' },

  // 4. Negócio & Ecossistema
  { id: 'financeiro', label: 'Planos & Receita (PIX/Cartão)', short: 'Financeiro', icon: <PaymentsOutlinedIcon />, group: 'Comercial & Negócio' },
  { id: 'telefinance', label: 'Financeiro · Teleconsultas', short: 'Tele Fin', icon: <AccountBalanceOutlinedIcon />, group: 'Comercial & Negócio' },
  { id: 'config', label: 'Preços & Pacotes de Créditos', short: 'Preços', icon: <SettingsOutlinedIcon />, group: 'Comercial & Negócio' },
  { id: 'labs', label: 'Laboratórios Parceiros', short: 'Laboratórios', icon: <ScienceOutlinedIcon />, group: 'Comercial & Negócio' },
  { id: 'pharmacies', label: 'Farmácias & Parcerias', short: 'Farmácias', icon: <StorefrontOutlinedIcon />, group: 'Comercial & Negócio' },
  { id: 'api', label: 'API Pública & Integrações', short: 'API Pública', icon: <ApiOutlinedIcon />, group: 'Comercial & Negócio' },

  // 5. Segurança & Operação
  { id: 'push', label: 'Push & Campanhas', short: 'Push', icon: <CampaignOutlinedIcon />, group: 'Segurança & Operação' },
  // tech: DnsOutlined (não Settings — já usado por 'config'; MonitorHeart fica só do 'risk')
  { id: 'tech', label: 'Saúde Técnica & Infra', short: 'Saúde Técnica', icon: <DnsOutlinedIcon />, group: 'Segurança & Operação' },
  { id: 'audit', label: 'Auditoria & Logs', short: 'Auditoria', icon: <ShieldOutlinedIcon />, group: 'Segurança & Operação' },
  { id: 'pii', label: 'LGPD & Consulta PII/CPF', short: 'LGPD & PII', icon: <PrivacyTipOutlinedIcon />, group: 'Segurança & Operação' },
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
  const isSmall = useMediaQuery(theme.breakpoints.down('sm'));
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
      {/* Topo do drawer com Logo e Brand Enterprise */}
      <Box sx={{ p: 2, pb: 1.75, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
          <Box
            sx={{
              width: 38,
              height: 38,
              borderRadius: '10px',
              flexShrink: 0,
              display: 'grid',
              placeItems: 'center',
              background: 'linear-gradient(135deg, #20b2aa 0%, #0d9488 100%)',
              boxShadow: '0 4px 14px rgba(32, 178, 170, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
              overflow: 'hidden',
            }}
          >
            <DrExame size={28} sx={{ borderRadius: '20%' }} />
          </Box>
          <Box>
            <Stack direction="row" spacing={0.75} alignItems="center">
              <Typography sx={{ fontWeight: 800, fontFamily: '"Poppins",sans-serif', color: 'text.primary', fontSize: 16, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
                Dr. Exame
              </Typography>
              <Chip
                size="small"
                label="ADMIN"
                sx={{
                  height: 18,
                  fontSize: 9.5,
                  fontWeight: 800,
                  bgcolor: 'rgba(23, 143, 137, 0.12)',
                  color: '#178f89',
                  borderRadius: '4px',
                  letterSpacing: '0.04em',
                  '& .MuiChip-label': { px: 0.6, py: 0 },
                }}
              />
            </Stack>
            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 0.25 }}>
              <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: '#22c55e' }} />
              <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 11, fontWeight: 500 }}>
                Gestão & Controle
              </Typography>
            </Stack>
          </Box>
        </Box>
        {!isDesktop && (
          <IconButton size="small" onClick={() => setDrawerOpen(false)} sx={{ color: 'text.secondary' }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        )}
      </Box>

      {/* Campo de busca rápida no drawer */}
      <Box sx={{ px: 1.5, py: 1.25 }}>
        <TextField
          size="small"
          fullWidth
          placeholder="Buscar módulo (/)..."
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ fontSize: 17, color: 'text.secondary' }} />
                </InputAdornment>
              ),
              endAdornment: filterText ? (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setFilterText('')}>
                    <CloseIcon sx={{ fontSize: 14 }} />
                  </IconButton>
                </InputAdornment>
              ) : (
                <InputAdornment position="end">
                  <Typography sx={{ fontSize: 10.5, fontWeight: 700, color: 'text.disabled', bgcolor: 'action.hover', px: 0.6, py: 0.2, borderRadius: '4px', fontFamily: 'monospace' }}>
                    /
                  </Typography>
                </InputAdornment>
              ),
            },
          }}
          sx={{
            '& .MuiOutlinedInput-root': {
              borderRadius: '8px',
              bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.04)' : '#f8fafc',
              fontSize: 12.5,
              transition: 'all .2s ease',
              '& fieldset': { borderColor: 'rgba(0,0,0,0.08)' },
              '&:hover fieldset': { borderColor: '#178f89' },
              '&.Mui-focused fieldset': { borderColor: '#178f89', borderWidth: '1.5px' },
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
                      pt: 1.75,
                      pb: 0.5,
                      fontSize: 11,
                      fontWeight: 800,
                      color: 'text.disabled',
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
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
                    mb: 0.35,
                    borderRadius: '8px',
                    py: 0.75,
                    px: 1.25,
                    position: 'relative',
                    transition: 'all 0.15s ease-in-out',
                    bgcolor: on ? (t) => t.palette.mode === 'dark' ? 'rgba(32,178,170,.18)' : 'rgba(23,143,137,.10)' : 'transparent',
                    '&:hover': {
                      bgcolor: on ? (t) => t.palette.mode === 'dark' ? 'rgba(32,178,170,.22)' : 'rgba(23,143,137,.14)' : 'action.hover',
                    },
                  }}
                >
                  {on && (
                    <Box
                      sx={{
                        position: 'absolute',
                        left: 0,
                        top: '20%',
                        bottom: '20%',
                        width: 3.5,
                        bgcolor: '#178f89',
                        borderRadius: '0 4px 4px 0',
                      }}
                    />
                  )}
                  <ListItemIcon sx={{ minWidth: 32, color: on ? '#178f89' : 'text.secondary', '& svg': { fontSize: 19 } }}>
                    {m.icon}
                  </ListItemIcon>
                  <ListItemText
                    primary={m.label}
                    primaryTypographyProps={{
                      fontSize: 13,
                      fontWeight: on ? 700 : 500,
                      color: on ? 'text.primary' : 'text.secondary',
                      noWrap: true,
                    }}
                  />
                  {m.badge && (
                    <Chip size="small" label={m.badge} sx={{ height: 18, fontSize: 11, fontWeight: 700, bgcolor: 'action.hover' }} />
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
        <ListItemButton onClick={() => navigate('/')} sx={{ borderRadius: '8px', py: 0.75, '&:hover': { bgcolor: 'action.hover' } }}>
          <ListItemIcon sx={{ minWidth: 32, color: 'text.secondary' }}><ArrowBackIcon sx={{ fontSize: 18 }} /></ListItemIcon>
          <ListItemText primary="Voltar ao app do paciente" primaryTypographyProps={{ fontSize: 12.5, fontWeight: 600 }} />
        </ListItemButton>
        <ListItemButton onClick={logout} sx={{ borderRadius: '8px', py: 0.75, color: 'error.main', '&:hover': { bgcolor: 'rgba(239, 68, 68, 0.08)' } }}>
          <ListItemIcon sx={{ minWidth: 32, color: 'error.main' }}><LogoutIcon sx={{ fontSize: 18 }} /></ListItemIcon>
          <ListItemText primary="Sair do backoffice" primaryTypographyProps={{ fontSize: 12.5, fontWeight: 700 }} />
        </ListItemButton>
      </List>
    </Box>
  );

  const active = MODULES.find((m) => m.id === mod);

  return (
    <Box sx={{ display: 'flex', minHeight: '100dvh', bgcolor: (t) => t.palette.mode === 'dark' ? 'background.default' : '#f8fafc' }}>
      <Title title="Backoffice · Dr. Exame" />

      {/* Sidebar Desktop / Drawer Mobile */}
      {isDesktop ? (
        <Box component="aside" sx={{ width: 270, position: 'sticky', top: 0, height: '100dvh', flexShrink: 0, borderRight: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
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
        {/* Topbar Glassmorphic */}
        <AppBar
          position="sticky"
          elevation={0}
          sx={{
            bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(18,24,27,0.88)' : 'rgba(255,255,255,0.88)',
            backdropFilter: 'blur(16px)',
            color: 'text.primary',
            borderBottom: 1,
            borderColor: 'divider',
            pt: 'env(safe-area-inset-top)',
          }}
        >
          <Toolbar variant="dense" sx={{ gap: 1.5, minHeight: { xs: 56, sm: 60 }, px: { xs: 1.5, sm: 2.5 } }}>
            {!isDesktop && (
              <IconButton onClick={() => setDrawerOpen(true)} sx={{ color: 'text.secondary' }} aria-label="Abrir menu">
                <MenuIcon />
              </IconButton>
            )}

            <Stack direction="row" spacing={1.25} alignItems="center" sx={{ minWidth: 0 }}>
              <Box
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: '8px',
                  bgcolor: 'rgba(23, 143, 137, 0.1)',
                  color: '#178f89',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  '& svg': { fontSize: 19 },
                }}
              >
                {active?.icon}
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Stack direction="row" spacing={0.75} alignItems="center">
                  <Typography variant="caption" sx={{ color: 'text.disabled', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', display: { xs: 'none', sm: 'inline-block' } }}>
                    {active?.group} /
                  </Typography>
                  <Typography noWrap sx={{ fontWeight: 800, fontSize: { xs: 14.5, sm: 16 }, fontFamily: '"Poppins",sans-serif', color: 'text.primary' }}>
                    {isSmall && active?.short ? active.short : active?.label}
                  </Typography>
                </Stack>
              </Box>
            </Stack>

            <Box sx={{ flex: 1 }} />

            {/* Enterprise Status & Quick KPI Capsules */}
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="nowrap">
              <Chip
                size="small"
                icon={<Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: '#22c55e', ml: '6px !important' }} />}
                label="Online"
                sx={{
                  display: { xs: 'none', md: 'inline-flex' },
                  height: 26,
                  fontSize: 11,
                  fontWeight: 700,
                  bgcolor: 'rgba(34, 197, 94, 0.08)',
                  color: '#166534',
                  border: '1px solid rgba(34, 197, 94, 0.2)',
                }}
              />

              {stats && (
                <Stack direction="row" spacing={0.75} useFlexGap flexWrap="nowrap" sx={{ overflowX: 'auto' }}>
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.6,
                      px: 1.25,
                      py: 0.4,
                      borderRadius: '8px',
                      bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : '#f1f5f9',
                      border: '1px solid',
                      borderColor: 'divider',
                    }}
                  >
                    <Typography sx={{ fontSize: 12 }}>👥</Typography>
                    <Typography sx={{ fontSize: 12, fontWeight: 800, fontFamily: 'monospace' }}>
                      {stats.users}
                    </Typography>
                    <Typography sx={{ fontSize: 11, color: 'text.secondary', display: { xs: 'none', lg: 'inline' } }}>
                      usuários
                    </Typography>
                  </Box>

                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.6,
                      px: 1.25,
                      py: 0.4,
                      borderRadius: '8px',
                      bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : '#f1f5f9',
                      border: '1px solid',
                      borderColor: 'divider',
                    }}
                  >
                    <Typography sx={{ fontSize: 12 }}>📋</Typography>
                    <Typography sx={{ fontSize: 12, fontWeight: 800, fontFamily: 'monospace' }}>
                      {stats.exams}
                    </Typography>
                    <Typography sx={{ fontSize: 11, color: 'text.secondary', display: { xs: 'none', lg: 'inline' } }}>
                      exames
                    </Typography>
                  </Box>

                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.6,
                      px: 1.25,
                      py: 0.4,
                      borderRadius: '8px',
                      bgcolor: 'rgba(23, 143, 137, 0.1)',
                      border: '1px solid rgba(23, 143, 137, 0.25)',
                      color: '#178f89',
                    }}
                  >
                    <Typography sx={{ fontSize: 12 }}>💰</Typography>
                    <Typography sx={{ fontSize: 12, fontWeight: 800, fontFamily: 'monospace', color: '#0d5f5a' }}>
                      R$ {Number(stats.revenue ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </Typography>
                  </Box>
                </Stack>
              )}
            </Stack>
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
            {mod === 'teleconsultas' && <TeleconsultasTab />}
            {mod === 'telefinance' && <TeleFinanceTab />}
            {mod === 'labs' && <LabsTab />}
            {mod === 'pharmacies' && <PharmaciesTab />}
            {mod === 'ia' && <IaTab />}
            {mod === 'usage' && <UsageTab />}
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
              <Typography sx={{ fontSize: 12, fontWeight: on ? 800 : 600, mt: 0.25, fontFamily: '"Poppins",sans-serif' }}>
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
          <Typography sx={{ fontSize: 12, fontWeight: 700, mt: 0.25, fontFamily: '"Poppins",sans-serif' }}>Mais</Typography>
          <Box sx={{ height: 3 }} />
        </Box>
      </Box>
    </Box>
  );
};
