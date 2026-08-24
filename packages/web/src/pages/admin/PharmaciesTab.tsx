import { useEffect, useState } from 'react';
import { Box, Button, Card, CardContent, Chip, CircularProgress, IconButton, Stack, Switch, TextField, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import { API_URL, token } from '../../config';

interface Pharmacy {
  id: string; name: string; slug: string; hostname: string;
  logoUrl?: string | null; color?: string | null; active: boolean; sortOrder: number;
}

/** Admin → Farmácias: CRUD de farmácias VTEX (o worker lê daqui). */
export const PharmaciesTab = () => {
  const [rows, setRows] = useState<Pharmacy[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', hostname: '', logoUrl: '', color: '#20b2aa' });

  const load = async () => {
    const r = await fetch(`${API_URL}/admin/pharmacies`, { headers: { Authorization: `Bearer ${token()}` } });
    setRows(r.ok ? await r.json() : []);
  };
  useEffect(() => { void load(); }, []);

  const save = async () => {
    const r = await fetch(`${API_URL}/admin/pharmacies`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ ...form, slug: form.name.toLowerCase().replace(/\s+/g, '-') }),
    });
    if (r.ok) { setAdding(false); setForm({ name: '', hostname: '', logoUrl: '', color: '#20b2aa' }); void load(); }
  };

  const toggle = async (p: Pharmacy) => {
    await fetch(`${API_URL}/admin/pharmacies/${p.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ active: !p.active }),
    });
    void load();
  };

  const updateLogo = async (p: Pharmacy, logoUrl: string) => {
    await fetch(`${API_URL}/admin/pharmacies/${p.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ logoUrl }),
    });
    void load();
  };

  const remove = async (p: Pharmacy) => {
    if (!confirm(`Remover ${p.name}?`)) return;
    await fetch(`${API_URL}/admin/pharmacies/${p.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } });
    void load();
  };

  if (rows === null) return <CircularProgress />;
  const activeCount = rows.filter((r) => r.active).length;

  return (
    <Stack spacing={2}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>🏪 Farmácias</Typography>
          <Typography variant="body2" color="text.secondary">
            {activeCount} ativas de {rows.length} — o comparador de preços busca em todas as ativas
          </Typography>
        </Box>
        <Chip icon={<AddIcon />} label="Adicionar" onClick={() => setAdding(true)} sx={{ cursor: 'pointer', fontWeight: 700 }} />
      </Stack>

      {adding && (
        <Card sx={{ p: 2, borderRadius: '12px', border: '2px solid', borderColor: 'primary.main' }}>
          <Stack spacing={1.5}>
            <TextField size="small" label="Nome (ex.: Drogaria XYZ)" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            <TextField size="small" label="Hostname VTEX (ex.: www.drogariaxyz.com.br)" value={form.hostname} onChange={(e) => setForm((f) => ({ ...f, hostname: e.target.value }))} />
            <TextField size="small" label="URL do logo (https://...)" value={form.logoUrl} onChange={(e) => setForm((f) => ({ ...f, logoUrl: e.target.value }))} />
            <Stack direction="row" spacing={1}>
              <Button variant="contained" onClick={() => void save()} disabled={!form.name || !form.hostname} sx={{ borderRadius: '999px', textTransform: 'none' }}>Salvar</Button>
              <Button onClick={() => setAdding(false)} sx={{ textTransform: 'none' }}>Cancelar</Button>
            </Stack>
          </Stack>
        </Card>
      )}

      {rows.map((p) => (
        <Card key={p.id} sx={{
          p: 2, borderRadius: '16px', border: '1px solid', borderColor: p.active ? 'divider' : 'error.light',
          opacity: p.active ? 1 : 0.5, transition: 'all .15s',
          '&:hover': { borderColor: 'primary.main', boxShadow: '0 4px 12px rgba(32,178,170,.08)' },
        }}>
          <Stack direction="row" spacing={2} alignItems="center">
            {/* LOGO ou badge */}
            {p.logoUrl ? (
              <Box component="img" src={p.logoUrl} alt={p.name} sx={{ width: 48, height: 48, borderRadius: '12px', objectFit: 'contain', bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider' }} />
            ) : (
              <Box sx={{ width: 48, height: 48, borderRadius: '12px', display: 'grid', placeItems: 'center', bgcolor: (p.color || '#20b2aa') + '18', color: p.color || '#20b2aa', fontWeight: 800, fontSize: 18 }}>
                {p.name?.charAt(0)}
              </Box>
            )}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography sx={{ fontWeight: 700, fontSize: 15 }}>{p.name}</Typography>
                <Chip size="small" label={p.active ? 'ativa' : 'pausada'} color={p.active ? 'success' : 'default'} sx={{ height: 20, fontSize: 10 }} />
              </Stack>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>{p.hostname}</Typography>
              {editing === p.id ? (
                <TextField size="small" fullWidth placeholder="URL do logo" defaultValue={p.logoUrl || ''}
                  onBlur={(e) => { void updateLogo(p, e.target.value); setEditing(null); }}
                  sx={{ mt: 1 }} />
              ) : (
                <Typography variant="caption" sx={{ color: 'text.disabled' }} onClick={() => setEditing(p.id)} style={{ cursor: 'pointer' }}>
                  {p.logoUrl ? '🖼️ logo definido (clique p/ trocar)' : 'sem logo — clique p/ adicionar'}
                </Typography>
              )}
            </Box>
            <Stack direction="row" spacing={1} alignItems="center">
              <Switch checked={p.active} onChange={() => void toggle(p)} color="primary" />
              <IconButton size="small" onClick={() => void remove(p)} aria-label={`Remover ${p.name}`} sx={{ '&:hover': { color: 'error.main' } }}>
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </Stack>
          </Stack>
        </Card>
      ))}
    </Stack>
  );
};
