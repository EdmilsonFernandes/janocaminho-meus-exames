import { useEffect, useState } from 'react';
import { Box, Card, CardContent, Typography, Button, TextField, List, ListItem, ListItemText, IconButton, Stack, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import { Title } from 'react-admin';
import { API_URL, token } from '../config';
import { useSelectedPatient } from '../patient-context';

export const ExpensesPage = () => {
  const [pid] = useSelectedPatient();
  const [items, setItems] = useState<any[]>([]);
  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState('Exame');

  const load = async () => {
    if (!pid) return;
    // reusa measurements endpoint temporariamente como despesas (campo type = EXPENSE)
    // idealmente ter tabela própria — por enquanto guarda local no browser
    const stored = JSON.parse(localStorage.getItem(`expenses_${pid}`) || '[]');
    setItems(stored.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()));
  };
  useEffect(() => { load(); }, [pid]);

  const add = () => {
    if (!desc.trim() || !amount) return;
    const stored = JSON.parse(localStorage.getItem(`expenses_${pid}`) || '[]');
    stored.push({ id: Date.now(), desc: desc.trim(), amount: parseFloat(amount), date, category });
    localStorage.setItem(`expenses_${pid}`, JSON.stringify(stored));
    setDesc(''); setAmount(''); load();
  };
  const del = (id: number) => {
    const stored = JSON.parse(localStorage.getItem(`expenses_${pid}`) || '[]').filter((x: any) => x.id !== id);
    localStorage.setItem(`expenses_${pid}`, JSON.stringify(stored));
    load();
  };

  const total = items.reduce((s, i) => s + i.amount, 0);
  const byCategory = items.reduce((acc: any, i) => { acc[i.category] = (acc[i.category] || 0) + i.amount; return acc; }, {});

  return (
    <Box sx={{ maxWidth: 760, mx: 'auto', p: { xs: 1, md: 2 } }}>
      <Title title="Despesas Médicas" />
      <Card sx={{ mb: 2, background: 'linear-gradient(135deg,#e3f2fd,#bbdefb)' }}>
        <CardContent>
          <Typography variant="h4" sx={{ fontWeight: 800, color: '#1565c0' }}>R$ {total.toFixed(2).replace('.', ',')}</Typography>
          <Typography color="text.secondary">Total gasto em saúde</Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 1 }} useFlexGap flexWrap="wrap">
            {Object.entries(byCategory).map(([cat, val]: any) => (
              <Typography key={cat} variant="body2" sx={{ color: '#555' }}>{cat}: <strong>R$ {Number(val).toFixed(2)}</strong></Typography>
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
            <Button variant="contained" onClick={add} disabled={!desc.trim() || !amount}>Adicionar</Button>
          </Stack>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>Histórico de despesas</Typography>
          {items.length === 0 ? (
            <Typography color="text.secondary" sx={{ py: 2 }}>Nenhuma despesa registrada.</Typography>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead><TableRow sx={{ bgcolor: '#f5f5f5' }}>
                  <TableCell>Descrição</TableCell><TableCell>Categoria</TableCell><TableCell align="right">Valor</TableCell><TableCell>Data</TableCell><TableCell></TableCell>
                </TableRow></TableHead>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.desc}</TableCell>
                      <TableCell>{item.category}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>R$ {item.amount.toFixed(2)}</TableCell>
                      <TableCell>{new Date(item.date).toLocaleDateString('pt-BR')}</TableCell>
                      <TableCell><IconButton size="small" onClick={() => del(item.id)}><DeleteIcon fontSize="small" /></IconButton></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
          {items.length > 0 && (
            <Button variant="outlined" size="small" sx={{ mt: 2 }} onClick={() => window.print()}>🖨️ Imprimir relatório (IR)</Button>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};
