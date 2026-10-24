import { useCallback, useEffect, useState, useMemo } from 'react';
import {
  Box,
  Stack,
  Typography,
  Button,
  TextField,
  MenuItem,
  TableContainer,
  Paper,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  Avatar,
  Tooltip,
  InputAdornment,
} from '@mui/material';
import { useNotify } from 'react-admin';
import DownloadIcon from '@mui/icons-material/Download';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import { API_URL, token } from '../../config';
import { TabLoader, SectionError } from './parts';

const PAGE_SIZE = 20;
const authH = () => ({ Authorization: `Bearer ${token()}` });

interface StatusConfig {
  label: string;
  dotColor: string;
  bg: string;
  text: string;
  border: string;
}

const statusConfigMap: Record<string, StatusConfig> = {
  APPROVED: {
    label: 'Aprovado',
    dotColor: '#16a34a',
    bg: 'rgba(22, 163, 74, 0.08)',
    text: '#15803d',
    border: '1px solid rgba(22, 163, 74, 0.25)',
  },
  PENDING: {
    label: 'Pendente',
    dotColor: '#d97706',
    bg: 'rgba(217, 119, 6, 0.08)',
    text: '#b45309',
    border: '1px solid rgba(217, 119, 6, 0.25)',
  },
  CANCELLED: {
    label: 'Cancelado',
    dotColor: '#64748b',
    bg: 'rgba(100, 116, 139, 0.08)',
    text: '#475569',
    border: '1px solid rgba(100, 116, 139, 0.2)',
  },
  FAILED: {
    label: 'Falhou',
    dotColor: '#dc2626',
    bg: 'rgba(220, 38, 38, 0.08)',
    text: '#b91c1c',
    border: '1px solid rgba(220, 38, 38, 0.25)',
  },
};

const getStatusConfig = (status: string): StatusConfig => {
  return (
    statusConfigMap[status] || {
      label: status || 'Indefinido',
      dotColor: '#64748b',
      bg: 'rgba(100, 116, 139, 0.08)',
      text: '#475569',
      border: '1px solid rgba(100, 116, 139, 0.2)',
    }
  );
};

const buildParams = (page: number, status: string, type: string, q: string) => {
  const p = new URLSearchParams({ page: String(page) });
  if (status) p.set('status', status);
  if (type) p.set('type', type);
  if (q) p.set('q', q);
  return p.toString();
};

const downloadCsv = (rows: any[]) => {
  const header = ['Data', 'Usuário', 'Valor', 'Tipo', 'Status', 'Referência'];
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = rows.map((p) => [
    new Date(p.createdAt).toLocaleDateString('pt-BR'),
    esc(p.user?.email ?? ''),
    Number(p.amount ?? 0).toFixed(2).replace('.', ','),
    p.periodDays > 0 ? 'Mensal' : 'Créditos',
    p.status ?? '',
    p.mpPaymentId ?? '',
  ].join(';'));
  const csv = [header.join(';'), ...lines].join('\r\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'pagamentos_drexame.csv';
  a.click();
  URL.revokeObjectURL(url);
};

export const FinanceiroTab = () => {
  const notify = useNotify();
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  const [committedQ, setCommittedQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ payments: any[]; total: number; hasMore: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [payloadRow, setPayloadRow] = useState<any | null>(null);
  const [sortBy, setSortBy] = useState<'date' | 'amount'>('date');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const r = await fetch(`${API_URL}/admin/payments?${buildParams(page, status, type, committedQ)}`, {
        headers: authH(),
      });
      if (r.ok) {
        const d = await r.json();
        setData({ payments: d.payments ?? [], total: d.total ?? 0, hasMore: !!d.hasMore });
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    }
    setLoading(false);
  }, [page, status, type, committedQ]);

  useEffect(() => {
    void load();
  }, [load]);

  // Debounce da busca por e-mail
  useEffect(() => {
    const t = setTimeout(() => {
      setCommittedQ(q);
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [q]);

  const handleCopy = (text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedId(text);
    notify('Código de referência copiado!', { type: 'info' });
    setTimeout(() => setCopiedId(null), 2000);
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const all: any[] = [];
      let p = 1;
      while (p <= 50) {
        const r = await fetch(`${API_URL}/admin/payments?${buildParams(p, status, type, committedQ)}`, {
          headers: authH(),
        });
        if (!r.ok) break;
        const d = await r.json();
        all.push(...(d.payments ?? []));
        if (!d.hasMore) break;
        p++;
      }
      if (all.length === 0) {
        notify('Nada para exportar.', { type: 'info' });
      } else {
        downloadCsv(all);
        notify(`${all.length} pagamento(s) exportado(s).`, { type: 'success' });
      }
    } catch {
      notify('Falha no export.', { type: 'error' });
    }
    setExporting(false);
  };

  // KPIs calculados da página ou acumulados
  const kpis = useMemo(() => {
    const list = data?.payments ?? [];
    let approvedTotal = 0;
    let approvedCount = 0;
    let pendingCount = 0;
    let pendingTotal = 0;
    let failCancelCount = 0;

    for (const p of list) {
      const amt = Number(p.amount ?? 0);
      if (p.status === 'APPROVED') {
        approvedTotal += amt;
        approvedCount++;
      } else if (p.status === 'PENDING') {
        pendingCount++;
        pendingTotal += amt;
      } else if (p.status === 'CANCELLED' || p.status === 'FAILED') {
        failCancelCount++;
      }
    }

    return {
      approvedTotal,
      approvedCount,
      pendingCount,
      pendingTotal,
      failCancelCount,
      totalListed: list.length,
    };
  }, [data?.payments]);

  if (loading && !data) return <TabLoader />;
  if (error && !data)
    return <SectionError message="Não foi possível carregar os pagamentos." onRetry={() => void load()} />;

  // SORTING: data (mais recente) ou valor (maior primeiro)
  const sorted = [...(data?.payments ?? [])].sort((a, b) => {
    if (sortBy === 'amount') return Number(b.amount ?? 0) - Number(a.amount ?? 0);
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
  const payments = sorted;
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);

  return (
    <Box>
      {/* 1. EXECUTIVE KPI SUMMARY CARDS (Top-Tier SaaS Standard) */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(4, 1fr)' },
          gap: 1.5,
          mb: 2.5,
        }}
      >
        {/* KPI 1: Faturamento Confirmado */}
        <Paper
          elevation={0}
          sx={{
            p: 2,
            borderRadius: '12px',
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: 'background.paper',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, textTransform: 'uppercase', fontSize: 11, letterSpacing: '0.04em' }}>
              Receita na Página
            </Typography>
            <Box sx={{ width: 28, height: 28, borderRadius: '6px', bgcolor: 'rgba(22, 163, 74, 0.1)', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TrendingUpIcon sx={{ fontSize: 18 }} />
            </Box>
          </Stack>
          <Typography variant="h5" sx={{ fontWeight: 800, mt: 0.75, fontFamily: 'monospace', color: '#15803d' }}>
            R$ {kpis.approvedTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25 }}>
            {kpis.approvedCount} pagamento(s) aprovado(s)
          </Typography>
        </Paper>

        {/* KPI 2: Transações Aprovadas */}
        <Paper
          elevation={0}
          sx={{
            p: 2,
            borderRadius: '12px',
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: 'background.paper',
          }}
        >
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, textTransform: 'uppercase', fontSize: 11, letterSpacing: '0.04em' }}>
              Vendas Concluídas
            </Typography>
            <Box sx={{ width: 28, height: 28, borderRadius: '6px', bgcolor: 'rgba(23, 143, 137, 0.1)', color: '#178f89', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CheckCircleOutlineIcon sx={{ fontSize: 18 }} />
            </Box>
          </Stack>
          <Typography variant="h5" sx={{ fontWeight: 800, mt: 0.75, fontFamily: 'monospace', color: 'text.primary' }}>
            {kpis.approvedCount} / {kpis.totalListed}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25 }}>
            Taxa de aprovação: {kpis.totalListed > 0 ? Math.round((kpis.approvedCount / kpis.totalListed) * 100) : 0}%
          </Typography>
        </Paper>

        {/* KPI 3: Em Aberto / Pendentes */}
        <Paper
          elevation={0}
          sx={{
            p: 2,
            borderRadius: '12px',
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: 'background.paper',
          }}
        >
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, textTransform: 'uppercase', fontSize: 11, letterSpacing: '0.04em' }}>
              Aguardando PIX / Cartão
            </Typography>
            <Box sx={{ width: 28, height: 28, borderRadius: '6px', bgcolor: 'rgba(217, 119, 6, 0.1)', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <HourglassEmptyIcon sx={{ fontSize: 18 }} />
            </Box>
          </Stack>
          <Typography variant="h5" sx={{ fontWeight: 800, mt: 0.75, fontFamily: 'monospace', color: '#b45309' }}>
            {kpis.pendingCount}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25 }}>
            R$ {kpis.pendingTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} em aberto
          </Typography>
        </Paper>

        {/* KPI 4: Cancelados / Falhas */}
        <Paper
          elevation={0}
          sx={{
            p: 2,
            borderRadius: '12px',
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: 'background.paper',
          }}
        >
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, textTransform: 'uppercase', fontSize: 11, letterSpacing: '0.04em' }}>
              Cancelados / Não Pagos
            </Typography>
            <Box sx={{ width: 28, height: 28, borderRadius: '6px', bgcolor: 'rgba(100, 116, 139, 0.1)', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CancelOutlinedIcon sx={{ fontSize: 18 }} />
            </Box>
          </Stack>
          <Typography variant="h5" sx={{ fontWeight: 800, mt: 0.75, fontFamily: 'monospace', color: 'text.secondary' }}>
            {kpis.failCancelCount}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25 }}>
            Tentativas abandonadas ou expiradas
          </Typography>
        </Paper>
      </Box>

      {/* 2. FILTERS TOOLBAR */}
      <Paper
        elevation={0}
        sx={{
          p: 1.5,
          mb: 2,
          borderRadius: '12px',
          border: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper',
        }}
      >
        <Stack direction="row" spacing={1.25} useFlexGap flexWrap="wrap" alignItems="center">
          {/* Status Dropdown */}
          <TextField
            select
            size="small"
            label="Status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            sx={{
              minWidth: 150,
              '& .MuiOutlinedInput-root': { borderRadius: '8px', fontSize: 13 },
            }}
          >
            <MenuItem value="">Todos os status</MenuItem>
            <MenuItem value="APPROVED">🟢 Aprovado</MenuItem>
            <MenuItem value="PENDING">🟡 Pendente</MenuItem>
            <MenuItem value="CANCELLED">⚪ Cancelado</MenuItem>
            <MenuItem value="FAILED">🔴 Falhou</MenuItem>
          </TextField>

          {/* Tipo Dropdown */}
          <TextField
            select
            size="small"
            label="Tipo"
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setPage(1);
            }}
            sx={{
              minWidth: 140,
              '& .MuiOutlinedInput-root': { borderRadius: '8px', fontSize: 13 },
            }}
          >
            <MenuItem value="">Todos os tipos</MenuItem>
            <MenuItem value="mensal">💎 Mensal</MenuItem>
            <MenuItem value="creditos">⚡ Créditos</MenuItem>
          </TextField>

          {/* Busca por E-mail */}
          <TextField
            size="small"
            placeholder="Buscar por e-mail..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                  </InputAdornment>
                ),
                endAdornment: q ? (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setQ('')}>
                      <CloseIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </InputAdornment>
                ) : undefined,
              },
            }}
            sx={{
              minWidth: { xs: '100%', sm: 220 },
              flex: { sm: 1 },
              '& .MuiOutlinedInput-root': { borderRadius: '8px', fontSize: 13 },
            }}
          />

          {/* Ordenar */}
          <TextField
            select
            size="small"
            label="Ordenar"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'date' | 'amount')}
            sx={{
              minWidth: 130,
              '& .MuiOutlinedInput-root': { borderRadius: '8px', fontSize: 13 },
            }}
          >
            <MenuItem value="date">Data mais recente ↓</MenuItem>
            <MenuItem value="amount">Maior valor ↓</MenuItem>
          </TextField>

          {/* Exportar CSV */}
          <Button
            startIcon={<DownloadIcon sx={{ fontSize: 18 }} />}
            variant="outlined"
            size="small"
            onClick={() => void exportCsv()}
            disabled={exporting}
            sx={{
              borderRadius: '8px',
              textTransform: 'none',
              fontWeight: 700,
              fontSize: 13,
              px: 2,
              height: 40,
              borderColor: 'rgba(23, 143, 137, 0.4)',
              color: '#178f89',
              '&:hover': {
                borderColor: '#178f89',
                bgcolor: 'rgba(23, 143, 137, 0.04)',
              },
            }}
          >
            {exporting ? 'Exportando…' : 'Exportar CSV'}
          </Button>
        </Stack>
      </Paper>

      {error && (
        <Box sx={{ mb: 2 }}>
          <SectionError message="Falha ao atualizar pagamentos." onRetry={() => void load()} />
        </Box>
      )}

      {/* 3. MOBILE/TABLET VIEW (Cards) */}
      <Stack spacing={1.25} sx={{ display: { xs: 'flex', md: 'none' } }}>
        {payments.map((p) => {
          const cfg = getStatusConfig(p.status);
          const email = p.user?.email || '—';
          const initial = email.charAt(0).toUpperCase();

          return (
            <Paper
              key={p.id}
              elevation={0}
              sx={{
                p: 1.75,
                borderRadius: '12px',
                border: '1px solid',
                borderColor: 'divider',
                bgcolor: 'background.paper',
                transition: 'box-shadow .2s ease',
                '&:hover': { boxShadow: '0 4px 14px rgba(0,0,0,0.06)' },
              }}
            >
              <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={1.5}>
                <Stack direction="row" spacing={1.25} alignItems="center" sx={{ minWidth: 0, flex: 1 }}>
                  <Avatar
                    sx={{
                      width: 34,
                      height: 34,
                      fontSize: 13,
                      fontWeight: 800,
                      bgcolor: 'rgba(23, 143, 137, 0.1)',
                      color: '#178f89',
                      border: '1px solid rgba(23, 143, 137, 0.2)',
                    }}
                  >
                    {initial}
                  </Avatar>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 700, fontSize: 13.5, wordBreak: 'break-word', lineHeight: 1.25 }}>
                      {email}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 11.5 }}>
                      {new Date(p.createdAt).toLocaleDateString('pt-BR')} às{' '}
                      {new Date(p.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </Typography>
                  </Box>
                </Stack>

                <Typography
                  sx={{
                    fontWeight: 800,
                    fontFamily: 'monospace',
                    fontSize: 15,
                    color: p.status === 'APPROVED' ? '#15803d' : 'text.primary',
                    whiteSpace: 'nowrap',
                  }}
                >
                  R$ {Number(p.amount ?? 0).toFixed(2).replace('.', ',')}
                </Typography>
              </Stack>

              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center" sx={{ mt: 1.5, pt: 1.25, borderTop: '1px solid', borderColor: 'divider' }}>
                <Box
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.6,
                    px: 1,
                    py: 0.3,
                    borderRadius: '6px',
                    bgcolor: cfg.bg,
                    border: cfg.border,
                  }}
                >
                  <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: cfg.dotColor }} />
                  <Typography sx={{ fontSize: 11.5, fontWeight: 700, color: cfg.text }}>
                    {cfg.label}
                  </Typography>
                </Box>

                <Chip
                  size="small"
                  label={p.periodDays > 0 ? 'Assinatura' : 'Créditos'}
                  sx={{
                    height: 22,
                    fontSize: 11,
                    fontWeight: 700,
                    bgcolor: p.periodDays > 0 ? 'rgba(147, 51, 234, 0.08)' : 'rgba(23, 143, 137, 0.08)',
                    color: p.periodDays > 0 ? '#7e22ce' : '#178f89',
                    borderRadius: '6px',
                  }}
                />

                {p.mpPaymentId && (
                  <Stack direction="row" spacing={0.5} alignItems="center" sx={{ ml: 'auto !important' }}>
                    <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.secondary', fontSize: 11 }}>
                      {p.mpPaymentId}
                    </Typography>
                    <IconButton size="small" onClick={() => handleCopy(p.mpPaymentId)} sx={{ p: 0.25 }}>
                      {copiedId === p.mpPaymentId ? (
                        <CheckIcon sx={{ fontSize: 14, color: 'success.main' }} />
                      ) : (
                        <ContentCopyIcon sx={{ fontSize: 13, color: 'text.disabled' }} />
                      )}
                    </IconButton>
                  </Stack>
                )}

                {p.rawWebhook && (
                  <IconButton size="small" onClick={() => setPayloadRow(p)} title="Ver payload do Mercado Pago" sx={{ ml: 0.5 }}>
                    <ReceiptLongIcon sx={{ fontSize: 16, color: '#178f89' }} />
                  </IconButton>
                )}
              </Stack>
            </Paper>
          );
        })}
        {payments.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
            Nenhum pagamento encontrado com os filtros selecionados.
          </Typography>
        )}
      </Stack>

      {/* 4. DESKTOP VIEW (Modern Enterprise Table) */}
      <TableContainer
        component={Paper}
        elevation={0}
        sx={{
          borderRadius: '12px',
          border: '1px solid',
          borderColor: 'divider',
          display: { xs: 'none', md: 'block' },
          bgcolor: 'background.paper',
          overflow: 'hidden',
        }}
      >
        <Table size="medium" sx={{ minWidth: 680 }}>
          <TableHead>
            <TableRow sx={{ bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : '#f8fafc' }}>
              <TableCell sx={{ fontWeight: 700, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'text.secondary', py: 1.5 }}>
                Data & Hora
              </TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'text.secondary', py: 1.5 }}>
                Usuário / Cliente
              </TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'text.secondary', py: 1.5 }}>
                Valor
              </TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'text.secondary', py: 1.5 }}>
                Tipo
              </TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'text.secondary', py: 1.5 }}>
                Status
              </TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'text.secondary', py: 1.5 }}>
                Referência
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {payments.map((p) => {
              const cfg = getStatusConfig(p.status);
              const email = p.user?.email || '—';
              const name = p.user?.name;
              const initial = email.charAt(0).toUpperCase();

              return (
                <TableRow
                  key={p.id}
                  hover
                  sx={{
                    transition: 'background-color 0.15s ease',
                    '&:hover': {
                      bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.04)' : '#f1f5f9 !important',
                    },
                  }}
                >
                  {/* Data & Hora */}
                  <TableCell sx={{ py: 1.5 }}>
                    <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'text.primary' }}>
                      {new Date(p.createdAt).toLocaleDateString('pt-BR')}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 11 }}>
                      {new Date(p.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </Typography>
                  </TableCell>

                  {/* Usuário / Cliente */}
                  <TableCell sx={{ py: 1.5, maxWidth: 240 }}>
                    <Stack direction="row" spacing={1.25} alignItems="center">
                      <Avatar
                        sx={{
                          width: 30,
                          height: 30,
                          fontSize: 12,
                          fontWeight: 800,
                          bgcolor: 'rgba(23, 143, 137, 0.1)',
                          color: '#178f89',
                          border: '1px solid rgba(23, 143, 137, 0.2)',
                          flexShrink: 0,
                        }}
                      >
                        {initial}
                      </Avatar>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography noWrap sx={{ fontSize: 13, fontWeight: 700, color: 'text.primary' }}>
                          {email}
                        </Typography>
                        {name && (
                          <Typography noWrap variant="caption" sx={{ color: 'text.secondary', fontSize: 11, display: 'block' }}>
                            {name}
                          </Typography>
                        )}
                      </Box>
                    </Stack>
                  </TableCell>

                  {/* Valor */}
                  <TableCell sx={{ py: 1.5 }}>
                    <Typography
                      sx={{
                        fontSize: 13.5,
                        fontWeight: 800,
                        fontFamily: 'monospace',
                        color: p.status === 'APPROVED' ? '#15803d' : 'text.primary',
                      }}
                    >
                      R$ {Number(p.amount ?? 0).toFixed(2).replace('.', ',')}
                    </Typography>
                  </TableCell>

                  {/* Tipo */}
                  <TableCell sx={{ py: 1.5 }}>
                    <Chip
                      size="small"
                      label={p.periodDays > 0 ? 'Assinatura' : 'Créditos'}
                      sx={{
                        height: 24,
                        fontSize: 11.5,
                        fontWeight: 700,
                        bgcolor: p.periodDays > 0 ? 'rgba(147, 51, 234, 0.08)' : 'rgba(23, 143, 137, 0.08)',
                        color: p.periodDays > 0 ? '#7e22ce' : '#178f89',
                        borderRadius: '6px',
                      }}
                    />
                  </TableCell>

                  {/* Status com Live Dot */}
                  <TableCell sx={{ py: 1.5 }}>
                    <Box
                      sx={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 0.75,
                        px: 1.25,
                        py: 0.4,
                        borderRadius: '6px',
                        bgcolor: cfg.bg,
                        border: cfg.border,
                      }}
                    >
                      <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: cfg.dotColor }} />
                      <Typography sx={{ fontSize: 12, fontWeight: 700, color: cfg.text }}>
                        {cfg.label}
                      </Typography>
                    </Box>
                  </TableCell>

                  {/* Referência + Copy Button + Webhook Button */}
                  <TableCell sx={{ py: 1.5 }}>
                    <Stack direction="row" spacing={0.75} alignItems="center">
                      <Typography sx={{ fontSize: 11.5, fontFamily: 'monospace', color: p.mpPaymentId ? 'text.secondary' : 'text.disabled' }}>
                        {p.mpPaymentId ?? '—'}
                      </Typography>
                      {p.mpPaymentId && (
                        <Tooltip title={copiedId === p.mpPaymentId ? 'Copiado!' : 'Copiar referência'}>
                          <IconButton size="small" onClick={() => handleCopy(p.mpPaymentId)} sx={{ p: 0.35 }}>
                            {copiedId === p.mpPaymentId ? (
                              <CheckIcon sx={{ fontSize: 14, color: 'success.main' }} />
                            ) : (
                              <ContentCopyIcon sx={{ fontSize: 13, color: 'text.disabled', '&:hover': { color: 'text.primary' } }} />
                            )}
                          </IconButton>
                        </Tooltip>
                      )}
                      {p.rawWebhook && (
                        <Tooltip title="Inspecionar webhook / payload">
                          <IconButton size="small" onClick={() => setPayloadRow(p)} sx={{ p: 0.35 }}>
                            <ReceiptLongIcon sx={{ fontSize: 15, color: '#178f89' }} />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Stack>
                  </TableCell>
                </TableRow>
              );
            })}
            {payments.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 6 }}>
                  <Typography variant="body2" color="text.secondary">
                    Nenhum registro de pagamento encontrado.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* 5. PAGINATION FOOTER */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mt: 2.5, px: 0.5 }}>
        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 500, fontSize: 12 }}>
          {total > 0 ? (
            <>
              Mostrando <strong>{rangeStart}–{rangeEnd}</strong> de <strong>{total}</strong> transações
            </>
          ) : (
            'Nenhuma transação'
          )}
        </Typography>

        <Stack direction="row" spacing={1} alignItems="center">
          <Button
            size="small"
            variant="outlined"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            startIcon={<ChevronLeftIcon fontSize="small" />}
            sx={{
              borderRadius: '8px',
              textTransform: 'none',
              fontWeight: 600,
              fontSize: 12,
              borderColor: 'divider',
              color: 'text.secondary',
            }}
          >
            Anterior
          </Button>

          <Box
            sx={{
              px: 1.5,
              py: 0.5,
              borderRadius: '6px',
              bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : '#f1f5f9',
              fontSize: 12,
              fontWeight: 700,
              fontFamily: 'monospace',
            }}
          >
            {page} / {totalPages}
          </Box>

          <Button
            size="small"
            variant="outlined"
            disabled={!data?.hasMore || loading}
            onClick={() => setPage((p) => p + 1)}
            endIcon={<ChevronRightIcon fontSize="small" />}
            sx={{
              borderRadius: '8px',
              textTransform: 'none',
              fontWeight: 600,
              fontSize: 12,
              borderColor: 'divider',
              color: 'text.secondary',
            }}
          >
            Próxima
          </Button>
        </Stack>
      </Stack>

      {/* Payload bruto do Mercado Pago / Gateway (auditoria) */}
      {payloadRow && (
        <Dialog open onClose={() => setPayloadRow(null)} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: '12px' } }}>
          <DialogTitle sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif', pb: 0.5 }}>
            Payload do Gateway de Pagamento
            <Typography variant="caption" sx={{ display: 'block', fontWeight: 600, color: 'text.secondary', fontFamily: 'monospace', mt: 0.25 }}>
              {payloadRow.user?.email ?? '—'} · Ref {payloadRow.mpPaymentId ?? '—'} · Status {payloadRow.status}
            </Typography>
          </DialogTitle>
          <DialogContent dividers>
            {payloadRow.rawWebhook ? (
              <Box
                component="pre"
                sx={{
                  margin: 0,
                  fontSize: 12,
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  fontFamily: 'monospace',
                  bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(0,0,0,0.5)' : '#0f172a',
                  color: '#e2e8f0',
                  p: 2,
                  borderRadius: '8px',
                  maxHeight: '60vh',
                  overflow: 'auto',
                }}
              >
                {JSON.stringify(payloadRow.rawWebhook, null, 2)}
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary">
                Sem payload registrado (pagamento anterior à captura, ou sem notificação de webhook).
              </Typography>
            )}
          </DialogContent>
        </Dialog>
      )}
    </Box>
  );
};
