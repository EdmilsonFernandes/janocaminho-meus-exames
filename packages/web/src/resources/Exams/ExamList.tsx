import { List, Datagrid, TextField, DateField, FunctionField, ShowButton, DeleteButton, CreateButton, TopToolbar, useListContext, useRefresh, useNotify } from 'react-admin';
import { Chip, useMediaQuery, useTheme, Box, Card, CardContent, Typography, IconButton, Stack, LinearProgress } from '@mui/material';
import ScienceIcon from '@mui/icons-material/Science';
import ImageIcon from '@mui/icons-material/Image';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { useNavigate } from 'react-router-dom';
import { useSelectedPatient } from '../../patient-context';
import { API_URL, token } from '../../config';

const ExamListActions = () => (
  <TopToolbar>
    <CreateButton label="Enviar exame" variant="contained" />
  </TopToolbar>
);

const statusColor: Record<string, 'success' | 'error' | 'warning' | 'info' | 'default'> = { EXTRACTED: 'success', FAILED: 'error', UPLOADED: 'warning', EXTRACTING: 'info' };
const statusLabel: Record<string, string> = { EXTRACTED: 'Pronto', FAILED: 'Falhou', UPLOADED: 'Enviado', EXTRACTING: 'Extraindo' };
const kindLabel: Record<string, string> = { LAB_PANEL: 'Laboratorial', IMAGING: 'Imagem', OTHER: 'Outro' };
const hexFor = (s: string) => { const sc = statusColor[s] ?? 'default'; return sc === 'success' ? '#10b981' : sc === 'error' ? '#ef4444' : sc === 'warning' ? '#f59e0b' : sc === 'info' ? '#0ea5e9' : '#94a3b8'; };

/** Cards mobile: toca p/ ver; ícone de lixeira p/ excluir. */
const MobileExams = () => {
  const { data, isLoading } = useListContext<any>();
  const navigate = useNavigate();
  const refresh = useRefresh();
  const notify = useNotify();
  if (isLoading) return null;
  const del = async (e: any, id: string, title: string) => {
    e.stopPropagation();
    if (!window.confirm(`Excluir "${title}"? Esta ação não desfaz.`)) return;
    const r = await fetch(`${API_URL}/exams/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } });
    if (r.ok) { notify('Exame excluído', { type: 'success' }); refresh(); } else notify('Falha ao excluir', { type: 'error' });
  };
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, p: { xs: 1.5, sm: 2 }, pb: 4 }}>
      {(data ?? []).map((r) => {
        const c = hexFor(r.status);
        const Icon = r.kind === 'IMAGING' ? ImageIcon : r.kind === 'LAB_PANEL' ? ScienceIcon : DescriptionOutlinedIcon;
        return (
          <Card key={r.id} variant="outlined" onClick={() => navigate(`/exams/${r.id}/show`)} sx={{ cursor: 'pointer', borderRadius: 3, borderLeft: `4px solid ${c}`, overflow: 'hidden', maxWidth: '100%' }}>
            <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Icon sx={{ color: c, flexShrink: 0 }} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</Typography>
                <Typography variant="caption" color="text.secondary">{kindLabel[r.kind] ?? r.kind} • {r.performedAt ? new Date(r.performedAt).toLocaleDateString('pt-BR') : 's/d'}{r._count?.items ? ` • ${r._count.items} itens` : ''}</Typography>
                <Box sx={{ mt: 0.5 }}><Chip size="small" label={statusLabel[r.status] ?? r.status} sx={{ bgcolor: c + '18', color: c, fontWeight: 700, height: 20 }} /></Box>
              </Box>
              <IconButton size="small" onClick={(e) => del(e, r.id, r.title)} title="Excluir" sx={{ flexShrink: 0 }}><DeleteOutlineIcon fontSize="small" /></IconButton>
              <ChevronRightIcon sx={{ color: 'text.disabled', flexShrink: 0 }} />
            </CardContent>
            {(r.status === 'EXTRACTING' || r.status === 'UPLOADED') && <LinearProgress sx={{ height: 3 }} />}
          </Card>
        );
      })}
    </Box>
  );
};

export const ExamList = () => {
  const [pid] = useSelectedPatient();
  const theme = useTheme() as any;
  const isDesktop = useMediaQuery(theme.breakpoints.up('sm'));
  return (
  <List key={pid} sort={{ field: 'performedAt', order: 'DESC' }} exporter={false} perPage={25} filter={{ patientId: pid || 'none' }} actions={<ExamListActions />}>
    {isDesktop ? (
      <Datagrid bulkActionButtons={false} rowClick="show" sx={{ '& .MuiTableCell-root': { whiteSpace: 'normal', wordBreak: 'break-word' } }}>
        <FunctionField label="Exame" render={(r: any) => (
          <Box component="span" title={r.title} sx={{ display: 'inline-block', maxWidth: { xs: 140, md: 300 }, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'bottom' }}>{r.title}</Box>
        )} />
        <FunctionField label="Tipo" render={(r: any) => kindLabel[r.kind] ?? r.kind} />
        <DateField source="performedAt" label="Data" locales="pt-BR" />
        <FunctionField label="Status" render={(r: any) => <Chip size="small" color={statusColor[r.status] ?? 'default'} label={statusLabel[r.status] ?? r.status} />} />
        <FunctionField label="Itens" render={(r: any) => r._count?.items ?? 0} />
        <ShowButton />
        <DeleteButton />
      </Datagrid>
    ) : (
      <MobileExams />
    )}
  </List>
  );
};
