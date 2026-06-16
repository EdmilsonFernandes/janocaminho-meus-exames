import { List, Datagrid, TextField, DateField, FunctionField, Edit, SimpleForm, TextInput, DateInput, useRecordContext } from 'react-admin';
import { Box } from '@mui/material';
import { PhotoUpload } from '../../components/PhotoUpload';

const PhotoField = () => {
  const record = useRecordContext();
  if (!record) return null;
  return <PhotoUpload patientId={String(record.id)} photoUrl={record.photoUrl} size={90} />;
};

export const PatientList = () => (
  <List exporter={false} pagination={false}>
    <Datagrid bulkActionButtons={false} rowClick="edit">
      <TextField source="fullName" label="Paciente" />
      <TextField source="relationship" label="Parentesco" />
      <TextField source="phone" label="Telefone" />
      <DateField source="dateOfBirth" label="Nascimento" locales="pt-BR" />
      <FunctionField
        label="Perfil clínico"
        render={(r: any) => (r.clinicalProfile ? 'preenchido' : '—')}
      />
    </Datagrid>
  </List>
);

export const PatientEdit = () => (
  <Edit title="Perfil do paciente">
    <SimpleForm sx={{ maxWidth: 640, pt: 1 }}>
      <Box sx={{ pt: 2, pb: 1 }}>
        <PhotoField />
      </Box>
      <TextInput source="fullName" label="Nome completo" fullWidth />
      <TextInput source="relationship" label="Parentesco (Titular, Filha, Mãe...)" fullWidth />
      <TextInput source="phone" label="Telefone / WhatsApp" fullWidth />
      <DateInput source="dateOfBirth" label="Data de nascimento" fullWidth />
      <TextInput
        source="clinicalProfile"
        label="Perfil clínico (condições, medicações, histórico relevante)"
        multiline
        fullWidth
        minRows={4}
        helperText="Ex.: 'Sem tireoide; usa levotiroxina (Levoid); usa testosterona; usa tirzepatida (Mounjaro).' Essas informações alimentam a IA para contextualizar a análise (nunca para diagnosticar)."
      />
    </SimpleForm>
  </Edit>
);
