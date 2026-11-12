import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Stack, Card, CardContent, Chip, IconButton, Collapse,
  LinearProgress, TextField, InputAdornment, MenuItem, Tooltip, Avatar,
  useMediaQuery, useTheme
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PeopleAltOutlinedIcon from '@mui/icons-material/PeopleAltOutlined';
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';
import ShoppingBagOutlinedIcon from '@mui/icons-material/ShoppingBagOutlined';
import AccessTimeOutlinedIcon from '@mui/icons-material/AccessTimeOutlined';
import { API_URL, token, photoUrlFor } from '../../config';
import { ListEmpty } from '@/components/reui/list-empty';
import { useTable, type ColumnDef } from '@tanstack/react-table';
import { DataGrid, DataGridContainer, dataGridFeatures } from '@/components/reui/data-grid/data-grid';
import { DataGridTable, DataGridTableRowExpand } from '@/components/reui/data-grid/data-grid-table';
import { DataGridColumnHeader } from '@/components/reui/data-grid/data-grid-column-header';
import { Badge } from '@/components/reui/badge';
import '../../doctor-v2/tw.css';
import { tealText } from '../../theme';

interface UsageRow {
  userId: string;
  email: string;
  name: string;
  plan: string;
  credits: number;
  totalSpent: number;
  totalEarned: number;
  txCount: number;
  lastTxAt: string | null;
  transactions: {
    id: string;
    delta: number;
    kind: string;
    label: string;
    createdAt: string;
  }[];
}

const KIND_LABEL: Record<string, string> = {
  purchase: '🛒 Compra',
  plan_monthly: '💎 Plano',
  chat_question: '💬 Chat',
  summary: '📄 Resumo',
  consolidated: '🧾 Relatório',
  extraction: '📤 Extração',
  doctor_question: '🩺 Pergunta médico',
  signup_bonus: '🎁 Bônus',
  first_exam_bonus: '🎁 Bônus 1º exame',
  achievement: '🏆 Conquista',
  refund: '↩️ Reembolso',
};

const fmtWhen = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

/** Linha expandida: extrato de créditos do usuário (até 50 lançamentos). */
const UsageTransactions = ({ row }: { row: UsageRow }) => (
  <div className="max-h-72 overflow-y-auto bg-muted/30 px-4 py-3">
    <p className="mb-2 text-xs font-bold text-muted-foreground">Histórico de transações ({row.transactions.length})</p>
    <div className="flex flex-col gap-1.5">
      {row.transactions.slice(0, 50).map((tx) => (
        <div key={tx.id} className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-1.5">
          <span className="w-24 shrink-0 text-xs tabular-nums text-muted-foreground">
            {new Date(tx.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
          </span>
          <Badge variant="outline" size="sm" className="shrink-0">{KIND_LABEL[tx.kind] ?? tx.kind}</Badge>
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{tx.label}</span>
          <span className={'shrink-0 text-[13px] font-extrabold tabular-nums ' + (tx.delta < 0 ? 'text-orange-700 dark:text-orange-400' : 'text-emerald-700 dark:text-emerald-400')}>
            {tx.delta > 0 ? '+' : ''}{tx.delta}
          </span>
        </div>
      ))}
    </div>
  </div>
);

/** ReUI DataGrid — consumo de créditos por usuário (desktop): ordena por coluna, linha expande o extrato. */
function UsageGrid({ rows }: { rows: UsageRow[] }) {
  const columns: ColumnDef<any, any>[] = [
    {
      id: 'expand', header: '', size: 44, enableSorting: false,
      cell: (c) => <DataGridTableRowExpand row={c.row as any} />,
      meta: { expandedContent: (row: UsageRow) => <UsageTransactions row={row} /> },
    },
    {
      id: 'user', size: 300, accessorFn: (r: UsageRow) => (r.name || r.email).toLowerCase(),
      header: (c) => <DataGridColumnHeader column={c.column as any} title="Usuário" />,
      cell: (c) => {
        const r = c.row.original as UsageRow & { hasPhoto?: boolean; patientId?: string };
        return (
          <div className="flex min-w-0 items-center gap-3">
            <Avatar src={r.hasPhoto && r.patientId ? photoUrlFor(r.patientId) : undefined} sx={{ width: 32, height: 32, fontSize: 12, fontWeight: 800, bgcolor: 'primary.main', color: '#fff' }}>
              {(r.name || r.email).slice(0, 2).toUpperCase()}
            </Avatar>
            <div className="min-w-0">
              <p className="max-w-56 truncate text-[13.5px] font-bold text-foreground">{r.name || r.email}</p>
              <p className="max-w-56 truncate text-xs text-muted-foreground">{r.email}</p>
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: 'credits', size: 150,
      header: (c) => <DataGridColumnHeader column={c.column as any} title="Saldo" />,
      cell: (c) => {
        const n = Number(c.getValue() ?? 0);
        return <Badge variant={n > 100 ? 'primary-light' : 'warning-light'} size="lg" className="tabular-nums">{n.toLocaleString('pt-BR')} créditos</Badge>;
      },
    },
    {
      accessorKey: 'totalSpent', size: 110,
      header: (c) => <DataGridColumnHeader column={c.column as any} title="Gasto IA" />,
      cell: (c) => <span className="text-[13.5px] font-extrabold tabular-nums text-orange-700 dark:text-orange-400">{Number(c.getValue() ?? 0).toLocaleString('pt-BR')}</span>,
    },
    {
      accessorKey: 'txCount', size: 110,
      header: (c) => <DataGridColumnHeader column={c.column as any} title="Transações" />,
      cell: (c) => <span className="text-[13px] font-semibold tabular-nums text-muted-foreground">{Number(c.getValue() ?? 0).toLocaleString('pt-BR')}</span>,
    },
    {
      id: 'lastTxAt', size: 160, accessorFn: (r: UsageRow) => (r.lastTxAt ? new Date(r.lastTxAt).getTime() : 0),
      header: (c) => <DataGridColumnHeader column={c.column as any} title="Última atividade" />,
      cell: (c) => <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">{fmtWhen((c.row.original as UsageRow).lastTxAt)}</span>,
    },
  ];
  const table = useTable({ features: dataGridFeatures, data: rows as any[], columns, getRowId: (r: any) => r.userId, getRowCanExpand: () => true });
  if (rows.length === 0) return <ListEmpty title="Nenhum usuário encontrado" description="Ajuste a busca." />;
  return (
    <DataGrid table={table} recordCount={rows.length} onRowClick={(r: any) => table.getRow(r.userId)?.toggleExpanded()} tableLayout={{ headerBackground: true, rowBorder: true }}>
      <DataGridContainer><DataGridTable /></DataGridContainer>
    </DataGrid>
  );
}

export const UsageTab = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [rows, setRows] = useState<UsageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<'recent' | 'spent' | 'earned' | 'tx'>('recent');

  useEffect(() => {
    setLoading(true);
    fetch(`${API_URL}/admin/credit-usage`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => (r.ok ? r.json() : { users: [] }))
      .then((d) => setRows(d.users ?? []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  const sorted = [...rows].sort((a, b) => {
    if (sortBy === 'recent') {
      const ta = a.lastTxAt ? new Date(a.lastTxAt).getTime() : 0;
      const tb = b.lastTxAt ? new Date(b.lastTxAt).getTime() : 0;
      return tb - ta;
    }
    if (sortBy === 'spent') return b.totalSpent - a.totalSpent;
    if (sortBy === 'earned') return b.totalEarned - a.totalEarned;
    return b.txCount - a.txCount;
  });

  const filtered = sorted.filter((r) =>
    !query || r.email.toLowerCase().includes(query.toLowerCase()) || r.name?.toLowerCase().includes(query.toLowerCase())
  );

  const totalSpent = rows.reduce((s, r) => s + r.totalSpent, 0);
  const activeUsers = rows.filter((r) => r.txCount > 0).length;
  const payingUsers = rows.filter((r) => r.totalEarned > 0).length;

  if (loading) {
    return (
      <Box sx={{ py: 6, textAlign: 'center' }}>
        <LinearProgress sx={{ borderRadius: 2, height: 6, bgcolor: 'rgba(32,178,170,0.12)', '& .MuiLinearProgress-bar': { bgcolor: '#20b2aa' } }} />
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>Carregando dados de uso de IA...</Typography>
      </Box>
    );
  }

  return (
    <Stack spacing={2.5}>
      {/* Cards de Resumo */}
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: { xs: 1, sm: 2 } }}>
        <Card variant="outlined" sx={{ borderRadius: '16px', bgcolor: 'background.paper', boxShadow: '0 2px 10px rgba(0,0,0,0.02)' }}>
          <CardContent sx={{ p: { xs: 1.25, sm: 2.25 }, '&:last-child': { pb: { xs: 1.25, sm: 2.25 } } }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} alignItems="center" spacing={{ xs: 0.5, sm: 1.5 }}>
              <Box sx={{ p: 1.25, borderRadius: '12px', bgcolor: 'rgba(32,178,170,0.1)', color: (t) => tealText(t.palette.mode) }}>
                <PeopleAltOutlinedIcon />
              </Box>
              <Box>
                <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block' }}>
                  Usuários Ativos (IA)
                </Typography>
                <Typography sx={{ fontSize: { xs: 26, sm: 30 }, fontWeight: 800, color: 'text.primary', lineHeight: 1.1 }}>
                  {activeUsers.toLocaleString('pt-BR')}
                </Typography>
              </Box>
            </Stack>
          </CardContent>
        </Card>

        <Card variant="outlined" sx={{ borderRadius: '16px', bgcolor: 'background.paper', boxShadow: '0 2px 10px rgba(0,0,0,0.02)' }}>
          <CardContent sx={{ p: { xs: 1.25, sm: 2.25 }, '&:last-child': { pb: { xs: 1.25, sm: 2.25 } } }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} alignItems="center" spacing={{ xs: 0.5, sm: 1.5 }}>
              <Box sx={{ p: 1.25, borderRadius: '12px', bgcolor: 'rgba(194,65,12,0.1)', color: '#c2410c' }}>
                <BoltOutlinedIcon />
              </Box>
              <Box>
                <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block' }}>
                  Créditos Consumidos
                </Typography>
                <Typography sx={{ fontSize: { xs: 26, sm: 30 }, fontWeight: 800, color: '#c2410c', lineHeight: 1.1 }}>
                  {totalSpent.toLocaleString('pt-BR')}
                </Typography>
              </Box>
            </Stack>
          </CardContent>
        </Card>

        <Card variant="outlined" sx={{ borderRadius: '16px', bgcolor: 'background.paper', boxShadow: '0 2px 10px rgba(0,0,0,0.02)' }}>
          <CardContent sx={{ p: { xs: 1.25, sm: 2.25 }, '&:last-child': { pb: { xs: 1.25, sm: 2.25 } } }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} alignItems="center" spacing={{ xs: 0.5, sm: 1.5 }}>
              <Box sx={{ p: 1.25, borderRadius: '12px', bgcolor: 'rgba(4,120,87,0.1)', color: '#047857' }}>
                <ShoppingBagOutlinedIcon />
              </Box>
              <Box>
                <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block' }}>
                  Compraram Créditos
                </Typography>
                <Typography sx={{ fontSize: { xs: 26, sm: 30 }, fontWeight: 800, color: '#047857', lineHeight: 1.1 }}>
                  {payingUsers.toLocaleString('pt-BR')}
                </Typography>
              </Box>
            </Stack>
          </CardContent>
        </Card>
      </Box>

      {/* Busca e Ordenação */}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', sm: 'center' }}>
        <TextField
          size="small"
          placeholder="Buscar por e-mail ou nome..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
              </InputAdornment>
            ),
          }}
          sx={{ flex: 1, '& .MuiOutlinedInput-root': { borderRadius: '12px', bgcolor: 'background.paper' } }}
        />
        <TextField
          select
          size="small"
          label="Ordenar por"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'recent' | 'spent' | 'earned' | 'tx')}
          sx={{ minWidth: 210, '& .MuiOutlinedInput-root': { borderRadius: '12px', bgcolor: 'background.paper', fontSize: 13 } }}
        >
          <MenuItem value="recent">⚡ Mais recente primeiro</MenuItem>
          <MenuItem value="spent">Gasto total IA ↓</MenuItem>
          <MenuItem value="earned">Créditos comprados ↓</MenuItem>
          <MenuItem value="tx">Transações realizadas ↓</MenuItem>
        </TextField>
      </Stack>

      {isMobile ? (
        <Stack spacing={1}>
          {filtered.length === 0 ? (
            <Card variant="outlined" sx={{ borderRadius: '16px', p: 3, textAlign: 'center' }}>
              <ListEmpty title="Nenhum usuário encontrado" description="Ajuste a busca." />
            </Card>
          ) : filtered.slice(0, 100).map((r) => (
            <Card
              key={r.userId}
              variant="outlined"
              onClick={() => setExpanded(expanded === r.userId ? null : r.userId)}
              sx={{
                borderRadius: '16px',
                cursor: 'pointer',
                overflow: 'hidden',
                transition: 'all .15s ease',
                '&:active': { transform: 'scale(0.98)' },
                borderLeft: expanded === r.userId ? '3px solid #178f89' : undefined,
              }}
            >
              <CardContent sx={{ p: 1.75, '&:last-child': { pb: 1.75 } }}>
                {/* Header: avatar + nome + saldo */}
                <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ flex: 1, minWidth: 0 }}>
                    <Avatar src={(r as any).hasPhoto && (r as any).patientId ? photoUrlFor((r as any).patientId) : undefined} sx={{ width: 34, height: 34, fontSize: 13, fontWeight: 800, bgcolor: 'primary.main', color: '#fff' }}>
                      {(r.name || r.email).slice(0, 2).toUpperCase()}
                    </Avatar>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontSize: 14.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.name || r.email}
                      </Typography>
                      <Typography sx={{ fontSize: 12, color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.email}
                      </Typography>
                    </Box>
                  </Stack>
                  <Stack direction="row" alignItems="center" spacing={0.75}>
                    <Box
                      sx={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 0.5,
                        px: 1,
                        py: 0.35,
                        borderRadius: '999px',
                        fontSize: 12,
                        fontWeight: 800,
                        whiteSpace: 'nowrap',
                        bgcolor: r.credits > 100
                          ? (theme.palette.mode === 'dark' ? 'rgba(45, 212, 191, 0.16)' : 'rgba(20, 184, 166, 0.12)')
                          : (theme.palette.mode === 'dark' ? 'rgba(245, 158, 11, 0.16)' : 'rgba(254, 243, 199, 0.95)'),
                        border: `1px solid ${r.credits > 100 ? 'rgba(20, 184, 166, 0.35)' : 'rgba(245, 158, 11, 0.35)'}`,
                        color: r.credits > 100 ? (theme.palette.mode === 'dark' ? '#2dd4bf' : '#0f766e') : (theme.palette.mode === 'dark' ? '#fbbf24' : '#b45309'),
                      }}
                    >
                      <span>⚡</span>
                      <span>{r.credits.toLocaleString('pt-BR')} cr</span>
                    </Box>
                    <IconButton size="small" sx={{ transform: expanded === r.userId ? 'rotate(180deg)' : 'none', transition: 'transform .2s', p: 0.25 }}>
                      <ExpandMoreIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                </Stack>
                {/* Métricas rápidas */}
                <Stack direction="row" spacing={0} sx={{ mt: 1.25, pt: 1, borderTop: '1px solid', borderColor: 'divider' }}>
                  <Box sx={{ flex: 1 }}>
                    <Typography sx={{ fontSize: 12, color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Gasto</Typography>
                    <Typography sx={{ fontSize: 16, fontWeight: 800, color: '#c2410c', lineHeight: 1.2 }}>{r.totalSpent.toLocaleString('pt-BR')}</Typography>
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Typography sx={{ fontSize: 12, color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Ganho</Typography>
                    <Typography sx={{ fontSize: 16, fontWeight: 800, color: '#047857', lineHeight: 1.2 }}>{r.totalEarned.toLocaleString('pt-BR')}</Typography>
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Typography sx={{ fontSize: 12, color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Trans.</Typography>
                    <Typography sx={{ fontSize: 16, fontWeight: 800, color: 'text.primary', lineHeight: 1.2 }}>{r.txCount}</Typography>
                  </Box>
                  <Box sx={{ flex: 1, textAlign: 'right' }}>
                    <Typography sx={{ fontSize: 12, color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Última</Typography>
                    <Typography sx={{ fontSize: 12, color: 'text.secondary', fontWeight: 600, lineHeight: 1.6 }}>
                      {r.lastTxAt ? new Date(r.lastTxAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : '—'}
                    </Typography>
                  </Box>
                </Stack>
                {/* Histórico expansível */}
                <Collapse in={expanded === r.userId} timeout="auto" unmountOnExit>
                  <Box sx={{ mt: 1.5, pt: 1.5, borderTop: '1px dashed', borderColor: 'divider' }}>
                    <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', display: 'block', mb: 1 }}>
                      📜 Histórico ({r.transactions.length})
                    </Typography>
                    <Stack spacing={0.5}>
                      {r.transactions.slice(0, 30).map((tx) => (
                        <Stack
                          key={tx.id}
                          direction="row"
                          spacing={0.75}
                          alignItems="center"
                          sx={{ p: 0.75, borderRadius: '10px', bgcolor: tx.delta < 0 ? 'rgba(194,65,12,0.04)' : 'rgba(4,120,87,0.04)' }}
                        >
                          <Typography sx={{ fontSize: 12, color: 'text.secondary', flexShrink: 0, width: 40 }}>
                            {new Date(tx.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                          </Typography>
                          <Typography sx={{ fontSize: 12, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'text.secondary' }}>
                            {KIND_LABEL[tx.kind] ?? tx.kind}
                          </Typography>
                          <Typography sx={{ fontSize: 13, fontWeight: 800, flexShrink: 0, color: tx.delta < 0 ? '#c2410c' : '#047857' }}>
                            {tx.delta > 0 ? '+' : ''}{tx.delta}
                          </Typography>
                        </Stack>
                      ))}
                    </Stack>
                  </Box>
                </Collapse>
              </CardContent>
            </Card>
          ))}
        </Stack>
      ) : (
      <div className="dx-island"><UsageGrid rows={filtered.slice(0, 100)} /></div>
      )}
    </Stack>
  );
};
