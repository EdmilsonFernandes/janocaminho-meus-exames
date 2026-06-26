import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Box, Typography, Stack, Chip, Tabs, Tab, CircularProgress } from '@mui/material';
import { Title } from 'react-admin';
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined';
import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import { API_URL, token } from '../../config';
import { OverviewTab } from './OverviewTab';
import { UsersTab } from './UsersTab';
import { FinanceiroTab } from './FinanceiroTab';
import { PricingTab } from './PricingTab';
import { SecurityTab } from './SecurityTab';

type TabId = 'overview' | 'users' | 'financeiro' | 'pricing' | 'security';

const TABS: { id: TabId; label: string; icon: ReactElement }[] = [
  { id: 'overview', label: 'Visão geral', icon: <InsightsOutlinedIcon /> },
  { id: 'users', label: 'Usuários', icon: <PeopleOutlinedIcon /> },
  { id: 'financeiro', label: 'Pagamentos', icon: <PaymentsOutlinedIcon /> },
  { id: 'pricing', label: 'Planos', icon: <TuneOutlinedIcon /> },
  { id: 'security', label: 'Segurança', icon: <ShieldOutlinedIcon /> },
];

export const AdminPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = searchParams.get('tab') as TabId | null;
  const [tab, setTab] = useState<TabId>(TABS.some(t => t.id === urlTab) ? (urlTab as TabId) : 'overview');
  const [stats, setStats] = useState<any>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const onTabChange = (_e: unknown, id: TabId) => { setTab(id); setSearchParams({ tab: id }); };

  useEffect(() => {
    (async () => {
      try {
        // KPIs: pega stats do endpoint de usuários (limit=1, barato). stats.users = total (não filtrado).
        const r = await fetch(`${API_URL}/admin/users?limit=1`, { headers: { Authorization: `Bearer ${token()}` } });
        if (r.ok) setStats((await r.json()).stats);
      } catch { /* KPI é enfeite; falhou = sem chips */ }
      setStatsLoading(false);
    })();
  }, []);

  return (
    <Box sx={{ p: { xs: 1.5, md: 3 }, maxWidth: 1100, width: '100%', mx: 'auto' }}>
      <Title title="Admin" />
      <Typography variant="h5" sx={{ fontWeight: 800, mb: 0.5 }}>⚙️ Painel Admin</Typography>
      {statsLoading ? (
        <Box sx={{ mb: 2 }}><CircularProgress size={16} /></Box>
      ) : stats && (
        <Stack direction="row" spacing={1} sx={{ mb: 2 }} useFlexGap flexWrap="wrap">
          <Chip label={`👤 ${stats.users} usuários`} color="primary" size="small" />
          <Chip label={`📋 ${stats.exams} exames`} color="secondary" size="small" />
          <Chip label={`💳 ${stats.subscriptions} pagamentos`} color="info" size="small" />
          <Chip label={`💰 R$ ${(stats.revenue ?? 0).toFixed(2).replace('.', ',')} aprovado`} color="success" size="small" />
        </Stack>
      )}
      <Tabs value={tab} onChange={onTabChange} variant="fullWidth"
        sx={{ mb: 2, minHeight: { xs: 58, sm: 52 }, borderBottom: 1, borderColor: 'divider',
          '& .MuiTab-root': { minHeight: { xs: 58, sm: 52 }, maxWidth: 'none', textTransform: 'none', fontWeight: 700, fontSize: { xs: 10.5, sm: 14 }, px: { xs: 0.5, sm: 2 } },
          '& .MuiTab-iconWrapper, & .MuiSvgIcon-root': { fontSize: { xs: 19, sm: 24 }, mb: 0.25 },
          '& .MuiTab-wrapped': { fontSize: { xs: 10.5, sm: 14 }, lineHeight: 1.15 } }}>
        {TABS.map(t => <Tab key={t.id} value={t.id} icon={t.icon} iconPosition="top" label={t.label} />)}
      </Tabs>

      {tab === 'overview' && <OverviewTab />}
      {tab === 'users' && <UsersTab />}
      {tab === 'financeiro' && <FinanceiroTab />}
      {tab === 'pricing' && <PricingTab />}
      {tab === 'security' && <SecurityTab />}
    </Box>
  );
};
