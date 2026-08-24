import { useCallback, useEffect, useState } from 'react';
import { Box, Card, CardContent, Typography, Stack, Chip, TextField, IconButton, Button, Divider, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import { useNotify } from 'react-admin';
import DeleteIcon from '@mui/icons-material/Delete';
import BlockIcon from '@mui/icons-material/Block';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import LockResetIcon from '@mui/icons-material/LockReset';
import EditIcon from '@mui/icons-material/Edit';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { API_URL, token, photoUrlFor } from '../../config';
import { confirmDialog } from '../../components/ConfirmDialog';
import { U, TabLoader, SectionError, ConfirmDialog, PhotoZoom } from './parts';

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
    if (!(await confirmDialog(blocking
      ? { title: `Bloquear ${u.email}`, message: 'Ele não vai conseguir mais entrar — verá uma mensagem pedindo pra contatar o suporte.', confirmLabel: 'Bloquear' }
      : { title: `Desbloquear ${u.email}`, message: 'Ele voltará a conseguir entrar normalmente.', confirmLabel: 'Desbloquear', tone: 'primary' }
    ))) return;
    try {
      const r = await fetch(`${API_URL}/admin/users/${u.id}/${blocking ? 'block' : 'unblock'}`, { method: 'POST', headers: authH() });
      if (r.ok) { notify(blocking ? 'Usuário bloqueado.' : 'Usuário desbloqueado.', { type: 'success' }); void load(); }
      else { const d = await r.json().catch(() => ({})); notify(d.error || 'Falha', { type: 'error' }); }
    } catch { notify('Falha de conexão.', { type: 'error' }); }
  };

  // Reset MFA — admin desativa o 2FA de um usuário (lockout recovery, sem código TOTP).
  const resetMfa = async (u: U) => {
    if (!(await confirmDialog({ title: `Resetar MFA de ${u.name || u.email}?`, message: 'Desativa a autenticação de 2 fatores. Ele poderá logar só com senha e reconfigurar o MFA.', confirmLabel: 'Resetar MFA', tone: 'primary' }))) return;
    try {
      const r = await fetch(`${API_URL}/admin/users/${u.id}/reset-mfa`, { method: 'POST', headers: authH() });
      if (r.ok) { const d = await r.json(); notify(d.message || 'MFA resetado.', { type: 'success' }); void load(); }
      else { const d = await r.json().catch(() => ({})); notify(d.error || 'Falha', { type: 'error' }); }
    } catch { notify('Falha de conexão.', { type: 'error' }); }
  };

  return (
    <Box>
      <TextField placeholder="Buscar por nome ou e-mail..." value={q} onChange={(e) => setQ(e.target.value)} size="small" fullWidth sx={{ mb: 2, '& .MuiOutlinedInput-root': { borderRadius: '14px' } }} />
      {error && <Box sx={{ mb: 2 }}><SectionError message="Falha ao atualizar a lista." onRetry={() => void load()} /></Box>}
      <Stack spacing={1.5}>
        {users.map((u, idx) => (
          <Card key={u.id} variant="outlined" sx={{
            borderRadius: '16px',
            boxShadow: '0 1px 2px rgba(0,0,0,.03), 0 2px 8px rgba(0,0,0,.04), 0 8px 20px rgba(0,0,0,.03)',
            transition: 'box-shadow .15s, border-color .15s',
            '&:hover': { borderColor: 'rgba(32,178,170,.3)', boxShadow: '0 2px 4px rgba(32,178,170,.06), 0 8px 24px rgba(32,178,170,.1)' },
            opacity: u.blocked ? 0.6 : 1,
            animation: `userCardIn .3s ease ${idx * 0.04}s both`,
            '@keyframes userCardIn': { from: { opacity: 0, transform: 'translateY(8px)' }, to: { opacity: u.blocked ? 0.6 : 1, transform: 'translateY(0)' } },
          }}>
            <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', py: 1.5, '&:last-child': { pb: 1.5 } }}>
              {/* AVATAR com foto (se tiver) ou inicial colorida — clicável p/ ZOOM */}
              <PhotoZoom
                src={(u as any).hasPhoto && (u as any).patientId ? photoUrlFor((u as any).patientId) : null}
                caption={<span>{u.name || u.email}{u.email ? ` · ${u.email}` : ''}</span>}
              >
                <Box sx={{
                  width: 44, height: 44, borderRadius: '12px', flexShrink: 0,
                  display: 'grid', placeItems: 'center', overflow: 'hidden',
                  bgcolor: 'rgba(32,178,170,.1)', color: '#178f89', fontWeight: 800, fontSize: 17, fontFamily: 'Poppins, sans-serif',
                  ...(u.blocked ? { filter: 'grayscale(1)' } : {}),
                  ...((u as any).hasPhoto ? { position: 'relative' } : {}),
                }}>
                  {(u as any).hasPhoto && (u as any).patientId
                    ? <Box component="img" src={photoUrlFor((u as any).patientId)} alt={u.name || '?'} loading="lazy" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : (u.name || u.email || '?').charAt(0).toUpperCase()}
                </Box>
              </PhotoZoom>
              <Box sx={{ flex: 1, minWidth: { xs: 120, sm: 180 } }}>
                <Typography component="div" sx={{ fontWeight: 700, fontSize: 15, wordBreak: 'break-word', display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                  {u.name || '—'}
                  {u.role === 'ADMIN' && <Chip size="small" label="ADMIN" color="warning" sx={{ height: 18, fontSize: 10 }} />}
                  {u.blocked && <Chip size="small" label="Bloqueado" color="error" sx={{ height: 18, fontSize: 10 }} />}
                </Typography>
                <Typography variant="caption" color="text.secondary">{u.email}</Typography>
              </Box>
              <Box sx={{ textAlign: 'center', minWidth: 56 }}>
                <Typography sx={{ fontWeight: 800, fontSize: 16, fontVariantNumeric: 'tabular-nums', color: u.credits > 0 ? 'success.main' : 'text.disabled' }}>{u.credits}</Typography>
                <Typography variant="caption" color="text.secondary">créditos</Typography>
              </Box>
              <Box>{u.planExpiresAt && new Date(u.planExpiresAt) > new Date()
                ? <Chip size="small" label="💎 Premium" color="primary" sx={{ fontWeight: 700 }} />
                : <Chip size="small" label="Grátis" variant="outlined" />}</Box>
              <Stack direction="row" spacing={0.5}>
                <IconButton size="small" onClick={() => openEdit(u)} title="Editar" sx={{ '&:hover': { color: 'primary.main' } }}><EditIcon fontSize="small" /></IconButton>
                <IconButton size="small" onClick={() => { void toggleBlock(u); }} title={u.blocked ? 'Desbloquear' : 'Bloquear'} sx={{ color: u.blocked ? 'success.main' : 'warning.main', '&:hover': { bgcolor: u.blocked ? 'rgba(5,150,105,.08)' : 'rgba(245,158,11,.08)' } }}>
                  {u.blocked ? <LockOpenIcon fontSize="small" /> : <BlockIcon fontSize="small" />}
                </IconButton>
                {(u as any).mfaEnabled && <IconButton size="small" onClick={() => { void resetMfa(u); }} title="Resetar MFA (ativo)" sx={{ color: 'info.main' }}>
                  <LockResetIcon fontSize="small" />
                </IconButton>}
                {u.role !== 'ADMIN' && <IconButton size="small" color="error" onClick={() => void openDelete(u)} title="Excluir" sx={{ '&:hover': { bgcolor: 'rgba(239,68,68,.08)' } }}><DeleteIcon fontSize="small" /></IconButton>}
              </Stack>
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
      <Dialog open={!!editUser} onClose={() => setEditUser(null)} PaperProps={{ sx: { borderRadius: '12px' } }}>
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
