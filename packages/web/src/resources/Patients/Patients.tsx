import { List, useListContext, Edit, Create, SimpleForm, TextInput, DateInput, useRecordContext, useNotify, useRefresh, CreateButton, TopToolbar, useInput, required } from 'react-admin';
import { Box, Avatar, Typography, Chip, IconButton, Stack, Card, CardContent, TextField as MuiTextField } from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import { PhotoUpload } from '../../components/PhotoUpload';
import { photoUrlFor, API_URL, token } from '../../config';
import { confirmDialog } from '../../components/ConfirmDialog';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { formatCpf, isValidCpf } from '../../utils/cpf';

const ageFrom = (dob?: string | null) => {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000));
};

const PatientListActions = () => (
  <TopToolbar>
    {/* Bug do dono (28/09): no mobile (<md) o CreateButton do react-admin vira um FAB FIXO
        (right:20, bottom:60, z-index 1000) e caía POR CIMA do MobileBottomNav (z-index 1100,
        flutuante no rodapé) — briga de toque no canto inferior direito. Sobe o FAB acima da
        altura REAL do nav (--me-bottom-nav-h, publicada pelo MobileBottomNav), mesmo padrão
        do ExamCreateFab. Só no xs: a partir do sm não existe bottom-nav (default do RA fica). */}
    <CreateButton
      label="Adicionar dependente"
      variant="contained"
      sx={{ '&.RaCreateButton-floating': { bottom: { xs: 'calc(var(--me-bottom-nav-h, 76px) + 14px)', sm: 60 }, zIndex: { xs: 1200, sm: 1000 } } }}
    />
  </TopToolbar>
);

/** Lista premium: titular em destaque + dependentes em cards. */
const PatientCards = () => {
  const { data, isLoading } = useListContext<any>();
  const navigate = useNavigate();
  const notify = useNotify();
  const refresh = useRefresh();
  const [deleting, setDeleting] = useState<string | null>(null);

  const handleDelete = async (id: string, name: string) => {
    if (!(await confirmDialog({ title: 'Excluir perfil', message: `Excluir "${name}" e TODOS os exames/análises deste perfil? Não dá pra desfazer.`, confirmLabel: 'Excluir' }))) return;
    setDeleting(id);
    try {
      const r = await fetch(`${API_URL}/patients/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || 'Falha ao excluir'); }
      notify('Perfil excluído!', { type: 'success' });
      window.dispatchEvent(new Event('selPatientChanged'));
      refresh();
    } catch (e: any) { notify(e.message, { type: 'error' }); }
    finally { setDeleting(null); }
  };

  if (isLoading) return null;
  const rows = data ?? [];
  const isTit = (p: any) => /titular/i.test(p.relationship || '');
  const titular = rows.find(isTit);
  const dependentes = rows.filter((p) => p !== titular);

  const renderItem = (p: any, titularStyle = false) => {
    const age = ageFrom(p.dateOfBirth);
    const sub = [age != null ? `${age} ano${age === 1 ? '' : 's'}` : null, p.phone].filter(Boolean).join(' • ');
    return (
      <Card key={p.id} variant="outlined" onClick={() => navigate(`/patients/${p.id}`)}
        sx={{ cursor: 'pointer', borderRadius: '12px', overflow: 'hidden',
          border: titularStyle ? '1px solid #d8f4f2' : '1px solid',
          borderColor: titularStyle ? undefined : 'divider',
          background: titularStyle ? 'linear-gradient(135deg,#f1fafa,#ffffff)' : 'background.paper',
          '&:hover': { boxShadow: '0 8px 22px rgba(32,178,170,.15)', transform: 'translateY(-1px)' },
          transition: 'box-shadow .15s, transform .15s' }}>
        <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.5, '&:last-child': { pb: 1.5 } }}>
          <Box sx={{ position: 'relative', flexShrink: 0 }}>
            <Avatar src={p.photoUrl ? photoUrlFor(String(p.id)) : undefined} sx={{ width: 50, height: 50, bgcolor: titularStyle ? 'primary.main' : '#cfd8dc', color: titularStyle ? '#fff' : '#5a6b72', fontWeight: 800, fontSize: 20 }}>
              {p.photoUrl ? '' : (p.fullName?.charAt(0)?.toUpperCase() || '?')}
            </Avatar>
            {titularStyle && <Box sx={{ position: 'absolute', bottom: -2, right: -2, width: 18, height: 18, borderRadius: '50%', bgcolor: '#d4a574', border: '2px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>★</Box>}
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
              <Typography sx={{ fontWeight: 800, fontSize: 16, lineHeight: 1.2, wordBreak: 'break-word' }}>{p.fullName}</Typography>
              <Chip size="small" label={titularStyle ? 'Titular' : (p.relationship || 'Dependente')} sx={{ height: 20, fontWeight: 700, bgcolor: titularStyle ? 'rgba(32,178,170,.14)' : 'rgba(212,165,116,.16)', color: titularStyle ? '#178f89' : '#b88a54' }} />
            </Box>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.3 }}>
              {sub || 'Sem dados adicionais'}{p.clinicalProfile ? ' • perfil clínico ✓' : ''}
            </Typography>
          </Box>
          <Box onClick={(e) => e.stopPropagation()} sx={{ display: 'flex', gap: 0.25, flexShrink: 0 }}>
            <IconButton size="small" onClick={() => navigate(`/patients/${p.id}`)} title="Editar perfil" sx={{ color: '#5a6b72' }}><EditIcon fontSize="small" /></IconButton>
            {!titularStyle && <IconButton size="small" color="error" disabled={deleting === p.id} onClick={() => handleDelete(p.id, p.fullName)} title="Excluir"><DeleteOutlineIcon fontSize="small" /></IconButton>}
          </Box>
        </CardContent>
      </Card>
    );
  };

  return (
    <Box sx={{ maxWidth: 720, mx: 'auto', p: { xs: 1.5, sm: 2 }, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {titular && (
        <>
          <Typography variant="caption" sx={{ fontWeight: 800, color: '#178f89', letterSpacing: '0.04em', textTransform: 'uppercase' }}>★ Titular</Typography>
          {renderItem(titular, true)}
        </>
      )}
      <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', letterSpacing: '0.04em', textTransform: 'uppercase', mt: titular ? 0.5 : 0 }}>
        {dependentes.length > 0 ? `Dependentes (${dependentes.length})` : 'Dependentes'}
      </Typography>
      {dependentes.length > 0 && (
        <Stack spacing={1.25}>{dependentes.map((p) => renderItem(p))}</Stack>
      )}
      {/* Adicionar dependente — sempre logo abaixo da lista (ação agrupada com o conteúdo).
          Antes, quando já havia dependente, o botão ficava só no topo (toolbar) e sobrava espaço
          vazio embaixo. Agora o "+ dependente" aparece sempre, colado na lista. */}
      <Card variant="outlined" onClick={() => navigate('/patients/create')} sx={{ cursor: 'pointer', borderRadius: '12px', border: '2px dashed', borderColor: 'divider', background: 'background.default', py: 2, textAlign: 'center', '&:hover': { background: 'action.hover' } }}>
        <PersonAddIcon sx={{ color: '#20b2aa', mb: 0.5 }} />
        <Typography sx={{ fontWeight: 700, color: '#178f89' }}>Adicionar um dependente</Typography>
        <Typography variant="caption" color="text.secondary">Filho(a), cônjuge, pai/mãe… cada um com exames e análises próprios.</Typography>
      </Card>
    </Box>
  );
};

const PhotoField = () => {
  const record = useRecordContext();
  if (!record) return null;
  return <PhotoUpload patientId={String(record.id)} photoUrl={record.photoUrl} size={90} />;
};

const PatientNameInput = ({ validate }: { validate?: any }) => {
  const record = useRecordContext();
  return <TextInput source="fullName" label="Nome completo" fullWidth validate={validate} disabled={!!record?.identityLocked} helperText={record?.identityLocked ? 'Nome bloqueado após verificação de CPF e e-mail.' : undefined} />;
};

const PatientCpfInput = ({ validate }: { validate?: any }) => {
  const record = useRecordContext();
  const { field } = useInput({ source: 'cpf', validate });
  if (record?.hasCpf) {
    return <MuiTextField label="CPF" value={record.cpfMasked ?? ''} disabled fullWidth size="small" helperText="CPF verificado e mascarado. Correção somente via suporte auditado." />;
  }
  return (
    <MuiTextField
      label="CPF"
      value={field.value ?? ''}
      onChange={(e) => field.onChange(formatCpf(e.target.value))}
      fullWidth
      size="small"
      inputProps={{ inputMode: 'numeric' }}
      error={!!field.value && String(field.value).length === 14 && !isValidCpf(field.value)}
      helperText={!!field.value && String(field.value).length === 14 && !isValidCpf(field.value) ? 'CPF inválido.' : 'Obrigatório para confirmar titularidade dos exames.'}
    />
  );
};

export const PatientList = () => (
  <List exporter={false} pagination={false} actions={<PatientListActions />} perPage={50}>
    <PatientCards />
  </List>
);

/** POST /patients EXIGE CPF válido (dedup por cpfHash) — sem isso o server devolve 400. */
const cpfValidate = (value: any) => (!value ? 'Informe o CPF.' : isValidCpf(String(value)) ? undefined : 'CPF inválido.');

/** Bug do dono (28/09): /patients/create não tinha view — o roteamento do Resource casava a URL
 *  na rota de EDIT com id="create" → GET /patients/create → 403 (guarda de PII/IDOR do server)
 *  → authProvider.checkError(403) derrubava a sessão (logout → login → biometria) e o dono era
 *  expulso do fluxo de criar dependente. View de criação de verdade: o FAB/toolbar e o card
 *  "+ Adicionar um dependente" agora caem AQUI (form) em vez de logar fora do app. */
export const PatientCreate = () => (
  /* Toolbar do SimpleForm é FIXED bottom:0 no mobile (padrão RA) e ficava por baixo do
     MobileBottomNav — o Salvar era intocável. Sobe junto com o nav (mesma var do layout).
     No sx do <Create> porque a toolbar é irmã do SimpleForm-root (sx do form não a alcança).
     O transform:none no :active do card: o theme dá scale(0.985) a todo MuiCard :active —
     ao PRESSIONAR o Salvar o card virava containing-block da toolbar fixed (toolbar pulava
     ~200px no meio do toque e o click era retargetado pro fundo = Salvar "morto"). */
  <Create title="Adicionar dependente" sx={{
    '& .MuiToolbar-root.RaToolbar-mobileToolbar': { bottom: 'calc(var(--me-bottom-nav-h, 76px) + 14px)' },
    '& .MuiCard-root:active': { transform: 'none !important' },
  }}>
    <SimpleForm sx={{ maxWidth: 640, pt: 1 }}>
      <PatientNameInput validate={required('Informe o nome.')} />
      <PatientCpfInput validate={cpfValidate} />
      <TextInput source="relationship" label="Parentesco (Titular, Filha, Mãe...)" fullWidth />
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
  </Create>
);

export const PatientEdit = () => (
  /* Mesma subida do toolbar mobile + mesmo neutralizador do :active do card (ver PatientCreate). */
  <Edit title="Perfil do paciente" sx={{
    '& .MuiToolbar-root.RaToolbar-mobileToolbar': { bottom: 'calc(var(--me-bottom-nav-h, 76px) + 14px)' },
    '& .MuiCard-root:active': { transform: 'none !important' },
  }}>
    <SimpleForm sx={{ maxWidth: 640, pt: 1 }}>
      <Box sx={{ pt: 2, pb: 1 }}>
        <PhotoField />
      </Box>
      <PatientNameInput />
      <PatientCpfInput />
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
