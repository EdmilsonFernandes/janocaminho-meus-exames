import { useEffect, useState } from 'react';
import { Box, Card, CardContent, Typography, Button, Stack, Chip, TextField, Dialog, DialogTitle, DialogContent, DialogActions, IconButton, CircularProgress, Divider } from '@mui/material';
import { Title, useNotify } from 'react-admin';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import { API_URL, token } from '../config';

interface U { id: string; email: string; name: string; role: string; credits: number; planExpiresAt: string | null; createdAt: string }

export const AdminPage = () => {
  const notify = useNotify();
  const [users, setUsers] = useState<U[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editUser, setEditUser] = useState<U | null>(null);
  const [editCredits, setEditCredits] = useState(0);
  const [editPlan, setEditPlan] = useState('');
  const [q, setQ] = useState('');

  const load = async () => {
    setLoading(true);
    const r = await fetch(`${API_URL}/admin/users`, { headers: { Authorization: `Bearer ${token()}` } });
    if (r.status === 403) { setLoading(false); return; }
    if (r.ok) { const d = await r.json(); setUsers(d.users ?? []); setStats(d.stats); }
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const saveCredits = async () => {
    if (!editUser) return;
    const r = await fetch(`${API_URL}/admin/users/${editUser.id}/credits`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` }, body: JSON.stringify({ credits: editCredits }) });
    if (r.ok) { notify('Créditos atualizados!', { type: 'success' }); setEditUser(null); void load(); }
    else notify('Erro', { type: 'error' });
  };
  const savePlan = async () => {
    if (!editUser) return;
    const r = await fetch(`${API_URL}/admin/users/${editUser.id}/plan`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` }, body: JSON.stringify({ planExpiresAt: editPlan || null }) });
    if (r.ok) { notify('Plano atualizado!', { type: 'success' }); setEditUser(null); void load(); }
    else notify('Erro', { type: 'error' });
  };
  const delUser = async (id: string, email: string) => {
    if (!window.confirm(`Excluir ${email}? Todos os dados serão perdidos.`)) return;
    const r = await fetch(`${API_URL}/admin/users/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } });
    if (r.ok) { notify('Usuário excluído', { type: 'success' }); void load(); }
    else notify('Erro', { type: 'error' });
  };

  if (loading) return <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>;

  const filtered = users.filter((u) => !q || u.email.toLowerCase().includes(q.toLowerCase()) || (u.name || '').toLowerCase().includes(q.toLowerCase()));

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1000, mx: 'auto' }}>
      <Title title="Admin" />
      <Typography variant="h5" sx={{ fontWeight: 800, mb: 0.5 }}>⚙️ Painel Admin</Typography>
      {stats && (
        <Stack direction="row" spacing={2} sx={{ mb: 2 }} useFlexGap flexWrap="wrap">
          <Chip label={`👤 ${stats.users} usuários`} color="primary" />
          <Chip label={`📋 ${stats.exams} exames`} color="secondary" />
        </Stack>
      )}
      <TextField placeholder="Buscar por email ou nome..." value={q} onChange={(e) => setQ(e.target.value)} size="small" fullWidth sx={{ mb: 2 }} />
      <Stack spacing={1}>
        {filtered.map((u) => (
          <Card key={u.id} variant="outlined" sx={{ borderRadius: 2 }}>
            <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', py: 1.5 }}>
              <Box sx={{ flex: 1, minWidth: 200 }}>
                <Typography sx={{ fontWeight: 700, wordBreak: 'break-word' }}>{u.name || '—'} {u.role === 'ADMIN' && <Chip size="small" label="ADMIN" color="warning" />}</Typography>
                <Typography variant="caption" color="text.secondary">{u.email}</Typography>
              </Box>
              <Box sx={{ textAlign: 'center', minWidth: 80 }}>
                <Typography sx={{ fontWeight: 800, color: u.credits > 0 ? 'success.main' : 'error.main' }}>{u.credits}</Typography>
                <Typography variant="caption" color="text.secondary">créditos</Typography>
              </Box>
              <Box sx={{ textAlign: 'center', minWidth: 80 }}>
                {u.planExpiresAt && new Date(u.planExpiresAt) > new Date()
                  ? <Chip size="small" label="Premium" color="primary" />
                  : <Chip size="small" label="Grátis" variant="outlined" />}
              </Box>
              <IconButton size="small" onClick={() => { setEditUser(u); setEditCredits(u.credits); setEditPlan(u.planExpiresAt ? u.planExpiresAt.split('T')[0] : ''); }} title="Editar"><EditIcon fontSize="small" /></IconButton>
              {u.role !== 'ADMIN' && <IconButton size="small" color="error" onClick={() => delUser(u.id, u.email)} title="Excluir"><DeleteIcon fontSize="small" /></IconButton>}
            </CardContent>
          </Card>
        ))}
      </Stack>

      <Dialog open={!!editUser} onClose={() => setEditUser(null)} PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle>Editar: {editUser?.name || editUser?.email}</DialogTitle>
        <DialogContent>
          <Typography variant="subtitle2" sx={{ mt: 1, mb: 0.5 }}>Créditos</Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <TextField type="number" value={editCredits} onChange={(e) => setEditCredits(Number(e.target.value))} size="small" sx={{ width: 120 }} />
            <Button size="small" variant="contained" onClick={saveCredits}>Salvar</Button>
          </Stack>
          <Divider sx={{ my: 2 }} />
          <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Plano (data de expiração ou vazio = grátis)</Typography>
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
