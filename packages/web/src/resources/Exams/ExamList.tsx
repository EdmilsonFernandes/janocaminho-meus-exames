import { List, Datagrid, TextField, DateField, FunctionField, ShowButton, DeleteButton, CreateButton, TopToolbar, useListContext, Link } from 'react-admin';
import { Chip, useMediaQuery, useTheme, Box, Card, CardContent, Stack, Typography, IconButton } from '@mui/material';
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

const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString('pt-BR') : 's/d');

/** Card mobile — encaixa 100% largura, opções visíveis (status + tipo + ver). */
const ExamCard = ({ r }: { r: any }) => {
  const Icon = r.kind === 'IMAGING' ? ImageIcon : r.kind === 'LAB_PANEL' ? ScienceIcon : DescriptionOutlinedIcon;
  const sc = statusColor[r.status] ?? 'default';
  return (
    <Card variant="outlined" sx={{ borderRadius: 3 }}>
      <CardContent sx={{ '&:last-child': { pb: 1.5 } }}>
        <Stack direction="row" spacing={1.5} alignItems="flex-start">
          <Box sx={{ mt: 0.3, width: 42, height: 42, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'rgba(32,178,170,.10)', color: 'primary.main', flexShrink: 0 }}>
            <Icon />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 700, fontSize: '1.02rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</Typography>
            <Typography variant="body2" color="text.secondary">{kindLabel[r.kind] ?? r.kind} • {fmtDate(r.performedAt)}{r.sourceLab ? ` • ${r.sourceLab}` : ''}</Typography>
            <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
              <Chip size="small" color={sc} label={statusLabel[r.status] ?? r.status} />
              {typeof r._count?.items === 'number' && <Chip size="small" variant="outlined" label={`${r._count.items} itens`} />}
            </Stack>
          </Box>
          <IconButton component={Link} to={`/exams/${r.id}/show`} size="small" sx={{ color: 'primary.main' }} title="Ver">→</IconButton>
        </Stack>
      </CardContent>
    </Card>
  );
};

const MobileExams = () => {
  const { data, isLoading } = useListContext<any>();
  if (isLoading) return null;
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, p: { xs: 1.5, sm: 2 }, pb: 4 }}>
      {(data ?? []).map((r) => <ExamCard key={r.id} r={r} />)}
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
        <TextField source="title" label="Exame" />
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
