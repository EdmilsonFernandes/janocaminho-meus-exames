import { useEffect, useState, useRef } from 'react';
import { Box, Card, CardContent, Stack, Typography, TextField, Button, IconButton, Switch, Chip, CircularProgress } from '@mui/material';
import UploadIcon from '@mui/icons-material/Upload';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import { useNotify } from 'react-admin';
import { API_URL, token } from '../../config';

/** Aba Laboratórios (admin): cadastra as REDES de lab (nome, cor, apelidos de unidade) + upload de LOGO.
 *  O app casa o sourceLab cru extraído do PDF (ex.: "SJC - Bacabal") com a marca por nome/apelidos.
 *  Com logo: mostra a imagem; sem logo: círculo colorido com a inicial. */
export const LabsTab = () => {
  const notify = useNotify();
  const [labs, setLabs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#20b2aa');
  const [newAliases, setNewAliases] = useState('');
  const [saving, setSaving] = useState(false);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const load = () => {
    setLoading(true);
    fetch(`${API_URL}/admin/labs`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => r.json())
      .then((d) => setLabs(d.labs ?? []))
      .catch(() => notify('Falha ao carregar laboratórios', { type: 'error' }))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!newName.trim()) { notify('Informe o nome', { type: 'warning' }); return; }
    setSaving(true);
    try {
      const r = await fetch(`${API_URL}/admin/labs`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ name: newName.trim(), color: newColor, aliases: newAliases.split(',').map((s) => s.trim()).filter(Boolean) }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Falha');
      setNewName(''); setNewAliases('');
      notify('Laboratório adicionado', { type: 'success' });
      load();
    } catch (e: any) { notify(e.message, { type: 'error' }); } finally { setSaving(false); }
  };

  const update = async (id: string, patch: any) => {
    try {
      const r = await fetch(`${API_URL}/admin/labs/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` }, body: JSON.stringify(patch) });
      if (!r.ok) throw new Error('Falha');
      load();
    } catch { notify('Falha ao salvar', { type: 'error' }); }
  };

  const uploadLogo = async (id: string, file: File) => {
    const fd = new FormData(); fd.append('logo', file);
    try {
      const r = await fetch(`${API_URL}/admin/labs/${id}/logo`, { method: 'POST', headers: { Authorization: `Bearer ${token()}` }, body: fd });
      if (!r.ok) throw new Error('Falha');
      notify('Logo salvo', { type: 'success' });
      load();
    } catch { notify('Falha no upload do logo', { type: 'error' }); }
  };

  const remove = async (id: string) => {
    if (!confirm('Excluir este laboratório?')) return;
    try { await fetch(`${API_URL}/admin/labs/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } }); load(); } catch { notify('Falha ao excluir', { type: 'error' }); }
  };

  return (
    <Box>
      <Typography variant="h6" sx={{ fontWeight: 800, mb: 0.5 }}>Laboratórios</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Cadastre as redes de laboratório (nome, cor, apelidos de unidade) e suba o logo. O app casa o que vem no PDF (ex.: "SJC - Bacabal") com a marca pelo nome/apelidos.
      </Typography>

      <Card sx={{ mb: 2, borderRadius: 3 }}><CardContent>
        <Typography sx={{ fontWeight: 700, mb: 1.5 }}>➕ Adicionar laboratório</Typography>
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ rowGap: 1, alignItems: 'center' }}>
          <TextField label="Nome (marca)" size="small" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ex.: Sabin" sx={{ minWidth: 200 }} />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Typography variant="caption" color="text.secondary">Cor</Typography>
            <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)} style={{ width: 38, height: 38, border: 'none', borderRadius: 8, cursor: 'pointer' }} />
          </Box>
          <TextField label="Apelidos (vírgula)" size="small" value={newAliases} onChange={(e) => setNewAliases(e.target.value)} placeholder="sjc, posto sabin" sx={{ minWidth: 220 }} />
          <Button variant="contained" startIcon={<AddIcon />} disabled={saving} onClick={create} sx={{ textTransform: 'none', fontWeight: 700, bgcolor: '#20b2aa' }}>Adicionar</Button>
        </Stack>
      </CardContent></Card>

      {loading ? <CircularProgress /> : (
        <Stack spacing={1.5}>
          {labs.map((lab) => (
            <Card key={lab.id} sx={{ borderRadius: 3, opacity: lab.active ? 1 : 0.55 }}><CardContent>
              <Stack direction="row" spacing={1.5} useFlexGap flexWrap="wrap" sx={{ rowGap: 1, alignItems: 'center' }}>
                {/* Logo ou círculo colorido */}
                {lab.logoUrl
                  ? <Box component="img" src={`${API_URL}/labs/${lab.id}/logo?${lab.updatedAt || ''}`} alt={lab.name} sx={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', bgcolor: '#fff', border: '1px solid', borderColor: 'divider' }} />
                  : <Box sx={{ width: 44, height: 44, borderRadius: '50%', display: 'grid', placeItems: 'center', bgcolor: lab.color || '#20b2aa', color: '#fff', fontWeight: 800, fontSize: 18 }}>{(lab.name || '?').charAt(0)}</Box>}
                <Box sx={{ flex: '1 1 220px', minWidth: 220 }}>
                  <TextField size="small" defaultValue={lab.name} onBlur={(e) => { if (e.target.value !== lab.name) update(lab.id, { name: e.target.value }); }} label="Nome" sx={{ width: '100%', mb: 0.75 }} />
                  <TextField size="small" defaultValue={(lab.aliases ?? []).join(', ')} onBlur={(e) => update(lab.id, { aliases: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} label="Apelidos (vírgula)" sx={{ width: '100%' }} />
                </Box>
                <Stack spacing={0.75} alignItems="flex-start">
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <input type="color" defaultValue={lab.color || '#20b2aa'} onBlur={(e) => update(lab.id, { color: e.target.value })} title="Cor da marca" style={{ width: 32, height: 32, border: 'none', borderRadius: 6, cursor: 'pointer' }} />
                    <Switch size="small" checked={!!lab.active} onChange={(_, v) => update(lab.id, { active: v })} title="Ativo" />
                    <IconButton size="small" onClick={() => remove(lab.id)} title="Excluir"><DeleteIcon fontSize="small" /></IconButton>
                  </Box>
                  <Button size="small" startIcon={<UploadIcon />} component="label" sx={{ textTransform: 'none', fontWeight: 700, color: '#178f89' }}>
                    {lab.logoUrl ? 'Trocar logo' : 'Subir logo'}
                    <input type="file" hidden accept="image/png,image/jpeg" ref={(el) => { fileRefs.current[lab.id] = el; }} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLogo(lab.id, f); e.target.value = ''; }} />
                  </Button>
                  {(lab.aliases ?? []).slice(0, 4).map((a: string, i: number) => <Chip key={i} size="small" label={a} sx={{ height: 18, fontSize: 10, mr: 0.25 }} />)}
                </Stack>
              </Stack>
            </CardContent></Card>
          ))}
          {!loading && labs.length === 0 && <Typography color="text.secondary">Nenhum laboratório cadastrado.</Typography>}
        </Stack>
      )}
    </Box>
  );
};
