import { List, Datagrid, TextField, DateField, FunctionField, ShowButton, DeleteButton, CreateButton, TopToolbar } from 'react-admin';
import { Chip, useMediaQuery, useTheme } from '@mui/material';
import { useSelectedPatient } from '../../patient-context';

const ExamListActions = () => (
  <TopToolbar>
    <CreateButton label="Enviar exame" variant="contained" />
  </TopToolbar>
);

const statusColor: Record<string, any> = { EXTRACTED: 'success', FAILED: 'error', UPLOADED: 'warning', EXTRACTING: 'info' };
const statusLabel: Record<string, string> = { EXTRACTED: 'Pronto', FAILED: 'Falhou', UPLOADED: 'Enviado', EXTRACTING: 'Extraindo' };
const kindLabel: Record<string, string> = { LAB_PANEL: 'Laboratorial', IMAGING: 'Imagem', OTHER: 'Outro' };

export const ExamList = () => {
  const [pid] = useSelectedPatient();
  const theme = useTheme() as any;
  const isDesktop = useMediaQuery(theme.breakpoints.up('sm'));
  return (
  <List key={pid} sort={{ field: 'performedAt', order: 'DESC' }} exporter={false} perPage={25} filter={{ patientId: pid || 'none' }} actions={<ExamListActions />}>
    <Datagrid bulkActionButtons={false} rowClick="show" sx={{ '& .MuiTableCell-root': { whiteSpace: 'normal', wordBreak: 'break-word' } }}>
      <TextField source="title" label="Exame" />
      {isDesktop && <FunctionField label="Tipo" render={(r: any) => kindLabel[r.kind] ?? r.kind} />}
      <DateField source="performedAt" label="Data" locales="pt-BR" />
      <FunctionField
        label="Status"
        render={(r: any) => (
          <Chip size="small" color={statusColor[r.status] ?? 'default'} label={statusLabel[r.status] ?? r.status} />
        )}
      />
      {isDesktop && <FunctionField label="Itens" render={(r: any) => r._count?.items ?? 0} />}
      <ShowButton />
      <DeleteButton />
    </Datagrid>
  </List>
  );
};
