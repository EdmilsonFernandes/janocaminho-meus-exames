import { useEffect, useState, useMemo } from 'react';
import {
  Box, Typography, Stack, Card, CardContent, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, LinearProgress, Button, Tooltip,
  TextField, InputAdornment, IconButton, Dialog, DialogTitle, DialogContent,
  DialogActions, Divider, Alert, CircularProgress,
} from '@mui/material';
import CardGiftcardIcon from '@mui/icons-material/CardGiftcard';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import WorkspacePremiumOutlinedIcon from '@mui/icons-material/WorkspacePremiumOutlined';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import DownloadIcon from '@mui/icons-material/Download';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import VisibilityIcon from '@mui/icons-material/Visibility';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import StarIcon from '@mui/icons-material/Star';
import { API_URL, token } from '../../config';

interface ReferralStats {
  totalReferred: number;
  verifiedReferred: number;
  withExams: number;
  premiumReferred: number;
  totalBonus: number;
  conversionRate: number;
  examRate: number;
}

interface TopReferrer {
  referralCode: string;
  count: number;
  userName: string;
  userEmail: string;
  userCredits: number;
}

interface RecentReferral {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  emailVerified: boolean;
  isPremium: boolean;
  examCount: number;
  credits: number;
  referredByCode: string;
  referrerName: string;
  referrerEmail: string;
}

interface ReferralData {
  stats: ReferralStats;
  topReferrers: TopReferrer[];
  recent: RecentReferral[];
}

interface PromoterDetail {
  promoter: { id?: string; name: string; email: string; referralCode: string; credits: number };
  totalInvitees: number;
  verifiedCount: number;
  withExamsCount: number;
  premiumCount: number;
  invitees: Array<{
    id: string;
    name: string;
    email: string;
    createdAt: string;
    emailVerified: boolean;
    isPremium: boolean;
    examCount: number;
    credits: number;
  }>;
}

const fmtDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
};

export const ReferralTab = ({ onGoToConfig }: { onGoToConfig?: () => void }) => {
  const [data, setData] = useState<ReferralData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Filtros
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'verified' | 'exams' | 'premium'>('all');

  // Modal de Detalhes do Promotor
  const [selectedPromoterCode, setSelectedPromoterCode] = useState<string | null>(null);
  const [promoterDetail, setPromoterDetail] = useState<PromoterDetail | null>(null);
  const [loadingPromoter, setLoadingPromoter] = useState(false);

  // Modal/Form de Bônus
  const [bonusAmount, setBonusAmount] = useState<number>(20);
  const [bonusReason, setBonusReason] = useState('Bônus por destaque em indicações');
  const [awardingBonus, setAwardingBonus] = useState(false);
  const [bonusSuccessMsg, setBonusSuccessMsg] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    fetch(`${API_URL}/admin/referrals`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const copy = (txt: string) => {
    try {
      navigator.clipboard.writeText(txt);
      setCopiedCode(txt);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch {}
  };

  // Carregar detalhes do promotor selecionado
  const openPromoterDetail = async (code: string) => {
    setSelectedPromoterCode(code);
    setLoadingPromoter(true);
    setBonusSuccessMsg(null);
    try {
      const r = await fetch(`${API_URL}/admin/referrals/promoter/${encodeURIComponent(code)}`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (r.ok) {
        setPromoterDetail(await r.json());
      } else {
        setPromoterDetail(null);
      }
    } catch {
      setPromoterDetail(null);
    } finally {
      setLoadingPromoter(false);
    }
  };

  // Conceder bônus para o promotor
  const handleAwardBonus = async () => {
    if (!promoterDetail?.promoter?.id || bonusAmount <= 0) return;
    setAwardingBonus(true);
    try {
      const r = await fetch(`${API_URL}/admin/referrals/award-bonus`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token()}`,
        },
        body: JSON.stringify({
          userId: promoterDetail.promoter.id,
          delta: bonusAmount,
          reason: bonusReason,
        }),
      });
      if (r.ok) {
        const res = await r.json();
        setBonusSuccessMsg(`+${res.added} créditos concedidos! Novo saldo: ${res.credits}`);
        // Atualiza o saldo local no modal
        setPromoterDetail((prev) => prev ? {
          ...prev,
          promoter: { ...prev.promoter, credits: res.credits },
        } : null);
        load();
      }
    } catch (e) {
      alert('Erro ao conceder bônus.');
    } finally {
      setAwardingBonus(false);
    }
  };

  // Exportar dados em CSV
  const handleExportCSV = () => {
    if (!data?.recent) return;
    const headers = ['ID', 'Nome', 'Email', 'Data Cadastro', 'Email Verificado', 'Premium', 'Exames Enviados', 'Creditos', 'Codigo Usado', 'Nome Padrinho', 'Email Padrinho'];
    const rows = data.recent.map((u) => [
      `"${u.id}"`,
      `"${u.name.replace(/"/g, '""')}"`,
      `"${u.email}"`,
      `"${u.createdAt}"`,
      u.emailVerified ? 'SIM' : 'NAO',
      u.isPremium ? 'SIM' : 'NAO',
      u.examCount,
      u.credits,
      `"${u.referredByCode}"`,
      `"${(u.referrerName || '').replace(/"/g, '""')}"`,
      `"${u.referrerEmail || ''}"`,
    ]);

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `indicacoes-dr-exame-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filtragem dos recentes
  const filteredRecent = useMemo(() => {
    if (!data?.recent) return [];
    return data.recent.filter((u) => {
      // Filtro de status
      if (statusFilter === 'verified' && !u.emailVerified) return false;
      if (statusFilter === 'exams' && u.examCount === 0) return false;
      if (statusFilter === 'premium' && !u.isPremium) return false;

      // Filtro de busca
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.referredByCode.toLowerCase().includes(q) ||
        (u.referrerName && u.referrerName.toLowerCase().includes(q))
      );
    });
  }, [data, searchQuery, statusFilter]);

  // Filtragem dos top promotores
  const filteredPromoters = useMemo(() => {
    if (!data?.topReferrers) return [];
    if (!searchQuery) return data.topReferrers;
    const q = searchQuery.toLowerCase().trim();
    return data.topReferrers.filter(
      (p) =>
        p.userName.toLowerCase().includes(q) ||
        p.userEmail.toLowerCase().includes(q) ||
        p.referralCode.toLowerCase().includes(q)
    );
  }, [data, searchQuery]);

  if (loading) {
    return (
      <Box sx={{ py: 6, textAlign: 'center' }}>
        <LinearProgress sx={{ borderRadius: 2, height: 6, bgcolor: 'rgba(32,178,170,0.12)', '& .MuiLinearProgress-bar': { bgcolor: '#20b2aa' } }} />
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>Carregando dados de indicações...</Typography>
      </Box>
    );
  }

  if (!data) {
    return (
      <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
        Não foi possível carregar os dados do programa de indicação.
      </Typography>
    );
  }

  const { stats, topReferrers, recent } = data;

  return (
    <Stack spacing={3}>
      {/* ── HEADER & AÇÕES ── */}
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, gap: 1.5 }}>
        <Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <CardGiftcardIcon sx={{ color: '#20b2aa', fontSize: 28 }} />
            <Typography variant="h6" sx={{ fontWeight: 800, fontFamily: '"Poppins",sans-serif' }}>
              Indicações & Crescimento (MGM)
            </Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary">
            Rastreie quem indicou quem, promotores de destaque e taxa de conversão orgânica em tempo real.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} flexWrap="wrap">
          <Button
            variant="outlined"
            size="small"
            onClick={handleExportCSV}
            startIcon={<DownloadIcon />}
            sx={{ borderRadius: '10px', textTransform: 'none', fontWeight: 700, borderColor: 'divider' }}
          >
            Exportar CSV
          </Button>
          {onGoToConfig && (
            <Button
              variant="contained"
              size="small"
              onClick={onGoToConfig}
              startIcon={<SettingsOutlinedIcon />}
              sx={{ borderRadius: '10px', textTransform: 'none', fontWeight: 700, bgcolor: '#178f89', '&:hover': { bgcolor: '#0f766e' } }}
            >
              Configurar Programa
            </Button>
          )}
        </Stack>
      </Box>

      {/* ── KPI CARDS ── */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, 1fr)', md: 'repeat(5, 1fr)' }, gap: 1.5 }}>
        <Card variant="outlined" sx={{ borderRadius: '16px', bgcolor: 'background.paper' }}>
          <CardContent sx={{ p: 2 }}>
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block' }}>Total de Indicados</Typography>
            <Typography sx={{ fontSize: { xs: 24, sm: 28 }, fontWeight: 800, color: '#178f89', mt: 0.25, lineHeight: 1.1 }}>
              {stats.totalReferred.toLocaleString('pt-BR')}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>cadastros com código</Typography>
          </CardContent>
        </Card>

        <Card variant="outlined" sx={{ borderRadius: '16px', bgcolor: 'background.paper' }}>
          <CardContent sx={{ p: 2 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>Verificados</Typography>
              <CheckCircleOutlineIcon sx={{ fontSize: 16, color: 'success.main' }} />
            </Stack>
            <Typography sx={{ fontSize: { xs: 24, sm: 28 }, fontWeight: 800, color: '#047857', mt: 0.25, lineHeight: 1.1 }}>
              {stats.verifiedReferred.toLocaleString('pt-BR')}
            </Typography>
            <Typography variant="caption" sx={{ color: 'success.dark', fontWeight: 700, mt: 0.5, display: 'block' }}>
              {stats.conversionRate}% de conversão
            </Typography>
          </CardContent>
        </Card>

        <Card variant="outlined" sx={{ borderRadius: '16px', bgcolor: 'background.paper' }}>
          <CardContent sx={{ p: 2 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>Subiram Exame</Typography>
              <DescriptionOutlinedIcon sx={{ fontSize: 16, color: '#0369a1' }} />
            </Stack>
            <Typography sx={{ fontSize: { xs: 24, sm: 28 }, fontWeight: 800, color: '#0369a1', mt: 0.25, lineHeight: 1.1 }}>
              {stats.withExams.toLocaleString('pt-BR')}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, mt: 0.5, display: 'block' }}>
              {stats.examRate}% de ativação
            </Typography>
          </CardContent>
        </Card>

        <Card variant="outlined" sx={{ borderRadius: '16px', bgcolor: 'background.paper' }}>
          <CardContent sx={{ p: 2 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>Viraram Premium</Typography>
              <WorkspacePremiumOutlinedIcon sx={{ fontSize: 16, color: '#d4a574' }} />
            </Stack>
            <Typography sx={{ fontSize: { xs: 24, sm: 28 }, fontWeight: 800, color: '#b45309', mt: 0.25, lineHeight: 1.1 }}>
              {stats.premiumReferred.toLocaleString('pt-BR')}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>assinantes pagos</Typography>
          </CardContent>
        </Card>

        <Card variant="outlined" sx={{ borderRadius: '16px', bgcolor: 'background.paper', gridColumn: { xs: 'span 2', sm: 'auto' } }}>
          <CardContent sx={{ p: 2 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>Bônus Concedidos</Typography>
              <TrendingUpIcon sx={{ fontSize: 16, color: '#7c3aed' }} />
            </Stack>
            <Typography sx={{ fontSize: { xs: 24, sm: 28 }, fontWeight: 800, color: '#7c3aed', mt: 0.25, lineHeight: 1.1 }}>
              +{stats.totalBonus.toLocaleString('pt-BR')}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>créditos de IA liberados</Typography>
          </CardContent>
        </Card>
      </Box>

      {/* ── BARRA DE PESQUISA & FILTROS ── */}
      <Card variant="outlined" sx={{ borderRadius: '14px', p: 1.5, bgcolor: 'background.paper' }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', sm: 'center' }} justifyContent="space-between">
          <TextField
            size="small"
            placeholder="Buscar por nome, e-mail ou código de indicação..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                  </InputAdornment>
                ),
                endAdornment: searchQuery ? (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setSearchQuery('')}>
                      <CloseIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </InputAdornment>
                ) : undefined,
              },
            }}
            sx={{
              maxWidth: { sm: 380 },
              '& .MuiOutlinedInput-root': { borderRadius: '10px', fontSize: 13 },
            }}
          />

          <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
            <Chip
              label="Todos"
              size="small"
              onClick={() => setStatusFilter('all')}
              color={statusFilter === 'all' ? 'primary' : 'default'}
              variant={statusFilter === 'all' ? 'filled' : 'outlined'}
              sx={{ fontWeight: 700 }}
            />
            <Chip
              label="E-mail Verificado"
              size="small"
              onClick={() => setStatusFilter('verified')}
              color={statusFilter === 'verified' ? 'success' : 'default'}
              variant={statusFilter === 'verified' ? 'filled' : 'outlined'}
              sx={{ fontWeight: 700 }}
            />
            <Chip
              label="Com Exames"
              size="small"
              onClick={() => setStatusFilter('exams')}
              color={statusFilter === 'exams' ? 'info' : 'default'}
              variant={statusFilter === 'exams' ? 'filled' : 'outlined'}
              sx={{ fontWeight: 700 }}
            />
            <Chip
              label="Premium"
              size="small"
              onClick={() => setStatusFilter('premium')}
              color={statusFilter === 'premium' ? 'warning' : 'default'}
              variant={statusFilter === 'premium' ? 'filled' : 'outlined'}
              sx={{ fontWeight: 700 }}
            />
          </Stack>
        </Stack>
      </Card>

      {/* ── TOP PROMOTORES ── */}
      <Card variant="outlined" sx={{ borderRadius: '16px', overflow: 'hidden' }}>
        <Box sx={{ p: 2.5, pb: 1.5, borderBottom: 1, borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box>
            <Typography sx={{ fontWeight: 800, fontSize: 15 }}>🏆 Top Promotores (Usuários que mais indicam)</Typography>
            <Typography variant="caption" color="text.secondary">
              Clique em qualquer promotor para ver todos os indicados e gerenciar bônus.
            </Typography>
          </Box>
          <Chip label={`${filteredPromoters.length} promotores`} size="small" sx={{ fontWeight: 700 }} />
        </Box>
        <TableContainer sx={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <Table size="small" sx={{ minWidth: 640 }}>
            <TableHead>
              <TableRow sx={{ bgcolor: 'action.hover' }}>
                <TableCell sx={{ py: 1.25, fontWeight: 800 }}>#</TableCell>
                <TableCell sx={{ py: 1.25, fontWeight: 800 }}>Promotor (Padrinho)</TableCell>
                <TableCell sx={{ py: 1.25, fontWeight: 800 }}>Código</TableCell>
                <TableCell align="right" sx={{ py: 1.25, fontWeight: 800 }}>Total Indicados</TableCell>
                <TableCell align="right" sx={{ py: 1.25, fontWeight: 800 }}>Saldo Atual</TableCell>
                <TableCell align="center" sx={{ py: 1.25, fontWeight: 800 }}>Ações</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredPromoters.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} sx={{ py: 4, textAlign: 'center' }}>
                    <Typography variant="body2" color="text.secondary">Nenhum promotor encontrado com os filtros atuais.</Typography>
                  </TableCell>
                </TableRow>
              ) : (
                filteredPromoters.map((r, i) => (
                  <TableRow
                    key={r.referralCode}
                    hover
                    sx={{ cursor: 'pointer' }}
                    onClick={() => openPromoterDetail(r.referralCode)}
                  >
                    <TableCell sx={{ fontWeight: 800, color: i < 3 ? '#178f89' : 'text.secondary' }}>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}º`}
                    </TableCell>
                    <TableCell>
                      <Typography sx={{ fontWeight: 700, fontSize: 13.5 }}>{r.userName}</Typography>
                      <Typography variant="caption" color="text.secondary">{r.userEmail}</Typography>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Tooltip title={copiedCode === r.referralCode ? 'Copiado!' : 'Copiar código'}>
                        <Chip
                          label={r.referralCode}
                          size="small"
                          onClick={() => copy(r.referralCode)}
                          icon={<ContentCopyIcon sx={{ fontSize: '13px !important' }} />}
                          sx={{ fontFamily: 'monospace', fontWeight: 800, cursor: 'pointer' }}
                        />
                      </Tooltip>
                    </TableCell>
                    <TableCell align="right">
                      <Chip
                        label={`${r.count} indicados`}
                        size="small"
                        color={r.count >= 5 ? 'primary' : 'default'}
                        sx={{ fontWeight: 800 }}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Typography sx={{ fontWeight: 700, fontSize: 13, color: 'text.secondary' }}>
                        {r.userCredits.toLocaleString('pt-BR')} cr
                      </Typography>
                    </TableCell>
                    <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                      <Button
                        size="small"
                        variant="text"
                        startIcon={<VisibilityIcon fontSize="small" />}
                        onClick={() => openPromoterDetail(r.referralCode)}
                        sx={{ textTransform: 'none', fontWeight: 700, fontSize: 12 }}
                      >
                        Ver indicados
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      {/* ── ÚLTIMOS CADASTROS VIA INDICAÇÃO ── */}
      <Card variant="outlined" sx={{ borderRadius: '16px', overflow: 'hidden' }}>
        <Box sx={{ p: 2.5, pb: 1.5, borderBottom: 1, borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box>
            <Typography sx={{ fontWeight: 800, fontSize: 15 }}>⏱️ Últimos Usuários que Vieram de Indicação</Typography>
            <Typography variant="caption" color="text.secondary">
              Rastreamento de novos cadastros gerados por links de indicação.
            </Typography>
          </Box>
          <Chip label={`${filteredRecent.length} cadastros`} size="small" sx={{ fontWeight: 700 }} />
        </Box>
        <TableContainer sx={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <Table size="small" sx={{ minWidth: 680 }}>
            <TableHead>
              <TableRow sx={{ bgcolor: 'action.hover' }}>
                <TableCell sx={{ py: 1.25, fontWeight: 800 }}>Novo Usuário</TableCell>
                <TableCell sx={{ py: 1.25, fontWeight: 800 }}>Data</TableCell>
                <TableCell sx={{ py: 1.25, fontWeight: 800 }}>Status</TableCell>
                <TableCell sx={{ py: 1.25, fontWeight: 800 }}>Padrinho (Quem Indicou)</TableCell>
                <TableCell align="right" sx={{ py: 1.25, fontWeight: 800 }}>Exames</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredRecent.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} sx={{ py: 4, textAlign: 'center' }}>
                    <Typography variant="body2" color="text.secondary">Nenhum cadastro encontrado com os filtros atuais.</Typography>
                  </TableCell>
                </TableRow>
              ) : (
                filteredRecent.map((u) => (
                  <TableRow key={u.id} hover>
                    <TableCell>
                      <Typography sx={{ fontWeight: 700, fontSize: 13.5 }}>{u.name}</Typography>
                      <Typography variant="caption" color="text.secondary">{u.email}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography sx={{ fontSize: 12.5, color: 'text.secondary', whiteSpace: 'nowrap' }}>
                        {fmtDate(u.createdAt)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        {u.emailVerified ? (
                          <Chip label="Verificado" size="small" color="success" sx={{ height: 20, fontSize: 10.5, fontWeight: 700 }} />
                        ) : (
                          <Chip label="Pendente" size="small" sx={{ height: 20, fontSize: 10.5, fontWeight: 600 }} />
                        )}
                        {u.isPremium && (
                          <Chip label="Premium" size="small" sx={{ height: 20, fontSize: 10.5, fontWeight: 700, bgcolor: 'rgba(212,165,116,0.18)', color: '#b45309' }} />
                        )}
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Typography
                        sx={{ fontWeight: 700, fontSize: 13, cursor: 'pointer', color: '#178f89', '&:hover': { textDecoration: 'underline' } }}
                        onClick={() => openPromoterDetail(u.referredByCode)}
                      >
                        {u.referrerName}
                      </Typography>
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <Typography variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 700, color: 'text.secondary' }}>
                          [{u.referredByCode}]
                        </Typography>
                        {u.referrerEmail && (
                          <Typography variant="caption" color="text.secondary">· {u.referrerEmail}</Typography>
                        )}
                      </Stack>
                    </TableCell>
                    <TableCell align="right">
                      <Chip
                        label={u.examCount > 0 ? `${u.examCount} exame(s)` : 'Nenhum'}
                        size="small"
                        color={u.examCount > 0 ? 'info' : 'default'}
                        variant={u.examCount > 0 ? 'filled' : 'outlined'}
                        sx={{ fontWeight: 700, height: 22 }}
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      {/* ── MODAL: DETALHES DO PROMOTOR & SEUS INDICADOS ── */}
      <Dialog
        open={Boolean(selectedPromoterCode)}
        onClose={() => setSelectedPromoterCode(null)}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { borderRadius: '18px' } }}
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <StarIcon sx={{ color: '#f59e0b' }} />
            <Typography variant="h6" sx={{ fontWeight: 800 }}>
              Detalhes do Promotor
            </Typography>
          </Stack>
          <IconButton size="small" onClick={() => setSelectedPromoterCode(null)}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>

        <DialogContent dividers>
          {loadingPromoter ? (
            <Box sx={{ py: 6, textAlign: 'center' }}>
              <CircularProgress size={36} sx={{ color: '#178f89' }} />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
                Buscando rede de indicados...
              </Typography>
            </Box>
          ) : promoterDetail ? (
            <Stack spacing={2.5}>
              {/* Card Resumo do Promotor */}
              <Card variant="outlined" sx={{ borderRadius: '14px', p: 2, bgcolor: 'background.default' }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={2}>
                  <Box>
                    <Typography sx={{ fontWeight: 800, fontSize: 16 }}>{promoterDetail.promoter.name}</Typography>
                    <Typography variant="body2" color="text.secondary">{promoterDetail.promoter.email}</Typography>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
                      <Chip
                        label={promoterDetail.promoter.referralCode}
                        size="small"
                        icon={<ContentCopyIcon sx={{ fontSize: '13px !important' }} />}
                        onClick={() => copy(promoterDetail.promoter.referralCode)}
                        sx={{ fontFamily: 'monospace', fontWeight: 800 }}
                      />
                      <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                        Saldo: {promoterDetail.promoter.credits} créditos
                      </Typography>
                    </Stack>
                  </Box>

                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, minWidth: 220 }}>
                    <Box sx={{ p: 1, borderRadius: '8px', bgcolor: 'background.paper', border: 1, borderColor: 'divider', textAlign: 'center' }}>
                      <Typography variant="caption" color="text.secondary">Total Indicados</Typography>
                      <Typography sx={{ fontWeight: 800, fontSize: 18, color: '#178f89' }}>
                        {promoterDetail.totalInvitees}
                      </Typography>
                    </Box>
                    <Box sx={{ p: 1, borderRadius: '8px', bgcolor: 'background.paper', border: 1, borderColor: 'divider', textAlign: 'center' }}>
                      <Typography variant="caption" color="text.secondary">Com Exames</Typography>
                      <Typography sx={{ fontWeight: 800, fontSize: 18, color: '#0369a1' }}>
                        {promoterDetail.withExamsCount}
                      </Typography>
                    </Box>
                  </Box>
                </Stack>
              </Card>

              {/* Seção de Conceder Bônus */}
              <Card variant="outlined" sx={{ borderRadius: '14px', p: 2, bgcolor: 'rgba(124,58,237,0.04)', borderColor: 'rgba(124,58,237,0.2)' }}>
                <Typography sx={{ fontWeight: 800, fontSize: 14, color: '#7c3aed', mb: 1, display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <AddCircleOutlineIcon fontSize="small" /> Conceder Bônus Extra para este Promotor
                </Typography>
                {bonusSuccessMsg && (
                  <Alert severity="success" sx={{ mb: 1.5, py: 0.25, borderRadius: '10px' }}>
                    {bonusSuccessMsg}
                  </Alert>
                )}
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems="center">
                  <TextField
                    size="small"
                    type="number"
                    label="Créditos"
                    value={bonusAmount}
                    onChange={(e) => setBonusAmount(Math.max(1, Number(e.target.value)))}
                    sx={{ width: { xs: '100%', sm: 110 } }}
                  />
                  <TextField
                    size="small"
                    fullWidth
                    label="Motivo do Bônus"
                    value={bonusReason}
                    onChange={(e) => setBonusReason(e.target.value)}
                  />
                  <Button
                    variant="contained"
                    disabled={awardingBonus || !promoterDetail.promoter.id}
                    onClick={handleAwardBonus}
                    sx={{
                      borderRadius: '10px',
                      textTransform: 'none',
                      fontWeight: 800,
                      whiteSpace: 'nowrap',
                      bgcolor: '#7c3aed',
                      '&:hover': { bgcolor: '#6d28d9' },
                    }}
                  >
                    {awardingBonus ? 'Enviando...' : 'Creditador Bônus'}
                  </Button>
                </Stack>
              </Card>

              {/* Tabela de Indicados do Promotor */}
              <Box>
                <Typography sx={{ fontWeight: 800, fontSize: 14, mb: 1 }}>
                  👥 Pessoas Indicadas por este Código ({promoterDetail.invitees.length})
                </Typography>
                <TableContainer sx={{ maxHeight: 320, borderRadius: '12px', border: 1, borderColor: 'divider' }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 800 }}>Usuário</TableCell>
                        <TableCell sx={{ fontWeight: 800 }}>Cadastro</TableCell>
                        <TableCell sx={{ fontWeight: 800 }}>Status</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 800 }}>Exames</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {promoterDetail.invitees.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} sx={{ py: 3, textAlign: 'center' }}>
                            <Typography variant="body2" color="text.secondary">Nenhum convidado encontrado.</Typography>
                          </TableCell>
                        </TableRow>
                      ) : (
                        promoterDetail.invitees.map((inv) => (
                          <TableRow key={inv.id} hover>
                            <TableCell>
                              <Typography sx={{ fontWeight: 700, fontSize: 13 }}>{inv.name}</Typography>
                              <Typography variant="caption" color="text.secondary">{inv.email}</Typography>
                            </TableCell>
                            <TableCell>
                              <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
                                {fmtDate(inv.createdAt)}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Stack direction="row" spacing={0.5}>
                                {inv.emailVerified ? (
                                  <Chip label="Verificado" size="small" color="success" sx={{ height: 20, fontSize: 10, fontWeight: 700 }} />
                                ) : (
                                  <Chip label="Pendente" size="small" sx={{ height: 20, fontSize: 10 }} />
                                )}
                                {inv.isPremium && (
                                  <Chip label="Premium" size="small" sx={{ height: 20, fontSize: 10, fontWeight: 700, bgcolor: 'rgba(212,165,116,0.18)', color: '#b45309' }} />
                                )}
                              </Stack>
                            </TableCell>
                            <TableCell align="right">
                              <Chip
                                label={inv.examCount > 0 ? `${inv.examCount} exames` : '0'}
                                size="small"
                                color={inv.examCount > 0 ? 'info' : 'default'}
                                sx={{ height: 20, fontSize: 10.5, fontWeight: 700 }}
                              />
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            </Stack>
          ) : (
            <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
              Dados do promotor não encontrados.
            </Typography>
          )}
        </DialogContent>

        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setSelectedPromoterCode(null)} sx={{ textTransform: 'none', fontWeight: 700 }}>
            Fechar
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
};
