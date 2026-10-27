import { useState } from 'react';
import { Box, Stack, Typography, Button, Card, CardContent, TextField, Chip, IconButton } from '@mui/material';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import { tealText } from '../../../theme';

/** Modelos rápidos clínicos para o médico preencher com 1 clique. */
const getTemplates = (patient?: any) => [
  {
    icon: '⚖️',
    label: 'Peso / Sinais',
    text: `Peso: ${patient?.weight ? `${patient.weight} kg` : '___ kg'} · PA: ___x___ mmHg · FC: ___ bpm`,
  },
  {
    icon: '🩺',
    label: 'Conduta',
    text: 'Conduta: Paciente orientado sobre o quadro clínico. Manter medicações habituais e estilo de vida saudável.',
  },
  {
    icon: '💊',
    label: 'Ajuste de Remédio',
    text: 'Ajuste medicamentoso: Ajustada dosagem de [Medicamento]. Orientado posologia e horários.',
  },
  {
    icon: '📅',
    label: 'Retorno 60d',
    text: 'Retorno solicitado em 60 dias com novos exames laboratoriais de acompanhamento.',
  },
  {
    icon: '🥗',
    label: 'Estilo de Vida',
    text: 'Orientações: Reforçado hábito de hidratação, controle de sal/açúcar e prática regular de atividade física.',
  },
  {
    icon: '⚠️',
    label: 'Sinais de Alerta',
    text: 'Sinais de alerta explicados. Se dor aguda, falta de ar ou PA > 140x90, buscar pronto atendimento.',
  },
];

/** Empty state compacto das views do portal. */
export const Empty = ({ label, icon = '📭' }: { label: string; icon?: string }) => (
  <Card sx={{ borderRadius: '20px', border: '1px solid', borderColor: 'divider', boxShadow: '0 2px 10px rgba(0,0,0,0.04)' }}><CardContent><Box sx={{ textAlign: 'center', py: 4 }}>
    <Box sx={{ fontSize: 44, mb: 1 }}>{icon}</Box>
    <Typography color="text.secondary" sx={{ fontWeight: 500 }}>{label}</Typography>
  </Box></CardContent></Card>
);

/** #1 Anotações clínicas (histórico de atendimento) — adicionar / editar / excluir. */
export const NotesTab = ({
  notes,
  newNote,
  setNewNote,
  onAdd,
  onDelete,
  onSave,
  patient,
}: {
  notes: any[];
  newNote: string;
  setNewNote: (s: string) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  onSave: (id: string, content: string) => void;
  patient?: any;
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const btnSx = { borderRadius: '999px', textTransform: 'none', fontWeight: 800, bgcolor: 'primary.dark', '&:hover': { bgcolor: 'primary.main' } } as const;

  const templates = getTemplates(patient);

  const applyTemplate = (tplText: string) => {
    if (!newNote.trim()) {
      setNewNote(tplText);
    } else {
      setNewNote(`${newNote.trim()}\n\n${tplText}`);
    }
  };

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
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 800, color: (t) => tealText(t.palette.mode) }}>
              📝 Nova anotação clínica
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Prontuário rápido
            </Typography>
          </Stack>

          {/* Modelos rápidos pré-formatados com 1 clique */}
          <Box sx={{ mb: 1.5 }}>
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 0.75 }}>
              ⚡ Modelos rápidos (toque para preencher):
            </Typography>
            <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', gap: 0.75 }}>
              {templates.map((tpl) => (
                <Chip
                  key={tpl.label}
                  size="small"
                  icon={<span style={{ fontSize: 13 }}>{tpl.icon}</span>}
                  label={tpl.label}
                  onClick={() => applyTemplate(tpl.text)}
                  sx={{
                    borderRadius: '999px',
                    fontWeight: 600,
                    fontSize: 12,
                    bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(32,178,170,0.12)' : 'rgba(32,178,170,0.08)'),
                    color: (t) => tealText(t.palette.mode),
                    border: '1px solid',
                    borderColor: (t) => (t.palette.mode === 'dark' ? 'rgba(32,178,170,0.3)' : 'rgba(32,178,170,0.25)'),
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    '&:hover': {
                      bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(32,178,170,0.22)' : 'rgba(32,178,170,0.16)'),
                      borderColor: '#20b2aa',
                      transform: 'translateY(-1px)',
                    },
                  }}
                />
              ))}
            </Stack>
          </Box>

          <TextField
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            multiline
            minRows={2.5}
            fullWidth
            size="small"
            placeholder="Conduta, observação clínica, sinais vitais, retorno solicitado…"
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: '14px' } }}
          />
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1.25 }}>
            <Button variant="contained" onClick={onAdd} disabled={!newNote.trim()} sx={{ px: 2.5, ...btnSx }}>
              Adicionar anotação
            </Button>
            {newNote.trim() && (
              <Button
                size="small"
                variant="text"
                onClick={() => setNewNote('')}
                sx={{ textTransform: 'none', color: 'text.secondary', borderRadius: '999px' }}
              >
                Limpar
              </Button>
            )}
          </Stack>
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
