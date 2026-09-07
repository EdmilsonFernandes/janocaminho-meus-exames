import { useState } from 'react';
import { Box, Stack, Typography, Button, Card, CardContent, TextField, MenuItem, Divider, Alert, CircularProgress, IconButton } from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import { API_URL, doctorPhotoUrl } from '../../../config';
import { PhotoUpload } from '../../PhotoUpload';
import { MfaSetupCard } from '../../mfa/MfaSetupCard';
import { SPECIALTIES } from '../../../utils/medicalData';

/** Empty state compacto das views do portal. */
export const Empty = ({ label, icon = '📭' }: { label: string; icon?: string }) => (
  <Card sx={{ borderRadius: '20px', border: '1px solid', borderColor: 'divider', boxShadow: '0 2px 10px rgba(0,0,0,0.04)' }}><CardContent><Box sx={{ textAlign: 'center', py: 4 }}>
    <Box sx={{ fontSize: 44, mb: 1 }}>{icon}</Box>
    <Typography color="text.secondary" sx={{ fontWeight: 500 }}>{label}</Typography>
  </Box></CardContent></Card>
);

/** #1 Anotações clínicas (histórico de atendimento) — adicionar / editar / excluir. */
export const NotesTab = ({ notes, newNote, setNewNote, onAdd, onDelete, onSave }: { notes: any[]; newNote: string; setNewNote: (s: string) => void; onAdd: () => void; onDelete: (id: string) => void; onSave: (id: string, content: string) => void }) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const btnSx = { borderRadius: '999px', textTransform: 'none', fontWeight: 800, bgcolor: 'primary.dark', '&:hover': { bgcolor: 'primary.main' } } as const;
  return (
    <Box>
      <Card
        sx={{
          mb: 2,
          borderRadius: '20px',
          border: '1px solid',
          borderColor: (t) => (t.palette.mode === 'dark' ? 'rgba(32,178,170,0.2)' : '#d8ece9'),
          background: (t) =>
            t.palette.mode === 'dark'
              ? 'radial-gradient(ellipse 90% 70% at 10% 0%, rgba(32,178,170,0.08), transparent 70%), #152223'
              : 'radial-gradient(ellipse 90% 70% at 10% 0%, rgba(32,178,170,0.04), transparent 70%), #ffffff',
          boxShadow: (t) => (t.palette.mode === 'dark' ? '0 4px 20px rgba(0,0,0,0.25)' : '0 4px 14px rgba(32,178,170,0.05)'),
        }}
      >
        <CardContent sx={{ p: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 1.25, fontWeight: 800, color: 'primary.dark' }}>📝 Nova anotação</Typography>
          <TextField value={newNote} onChange={(e) => setNewNote(e.target.value)} multiline minRows={2} fullWidth size="small" placeholder="Conduta, observação clínica, retorno solicitado…" sx={{ '& .MuiOutlinedInput-root': { borderRadius: '14px' } }} />
          <Button variant="contained" onClick={onAdd} disabled={!newNote.trim()} sx={{ mt: 1.25, px: 2.5, ...btnSx }}>Adicionar anotação</Button>
        </CardContent>
      </Card>
      {notes.length === 0 && <Empty label="Nenhuma anotação ainda. Use o campo acima pra registrar uma conduta." icon="📝" />}
      <Stack spacing={1.25}>
        {notes.map((n) => (
          <Card
            key={n.id}
            variant="outlined"
            sx={{
              borderRadius: '20px',
              borderColor: 'divider',
              boxShadow: (t) => (t.palette.mode === 'dark' ? '0 2px 10px rgba(0,0,0,0.2)' : '0 2px 8px rgba(0,0,0,0.03)'),
              transition: 'transform 0.18s ease, box-shadow 0.18s ease',
              '&:hover': {
                transform: 'translateY(-2px)',
                boxShadow: (t) => (t.palette.mode === 'dark' ? '0 6px 18px rgba(0,0,0,0.3)' : '0 4px 12px rgba(32,178,170,0.1)'),
              },
            }}
          >
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              {editingId === n.id ? (
                <>
                  <TextField value={editText} onChange={(e) => setEditText(e.target.value)} multiline minRows={2} fullWidth size="small" autoFocus sx={{ '& .MuiOutlinedInput-root': { borderRadius: '14px' } }} />
                  <Stack direction="row" spacing={1} sx={{ mt: 1.25 }}>
                    <Button size="small" variant="contained" disabled={!editText.trim()} onClick={() => { onSave(n.id, editText.trim()); setEditingId(null); }} sx={btnSx}>Salvar</Button>
                    <Button size="small" onClick={() => setEditingId(null)} sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 700 }}>Cancelar</Button>
                  </Stack>
                </>
              ) : (
                <>
                  <Typography sx={{ whiteSpace: 'pre-wrap', fontSize: 14.5, color: 'text.primary', lineHeight: 1.5 }}>{n.content}</Typography>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 1.25 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>{new Date(n.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</Typography>
                    <Stack direction="row" spacing={0.5}>
                      <IconButton aria-label="Editar anotação" size="small" sx={{ color: 'text.secondary' }} onClick={() => { setEditingId(n.id); setEditText(n.content); }}><EditOutlinedIcon fontSize="small" /></IconButton>
                      <IconButton aria-label="Excluir anotação" size="small" sx={{ color: 'error.main' }} onClick={() => onDelete(n.id)}><DeleteOutlinedIcon fontSize="small" /></IconButton>
                    </Stack>
                  </Stack>
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </Stack>
    </Box>
  );
};
