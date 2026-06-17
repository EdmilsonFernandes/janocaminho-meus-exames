import { List, Datagrid, TextField, DateField, FunctionField, ShowButton, DeleteButton, CreateButton, TopToolbar, SimpleList } from 'react-admin';
import { Chip, useMediaQuery, useTheme, Box } from '@mui/material';
import ScienceIcon from '@mui/icons-material/Science';
import ImageIcon from '@mui/icons-material/Image';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import { useSelectedPatient } from '../../patient-context';

const ExamListActions = () => (
  <TopToolbar>
    <CreateButton label="Enviar exame" variant="contained" />
  </TopToolbar>
);

const statusColor: Record<string, 'success' | 'error' | 'warning' | 'info' | 'default'> = { EXTRACTED: 'success', FAILED: 'error', UPLOADED: 'warning', EXTRACTING: 'info' };
const statusLabel: Record<string, string> = { EXTRACTED: 'Pronto', FAILED: 'Falhou', UPLOADED: 'Enviado', EXTRACTING: 'Extraindo' };
const kindLabel: Record<string, string> = { LAB_PANEL: 'Laboratorial', IMAGING: 'Imagem', OTHER: 'Outro' };

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
      <SimpleList
        leftIcon={(r: any) => {
          const I = r.kind === 'IMAGING' ? ImageIcon : r.kind === 'LAB_PANEL' ? ScienceIcon : DescriptionOutlinedIcon;
          const sc = statusColor[r.status] ?? 'default';
          const c = sc === 'success' ? '#10b981' : sc === 'error' ? '#ef4444' : sc === 'warning' ? '#f59e0b' : sc === 'info' ? '#0ea5e9' : '#94a3b8';
          return <I sx={{ color: c }} />;
        }}
        primaryText={(r: any) => r.title}
        secondaryText={(r: any) => `${kindLabel[r.kind] ?? r.kind} • ${r.performedAt ? new Date(r.performedAt).toLocaleDateString('pt-BR') : 's/d'}${r.sourceLab ? ` • ${r.sourceLab}` : ''}`}
        tertiaryText={(r: any) => statusLabel[r.status] ?? r.status}
        linkType="show"
        rowSx={(r: any) => {
          const sc = statusColor[r.status];
          const c = sc === 'success' ? '#10b981' : sc === 'error' ? '#ef4444' : sc === 'warning' ? '#f59e0b' : sc === 'info' ? '#0ea5e9' : undefined;
          return c ? { borderLeft: `4px solid ${c}` } : {};
        }}
        sx={{ '& .MuiTypography-root': { whiteSpace: 'normal' } }}
      />
    )}
  </List>
  );
};
