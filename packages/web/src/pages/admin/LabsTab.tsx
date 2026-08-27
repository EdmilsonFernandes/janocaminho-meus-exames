import { useEffect, useState, useRef } from 'react';
import {
  Box, Card, CardContent, Stack, Typography, TextField, Button, IconButton,
  Switch, Chip, CircularProgress, Tooltip
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import CloseIcon from '@mui/icons-material/Close';
import UploadIcon from '@mui/icons-material/Upload';
import ColorLensIcon from '@mui/icons-material/ColorLens';
import { useNotify } from 'react-admin';
import { API_URL, token } from '../../config';

interface LabItem {
  id: string;
  name: string;
  color?: string | null;
  aliases?: string[];
  logoUrl?: string | null;
  active?: boolean;
  updatedAt?: string;
}

/** Aba Laboratórios (admin): cadastra as REDES de lab (nome, cor, apelidos de unidade) + upload de LOGO.
 *  O app casa o sourceLab cru extraído do PDF (ex.: "SJC - Bacabal") com a marca por nome/apelidos.
 *  Com logo: mostra a imagem; sem logo: círculo colorido com a inicial. */
export const LabsTab = () => {
  const notify = useNotify();
  const [labs, setLabs] = useState<LabItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form de criação
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#20b2aa');
  const [newAliases, setNewAliases] = useState('');

  // Estado de edição inline por item
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('#20b2aa');
  const [editAliases, setEditAliases] = useState('');

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
    if (!newName.trim()) { notify('Informe o nome da marca', { type: 'warning' }); return; }
    setSaving(true);
    try {
      const r = await fetch(`${API_URL}/admin/labs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({
          name: newName.trim(),
          color: newColor,
          aliases: newAliases.split(',').map((s) => s.trim()).filter(Boolean),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Falha ao criar laboratório');
      setNewName('');
      setNewAliases('');
      setNewColor('#20b2aa');
      setAdding(false);
      notify('Laboratório adicionado com sucesso', { type: 'success' });
      load();
    } catch (e: any) {
      notify(e.message || 'Erro ao salvar', { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (lab: LabItem) => {
    setEditingId(lab.id);
    setEditName(lab.name || '');
    setEditColor(lab.color || '#20b2aa');
    setEditAliases((lab.aliases ?? []).join(', '));
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const saveEdit = async (id: string) => {
    if (!editName.trim()) { notify('O nome não pode ficar vazio', { type: 'warning' }); return; }
    try {
      const patch = {
        name: editName.trim(),
        color: editColor,
        aliases: editAliases.split(',').map((s) => s.trim()).filter(Boolean),
      };
      const r = await fetch(`${API_URL}/admin/labs/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify(patch),
      });
      if (!r.ok) throw new Error('Falha ao atualizar');
      notify('Laboratório atualizado', { type: 'success' });
      setEditingId(null);
      load();
    } catch {
      notify('Falha ao salvar alterações', { type: 'error' });
    }
  };

  const toggleActive = async (lab: LabItem) => {
    try {
      const r = await fetch(`${API_URL}/admin/labs/${lab.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ active: !lab.active }),
      });
      if (!r.ok) throw new Error('Falha');
      load();
    } catch {
      notify('Falha ao alterar status', { type: 'error' });
    }
  };

  const uploadLogo = async (id: string, file: File) => {
    const fd = new FormData();
    fd.append('logo', file);
    try {
      const r = await fetch(`${API_URL}/admin/labs/${id}/logo`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token()}` },
        body: fd,
      });
      if (!r.ok) throw new Error('Falha');
      notify('Logo atualizado com sucesso', { type: 'success' });
      load();
    } catch {
      notify('Falha no upload do logo', { type: 'error' });
    }
  };

  const remove = async (lab: LabItem) => {
    if (!confirm(`Excluir a rede de laboratório "${lab.name}"?`)) return;
    try {
      const r = await fetch(`${API_URL}/admin/labs/${lab.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (!r.ok) throw new Error('Falha');
      notify('Laboratório removido', { type: 'info' });
      load();
    } catch {
      notify('Falha ao excluir', { type: 'error' });
    }
  };

  const activeCount = labs.filter((l) => l.active).length;

  return (
    <Box>
      {/* Cabeçalho */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2} sx={{ mb: 2, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>🏥 Redes de Laboratório</Typography>
          <Typography variant="body2" color="text.secondary">
            {activeCount} ativas de {labs.length} cadastradas — associam o nome do PDF (ex.: "SJC - Bacabal") à marca oficial.
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setAdding(!adding)}
          sx={{ borderRadius: '999px', px: 2.5, textTransform: 'none', fontWeight: 800, bgcolor: '#20b2aa' }}
        >
          {adding ? 'Fechar' : 'Novo laboratório'}
        </Button>
      </Stack>

      {/* Card de Adição de Novo Laboratório */}
      {adding && (
        <Card variant="outlined" sx={{ mb: 3, borderRadius: '16px', border: '2px solid #20b2aa', bgcolor: 'rgba(32,178,170,0.03)' }}>
          <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
            <Typography sx={{ fontWeight: 800, fontSize: 15, color: '#178f89', mb: 1.5 }}>
              ➕ Cadastrar nova rede de laboratório
            </Typography>
            <Stack spacing={2}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="flex-start">
                <TextField
                  label="Nome da marca (ex.: Sabin, Fleury)"
                  size="small"
                  fullWidth
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Nome oficial da rede"
                  sx={{ flex: { sm: 1.2 } }}
                />
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, height: 40, px: 1.5, borderRadius: '10px', border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', width: { xs: '100%', sm: 'auto' } }}>
                  <ColorLensIcon sx={{ fontSize: 18, color: newColor }} />
                  <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', mr: 0.5 }}>Cor da marca</Typography>
                  <input
                    type="color"
                    value={newColor}
                    onChange={(e) => setNewColor(e.target.value)}
                    style={{ width: 28, height: 28, border: 'none', borderRadius: '50%', cursor: 'pointer', background: 'none' }}
                  />
                </Box>
              </Stack>

              <TextField
                label="Apelidos e variações de unidade (separados por vírgula)"
                size="small"
                fullWidth
                value={newAliases}
                onChange={(e) => setNewAliases(e.target.value)}
                placeholder="Ex.: sjc, posto sabin, sabin medicina diagnostica"
                helperText="O leitor de laudo usa estes nomes para identificar a rede automaticamente."
              />

              <Stack direction="row" spacing={1.5} justifyContent="flex-end">
                <Button onClick={() => setAdding(false)} sx={{ textTransform: 'none', color: 'text.secondary' }}>
                  Cancelar
                </Button>
                <Button
                  variant="contained"
                  disabled={saving || !newName.trim()}
                  onClick={create}
                  sx={{ borderRadius: '12px', px: 3, textTransform: 'none', fontWeight: 800, bgcolor: '#20b2aa' }}
                >
                  {saving ? 'Salvando...' : 'Adicionar laboratório'}
                </Button>
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      )}

      {/* Lista de Laboratórios */}
      {loading ? (
        <Box sx={{ py: 6, textAlign: 'center' }}><CircularProgress size={32} sx={{ color: '#20b2aa' }} /></Box>
      ) : labs.length === 0 ? (
        <Card variant="outlined" sx={{ borderRadius: '16px', p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">Nenhum laboratório cadastrado ainda.</Typography>
        </Card>
      ) : (
        <Stack spacing={1.5}>
          {labs.map((lab) => {
            const isEditing = editingId === lab.id;

            return (
              <Card
                key={lab.id}
                variant="outlined"
                sx={{
                  borderRadius: '16px',
                  opacity: lab.active ? 1 : 0.6,
                  transition: 'all 0.2s ease-in-out',
                  borderColor: isEditing ? '#20b2aa' : lab.active ? 'divider' : 'rgba(0,0,0,0.12)',
                  boxShadow: isEditing ? '0 4px 16px rgba(32,178,170,0.12)' : '0 2px 8px rgba(0,0,0,0.02)',
                  '&:hover': { borderColor: '#20b2aa' },
                }}
              >
                <CardContent sx={{ p: { xs: 2, sm: 2.25 }, '&:last-child': { pb: { xs: 2, sm: 2.25 } } }}>
                  {isEditing ? (
                    /* EDIÇÃO INLINE */
                    <Stack spacing={2}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#178f89' }}>
                        ✏️ Editando {lab.name}
                      </Typography>

                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="flex-start">
                        <TextField
                          label="Nome da marca"
                          size="small"
                          fullWidth
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          sx={{ flex: { sm: 1.2 } }}
                        />
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, height: 40, px: 1.5, borderRadius: '10px', border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', width: { xs: '100%', sm: 'auto' } }}>
                          <ColorLensIcon sx={{ fontSize: 18, color: editColor }} />
                          <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>Cor</Typography>
                          <input
                            type="color"
                            value={editColor}
                            onChange={(e) => setEditColor(e.target.value)}
                            style={{ width: 28, height: 28, border: 'none', borderRadius: '50%', cursor: 'pointer', background: 'none' }}
                          />
                        </Box>
                      </Stack>

                      <TextField
                        label="Apelidos e variações (vírgula)"
                        size="small"
                        fullWidth
                        value={editAliases}
                        onChange={(e) => setEditAliases(e.target.value)}
                        placeholder="sjc, posto sabin, matriz"
                      />

                      <Stack direction="row" spacing={1} justifyContent="flex-end">
                        <Button size="small" onClick={cancelEdit} startIcon={<CloseIcon />} sx={{ textTransform: 'none', color: 'text.secondary' }}>
                          Cancelar
                        </Button>
                        <Button
                          size="small"
                          variant="contained"
                          onClick={() => saveEdit(lab.id)}
                          startIcon={<SaveIcon />}
                          sx={{ borderRadius: '10px', px: 2.5, textTransform: 'none', fontWeight: 800, bgcolor: '#20b2aa' }}
                        >
                          Salvar alterações
                        </Button>
                      </Stack>
                    </Stack>
                  ) : (
                    /* VISUALIZAÇÃO DE CARD PREMIUM */
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'flex-start', sm: 'center' }}>
                      {/* Logo Avatar + Upload button */}
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexShrink: 0 }}>
                        {lab.logoUrl ? (
                          <Box
                            component="img"
                            src={`${API_URL}/labs/${lab.id}/logo?${lab.updatedAt || ''}`}
                            alt={lab.name}
                            sx={{ width: 46, height: 46, borderRadius: '50%', objectFit: 'cover', bgcolor: '#fff', border: '2px solid', borderColor: lab.color || '#20b2aa', p: 0.25 }}
                          />
                        ) : (
                          <Box
                            sx={{
                              width: 46, height: 46, borderRadius: '50%', display: 'grid', placeItems: 'center',
                              bgcolor: (lab.color || '#20b2aa') + '20', color: lab.color || '#20b2aa',
                              fontWeight: 800, fontSize: 20, border: '2px solid', borderColor: (lab.color || '#20b2aa') + '50'
                            }}
                          >
                            {(lab.name || '?').charAt(0).toUpperCase()}
                          </Box>
                        )}
                        <Button
                          size="small"
                          component="label"
                          startIcon={<UploadIcon sx={{ fontSize: 16 }} />}
                          sx={{ textTransform: 'none', fontWeight: 700, fontSize: 12, color: '#178f89', bgcolor: 'rgba(32,178,170,0.08)', px: 1.5, py: 0.5, borderRadius: '8px', '&:hover': { bgcolor: 'rgba(32,178,170,0.18)' } }}
                        >
                          {lab.logoUrl ? 'Trocar logo' : 'Subir logo'}
                          <input
                            type="file"
                            hidden
                            accept="image/png,image/jpeg"
                            ref={(el) => { fileRefs.current[lab.id] = el; }}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) uploadLogo(lab.id, f);
                              e.target.value = '';
                            }}
                          />
                        </Button>
                      </Box>

                      {/* Informações da Marca */}
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5, flexWrap: 'wrap' }}>
                          <Typography sx={{ fontWeight: 800, fontSize: 16, color: 'text.primary' }}>
                            {lab.name}
                          </Typography>
                          <Chip
                            size="small"
                            label={lab.active ? 'Ativo' : 'Inativo'}
                            color={lab.active ? 'success' : 'default'}
                            sx={{ height: 20, fontSize: 10.5, fontWeight: 800 }}
                          />
                          <Box
                            title={`Cor da marca: ${lab.color || '#20b2aa'}`}
                            sx={{ width: 14, height: 14, borderRadius: '50%', bgcolor: lab.color || '#20b2aa', border: '1px solid rgba(0,0,0,0.15)' }}
                          />
                        </Stack>

                        {/* Apelidos em Chips elegantes */}
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.75 }}>
                          {(lab.aliases ?? []).length === 0 ? (
                            <Typography variant="caption" sx={{ color: 'text.disabled', fontStyle: 'italic' }}>
                              Sem apelidos cadastrados
                            </Typography>
                          ) : (
                            (lab.aliases ?? []).map((alias: string, idx: number) => (
                              <Tooltip key={idx} title={`Apelido: ${alias}`}>
                                <Chip
                                  size="small"
                                  label={alias}
                                  sx={{
                                    height: 22,
                                    fontSize: 11,
                                    fontWeight: 600,
                                    bgcolor: 'action.hover',
                                    border: '1px solid',
                                    borderColor: 'divider',
                                    color: 'text.secondary',
                                  }}
                                />
                              </Tooltip>
                            ))
                          )}
                        </Box>
                      </Box>

                      {/* Ações à direita */}
                      <Stack direction="row" alignItems="center" spacing={0.75} sx={{ alignSelf: { xs: 'flex-end', sm: 'center' }, flexShrink: 0 }}>
                        <Tooltip title={lab.active ? 'Desativar laboratório' : 'Ativar laboratório'}>
                          <Switch
                            size="small"
                            checked={!!lab.active}
                            onChange={() => toggleActive(lab)}
                            color="success"
                          />
                        </Tooltip>
                        <Tooltip title="Editar nome, cor ou apelidos">
                          <IconButton
                            size="small"
                            onClick={() => startEdit(lab)}
                            sx={{ color: 'text.secondary', '&:hover': { color: '#178f89', bgcolor: 'rgba(32,178,170,0.1)' } }}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Excluir laboratório">
                          <IconButton
                            size="small"
                            onClick={() => remove(lab)}
                            sx={{ color: 'text.secondary', '&:hover': { color: 'error.main', bgcolor: 'rgba(239,68,68,0.1)' } }}
                          >
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </Stack>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </Stack>
      )}
    </Box>
  );
};
