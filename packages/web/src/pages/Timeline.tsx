import { useEffect, useState } from 'react';
import { Box, Card, CardContent, Typography, Chip, Stack, CircularProgress, Dialog, DialogTitle, DialogContent, IconButton, Button, useMediaQuery, useTheme } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import LocalHospitalIcon from '@mui/icons-material/Image';
import ScienceIcon from '@mui/icons-material/Science';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import CloseIcon from '@mui/icons-material/Close';
import LockIcon from '@mui/icons-material/Lock';
import { Title } from 'react-admin';
import { useNavigate } from 'react-router-dom';
import { API_URL, token } from '../config';
import { useSelectedPatient } from '../patient-context';
import { ExplainButton } from '../components/ExplainItem';
import { usePremium } from '../components/PremiumGate';
import { refLabel } from '../utils/medicalData';
import { groupByYear } from '../utils/groupByYear';

interface Event { id: string; date: string | null; title: string; kind: string; abnormalCount: number; itemCount: number }

export const TimelinePage = () => {
  const [pid] = useSelectedPatient();
  const navigate = useNavigate();
  const premium = usePremium();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!pid) return;
    setLoading(true);
    const h = { Authorization: `Bearer ${token()}` };
    Promise.all([
      fetch(`${API_URL}/exams?_start=0&_end=100&patientId=${pid}`, { headers: h }).then((r) => r.json()).catch(() => []),
      fetch(`${API_URL}/items/abnormal?patientId=${pid}`, { headers: h }).then((r) => r.json()).catch(() => ({ items: [] })),
    ]).then(([rows, abn]: any[]) => {
      const byExam: Record<string, number> = {};
      for (const it of abn?.items ?? []) byExam[it.examId] = (byExam[it.examId] ?? 0) + 1;
      setEvents((rows as any[]).filter((e: any) => e.status === 'EXTRACTED').map((e: any) => ({
        id: e.id, date: e.performedAt, title: e.title, kind: e.kind,
        abnormalCount: byExam[e.id] ?? 0,
        itemCount: e._count?.items ?? 0,
      })));
    }).finally(() => setLoading(false));
  }, [pid]);

  const sorted = [...events].sort((a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime());
  const groups = groupByYear(sorted, (e) => e.date);
  const latestYear = groups[0]?.year ?? null;
  const totalAbnormal = events.reduce((s, e) => s + e.abnormalCount, 0);
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const [sel, setSel] = useState<Event | null>(null);
  const [abn, setAbn] = useState<any[]>([]);
  const [abnLoading, setAbnLoading] = useState(false);
  const openExam = async (e: Event) => {
    setSel(e); setAbn([]); setAbnLoading(true);
    try {
      const r = await fetch(`${API_URL}/items?_start=0&_end=200&examId=${e.id}&abnormal=true`, { headers: { Authorization: `Bearer ${token()}` } });
      if (r.ok) setAbn(await r.json());
    } catch { /* */ }
    setAbnLoading(false);
  };

  const renderEvent = (e: Event, i: number) => {
    const isImaging = e.kind === 'IMAGING';
    const hasIssues = e.abnormalCount > 0;
    const dotColor = isImaging ? '#0ea5e9' : hasIssues ? '#ef4444' : '#10b981';
    return (
      <Box key={i} sx={{ position: 'relative' }}>
        <Box sx={{ position: 'absolute', left: -3.5, top: 14, width: 22, height: 22, borderRadius: '50%', bgcolor: dotColor, border: '3px solid #fff', boxShadow: '0 2px 6px rgba(0,0,0,.2)', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {isImaging ? <LocalHospitalIcon sx={{ color: '#fff', fontSize: 12 }} /> : hasIssues ? <TrendingDownIcon sx={{ color: '#fff', fontSize: 12 }} /> : <CheckCircleIcon sx={{ color: '#fff', fontSize: 12 }} />}
        </Box>
        <Card onClick={() => openExam(e)} sx={{ borderRadius: 3, ml: 1.5, borderLeft: `5px solid ${dotColor}`, transition: 'transform .15s', cursor: 'pointer', '&:hover': { transform: 'translateX(2px)' } }}>
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
  };

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
        <Stack spacing={3}>
          {groups.map((g) => {
            const locked = !premium && g.year !== latestYear && g.year != null;
            return (
              <Box key={String(g.year)}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                  <Chip label={`📅 ${g.label}`} sx={{ fontWeight: 800, bgcolor: '#0f172a', color: '#fff' }} />
                  <Typography variant="caption" color="text.secondary">{g.items.length} exame(s){locked ? ' • Premium' : ''}</Typography>
                </Box>
                {locked ? (
                  <Card sx={{ borderRadius: 3, p: 2, display: 'flex', alignItems: 'center', gap: 1.5, background: 'linear-gradient(135deg, rgba(32,178,170,.06), transparent)' }}>
                    <LockIcon sx={{ color: '#178f89' }} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 800 }}>Histórico de {g.label}</Typography>
                      <Typography variant="caption" color="text.secondary">Desbloqueie todo o seu histórico de exames (Premium).</Typography>
                    </Box>
                    <Button size="small" variant="contained" onClick={() => navigate('/planos')} sx={{ borderRadius: 99, textTransform: 'none', fontWeight: 700, bgcolor: '#20b2aa', boxShadow: 'none', '&:hover': { bgcolor: '#178f89' } }}>Ver planos</Button>
                  </Card>
                ) : (
                  <Box sx={{ position: 'relative', pl: 3.5 }}>
                    <Box sx={{ position: 'absolute', left: 15, top: 8, bottom: 8, width: 3, background: 'linear-gradient(#2a93b8,#5FD35A)', borderRadius: 3 }} />
                    <Stack spacing={2}>{g.items.map(renderEvent)}</Stack>
                  </Box>
                )}
              </Box>
            );
          })}
        </Stack>
      )}

      {/* POPUP: valores fora da faixa do exame clicado */}
      <Dialog open={!!sel} onClose={() => setSel(null)} fullScreen={fullScreen} PaperProps={{ sx: { borderRadius: fullScreen ? 0 : 3 } }}>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pr: 1, gap: 1 }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sel?.title}</Typography>
            <Typography variant="caption" color="text.secondary">{sel?.date ? new Date(sel.date).toLocaleDateString('pt-BR') : 's/d'}</Typography>
          </Box>
          <IconButton onClick={() => setSel(null)} sx={{ flexShrink: 0, p: 1 }}><CloseIcon sx={{ fontSize: 28 }} /></IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {abnLoading ? (
            <CircularProgress size={24} />
          ) : abn.length === 0 ? (
            <Typography color="text.secondary">Nenhum valor fora da faixa neste exame. Tudo dentro da referência. ✅</Typography>
          ) : (
            <Stack spacing={1}>
              <Typography variant="body2" sx={{ color: 'error.main', fontWeight: 700 }}>🚩 {abn.length} valor(es) fora da faixa</Typography>
              {abn.map((it) => (
                <Box key={it.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1, borderRadius: 2, bgcolor: 'rgba(239,68,68,.06)' }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
                      <Typography sx={{ fontWeight: 700, wordBreak: 'break-word', overflowWrap: 'anywhere', lineHeight: 1.2 }}>{it.name}</Typography>
                      <ExplainButton name={it.name} nameCanonical={it.nameCanonical} />
                    </Box>
                    <Typography variant="caption" color="text.secondary" sx={{ wordBreak: 'break-word' }}>{refLabel(it)}</Typography>
                  </Box>
                  <Typography sx={{ fontWeight: 800, color: 'error.main', fontSize: '1.2rem' }}>{it.valueText}</Typography>
                  {it.unit ? <Typography variant="caption" color="text.secondary">{it.unit}</Typography> : null}
                </Box>
              ))}
            </Stack>
          )}
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>*Educativo. A interpretação final é do seu médico.</Typography>
          <Button variant="outlined" fullWidth startIcon={<CloseIcon />} onClick={() => setSel(null)} sx={{ mt: 2 }}>Fechar</Button>
        </DialogContent>
      </Dialog>
    </Box>
  );
};
