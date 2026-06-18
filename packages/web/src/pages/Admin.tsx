import { useEffect, useState } from 'react';
import { Box, Card, CardContent, Typography, Button, Stack, Chip, TextField, Dialog, DialogTitle, DialogContent, DialogActions, IconButton, CircularProgress, Divider, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper } from '@mui/material';
import { Title, useNotify } from 'react-admin';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import { API_URL, token } from '../config';

interface U { id: string; email: string; name: string; role: string; credits: number; planExpiresAt: string | null; createdAt: string }

export const AdminPage = () => {
  const notify = useNotify();
  const [tab, setTab] = useState<'users' | 'payments' | 'config'>('users');
  const [users, setUsers] = useState<U[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editUser, setEditUser] = useState<U | null>(null);
  const [editCredits, setEditCredits] = useState(0);
  const [editPlan, setEditPlan] = useState('');
  const [q, setQ] = useState('');

  const load = async () => {
    setLoading(true);
    const h = { Authorization: `Bearer ${token()}` };
    const [u, p, c] = await Promise.all([
      fetch(`${API_URL}/admin/users`, { headers: h }).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`${API_URL}/admin/payments`, { headers: h }).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`${API_URL}/admin/config`, { headers: h }).then(r => r.ok ? r.json() : null).catch(() => null),
    ]);
    if (u) { setUsers(u.users ?? []); setStats(u.stats); }
    if (p) setPayments(p.payments ?? []);
    if (c) setConfig(c);
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const saveCredits = async () => {
    if (!editUser) return;
    await fetch(`${API_URL}/admin/users/${editUser.id}/credits`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` }, body: JSON.stringify({ credits: editCredits }) });
    notify('Créditos atualizados!', { type: 'success' }); setEditUser(null); void load();
  };
  const savePlan = async () => {
    if (!editUser) return;
    await fetch(`${API_URL}/admin/users/${editUser.id}/plan`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` }, body: JSON.stringify({ planExpiresAt: editPlan || null }) });
    notify('Plano atualizado!', { type: 'success' }); setEditUser(null); void load();
  };
  const delUser = async (id: string, email: string) => {
    if (!window.confirm(`Excluir ${email}? Todos os dados serão perdidos.`)) return;
    await fetch(`${API_URL}/admin/users/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } });
    notify('Usuário excluído', { type: 'success' }); void load();
  };

  if (loading) return <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>;

  const filtered = users.filter((u) => !q || u.email.toLowerCase().includes(q.toLowerCase()) || (u.name || '').toLowerCase().includes(q.toLowerCase()));
  const TabBtn = ({ id, label }: any) => (
    <Button variant={tab === id ? 'contained' : 'outlined'} size="small" onClick={() => setTab(id)} sx={{ borderRadius: 99 }}>{label}</Button>
  );
  const statusColor: Record<string, any> = { APPROVED: 'success', PENDING: 'warning', CANCELLED: 'default', FAILED: 'error' };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1100, mx: 'auto' }}>
      <Title title="Admin" />
      <Typography variant="h5" sx={{ fontWeight: 800, mb: 0.5 }}>⚙️ Painel Admin</Typography>
      {stats && (
        <Stack direction="row" spacing={1} sx={{ mb: 2 }} useFlexGap flexWrap="wrap">
          <Chip label={`👤 ${stats.users} usuários`} color="primary" size="small" />
          <Chip label={`📋 ${stats.exams} exames`} color="secondary" size="small" />
          <Chip label={`💳 ${stats.subscriptions} pagamentos`} color="info" size="small" />
          <Chip label={`💰 R$ ${(stats.revenue ?? 0).toFixed(2).replace('.', ',')} aprovado`} color="success" size="small" />
        </Stack>
      )}
      <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
        <TabBtn id="users" label="👥 Usuários" />
        <TabBtn id="payments" label="💳 Pagamentos" />
        <TabBtn id="config" label="⚙️ Config" />
      </Stack>

      {/* TAB: USUÁRIOS */}
      {tab === 'users' && (
        <Box>
          <TextField placeholder="Buscar..." value={q} onChange={(e) => setQ(e.target.value)} size="small" fullWidth sx={{ mb: 2 }} />
          <Stack spacing={1}>
            {filtered.map((u) => (
              <Card key={u.id} variant="outlined" sx={{ borderRadius: 2 }}>
                <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', py: 1.5 }}>
                  <Box sx={{ flex: 1, minWidth: 180 }}>
                    <Typography sx={{ fontWeight: 700, wordBreak: 'break-word' }}>{u.name || '—'} {u.role === 'ADMIN' && <Chip size="small" label="ADMIN" color="warning" />}</Typography>
                    <Typography variant="caption" color="text.secondary">{u.email}</Typography>
                  </Box>
                  <Box sx={{ textAlign: 'center', minWidth: 60 }}>
                    <Typography sx={{ fontWeight: 800, color: u.credits > 0 ? 'success.main' : 'error.main' }}>{u.credits}</Typography>
                    <Typography variant="caption" color="text.secondary">créditos</Typography>
                  </Box>
                  <Box>{u.planExpiresAt && new Date(u.planExpiresAt) > new Date() ? <Chip size="small" label="Premium" color="primary" /> : <Chip size="small" label="Grátis" variant="outlined" />}</Box>
                  <IconButton size="small" onClick={() => { setEditUser(u); setEditCredits(u.credits); setEditPlan(u.planExpiresAt ? u.planExpiresAt.split('T')[0] : ''); }} title="Editar"><EditIcon fontSize="small" /></IconButton>
                  {u.role !== 'ADMIN' && <IconButton size="small" color="error" onClick={() => delUser(u.id, u.email)} title="Excluir"><DeleteIcon fontSize="small" /></IconButton>}
                </CardContent>
              </Card>
            ))}
          </Stack>
        </Box>
      )}

      {/* TAB: PAGAMENTOS */}
      {tab === 'payments' && (
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
                  <TableCell>R$ {p.amount.toFixed(2).replace('.', ',')}</TableCell>
                  <TableCell>{p.periodDays > 0 ? 'Mensal' : 'Créditos'}</TableCell>
                  <TableCell><Chip size="small" color={statusColor[p.status] ?? 'default'} label={p.status} /></TableCell>
                  <TableCell sx={{ fontSize: 11, fontFamily: 'monospace' }}>{p.mpPaymentId ?? '—'}</TableCell>
                </TableRow>
              ))}
              {payments.length === 0 && <TableRow><TableCell colSpan={6} align="center">Nenhum pagamento ainda.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* TAB: CONFIG */}
      {tab === 'config' && config && (
        <Card sx={{ borderRadius: 4 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>Custos de créditos (por ação de IA)</Typography>
            <Stack spacing={1}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography>💬 Chat com IA (por pergunta)</Typography>
                <Chip label={`${config.creditCosts?.chat ?? 0} créditos`} color="primary" />
              </Box>
              <Divider />
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography>📄 Resumo de exame</Typography>
                <Chip label={`${config.creditCosts?.summary ?? 0} créditos`} color="primary" />
              </Box>
              <Divider />
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography>🧾 Relatório consolidado</Typography>
                <Chip label={`${config.creditCosts?.consolidated ?? 0} créditos`} color="primary" />
              </Box>
              <Divider />
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography>📤 Upload de exame</Typography>
                <Chip label={`${config.creditCosts?.extraction ?? 0} créditos (grátis)`} color="success" />
              </Box>
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
              * Valores definidos no código (credits.ts). Pra alterar, edite e redeploy.
            </Typography>
          </CardContent>
        </Card>
      )}

      {/* DIALOG: Editar usuário */}
      <Dialog open={!!editUser} onClose={() => setEditUser(null)} PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle>Editar: {editUser?.name || editUser?.email}</DialogTitle>
        <DialogContent>
          <Typography variant="subtitle2" sx={{ mt: 1, mb: 0.5 }}>Créditos</Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <TextField type="number" value={editCredits} onChange={(e) => setEditCredits(Number(e.target.value))} size="small" sx={{ width: 120 }} />
            <Button size="small" variant="contained" onClick={saveCredits}>Salvar</Button>
          </Stack>
          <Divider sx={{ my: 2 }} />
          <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Plano Premium (data expiração ou vazio = grátis)</Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <TextField type="date" value={editPlan} onChange={(e) => setEditPlan(e.target.value)} size="small" InputLabelProps={{ shrink: true }} />
            <Button size="small" variant="contained" onClick={savePlan}>Salvar</Button>
          </Stack>
          <Button size="small" color="error" onClick={() => { setEditPlan('2099-12-31'); }} sx={{ mt: 1 }}>VIP (2099)</Button>
        </DialogContent>
        <DialogActions><Button onClick={() => setEditUser(null)}>Fechar</Button></DialogActions>
      </Dialog>
    </Box>
  );
};
