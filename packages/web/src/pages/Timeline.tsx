import { useEffect, useState } from 'react';
import { Box, Card, CardContent, Typography, Chip, Stack, CircularProgress } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import LocalHospitalIcon from '@mui/icons-material/Image';
import ScienceIcon from '@mui/icons-material/Science';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import { Title } from 'react-admin';
import { API_URL, token } from '../config';
import { useSelectedPatient } from '../patient-context';

interface Event { date: string | null; title: string; kind: string; abnormalCount: number; itemCount: number }

export const TimelinePage = () => {
  const [pid] = useSelectedPatient();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!pid) return;
    setLoading(true);
    fetch(`${API_URL}/exams?_start=0&_end=100&patientId=${pid}`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => r.json())
      .then((rows: any[]) => setEvents(rows.filter((e: any) => e.status === 'EXTRACTED').map((e: any) => ({
        date: e.performedAt, title: e.title, kind: e.kind, abnormalCount: e._count?.items ?? 0, itemCount: e._count?.items ?? 0,
      }))))
      .finally(() => setLoading(false));
  }, [pid]);

  const sorted = [...events].sort((a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime()); // mais recente primeiro
  const totalAbnormal = events.reduce((s, e) => s + e.abnormalCount, 0);

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 760, mx: 'auto' }}>
      <Title title="Linha do Tempo" />
      <Typography variant="h5" sx={{ fontWeight: 800, mb: 0.5 }}>📅 Sua jornada de saúde</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {events.length} exame(s) ao longo do tempo • {totalAbnormal > 0 ? `${totalAbnormal} sinal(is) de atenção no total` : 'sem alterações registradas'}.
      </Typography>

      {loading ? (
        <Box sx={{ textAlign: 'center', py: 4 }}><CircularProgress /></Box>
      ) : sorted.length === 0 ? (
        <Card sx={{ borderRadius: 4 }}><CardContent><Typography color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>Nenhum exame extraído ainda. Envie um exame para começar sua linha do tempo.</Typography></CardContent></Card>
      ) : (
        <Box sx={{ position: 'relative', pl: 3.5 }}>
          {/* linha vertical */}
          <Box sx={{ position: 'absolute', left: 15, top: 8, bottom: 8, width: 3, background: 'linear-gradient(#2a93b8,#5FD35A)', borderRadius: 3 }} />
          <Stack spacing={2}>
            {sorted.map((e, i) => {
              const isImaging = e.kind === 'IMAGING';
              const hasIssues = e.abnormalCount > 0;
              const dotColor = isImaging ? '#0ea5e9' : hasIssues ? '#ef4444' : '#10b981';
              return (
                <Box key={i} sx={{ position: 'relative' }}>
                  {/* bolinha */}
                  <Box sx={{
                    position: 'absolute', left: -3.5, top: 14, width: 22, height: 22, borderRadius: '50%',
                    bgcolor: dotColor, border: '3px solid #fff', boxShadow: '0 2px 6px rgba(0,0,0,.2)', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {isImaging ? <LocalHospitalIcon sx={{ color: '#fff', fontSize: 12 }} /> : hasIssues ? <TrendingDownIcon sx={{ color: '#fff', fontSize: 12 }} /> : <CheckCircleIcon sx={{ color: '#fff', fontSize: 12 }} />}
                  </Box>
                  <Card sx={{ borderRadius: 3, ml: 1.5, borderLeft: `5px solid ${dotColor}`, transition: 'transform .15s', '&:hover': { transform: 'translateX(2px)' } }}>
                    <CardContent sx={{ pb: '12px !important' }}>
                      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap={1}>
                        <Box>
                          <Typography sx={{ fontWeight: 800, fontSize: '1.02rem' }}>{e.title}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {e.date ? new Date(e.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }) : 'Data não identificada'}
                          </Typography>
                        </Box>
                        <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
                          {isImaging
                            ? <Chip size="small" sx={{ bgcolor: '#0ea5e915', color: '#0ea5e9' }} icon={<ScienceIcon sx={{ fontSize: 14 }} />} label="Imagem" />
                            : <Chip size="small" sx={{ bgcolor: '#2a93b815', color: '#2a93b8' }} label="Laboratorial" />}
                        </Stack>
                      </Stack>
                      <Box sx={{ mt: 1 }}>
                        {hasIssues ? (
                          <Chip size="small" color="error" variant="outlined" label={`⚠️ ${e.abnormalCount} valor(es) fora da faixa`} />
                        ) : (
                          <Chip size="small" color="success" variant="outlined" icon={<CheckCircleIcon sx={{ fontSize: 16 }} />} label="Tudo dentro da faixa" />
                        )}
                      </Box>
                    </CardContent>
                  </Card>
                </Box>
              );
            })}
          </Stack>
        </Box>
      )}
    </Box>
  );
};
