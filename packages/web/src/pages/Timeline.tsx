import { useEffect, useState } from 'react';
import { plural } from '../utils/format';
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
import { measurementLabel, measurementValue } from '../utils/measurementLabels';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { PageSkeleton } from '../components/PageSkeleton';
import { EmptyState } from '../components/EmptyState';
import EventIcon from '@mui/icons-material/Event';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import VaccinesIcon from '@mui/icons-material/Vaccines';
import { tealText } from '../theme';
import { chipA11y } from '../utils/chipA11y';

type EvType = 'exam' | 'medicao' | 'vacina';
interface Event { id: string; date: string | null; title: string; kind: string; abnormalCount: number; itemCount: number; type: EvType }

export const TimelinePage = () => {
  const [pid] = useSelectedPatient();
  const navigate = useNavigate();
  const premium = usePremium();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<'all' | EvType>('all');

  useEffect(() => {
    if (!pid) return;
    setLoading(true);
    const h = { Authorization: `Bearer ${token()}` };
    Promise.all([
      // Exames com CPF divergente do perfil NÃO entram na narrativa (documento de terceiro —
      // segue visível na lista de exames com aviso, mas não é a "jornada de saúde" do titular).
      fetch(`${API_URL}/exams?_start=0&_end=100&patientId=${pid}`, { headers: h })
        .then((r) => r.json())
        .then((rows: any[]) => (Array.isArray(rows) ? rows.filter((e) => !(e?.rawExtraction?.identityMatch?.method === 'cpf' && e?.rawExtraction?.identityMatch?.cpfMatch === false)) : []))
        .catch(() => []),
      fetch(`${API_URL}/items/abnormal?patientId=${pid}`, { headers: h }).then((r) => r.json()).catch(() => ({ items: [] })),
      // JORNADA COMPLETA (auditoria item 17): medições e vacinas entram na linha do tempo.
      fetch(`${API_URL}/measurements?_start=0&_end=50&patientId=${pid}`, { headers: h }).then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch(`${API_URL}/vaccines?_start=0&_end=50&patientId=${pid}`, { headers: h }).then((r) => (r.ok ? r.json() : [])).catch(() => []),
    ]).then(([rows, abn, meas, vax]: any[]) => {
      const byExam: Record<string, number> = {};
      for (const it of abn?.items ?? []) byExam[it.examId] = (byExam[it.examId] ?? 0) + 1;
      const examEvents: Event[] = (rows as any[]).filter((e: any) => e.status === 'EXTRACTED').map((e: any) => ({
        id: e.id, date: e.performedAt, title: e.title, kind: e.kind,
        abnormalCount: byExam[e.id] ?? 0,
        itemCount: e._count?.items ?? 0,
        type: 'exam' as const,
      }));
      // MEDIÇÕES (manuais + Health Connect): rótulo PT-BR + valor formatado — antes exibia
      // "BLOOD_PRESSURE: 120" (inglês cru, sem a diastólica, float com 14 casas).
      const measEvents: Event[] = (Array.isArray(meas) ? meas : []).map((m: any) => ({
        id: `m-${m.id}`, date: m.measuredAt,
        title: `${measurementLabel(m.type)}: ${measurementValue(m)}${m.unit ? ` ${m.unit}` : ''}`,
        kind: 'MEASUREMENT',
        abnormalCount: 0, itemCount: 1, type: 'medicao' as const,
      }));
      const vaxEvents: Event[] = (Array.isArray(vax) ? vax : []).map((v: any) => ({
        id: `v-${v.id}`, date: v.dateApplied, title: `Vacina: ${v.name}`, kind: 'VACCINE',
        abnormalCount: 0, itemCount: 1, type: 'vacina' as const,
      }));
      setEvents([...examEvents, ...measEvents, ...vaxEvents]);
    }).finally(() => setLoading(false));
  }, [pid]);

  const counts = { exam: events.filter((e) => e.type === 'exam').length, medicao: events.filter((e) => e.type === 'medicao').length, vacina: events.filter((e) => e.type === 'vacina').length };
  const sorted = [...events].filter((e) => typeFilter === 'all' || e.type === typeFilter).sort((a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime());
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

  // ReUI c-timeline-11 "Avatar Activity" (dono 30/10): o evento vira linha de FEED —
  // azulejo redondo com ícone sobre o trilho (no lugar do dot 22px) + frase de
  // atividade (título em negrito · ação em cinza) + data + chips de leitura. Sem
  // card colorido por evento: o feed respira e a cor mora só no indicador.
  const renderEvent = (e: Event, i: number) => {
    const isImaging = e.kind === 'IMAGING';
    const hasIssues = e.type === 'exam' && e.abnormalCount > 0;
    const dotColor = e.type === 'vacina' ? '#4f46e5' : e.type === 'medicao' ? '#f59e0b' : isImaging ? '#0ea5e9' : hasIssues ? '#ef4444' : '#059669';
    const clickable = e.type === 'exam'; // medições/vacinas: informativas (popup é de exame)
    const EvIcon = e.type === 'vacina' ? VaccinesIcon : e.type === 'medicao' ? MonitorHeartIcon : isImaging ? LocalHospitalIcon : hasIssues ? TrendingDownIcon : CheckCircleIcon;
    const action = e.type === 'vacina' ? 'vacina aplicada' : e.type === 'medicao' ? 'medição registrada' : isImaging ? 'exame de imagem' : 'exame laboratorial';
    return (
      <Box key={i} sx={{ position: 'relative' }}>
        <Box aria-hidden sx={{
          position: 'absolute', left: -44, top: 6, width: 30, height: 30, borderRadius: '50%', zIndex: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          bgcolor: dotColor, border: '3px solid', borderColor: 'background.paper',
          boxShadow: `0 4px 10px -2px ${dotColor}66`,
        }}>
          <EvIcon sx={{ color: '#fff', fontSize: 14 }} />
        </Box>
        <Box
          onClick={clickable ? () => openExam(e) : undefined}
          {...(clickable ? chipA11y() : {})}
          aria-label={clickable ? `Abrir exame ${e.title ?? ''}` : undefined}
          sx={{
            borderRadius: '14px', px: 1.25, py: 1, minHeight: 42,
            cursor: clickable ? 'pointer' : 'default',
            transition: 'background .15s ease, transform .15s ease',
            ...(clickable ? { '&:hover': { bgcolor: `${dotColor}0D`, transform: 'translateX(2px)' } } : {}),
          }}
        >
          <Typography sx={{ fontWeight: 700, fontSize: '0.98rem', lineHeight: 1.35, wordBreak: 'break-word' }}>
            {e.title}
            <Box component="span" sx={{ fontWeight: 500, color: 'text.secondary' }}> · {action}</Box>
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25 }}>
            {e.date ? new Date(e.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }) : 'Data não identificada'}
          </Typography>
          {e.type === 'exam' && (
            <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" sx={{ mt: 0.75 }}>
              {hasIssues
                ? <Chip size="small" label={`${plural(e.abnormalCount, 'valor')} fora da faixa`} sx={{ height: 22, fontWeight: 800, fontSize: 11.5, bgcolor: 'rgba(239,68,68,.10)', color: (t) => t.palette.mode === 'dark' ? '#fca5a5' : '#dc2626', border: '1px solid rgba(239,68,68,.25)' }} />
                : <Chip size="small" icon={<CheckCircleIcon sx={{ fontSize: 14 }} />} label="Tudo dentro da faixa" sx={{ height: 22, fontWeight: 700, fontSize: 11.5, bgcolor: 'rgba(5,150,105,.10)', color: (t) => t.palette.mode === 'dark' ? '#6ee7b7' : '#059669', '& .MuiChip-icon': { color: 'inherit' } }} />}
              {e.itemCount > 0 && <Chip size="small" label={plural(e.itemCount, 'resultado')} sx={{ height: 22, fontSize: 11.5, fontWeight: 700, bgcolor: 'action.hover', color: 'text.secondary' }} />}
            </Stack>
          )}
        </Box>
      </Box>
    );
  };

  return (
    <PageContainer width="content">
      <Title title="Linha do Tempo" />
      <PageHeader
        icon={<EventIcon />}
        title="Sua jornada de saúde"
        subtitle={`${counts.exam} ${counts.exam === 1 ? 'exame' : 'exames'} • ${counts.medicao} ${counts.medicao === 1 ? 'medição' : 'medições'} • ${counts.vacina} ${counts.vacina === 1 ? 'vacina' : 'vacinas'} • ${totalAbnormal > 0 ? `${totalAbnormal} ${totalAbnormal === 1 ? 'sinal' : 'sinais'} de atenção` : 'sem alterações'}. Toque num exame para abri-lo.`}
      />

      {/* Filtro por tipo de evento (auditoria item 17: narrativa com exames + medições + vacinas) */}
      <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mb: 2 }}>
        {/* Filtro = função primária da tela: alvo 40px no touch + semântica de toggle. */}
        {([['all', 'Tudo'], ['exam', '🧪 Exames'], ['medicao', '💓 Medições'], ['vacina', '💉 Vacinas']] as const).map(([v, l]) => (
          <Chip key={v} component="button" aria-pressed={typeFilter === v} label={l} onClick={() => setTypeFilter(v)} color={typeFilter === v ? 'primary' : 'default'} variant={typeFilter === v ? 'filled' : 'outlined'} sx={{ fontWeight: 700, borderRadius: '999px', height: { xs: 40, sm: 32 }, fontSize: 13 }} />
        ))}
      </Stack>

      {loading ? (
        <PageSkeleton cards={4} />
      ) : sorted.length === 0 ? (
        /* ReUI Empty (dono 30/10): vazio com moldura tracejada + CTA — antes era um
           Card mudo sem ação (beco sem saída na primeira visita). */
        <EmptyState
          variant="card"
          title="Sua jornada começa com o 1º exame"
          desc="Envie um exame (PDF ou foto) e a linha do tempo monta sozinha — exames, medições e vacinas em ordem."
          cta="Enviar exame"
          onCta={() => navigate('/exams/create')}
        />
      ) : (
        <Stack spacing={3}>
          {groups.map((g) => {
            const locked = !premium && g.year !== latestYear && g.year != null;
            return (
              <Box key={String(g.year)}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                  <Chip label={`📅 ${g.label}`} sx={{ fontWeight: 800, bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(148,163,184,0.18)' : '#0f172a', color: '#fff' }} />
                  <Typography variant="caption" color="text.secondary">{plural(g.items.length, 'registro')}{locked ? ' • Premium' : ''}</Typography>
                </Box>
                {locked ? (
                  <Card sx={{ borderRadius: '12px', p: 2, display: 'flex', alignItems: 'center', gap: 1.5, background: 'linear-gradient(135deg, rgba(32,178,170,.06), transparent)' }}>
                    <LockIcon sx={{ color: (t) => tealText(t.palette.mode) }} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 800 }}>Histórico de {g.label}</Typography>
                      <Typography variant="caption" color="text.secondary">Desbloqueie todo o seu histórico de exames (Premium).</Typography>
                    </Box>
                    <Button size="small" variant="contained" onClick={() => navigate('/planos')} sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 700, bgcolor: '#20b2aa', boxShadow: 'none', '&:hover': { bgcolor: 'primary.dark' } }}>Ver planos</Button>
                  </Card>
                ) : (
                  <Box sx={{ position: 'relative', pl: 5.5 }}>
                    {/* Trilho fino na cor da marca (antes: azul→verde fora da paleta) */}
                    <Box sx={{ position: 'absolute', left: '14px', top: 10, bottom: 10, width: 2, background: 'linear-gradient(rgba(32,178,170,.55), rgba(32,178,170,.15))', borderRadius: '12px' }} />
                    <Stack spacing={1.5}>{g.items.map(renderEvent)}</Stack>
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
              <Typography variant="body2" sx={{ color: 'error.main', fontWeight: 700 }}>🚩 {plural(abn.length, 'valor')} fora da faixa</Typography>
              {abn.map((it) => (
                <Box key={it.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1, borderRadius: '12px', bgcolor: 'rgba(239,68,68,.06)' }}>
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
          {/* Auditoria: o popup mostrava os valores mas não levava ao exame — pulo direto ao completo */}
          {sel?.id && (
            <Button variant="contained" fullWidth onClick={() => { setSel(null); navigate(`/exams/${sel.id}/show`); }} sx={{ mt: 2, borderRadius: '12px', textTransform: 'none', fontWeight: 800 }}>Abrir exame completo →</Button>
          )}
          <Button variant="outlined" fullWidth startIcon={<CloseIcon />} onClick={() => setSel(null)} sx={{ mt: 1 }}>Fechar</Button>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
};
