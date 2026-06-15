import { List, Datagrid, TextField, DateField, FunctionField, Edit, SimpleForm, TextInput, DateInput } from 'react-admin';

export const PatientList = () => (
  <List exporter={false} pagination={false}>
    <Datagrid bulkActionButtons={false} rowClick="edit">
      <TextField source="fullName" label="Paciente" />
      <TextField source="relationship" label="Parentesco" />
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
    <SimpleForm>
      <TextInput source="fullName" label="Nome completo" fullWidth />
      <TextInput source="relationship" label="Parentesco (Titular, Filha, Mãe...)" fullWidth />
      <DateInput source="dateOfBirth" label="Data de nascimento" />
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
