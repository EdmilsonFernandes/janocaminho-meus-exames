import { useEffect, useState } from 'react';
import { Box, Typography, Button, TextField, IconButton, Stack, Chip, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import { confirmDialog } from '../components/ConfirmDialog';
import PaymentsIcon from '@mui/icons-material/Payments';
import { useNotify, useTranslate } from 'react-admin';
import { API_URL, apiHeaders, token } from '../config';
import { useSelectedPatient } from '../patient-context';
import { printPage } from '../utils/nativeDoc';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { ListSkeleton } from '../components/Skeleton';
import { AppCard } from '../components/AppCard';

interface Expense { id: string; description: string; category: string; amount: number; spentAt: string; }

const brl = (n: number) => `R$ ${n.toFixed(2).replace('.', ',')}`;
/** Meio-dia local: imune a TZ (o parse cru de date-only caía no dia anterior em UTC-3). */
const fmtDate = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR');
const monthLabel = (key: string) => {
  const s = new Date(`${key}-01T12:00:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1); // "Agosto de 2026"
};

export const ExpensesPage = () => {
  const translate = useTranslate();
  const [pid] = useSelectedPatient();
  const notify = useNotify();
  const [items, setItems] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState('Exame');

  const load = async () => {
    if (!pid) { setItems([]); return; }
    setLoading(true);
    try {
      const r = await fetch(`${API_URL}/expenses?patientId=${pid}&_start=0&_end=200`, { headers: { Authorization: `Bearer ${token()}` } });
      if (r.ok) setItems(await r.json());
    } catch { /* ignore */ }
    setLoading(false);
  };
  useEffect(() => { load(); }, [pid]);

  const add = async () => {
    if (!pid || !desc.trim() || !amount) return;
    setSaving(true);
    try {
      const r = await fetch(`${API_URL}/expenses`, {
        method: 'POST', headers: apiHeaders(true), body: JSON.stringify({ patientId: pid, description: desc.trim(), category, amount: parseFloat(amount), spentAt: date }),
      });
      if (!r.ok) throw new Error('Falha ao salvar');
      setDesc(''); setAmount('');
      await load();
    } catch (e: any) { notify(e.message, { type: 'error' }); }
    setSaving(false);
  };

  const del = async (id: string) => {
    if (!(await confirmDialog({ title: 'Excluir lançamento', message: 'Apagar este lançamento? Afeta o total e o relatório de IR.', confirmLabel: 'Excluir' }))) return;
    try {
      await fetch(`${API_URL}/expenses/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } });
      await load();
    } catch { /* ignore */ }
  };

  const total = items.reduce((s, i) => s + i.amount, 0);

  // Histórico AGRUPADO POR MÊS (desc): o médico/IR pensa em "quanto gastei em agosto" —
  // a tabela plana de 5 colunas cortava datas e descrição no 375px e não somava nada.
  const months = (() => {
    const map = new Map<string, Expense[]>();
    for (const i of [...items].sort((a, b) => b.spentAt.localeCompare(a.spentAt))) {
      const key = i.spentAt.slice(0, 7);
      const arr = map.get(key) ?? [];
      arr.push(i);
      map.set(key, arr);
    }
    return [...map.entries()];
  })();

  return (
    <PageContainer width="content">
      <PageHeader icon={<PaymentsIcon />} title={translate('page.expenses')} subtitle="Consultas, exames, farmácia: registre e veja pra onde vai seu dinheiro em saúde — organizado pro imposto de renda e pra conversar com o médico sobre custos." />

      {/* RESUMO — total geral + nº de lançamentos (chips por categoria saíram: ruído no 375px,
          o detalhe agora mora no total de cada mês abaixo). */}
      <AppCard kind="tinted" tone="primary" sx={{ p: 2, mb: 2 }}>
        <Typography sx={{ fontWeight: 800, fontFamily: '"Poppins",sans-serif', fontSize: { xs: 30, sm: 34 }, lineHeight: 1.1, color: 'primary.dark' }}>{brl(total)}</Typography>
        <Typography color="text.secondary" sx={{ fontSize: 13 }}>Total gasto em saúde · {items.length} lançamento{items.length === 1 ? '' : 's'} · vale dedução de IR (mantenha os comprovantes)</Typography>
      </AppCard>

      <AppCard sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6" sx={{ mb: 1.5 }}>Registrar despesa</Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} useFlexGap flexWrap="wrap">
          {/* Larguras fluidas no xs (causa raiz de overflow em 600–768px), fixas só no sm+. */}
          <TextField size="small" label="Descrição" placeholder="Consulta, exame, remédio..." value={desc} onChange={(e) => setDesc(e.target.value)} sx={{ flex: { xs: '1 1 100%', sm: 1 }, minWidth: { xs: 0, sm: 200 } }} />
          <TextField size="small" select label="Categoria" value={category} onChange={(e) => setCategory(e.target.value)} sx={{ width: { xs: '100%', sm: 130 } }}>
            {['Exame', 'Consulta', 'Remédio', 'Outro'].map((c) => <option key={c} value={c}>{c}</option>)}
          </TextField>
          <TextField size="small" label="Valor (R$)" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} sx={{ width: { xs: '100%', sm: 120 } }} />
          <TextField size="small" type="date" value={date} onChange={(e) => setDate(e.target.value)} InputLabelProps={{ shrink: true }} sx={{ width: { xs: '100%', sm: 160 } }} />
          <Button variant="contained" onClick={add} disabled={!desc.trim() || !amount || saving}>{saving ? 'Salvando…' : 'Adicionar'}</Button>
        </Stack>
      </AppCard>

      <AppCard sx={{ p: 2 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" useFlexGap flexWrap="wrap" sx={{ mb: 1.5 }}>
          <Typography variant="h6">Histórico de despesas</Typography>
          {items.length > 0 && (
            <Button variant="outlined" size="small" onClick={() => printPage('Relatório de Despesas')} sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 700 }}>🖨️ Imprimir relatório (IR)</Button>
          )}
        </Stack>

        {loading ? (
          <ListSkeleton count={3} />
        ) : items.length === 0 ? (
          <Typography color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>Nenhuma despesa registrada — comece pelo formulário acima.</Typography>
        ) : months.map(([key, list]) => {
          const monthTotal = list.reduce((s, i) => s + i.amount, 0);
          return (
            <Box key={key} sx={{ mb: 2.5, '&:last-child': { mb: 0 } }}>
              {/* Header do mês — sticky (acompanha a rolagem) com o TOTAL do período */}
              <Box sx={{ position: 'sticky', top: { xs: 58, sm: 64 }, zIndex: 2, bgcolor: 'background.paper', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1, py: 0.75, px: 1, mx: -1, borderBottom: '2px solid', borderColor: 'rgba(32,178,170,.35)' }}>
                <Typography sx={{ fontWeight: 800, fontSize: 14 }}>{monthLabel(key)}</Typography>
                <Typography sx={{ fontWeight: 800, fontSize: 14, color: 'primary.dark', fontVariantNumeric: 'tabular-nums' }}>{brl(monthTotal)}</Typography>
              </Box>

              {/* XS — lista-card: nada de tabela de 5 colunas cortando data/letra no mobile */}
              <Stack spacing={1} sx={{ mt: 1, display: { xs: 'flex', sm: 'none' } }}>
                {list.map((item) => (
                  <Box key={item.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.25, p: 1.25, borderRadius: '12px', bgcolor: 'background.default', border: '1px solid', borderColor: 'divider' }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 700, fontSize: 14, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.description}</Typography>
                      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 0.25 }}>
                        <Chip size="small" label={item.category} sx={{ height: 20, fontSize: 11, fontWeight: 700, bgcolor: 'rgba(32,178,170,.12)', color: 'primary.dark' }} />
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>{fmtDate(item.spentAt)}</Typography>
                      </Stack>
                    </Box>
                    <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flexShrink: 0 }}>
                      <Typography sx={{ fontWeight: 800, fontSize: 14, fontVariantNumeric: 'tabular-nums', color: 'text.primary' }}>{brl(item.amount)}</Typography>
                      <IconButton size="small" aria-label={`Excluir ${item.description}`} onClick={() => del(item.id)} sx={{ p: 1, color: 'text.disabled', '&:hover': { color: 'error.main' } }}><DeleteIcon sx={{ fontSize: 20 }} /></IconButton>
                    </Stack>
                  </Box>
                ))}
              </Stack>

              {/* SM+ — tabela clássica (tem espaço) */}
              <TableContainer component={Paper} variant="outlined" sx={{ mt: 1, display: { xs: 'none', sm: 'block' } }}>
                <Table size="small">
                  <TableHead><TableRow sx={{ bgcolor: 'action.hover' }}>
                    <TableCell>Descrição</TableCell><TableCell>Categoria</TableCell><TableCell align="right">Valor</TableCell><TableCell>Data</TableCell><TableCell></TableCell>
                  </TableRow></TableHead>
                  <TableBody>
                    {list.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{item.description}</TableCell>
                        <TableCell>{item.category}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600 }}>{item.amount.toFixed(2).replace('.', ',')}</TableCell>
                        <TableCell>{fmtDate(item.spentAt)}</TableCell>
                        <TableCell><IconButton size="small" onClick={() => del(item.id)}><DeleteIcon fontSize="small" /></IconButton></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          );
        })}
      </AppCard>
    </PageContainer>
  );
};
