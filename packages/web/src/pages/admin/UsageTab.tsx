import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Stack, Card, CardContent, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, IconButton, Collapse,
  LinearProgress, TextField, InputAdornment, MenuItem, Tooltip
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PeopleAltOutlinedIcon from '@mui/icons-material/PeopleAltOutlined';
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';
import ShoppingBagOutlinedIcon from '@mui/icons-material/ShoppingBagOutlined';
import { API_URL, token } from '../../config';

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
  const [sortBy, setSortBy] = useState<'spent' | 'earned' | 'tx'>('spent');

  useEffect(() => {
    setLoading(true);
    fetch(`${API_URL}/admin/credit-usage`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => (r.ok ? r.json() : { users: [] }))
      .then((d) => setRows(d.users ?? []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

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
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr' }, gap: 2 }}>
        <Card variant="outlined" sx={{ borderRadius: '16px', bgcolor: 'background.paper', boxShadow: '0 2px 10px rgba(0,0,0,0.02)' }}>
          <CardContent sx={{ p: 2.25 }}>
            <Stack direction="row" alignItems="center" spacing={1.5}>
              <Box sx={{ p: 1.25, borderRadius: '12px', bgcolor: 'rgba(32,178,170,0.1)', color: '#178f89' }}>
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
          <CardContent sx={{ p: 2.25 }}>
            <Stack direction="row" alignItems="center" spacing={1.5}>
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
          <CardContent sx={{ p: 2.25 }}>
            <Stack direction="row" alignItems="center" spacing={1.5}>
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
          onChange={(e) => setSortBy(e.target.value as 'spent' | 'earned' | 'tx')}
          sx={{ minWidth: 160, '& .MuiOutlinedInput-root': { borderRadius: '12px', bgcolor: 'background.paper' } }}
        >
          <MenuItem value="spent">Gasto total ↓</MenuItem>
          <MenuItem value="earned">Ganho total ↓</MenuItem>
          <MenuItem value="tx">Transações ↓</MenuItem>
        </TextField>
      </Stack>

      {/* Tabela de Uso */}
      <Card variant="outlined" sx={{ borderRadius: '16px', overflow: 'hidden' }}>
        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: 640 }}>
            <TableHead>
              <TableRow sx={{ bgcolor: 'action.hover' }}>
                <TableCell width={48} />
                <TableCell sx={{ py: 1.5 }}><Typography sx={{ fontWeight: 800, fontSize: 13 }}>Usuário</Typography></TableCell>
                <TableCell align="right" sx={{ py: 1.5, whiteSpace: 'nowrap' }}><Typography sx={{ fontWeight: 800, fontSize: 13 }}>Saldo</Typography></TableCell>
                <TableCell align="right" sx={{ py: 1.5, whiteSpace: 'nowrap' }}><Typography sx={{ fontWeight: 800, fontSize: 13 }}>Gasto IA</Typography></TableCell>
                <TableCell align="right" sx={{ py: 1.5, whiteSpace: 'nowrap' }}><Typography sx={{ fontWeight: 800, fontSize: 13 }}>Transações</Typography></TableCell>
                <TableCell sx={{ py: 1.5, whiteSpace: 'nowrap' }}><Typography sx={{ fontWeight: 800, fontSize: 13 }}>Última Atividade</Typography></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    Nenhum usuário encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.slice(0, 100).map((r) => (
                  <React.Fragment key={r.userId}>
                    <TableRow
                      hover
                      onClick={() => setExpanded(expanded === r.userId ? null : r.userId)}
                      sx={{ cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
                    >
                      <TableCell>
                        <IconButton size="small" sx={{ transform: expanded === r.userId ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>
                          <ExpandMoreIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                      <TableCell>
                        <Typography sx={{ fontSize: 14, fontWeight: 700, color: 'text.primary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>
                          {r.name || r.email}
                        </Typography>
                        <Typography sx={{ fontSize: 11, color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>
                          {r.email}
                        </Typography>
                      </TableCell>
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                        <Chip
                          size="small"
                          label={`${r.credits.toLocaleString('pt-BR')} cr` }
                          sx={{
                            height: 22,
                            fontSize: 11,
                            fontWeight: 800,
                            bgcolor: r.credits > 100 ? 'rgba(4,120,87,.1)' : 'rgba(194,65,12,.1)',
                            color: r.credits > 100 ? '#047857' : '#c2410c',
                          }}
                        />
                      </TableCell>
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                        <Typography sx={{ fontSize: 14, fontWeight: 800, color: '#c2410c' }}>
                          {r.totalSpent.toLocaleString('pt-BR')}
                        </Typography>
                      </TableCell>
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                        <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'text.secondary' }}>
                          {r.txCount.toLocaleString('pt-BR')}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
                          {r.lastTxAt ? new Date(r.lastTxAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                        </Typography>
                      </TableCell>
                    </TableRow>

                    {/* Detalhes de Transações */}
                    <TableRow key={`${r.userId}-detail`}>
                      <TableCell colSpan={6} sx={{ py: 0, px: 2, borderBottom: expanded === r.userId ? '1px solid' : 'none', borderColor: 'divider', bgcolor: 'rgba(0,0,0,0.01)' }}>
                        <Collapse in={expanded === r.userId} timeout="auto" unmountOnExit>
                          <Box sx={{ py: 2, maxHeight: 280, overflowY: 'auto' }}>
                            <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', display: 'block', mb: 1 }}>
                              📜 Histórico de Transações ({r.transactions.length})
                            </Typography>
                            <Stack spacing={0.75}>
                              {r.transactions.slice(0, 50).map((tx) => (
                                <Stack
                                  key={tx.id}
                                  direction="row"
                                  spacing={1.5}
                                  alignItems="center"
                                  sx={{ p: 0.75, borderRadius: '8px', bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider' }}
                                >
                                  <Typography sx={{ fontSize: 11, color: 'text.secondary', width: 85, flexShrink: 0 }}>
                                    {new Date(tx.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                  </Typography>
                                  <Chip size="small" label={KIND_LABEL[tx.kind] ?? tx.kind} sx={{ height: 20, fontSize: 11, fontWeight: 700, flexShrink: 0 }} />
                                  <Typography sx={{ fontSize: 12, color: 'text.secondary', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {tx.label}
                                  </Typography>
                                  <Typography sx={{ fontSize: 13, fontWeight: 800, flexShrink: 0, color: tx.delta < 0 ? '#c2410c' : '#047857' }}>
                                    {tx.delta > 0 ? '+' : ''}{tx.delta}
                                  </Typography>
                                </Stack>
                              ))}
                            </Stack>
                          </Box>
                        </Collapse>
                      </TableCell>
                    </TableRow>
                  </React.Fragment>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>
    </Stack>
  );
};
