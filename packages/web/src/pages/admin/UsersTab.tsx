import { useCallback, useEffect, useState } from 'react';
import { Box, Card, CardContent, Typography, Stack, Chip, TextField, IconButton, Button, Divider, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import { useNotify } from 'react-admin';
import DeleteIcon from '@mui/icons-material/Delete';
import BlockIcon from '@mui/icons-material/Block';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import EditIcon from '@mui/icons-material/Edit';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { API_URL, token } from '../../config';
import { U, TabLoader, SectionError, ConfirmDialog } from './parts';

const PAGE_SIZE = 15;
const authH = () => ({ Authorization: `Bearer ${token()}` });

export const UsersTab = () => {
  const notify = useNotify();
  const [q, setQ] = useState('');
  const [committedQ, setCommittedQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ users: U[]; total: number; hasMore: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [editUser, setEditUser] = useState<U | null>(null);
  const [editCredits, setEditCredits] = useState(0);
  const [editPlan, setEditPlan] = useState('');

  const [delTarget, setDelTarget] = useState<{ id: string; email: string; impact: { patients: number; exams: number; analyses: number } } | null>(null);
  const [delLoading, setDelLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(false);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (committedQ) params.set('q', committedQ);
      const r = await fetch(`${API_URL}/admin/users?${params.toString()}`, { headers: authH() });
      if (r.ok) { const d = await r.json(); setData({ users: d.users ?? [], total: d.total ?? 0, hasMore: !!d.hasMore }); }
      else setError(true);
    } catch { setError(true); }
    setLoading(false);
  }, [page, committedQ]);

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [load]);

  // Debounce da busca: commita após 350ms e volta pra página 1.
  useEffect(() => {
    const t = setTimeout(() => { setCommittedQ(q); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [q]);

  const openEdit = (u: U) => { setEditUser(u); setEditCredits(u.credits); setEditPlan(u.planExpiresAt ? u.planExpiresAt.split('T')[0] : ''); };
  const saveCredits = async () => {
    if (!editUser) return;
    await fetch(`${API_URL}/admin/users/${editUser.id}/credits`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authH() }, body: JSON.stringify({ credits: editCredits }) });
    notify('Créditos atualizados!', { type: 'success' }); setEditUser(null); void load();
  };
  const savePlan = async () => {
    if (!editUser) return;
    await fetch(`${API_URL}/admin/users/${editUser.id}/plan`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authH() }, body: JSON.stringify({ planExpiresAt: editPlan || null }) });
    notify('Plano atualizado!', { type: 'success' }); setEditUser(null); void load();
  };
  const openDelete = async (u: U) => {
    try {
      const ir = await fetch(`${API_URL}/admin/users/${u.id}/impact`, { headers: authH() });
      const impact = ir.ok ? await ir.json() : { patients: 0, exams: 0, analyses: 0 };
      setDelTarget({ id: u.id, email: u.email, impact });
    } catch { setDelTarget({ id: u.id, email: u.email, impact: { patients: 0, exams: 0, analyses: 0 } }); }
  };
  const confirmDelete = async () => {
    if (!delTarget) return;
    setDelLoading(true);
    const r = await fetch(`${API_URL}/admin/users/${delTarget.id}`, { method: 'DELETE', headers: authH() });
    setDelLoading(false);
    if (r.ok) { notify('Usuário + documentos excluídos', { type: 'success' }); setDelTarget(null); void load(); }
    else notify('Erro ao excluir', { type: 'error' });
  };

  if (loading && !data) return <TabLoader />;
  if (error && !data) return <SectionError message="Não foi possível carregar os usuários." onRetry={() => void load()} />;

  const users = data?.users ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);

  const toggleBlock = async (u: U) => {
    const blocking = !u.blocked;
    if (!window.confirm(blocking ? `Bloquear ${u.email}?\n\nEle não vai conseguir mais entrar — verá uma mensagem amigável pedindo pra contatar o suporte.` : `Desbloquear ${u.email}?`)) return;
    try {
      const r = await fetch(`${API_URL}/admin/users/${u.id}/${blocking ? 'block' : 'unblock'}`, { method: 'POST', headers: authH() });
      if (r.ok) { notify(blocking ? 'Usuário bloqueado.' : 'Usuário desbloqueado.', { type: 'success' }); void load(); }
      else { const d = await r.json().catch(() => ({})); notify(d.error || 'Falha', { type: 'error' }); }
    } catch { notify('Falha de conexão.', { type: 'error' }); }
  };

  return (
    <Box>
      <TextField placeholder="Buscar por nome ou e-mail..." value={q} onChange={(e) => setQ(e.target.value)} size="small" fullWidth sx={{ mb: 2 }} />
      {error && <Box sx={{ mb: 2 }}><SectionError message="Falha ao atualizar a lista." onRetry={() => void load()} /></Box>}
      <Stack spacing={1}>
        {users.map((u) => (
          <Card key={u.id} variant="outlined" sx={{ borderRadius: 2 }}>
            <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', py: 1.5 }}>
              <Box sx={{ flex: 1, minWidth: { xs: 120, sm: 180 } }}>
                <Typography sx={{ fontWeight: 700, wordBreak: 'break-word' }}>{u.name || '—'} {u.role === 'ADMIN' && <Chip size="small" label="ADMIN" color="warning" />} {u.blocked && <Chip size="small" label="Bloqueado" color="error" />}</Typography>
                <Typography variant="caption" color="text.secondary">{u.email}</Typography>
              </Box>
              <Box sx={{ textAlign: 'center', minWidth: 60 }}>
                <Typography sx={{ fontWeight: 800, color: u.credits > 0 ? 'success.main' : 'text.disabled' }}>{u.credits}</Typography>
                <Typography variant="caption" color="text.secondary">créditos</Typography>
              </Box>
              <Box>{u.planExpiresAt && new Date(u.planExpiresAt) > new Date() ? <Chip size="small" label="Premium" color="primary" /> : <Chip size="small" label="Grátis" variant="outlined" />}</Box>
              <IconButton size="small" onClick={() => openEdit(u)} title="Editar"><EditIcon fontSize="small" /></IconButton>
              <IconButton size="small" onClick={() => { void toggleBlock(u); }} title={u.blocked ? 'Desbloquear' : 'Bloquear'} sx={{ color: u.blocked ? 'success.main' : 'warning.main' }}>
                {u.blocked ? <LockOpenIcon fontSize="small" /> : <BlockIcon fontSize="small" />}
              </IconButton>
              {u.role !== 'ADMIN' && <IconButton size="small" color="error" onClick={() => void openDelete(u)} title="Excluir"><DeleteIcon fontSize="small" /></IconButton>}
            </CardContent>
          </Card>
        ))}
        {!loading && users.length === 0 && <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>Nenhum usuário encontrado.</Typography>}
      </Stack>

      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mt: 2 }}>
        <Typography variant="caption" color="text.secondary">{total > 0 ? `${rangeStart}–${rangeEnd} de ${total}` : '—'}</Typography>
        <Stack direction="row" spacing={1} alignItems="center">
          <IconButton size="small" disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}><ChevronLeftIcon fontSize="small" /></IconButton>
          <Typography variant="body2">{page}/{totalPages}</Typography>
          <IconButton size="small" disabled={!data?.hasMore || loading} onClick={() => setPage((p) => p + 1)}><ChevronRightIcon fontSize="small" /></IconButton>
        </Stack>
      </Stack>

      {/* EDITAR */}
      <Dialog open={!!editUser} onClose={() => setEditUser(null)} PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle>Editar: {editUser?.name || editUser?.email}</DialogTitle>
        <DialogContent>
          <Typography variant="subtitle2" sx={{ mt: 1, mb: 0.5 }}>Créditos</Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <TextField type="number" value={editCredits} onChange={(e) => setEditCredits(Number(e.target.value))} size="small" sx={{ width: 120 }} />
            <Button size="small" variant="contained" onClick={() => void saveCredits()}>Salvar</Button>
          </Stack>
          <Divider sx={{ my: 2 }} />
          <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Plano Premium (data expiração ou vazio = grátis)</Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <TextField type="date" value={editPlan} onChange={(e) => setEditPlan(e.target.value)} size="small" InputLabelProps={{ shrink: true }} />
            <Button size="small" variant="contained" onClick={() => void savePlan()}>Salvar</Button>
          </Stack>
          <Button size="small" color="error" onClick={() => setEditPlan('2099-12-31')} sx={{ mt: 1 }}>VIP (2099)</Button>
        </DialogContent>
        <DialogActions><Button onClick={() => setEditUser(null)}>Fechar</Button></DialogActions>
      </Dialog>

      {/* CONFIRMAR EXCLUSÃO */}
      <ConfirmDialog
        open={!!delTarget} onClose={() => setDelTarget(null)} onConfirm={() => void confirmDelete()}
        title={delTarget ? `Excluir ${delTarget.email}?` : 'Excluir usuário?'} tone="danger" confirmLabel="Excluir" loading={delLoading}
        desc={delTarget ? `Isso vai apagar DEFINITIVAMENTE:\n• ${delTarget.impact.patients} perfil(is)\n• ${delTarget.impact.exams} exame(s) + PDFs\n• ${delTarget.impact.analyses} análise(s)\n\nNÃO dá pra desfazer.` : ''} />
    </Box>
  );
};
