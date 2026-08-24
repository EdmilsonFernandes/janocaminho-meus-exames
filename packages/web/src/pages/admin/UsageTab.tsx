import { useEffect, useState } from 'react';
import { Box, Typography, Stack, Card, CardContent, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Chip, IconButton, Collapse, LinearProgress, TextField, InputAdornment, MenuItem } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import BoltIcon from '@mui/icons-material/Bolt';
import { API_URL, token } from '../../config';

/**
 * UsageTab — "Uso de IA" no admin.
 * Mostra quem usa a IA, quanto gasta, quais transações.
 * Drill-down: clica num usuário → expande as transações.
 */

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
  achievement: '🏆 Conquista',
  refund: '↩️ Reembolso',
};

export const UsageTab = () => {
  const [rows, setRows] = useState<UsageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    setLoading(true);
    fetch(`${API_URL}/admin/credit-usage`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => (r.ok ? r.json() : { users: [] }))
      .then((d) => setRows(d.users ?? []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  // SORTING: por total gasto (desc) — quem mais consome IA primeiro
  const [sortBy, setSortBy] = useState<'spent' | 'earned' | 'tx'>('spent');
  const sorted = [...rows].sort((a, b) => {
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

  if (loading) return <LinearProgress sx={{ mt: 2 }} />;

  return (
    <Stack spacing={2}>
      {/* Resumo */}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <Card sx={{ flex: 1, borderRadius: '12px' }}>
          <CardContent sx={{ textAlign: 'center', py: 2 }}>
            <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>Usuários ativos (IA)</Typography>
            <Typography sx={{ fontSize: 28, fontWeight: 800, fontFamily: 'Poppins' }}>{activeUsers}</Typography>
          </CardContent>
        </Card>
        <Card sx={{ flex: 1, borderRadius: '12px' }}>
          <CardContent sx={{ textAlign: 'center', py: 2 }}>
            <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>Créditos consumidos</Typography>
            <Typography sx={{ fontSize: 28, fontWeight: 800, fontFamily: 'Poppins', color: '#c2410c' }}>
              {totalSpent.toLocaleString('pt-BR')}
            </Typography>
          </CardContent>
        </Card>
        <Card sx={{ flex: 1, borderRadius: '12px' }}>
          <CardContent sx={{ textAlign: 'center', py: 2 }}>
            <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>Compraram créditos</Typography>
            <Typography sx={{ fontSize: 28, fontWeight: 800, fontFamily: 'Poppins', color: '#047857' }}>{payingUsers}</Typography>
          </CardContent>
        </Card>
      </Stack>

      {/* Busca + ordenação */}
      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
        <TextField
          size="small" fullWidth placeholder="Buscar por e-mail ou nome…"
          value={query} onChange={(e) => setQuery(e.target.value)}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 18, color: 'text.secondary' }} /></InputAdornment> }}
          sx={{ flex: 1, minWidth: 200, '& .MuiOutlinedInput-root': { borderRadius: '12px', bgcolor: 'background.paper' } }}
        />
        <TextField select size="small" label="Ordenar" value={sortBy} onChange={(e) => setSortBy(e.target.value as 'spent' | 'earned' | 'tx')} sx={{ minWidth: 130, '& .MuiOutlinedInput-root': { borderRadius: '12px', bgcolor: 'background.paper' } }}>
          <MenuItem value="spent">Gasto ↓</MenuItem>
          <MenuItem value="earned">Ganho ↓</MenuItem>
          <MenuItem value="tx">Transações ↓</MenuItem>
        </TextField>
      </Stack>

      {/* Tabela */}
      <TableContainer component={Card} sx={{ borderRadius: '12px' }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: 'action.hover' }}>
              <TableCell width={40} />
              <TableCell><Typography sx={{ fontWeight: 700, fontSize: 12 }}>Usuário</Typography></TableCell>
              <TableCell align="right"><Typography sx={{ fontWeight: 700, fontSize: 12 }}>Saldo</Typography></TableCell>
              <TableCell align="right"><Typography sx={{ fontWeight: 700, fontSize: 12 }}>Gasto</Typography></TableCell>
              <TableCell align="right"><Typography sx={{ fontWeight: 700, fontSize: 12 }}>Transações</Typography></TableCell>
              <TableCell><Typography sx={{ fontWeight: 700, fontSize: 12 }}>Última</Typography></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.slice(0, 100).map((r) => (
              <>
                <TableRow key={r.userId} hover onClick={() => setExpanded(expanded === r.userId ? null : r.userId)} sx={{ cursor: 'pointer' }}>
                  <TableCell>
                    <IconButton size="small" sx={{ transform: expanded === r.userId ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>
                      <ExpandMoreIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                  <TableCell>
                    <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{r.name || r.email}</Typography>
                    <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>{r.email}</Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Chip size="small" label={r.credits.toLocaleString('pt-BR')} sx={{ height: 20, fontSize: 11, fontWeight: 700, bgcolor: r.credits > 100 ? 'rgba(4,120,87,.1)' : 'rgba(194,65,12,.1)', color: r.credits > 100 ? '#047857' : '#c2410c' }} />
                  </TableCell>
                  <TableCell align="right">
                    <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#c2410c' }}>{r.totalSpent.toLocaleString('pt-BR')}</Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{r.txCount}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>
                      {r.lastTxAt ? new Date(r.lastTxAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : '—'}
                    </Typography>
                  </TableCell>
                </TableRow>
                <TableRow key={`${r.userId}-detail`}>
                  <TableCell colSpan={6} sx={{ py: 0, borderBottom: expanded === r.userId ? '1px solid' : 'none', borderColor: 'divider' }}>
                    <Collapse in={expanded === r.userId} timeout="auto" unmountOnExit>
                      <Box sx={{ py: 1.5, maxHeight: 300, overflowY: 'auto' }}>
                        {r.transactions.slice(0, 50).map((tx) => (
                          <Stack key={tx.id} direction="row" spacing={2} alignItems="center" sx={{ py: 0.4, px: 1 }}>
                            <Typography sx={{ fontSize: 11, color: 'text.disabled', width: 70, flexShrink: 0 }}>
                              {new Date(tx.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                            </Typography>
                            <Chip size="small" label={KIND_LABEL[tx.kind] ?? tx.kind} sx={{ height: 18, fontSize: 10, flexShrink: 0 }} />
                            <Typography sx={{ fontSize: 12, color: 'text.secondary', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {tx.label}
                            </Typography>
                            <Typography sx={{ fontSize: 12, fontWeight: 700, flexShrink: 0, color: tx.delta < 0 ? '#c2410c' : '#047857' }}>
                              {tx.delta > 0 ? '+' : ''}{tx.delta}
                            </Typography>
                          </Stack>
                        ))}
                      </Box>
                    </Collapse>
                  </TableCell>
                </TableRow>
              </>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Stack>
  );
};
