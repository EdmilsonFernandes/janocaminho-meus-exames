import { useEffect, useState } from 'react';
import {
  Box, Button, Card, CardContent, Chip, CircularProgress, IconButton, Stack,
  Switch, TextField, Typography, Tooltip
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import CloseIcon from '@mui/icons-material/Close';
import { API_URL, token } from '../../config';

interface Pharmacy {
  id: string;
  name: string;
  slug: string;
  hostname: string;
  logoUrl?: string | null;
  color?: string | null;
  active: boolean;
  sortOrder: number;
}

/** Admin → Farmácias: CRUD de farmácias VTEX (o worker de preços lê daqui). */
export const PharmaciesTab = () => {
  const [rows, setRows] = useState<Pharmacy[] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLogoUrl, setEditingLogoUrl] = useState('');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', hostname: '', logoUrl: '', color: '#20b2aa' });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const r = await fetch(`${API_URL}/admin/pharmacies`, { headers: { Authorization: `Bearer ${token()}` } });
      setRows(r.ok ? await r.json() : []);
    } catch {
      setRows([]);
    }
  };

  useEffect(() => { void load(); }, []);

  const save = async () => {
    if (!form.name.trim() || !form.hostname.trim()) return;
    setSaving(true);
    try {
      const r = await fetch(`${API_URL}/admin/pharmacies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ ...form, slug: form.name.toLowerCase().replace(/\s+/g, '-') }),
      });
      if (r.ok) {
        setAdding(false);
        setForm({ name: '', hostname: '', logoUrl: '', color: '#20b2aa' });
        await load();
      }
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (p: Pharmacy) => {
    await fetch(`${API_URL}/admin/pharmacies/${p.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ active: !p.active }),
    });
    void load();
  };

  const updateLogo = async (p: Pharmacy, logoUrl: string) => {
    await fetch(`${API_URL}/admin/pharmacies/${p.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ logoUrl }),
    });
    setEditingId(null);
    void load();
  };

  const remove = async (p: Pharmacy) => {
    if (!confirm(`Remover a farmácia ${p.name}?`)) return;
    await fetch(`${API_URL}/admin/pharmacies/${p.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } });
    void load();
  };

  if (rows === null) {
    return (
      <Box sx={{ py: 6, textAlign: 'center' }}>
        <CircularProgress size={32} sx={{ color: '#20b2aa' }} />
      </Box>
    );
  }

  const activeCount = rows.filter((r) => r.active).length;

  return (
    <Stack spacing={2.5}>
      {/* Cabeçalho Responsivo */}
      <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'flex-start', sm: 'center' }} justifyContent="space-between" spacing={2} sx={{ mb: 1 }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>🏪 Farmácias Integradas</Typography>
          <Typography variant="body2" color="text.secondary">
            {activeCount} ativas de {rows.length} cadastradas — o comparador de preços busca em todas as parceiras ativas.
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setAdding(!adding)}
          sx={{ borderRadius: '999px', px: 2.5, textTransform: 'none', fontWeight: 800, bgcolor: '#20b2aa', alignSelf: { xs: 'stretch', sm: 'auto' } }}
        >
          {adding ? 'Fechar' : 'Adicionar farmácia'}
        </Button>
      </Stack>

      {/* Form de Cadastro */}
      {adding && (
        <Card variant="outlined" sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: '16px', border: '2px solid #20b2aa', bgcolor: 'rgba(32,178,170,0.03)' }}>
          <Typography sx={{ fontWeight: 800, fontSize: 15, color: '#178f89', mb: 2 }}>
            ➕ Cadastrar Nova Parceira (VTEX)
          </Typography>
          <Stack spacing={2}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                size="small"
                fullWidth
                label="Nome da farmácia"
                placeholder="Ex.: Drogaria Pague Menos"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
              <TextField
                size="small"
                fullWidth
                label="Hostname VTEX"
                placeholder="Ex.: www.paguemenos.com.br"
                value={form.hostname}
                onChange={(e) => setForm((f) => ({ ...f, hostname: e.target.value }))}
              />
            </Stack>
            <TextField
              size="small"
              fullWidth
              label="URL do Logo (HTTPS)"
              placeholder="https://sua-cdn.com/logo.png"
              value={form.logoUrl}
              onChange={(e) => setForm((f) => ({ ...f, logoUrl: e.target.value }))}
            />
            <Stack direction="row" spacing={1.5} justifyContent="flex-end">
              <Button onClick={() => setAdding(false)} sx={{ textTransform: 'none', color: 'text.secondary' }}>
                Cancelar
              </Button>
              <Button
                variant="contained"
                onClick={() => void save()}
                disabled={saving || !form.name.trim() || !form.hostname.trim()}
                sx={{ borderRadius: '12px', px: 3, textTransform: 'none', fontWeight: 800, bgcolor: '#20b2aa' }}
              >
                {saving ? 'Salvando...' : 'Salvar farmácia'}
              </Button>
            </Stack>
          </Stack>
        </Card>
      )}

      {/* Lista de Farmácias */}
      {rows.length === 0 ? (
        <Card variant="outlined" sx={{ borderRadius: '16px', p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">Nenhuma farmácia cadastrada.</Typography>
        </Card>
      ) : (
        rows.map((p) => (
          <Card
            key={p.id}
            variant="outlined"
            sx={{
              borderRadius: '16px',
              opacity: p.active ? 1 : 0.6,
              transition: 'all .2s ease-in-out',
              borderColor: p.active ? 'divider' : 'rgba(0,0,0,0.12)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
              '&:hover': { borderColor: '#20b2aa' },
            }}
          >
            <CardContent sx={{ p: { xs: 2, sm: 2.25 }, '&:last-child': { pb: { xs: 2, sm: 2.25 } } }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'flex-start', sm: 'center' }}>
                {/* Logo ou Inicial */}
                <Box sx={{ flexShrink: 0 }}>
                  {p.logoUrl ? (
                    <Box
                      component="img"
                      src={p.logoUrl}
                      alt={p.name}
                      sx={{ width: 48, height: 48, borderRadius: '12px', objectFit: 'contain', bgcolor: '#fff', border: '1px solid', borderColor: 'divider', p: 0.5 }}
                    />
                  ) : (
                    <Box
                      sx={{
                        width: 48, height: 48, borderRadius: '12px', display: 'grid', placeItems: 'center',
                        bgcolor: (p.color || '#20b2aa') + '18', color: p.color || '#20b2aa',
                        fontWeight: 800, fontSize: 20
                      }}
                    >
                      {p.name?.charAt(0).toUpperCase()}
                    </Box>
                  )}
                </Box>

                {/* Detalhes da Marca */}
                <Box sx={{ flex: 1, minWidth: 0, width: '100%' }}>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5, flexWrap: 'wrap' }}>
                    <Typography sx={{ fontWeight: 800, fontSize: 16 }}>{p.name}</Typography>
                    <Chip
                      size="small"
                      label={p.active ? 'Ativa' : 'Pausada'}
                      color={p.active ? 'success' : 'default'}
                      sx={{ height: 20, fontSize: 11, fontWeight: 800 }}
                    />
                  </Stack>
                  <Typography variant="body2" sx={{ color: 'text.secondary', fontFamily: 'monospace', fontSize: 13, wordBreak: 'break-all' }}>
                    {p.hostname}
                  </Typography>

                  {editingId === p.id ? (
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
                      <TextField
                        size="small"
                        fullWidth
                        placeholder="URL do logo (https://...)"
                        value={editingLogoUrl}
                        onChange={(e) => setEditingLogoUrl(e.target.value)}
                      />
                      <Button
                        size="small"
                        variant="contained"
                        startIcon={<SaveIcon />}
                        onClick={() => void updateLogo(p, editingLogoUrl)}
                        sx={{ bgcolor: '#20b2aa', textTransform: 'none', fontWeight: 800, flexShrink: 0 }}
                      >
                        Salvar
                      </Button>
                      <IconButton size="small" onClick={() => setEditingId(null)}>
                        <CloseIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                  ) : (
                    <Typography
                      variant="caption"
                      sx={{ color: '#178f89', cursor: 'pointer', display: 'inline-block', mt: 0.5, fontWeight: 600 }}
                      onClick={() => { setEditingId(p.id); setEditingLogoUrl(p.logoUrl || ''); }}
                    >
                      {p.logoUrl ? '🖼️ Editar URL do logo' : '➕ Adicionar URL do logo'}
                    </Typography>
                  )}
                </Box>

                {/* Ações */}
                <Stack direction="row" spacing={1} alignItems="center" sx={{ alignSelf: { xs: 'flex-end', sm: 'center' }, flexShrink: 0 }}>
                  <Tooltip title={p.active ? 'Pausar parceiro' : 'Ativar parceiro'}>
                    <Switch checked={p.active} onChange={() => void toggle(p)} color="success" />
                  </Tooltip>
                  <Tooltip title="Remover farmácia">
                    <IconButton size="small" onClick={() => void remove(p)} sx={{ '&:hover': { color: 'error.main' } }}>
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        ))
      )}
    </Stack>
  );
};
