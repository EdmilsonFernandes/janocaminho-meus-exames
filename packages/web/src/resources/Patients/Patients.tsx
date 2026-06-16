import { List, Datagrid, TextField, DateField, FunctionField, Edit, SimpleForm, TextInput, DateInput, useRecordContext } from 'react-admin';
import { Box, Avatar, useMediaQuery, useTheme } from '@mui/material';
import { PhotoUpload } from '../../components/PhotoUpload';
import { photoUrlFor } from '../../config';

const PhotoField = () => {
  const record = useRecordContext();
  if (!record) return null;
  return <PhotoUpload patientId={String(record.id)} photoUrl={record.photoUrl} size={90} />;
};

export const PatientList = () => {
  const theme = useTheme() as any;
  const isDesktop = useMediaQuery(theme.breakpoints.up('sm'));
  return (
  <List exporter={false} pagination={false}>
    <Datagrid bulkActionButtons={false} rowClick="edit" sx={{ '& .MuiTableCell-root': { whiteSpace: 'normal', wordBreak: 'break-word' } }}>
      <FunctionField
        label="Foto"
        render={(r: any) => (
          <Avatar src={r.photoUrl ? photoUrlFor(String(r.id)) : undefined} sx={{ width: 38, height: 38, bgcolor: 'primary.main', fontWeight: 700 }}>
            {r.fullName?.charAt(0)?.toUpperCase()}
          </Avatar>
        )}
      />
      <TextField source="fullName" label="Paciente" />
      <TextField source="relationship" label="Parentesco" />
      {isDesktop && <TextField source="phone" label="Telefone" />}
      {isDesktop && <DateField source="dateOfBirth" label="Nascimento" locales="pt-BR" />}
      <FunctionField
        label="Perfil clínico"
        render={(r: any) => (r.clinicalProfile ? 'preenchido' : '—')}
      />
    </Datagrid>
  </List>
  );
};

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
