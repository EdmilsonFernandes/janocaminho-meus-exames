import { useEffect, useState } from 'react';
import { Box, Card, CardContent, Typography, Button, TextField, IconButton, Stack, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, CircularProgress } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import { Title, useNotify } from 'react-admin';
import { API_URL, apiHeaders, token } from '../config';
import { useSelectedPatient } from '../patient-context';
import { printPage } from '../utils/nativeDoc';

interface Expense { id: string; description: string; category: string; amount: number; spentAt: string; }

export const ExpensesPage = () => {
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
    try {
      await fetch(`${API_URL}/expenses/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } });
      await load();
    } catch { /* ignore */ }
  };

  const total = items.reduce((s, i) => s + i.amount, 0);
  const byCategory = items.reduce((acc: Record<string, number>, i) => { acc[i.category] = (acc[i.category] || 0) + i.amount; return acc; }, {});

  return (
    <Box sx={{ maxWidth: 760, mx: 'auto', p: { xs: 1, md: 2 } }}>
      <Title title="Despesas Médicas" />
      <Card sx={{ mb: 2, background: 'linear-gradient(135deg,#e3f2fd,#bbdefb)' }}>
        <CardContent>
          <Typography variant="h4" sx={{ fontWeight: 800, color: '#1565c0' }}>R$ {total.toFixed(2).replace('.', ',')}</Typography>
          <Typography color="text.secondary">Total gasto em saúde</Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 1 }} useFlexGap flexWrap="wrap">
            {Object.entries(byCategory).map(([cat, val]) => (
              <Typography key={cat} variant="body2" sx={{ color: 'text.secondary' }}>{cat}: <strong>R$ {val.toFixed(2)}</strong></Typography>
            ))}
          </Stack>
        </CardContent>
      </Card>
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>Registrar despesa</Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} useFlexGap flexWrap="wrap">
            <TextField size="small" label="Descrição" placeholder="Consulta, exame, remédio..." value={desc} onChange={(e) => setDesc(e.target.value)} sx={{ flex: 1, minWidth: 200 }} />
            <TextField size="small" select label="Categoria" value={category} onChange={(e) => setCategory(e.target.value)} sx={{ width: 130 }}>
              {['Exame', 'Consulta', 'Remédio', 'Outro'].map((c) => <option key={c} value={c}>{c}</option>)}
            </TextField>
            <TextField size="small" label="Valor (R$)" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} sx={{ width: 120 }} />
            <TextField size="small" type="date" value={date} onChange={(e) => setDate(e.target.value)} InputLabelProps={{ shrink: true }} />
            <Button variant="contained" onClick={add} disabled={!desc.trim() || !amount || saving}>{saving ? 'Salvando…' : 'Adicionar'}</Button>
          </Stack>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>Histórico de despesas</Typography>
          {loading ? (
            <CircularProgress size={20} />
          ) : items.length === 0 ? (
            <Typography color="text.secondary" sx={{ py: 2 }}>Nenhuma despesa registrada.</Typography>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead><TableRow sx={{ bgcolor: 'action.hover' }}>
                  <TableCell>Descrição</TableCell><TableCell>Categoria</TableCell><TableCell align="right">Valor</TableCell><TableCell>Data</TableCell><TableCell></TableCell>
                </TableRow></TableHead>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.description}</TableCell>
                      <TableCell>{item.category}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>R$ {item.amount.toFixed(2)}</TableCell>
                      <TableCell>{new Date(item.spentAt).toLocaleDateString('pt-BR')}</TableCell>
                      <TableCell><IconButton size="small" onClick={() => del(item.id)}><DeleteIcon fontSize="small" /></IconButton></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
          {items.length > 0 && (
            <Button variant="outlined" size="small" sx={{ mt: 2 }} onClick={() => printPage('Relatório de Despesas')}>🖨️ Imprimir relatório (IR)</Button>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};
