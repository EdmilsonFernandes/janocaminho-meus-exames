import { List, Datagrid, TextField, DateField, FunctionField, ShowButton, DeleteButton } from 'react-admin';
import { Chip } from '@mui/material';
import { useSelectedPatient } from '../../patient-context';

const statusColor: Record<string, any> = {
  EXTRACTED: 'success',
  FAILED: 'error',
  UPLOADED: 'warning',
  EXTRACTING: 'info',
};

const statusLabel: Record<string, string> = {
  EXTRACTED: 'Pronto',
  FAILED: 'Falhou',
  UPLOADED: 'Enviado',
  EXTRACTING: 'Extraindo',
};

const kindLabel: Record<string, string> = {
  LAB_PANEL: 'Laboratorial',
  IMAGING: 'Imagem',
  OTHER: 'Outro',
};

export const ExamList = () => {
  const [pid] = useSelectedPatient();
  return (
  <List key={pid} sort={{ field: 'performedAt', order: 'DESC' }} exporter={false} perPage={25} filter={{ patientId: pid || 'none' }}>
    <Datagrid bulkActionButtons={false} rowClick="show">
      <TextField source="title" label="Exame" />
      <FunctionField label="Tipo" render={(r: any) => kindLabel[r.kind] ?? r.kind} />
      <DateField source="performedAt" label="Data" locales="pt-BR" />
      <FunctionField
        label="Status"
        render={(r: any) => (
          <Chip size="small" color={statusColor[r.status] ?? 'default'} label={statusLabel[r.status] ?? r.status} />
        )}
      />
      <FunctionField label="Itens" render={(r: any) => r._count?.items ?? 0} />
      <ShowButton />
      <DeleteButton />
    </Datagrid>
  </List>
  );
};
