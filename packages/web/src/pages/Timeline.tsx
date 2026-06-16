import { useEffect, useState } from 'react';
import { Box, Card, CardContent, Typography, Chip, Stack, CircularProgress, Stepper, Step, StepLabel, StepContent, Paper } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';
import ScienceIcon from '@mui/icons-material/Science';
import { Title } from 'react-admin';
import { API_URL, token } from '../config';
import { useSelectedPatient } from '../patient-context';

interface Event { date: string; title: string; kind: string; abnormalCount: number; status: string }

export const TimelinePage = () => {
  const [pid] = useSelectedPatient();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!pid) return;
    setLoading(true);
    fetch(`${API_URL}/exams?_start=0&_end=50&patientId=${pid}`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => r.json())
      .then((rows: any[]) => setEvents(rows.filter((e: any) => e.status === 'EXTRACTED').map((e: any) => ({
        date: e.performedAt, title: e.title, kind: e.kind, abnormalCount: e._count?.items ?? 0, status: e.status,
      }))))
      .finally(() => setLoading(false));
  }, [pid]);

  // ordena do mais antigo para o mais recente (linha do tempo)
  const sorted = [...events].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return (
    <Box sx={{ maxWidth: 720, mx: 'auto', p: { xs: 1, md: 2 } }}>
      <Title title="Linha do Tempo" />
      <Card><CardContent>
        <Typography variant="h6" gutterBottom>📅 Sua jornada de saúde</Typography>
        {loading ? (
          <CircularProgress />
        ) : sorted.length === 0 ? (
          <Typography color="text.secondary" sx={{ py: 2 }}>Nenhum exame extraído ainda.</Typography>
        ) : (
          <Stepper orientation="vertical" sx={{ mt: 2 }}>
            {sorted.map((e, i) => {
              const isImaging = e.kind === 'IMAGING';
              const hasIssues = e.abnormalCount > 0;
              return (
                <Step key={i} active={i === sorted.length - 1} completed={i < sorted.length - 1}>
                  <StepLabel icon={isImaging ? <LocalHospitalIcon color="primary" /> : <ScienceIcon color={hasIssues ? 'error' : 'success'} />}>
                    <Typography component="span" sx={{ fontWeight: 600, fontSize: '0.95rem' }}>{e.title}</Typography>
                    <Typography component="span" sx={{ fontSize: '0.85rem', color: 'text.secondary', ml: 1 }}>
                      {e.date ? new Date(e.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : 's/d'}
                    </Typography>
                  </StepLabel>
                  <StepContent>
                    <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
                      {isImaging && <Chip size="small" label="Imagem" variant="outlined" />}
                      {hasIssues ? (
                        <Chip size="small" color="error" label={`${e.abnormalCount} valor(es) alterado(s)`} />
                      ) : (
                        <Chip size="small" color="success" icon={<CheckCircleIcon sx={{ fontSize: 16 }} />} label="Tudo na faixa" />
                      )}
                    </Stack>
                  </StepContent>
                </Step>
              );
            })}
          </Stepper>
        )}
      </CardContent></Card>
    </Box>
  );
};
