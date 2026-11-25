import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Button, Stack, Typography, useTheme } from '@mui/material';
import EventRepeatRoundedIcon from '@mui/icons-material/EventRepeatRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { API_URL, token } from '../../config';
import { useSelectedPatient } from '../../patient-context';
import { AppCard } from '../AppCard';

/**
 * PRÓXIMO EXAME (25/11/26) — a data em que costuma fazer sentido repetir, calculada do exame mais
 * recente (3 meses se algo saiu da faixa, 12 se estava tudo dentro). É o motivo natural para voltar
 * ao app; antes ele não aparecia em lugar nenhum. O servidor também avisa quando o prazo chega.
 *
 * Só aparece quando há o que dizer: prazo chegando (≤30 dias) ou já chegou. Longe disso, o card
 * some — sem mobília na Home. Texto sem prescrição: lembra o prazo e devolve a decisão ao médico.
 */
export interface RetestPlan {
  examId: string;
  lastExamAt: string;
  dueAt: string;
  months: number;
  reason: 'alterado' | 'rotina';
  markers: string[];
  daysUntil: number;
  status: 'longe' | 'chegando' | 'chegou';
}

const joinNames = (n: string[]) => (n.length <= 1 ? n[0] ?? '' : `${n.slice(0, -1).join(', ')} e ${n[n.length - 1]}`);

/** Textos do card (função pura, testada). null = não mostrar. */
export function nextExamCopy(plan: RetestPlan | null): { title: string; when: string; body: string; tone: 'primary' | 'warning' } | null {
  if (!plan || plan.status === 'longe') return null;
  const due = new Date(plan.dueAt);
  const month = due.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const why = plan.reason === 'alterado'
    ? `No último exame, ${joinNames(plan.markers)} ${plan.markers.length > 1 ? 'saíram' : 'saiu'} da faixa. É comum repetir em cerca de ${plan.months} meses para ver como ficou.`
    : 'Muita gente refaz os exames de rotina uma vez por ano.';
  if (plan.status === 'chegou') {
    const late = -plan.daysUntil;
    return {
      title: 'Hora de rever seu exame',
      when: late <= 1 ? 'O prazo chegou agora' : `O prazo chegou há ${late} dias`,
      body: `${why} Vale combinar com seu médico.`,
      tone: 'warning',
    };
  }
  return {
    title: 'Seu próximo exame',
    when: `Por volta de ${month} · em ${plan.daysUntil} ${plan.daysUntil === 1 ? 'dia' : 'dias'}`,
    body: `${why} A gente avisa quando chegar a hora.`,
    tone: 'primary',
  };
}

export function NextExamCard() {
  const navigate = useNavigate();
  const isDark = useTheme().palette.mode === 'dark';
  const [pid] = useSelectedPatient();
  const [plan, setPlan] = useState<RetestPlan | null>(null);

  useEffect(() => {
    let alive = true;
    setPlan(null);
    fetch(`${API_URL}/retest${pid ? `?patientId=${pid}` : ''}`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d?.plan) setPlan(d.plan as RetestPlan); })
      .catch(() => { /* sem rede: o card simplesmente não aparece */ });
    return () => { alive = false; };
  }, [pid]);

  const copy = nextExamCopy(plan);
  if (!copy) return null;

  const tone = copy.tone === 'warning'
    ? { fg: isDark ? '#fbbf24' : '#b45309', bg: isDark ? 'rgba(251,191,36,.14)' : 'rgba(245,158,11,.14)' }
    : { fg: isDark ? '#5fc9c3' : '#0f766e', bg: isDark ? 'rgba(32,178,170,.16)' : 'rgba(32,178,170,.12)' };

  return (
    <AppCard sx={{ p: { xs: 2.25, md: 2.5 }, mt: 2 }} aria-label={copy.title} data-next-exam>
      <Stack direction="row" spacing={1.5} alignItems="flex-start">
        <Box sx={{ width: 44, height: 44, borderRadius: '14px', bgcolor: tone.bg, color: tone.fg, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <EventRepeatRoundedIcon />
        </Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography sx={{ fontFamily: 'Poppins, sans-serif', fontWeight: 800, fontSize: 17, color: 'text.primary', lineHeight: 1.25 }}>
            {copy.title}
          </Typography>
          <Typography sx={{ fontSize: 13, fontWeight: 700, color: tone.fg, mt: 0.25 }}>{copy.when}</Typography>
          <Typography sx={{ fontSize: 13.5, color: 'text.secondary', mt: 0.75, lineHeight: 1.5 }}>{copy.body}</Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: 'wrap', rowGap: 1 }}>
            <Button
              variant="contained"
              onClick={() => navigate('/exams/create')}
              endIcon={<ArrowForwardRoundedIcon />}
              sx={{ minHeight: 44, borderRadius: '12px', textTransform: 'none', fontWeight: 700, px: 2 }}
            >
              Enviar novo exame
            </Button>
            <Button
              onClick={() => navigate(`/exams/${plan!.examId}/show`)}
              sx={{ minHeight: 44, borderRadius: '12px', textTransform: 'none', fontWeight: 700, px: 1.5 }}
            >
              Ver o último
            </Button>
          </Stack>
        </Box>
      </Stack>
    </AppCard>
  );
}
