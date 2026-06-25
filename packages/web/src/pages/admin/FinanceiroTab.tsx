import { useCallback, useEffect, useState } from 'react';
import { Box, Stack, Typography, Button, TextField, MenuItem, TableContainer, Paper, Table, TableHead, TableRow, TableCell, TableBody, Chip, IconButton } from '@mui/material';
import { useNotify } from 'react-admin';
import DownloadIcon from '@mui/icons-material/Download';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { API_URL, token } from '../../config';
import { TabLoader, SectionError } from './parts';

const PAGE_SIZE = 20;
const authH = () => ({ Authorization: `Bearer ${token()}` });
const statusColor: Record<string, any> = { APPROVED: 'success', PENDING: 'warning', CANCELLED: 'default', FAILED: 'error' };

const buildParams = (page: number, status: string, type: string, q: string) => {
  const p = new URLSearchParams({ page: String(page) });
  if (status) p.set('status', status);
  if (type) p.set('type', type);
  if (q) p.set('q', q);
  return p.toString();
};

const downloadCsv = (rows: any[]) => {
  const header = ['Data', 'Usuario', 'Valor', 'Tipo', 'Status', 'MP ID'];
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = rows.map((p) => [
    new Date(p.createdAt).toLocaleDateString('pt-BR'),
    esc(p.user?.email ?? ''),
    Number(p.amount ?? 0).toFixed(2).replace('.', ','),
    p.periodDays > 0 ? 'Mensal' : 'Creditos',
    p.status ?? '',
    p.mpPaymentId ?? '',
  ].join(';'));
  const csv = [header.join(';'), ...lines].join('\r\n');
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'pagamentos.csv'; a.click();
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

  const load = useCallback(async () => {
    setLoading(true); setError(false);
    try {
      const r = await fetch(`${API_URL}/admin/payments?${buildParams(page, status, type, committedQ)}`, { headers: authH() });
      if (r.ok) { const d = await r.json(); setData({ payments: d.payments ?? [], total: d.total ?? 0, hasMore: !!d.hasMore }); }
      else setError(true);
    } catch { setError(true); }
    setLoading(false);
  }, [page, status, type, committedQ]);

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [load]);

  // Debounce da busca por e-mail.
  useEffect(() => {
    const t = setTimeout(() => { setCommittedQ(q); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [q]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const all: any[] = [];
      let p = 1;
      while (p <= 50) { // teto de segurança (~1000 registros)
        const r = await fetch(`${API_URL}/admin/payments?${buildParams(p, status, type, committedQ)}`, { headers: authH() });
        if (!r.ok) break;
        const d = await r.json();
        all.push(...(d.payments ?? []));
        if (!d.hasMore) break;
        p++;
      }
      if (all.length === 0) notify('Nada para exportar.', { type: 'info' });
      else { downloadCsv(all); notify(`${all.length} pagamento(s) exportado(s).`, { type: 'success' }); }
    } catch { notify('Falha no export.', { type: 'error' }); }
    setExporting(false);
  };

  if (loading && !data) return <TabLoader />;
  if (error && !data) return <SectionError message="Não foi possível carregar os pagamentos." onRetry={() => void load()} />;

  const payments = data?.payments ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);

  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ mb: 2 }} useFlexGap flexWrap="wrap" alignItems="center">
        <TextField select size="small" label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} sx={{ minWidth: 140 }}>
          <MenuItem value="">Todos</MenuItem>
          <MenuItem value="APPROVED">Aprovado</MenuItem>
          <MenuItem value="PENDING">Pendente</MenuItem>
          <MenuItem value="CANCELLED">Cancelado</MenuItem>
          <MenuItem value="FAILED">Falhou</MenuItem>
        </TextField>
        <TextField select size="small" label="Tipo" value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} sx={{ minWidth: 130 }}>
          <MenuItem value="">Todos</MenuItem>
          <MenuItem value="mensal">Mensal</MenuItem>
          <MenuItem value="creditos">Créditos</MenuItem>
        </TextField>
        <TextField size="small" placeholder="Buscar e-mail..." value={q} onChange={(e) => setQ(e.target.value)} sx={{ minWidth: 200 }} />
        <Button startIcon={<DownloadIcon />} variant="outlined" size="small" onClick={() => void exportCsv()} disabled={exporting}>Exportar CSV</Button>
      </Stack>

      {error && <Box sx={{ mb: 2 }}><SectionError message="Falha ao atualizar." onRetry={() => void load()} /></Box>}
      <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: '#e6f7f6' } }}>
              <TableCell>Data</TableCell><TableCell>Usuário</TableCell><TableCell>Valor</TableCell><TableCell>Tipo</TableCell><TableCell>Status</TableCell><TableCell>MP ID</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {payments.map((p) => (
              <TableRow key={p.id}>
                <TableCell>{new Date(p.createdAt).toLocaleDateString('pt-BR')}</TableCell>
                <TableCell sx={{ wordBreak: 'break-word', maxWidth: 200 }}>{p.user?.email ?? '—'}</TableCell>
                <TableCell>R$ {Number(p.amount ?? 0).toFixed(2).replace('.', ',')}</TableCell>
                <TableCell>{p.periodDays > 0 ? 'Mensal' : 'Créditos'}</TableCell>
                <TableCell><Chip size="small" color={statusColor[p.status] ?? 'default'} label={p.status} /></TableCell>
                <TableCell sx={{ fontSize: 11, fontFamily: 'monospace' }}>{p.mpPaymentId ?? '—'}</TableCell>
              </TableRow>
            ))}
            {payments.length === 0 && <TableRow><TableCell colSpan={6} align="center">Nenhum pagamento.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </TableContainer>

      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mt: 2 }}>
        <Typography variant="caption" color="text.secondary">{total > 0 ? `${rangeStart}–${rangeEnd} de ${total}` : '—'}</Typography>
        <Stack direction="row" spacing={1} alignItems="center">
          <IconButton size="small" disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}><ChevronLeftIcon fontSize="small" /></IconButton>
          <Typography variant="body2">{page}/{totalPages}</Typography>
          <IconButton size="small" disabled={!data?.hasMore || loading} onClick={() => setPage((p) => p + 1)}><ChevronRightIcon fontSize="small" /></IconButton>
        </Stack>
      </Stack>
    </Box>
  );
};
