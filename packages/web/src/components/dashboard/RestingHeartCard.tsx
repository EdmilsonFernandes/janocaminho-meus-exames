import { useEffect, useMemo, useState } from 'react';
import { Box, Stack, Typography, alpha, useTheme } from '@mui/material';
import FavoriteIcon from '@mui/icons-material/Favorite';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import { API_URL, apiHeaders } from '../../config';
import { useSelectedPatient } from '../../patient-context';
import { AppCard } from '../AppCard';

/**
 * RestingHeartCard — tendência de FREQUÊNCIA CARDÍACA MÉDIA diária (Health Connect).
 *
 * A FC média do dia é o marcador de condicionamento que o app JÁ lê (zero permissões
 * novas). Estudos prospectivos: cada +10 bpm associa-se a maior risco de mortalidade
 * (PMC 4658911) — aqui virou contexto educativo: número grande + tendência 7d + zona,
 * com disclaimer (nunca diagnóstico). Só existe com ≥7 dias de dados — nada inventado.
 * Sério no dado, premium na forma (mesma linguagem do ActivityCard).
 */

interface HrDay { date: string; avg: number }

const zone = (bpm: number): { label: string; color: string } => {
  if (bpm > 0 && bpm < 60) return { label: 'zona ótima', color: '#059669' };
  if (bpm <= 80) return { label: 'zona típica', color: '#178f89' };
  return { label: 'elevada — comente com seu médico', color: '#b45309' };
};

// Animações (fora do JSX — menos aninhamento, mesma linguagem da casa)
const CARD_IN = {
  animation: 'DxHrIn .5s cubic-bezier(.2,.8,.2,1) both',
  '@keyframes DxHrIn': {
    from: { opacity: 0, transform: 'translateY(8px)' },
    to: { opacity: 1, transform: 'none' },
  },
} as const;
const BEAT = {
  animation: 'DxHrBeat 1.6s ease-in-out infinite',
  '@keyframes DxHrBeat': {
    '0%': { transform: 'scale(1)' },
    '50%': { transform: 'scale(1.35)' },
    '100%': { transform: 'scale(1)' },
  },
} as const;

export const RestingHeartCard = () => {
  const theme = useTheme();
  const [pid] = useSelectedPatient();
  const [series, setSeries] = useState<HrDay[] | null>(null);

  useEffect(() => {
    if (!pid) { setSeries(null); return; }
    let alive = true;
    fetch(`${API_URL}/measurements/hr-trend?days=30&patientId=${pid}`, { headers: apiHeaders() })
      .then((r) => (r.ok ? r.json() : { series: [] }))
      .then((d: { series?: HrDay[] }) => { if (alive) setSeries(d.series ?? []); })
      .catch(() => { if (alive) setSeries([]); });
    return () => { alive = false; };
  }, [pid]);

  const s = useMemo(() => {
    if (!series || series.length < 7) return null; // menos de 7 dias: sem card (sem ruído)
    const avg30 = Math.round(series.reduce((t, d) => t + d.avg, 0) / series.length);
    const last7 = series.slice(-7);
    const prev7 = series.slice(-14, -7);
    const avgLast7 = Math.round(last7.reduce((t, d) => t + d.avg, 0) / last7.length);
    const avgPrev7 = prev7.length >= 3 ? Math.round(prev7.reduce((t, d) => t + d.avg, 0) / prev7.length) : null;
    const delta = avgPrev7 != null ? avgLast7 - avgPrev7 : null;
    return { avg30, avgLast7, delta, days: series.length, series };
  }, [series]);

  if (!s) return null;

  const z = zone(s.avgLast7);
  const max = Math.max(...s.series.map((d) => d.avg), 1);
  const lastDate = s.series[s.series.length - 1]?.date;

  return (
    <AppCard sx={{ p: 2, ...CARD_IN }}>
      {/* Cabeçalho + zona (chip com batimento) */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.25 }}>
        <Typography sx={{ fontFamily: '"Poppins",sans-serif', fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <FavoriteIcon sx={{ fontSize: 19, color: '#ef4444' }} /> Frequência cardíaca
        </Typography>
        <Stack
          direction="row"
          spacing={0.5}
          alignItems="center"
          sx={{ px: 1, py: 0.35, borderRadius: '99px', bgcolor: alpha(z.color, 0.1), border: `1px solid ${alpha(z.color, 0.25)}` }}
        >
          <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: z.color, boxShadow: `0 0 8px ${z.color}`, ...BEAT }} />
          <Typography sx={{ fontSize: 11, fontWeight: 700, color: z.color }}>{z.label}</Typography>
        </Stack>
      </Stack>

      {/* Herói: FC média 7d + delta vs semana anterior | sparkline 30d */}
      <Stack direction="row" spacing={{ xs: 1.5, sm: 2 }} alignItems="center">
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography noWrap sx={{ fontSize: 12, color: 'text.secondary' }}>Média dos últimos 7 dias</Typography>
          <Stack direction="row" alignItems="baseline" spacing={0.5} sx={{ minWidth: 0 }}>
            <Typography sx={{ fontFamily: '"Poppins",sans-serif', fontWeight: 800, fontSize: { xs: 'clamp(1.5rem, 8vw, 2rem)', sm: 'clamp(1.75rem, 5vw, 2.125rem)', md: 34 }, lineHeight: 1.1, color: 'text.primary', fontVariantNumeric: 'tabular-nums' }}>
              {s.avgLast7}
            </Typography>
            <Typography component="span" sx={{ fontSize: 13, color: 'text.secondary', fontWeight: 600 }}>bpm</Typography>
          </Stack>
          {s.delta != null && s.delta !== 0 && (
            <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.25 }}>
              {s.delta < 0 ? (
                <TrendingDownIcon sx={{ fontSize: 15, color: 'success.main' }} />
              ) : (
                <TrendingUpIcon sx={{ fontSize: 15, color: '#b45309' }} />
              )}
              <Typography noWrap sx={{ fontSize: 11, fontWeight: 700, color: s.delta < 0 ? 'success.main' : '#b45309' }}>
                {s.delta < 0 ? '' : '+'}{s.delta} bpm vs semana anterior{s.delta < 0 ? ' · condicionamento tende a melhorar' : ' · acompanhe com seu médico'}
              </Typography>
            </Stack>
          )}
        </Box>

        {/* Sparkline 30d — barra do dia mais recente em destaque */}
        <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: 40, flex: 1, minWidth: 0 }} aria-hidden="true">
          {s.series.map((d) => (
            <Box
              key={d.date}
              sx={{
                flex: 1,
                minWidth: 2,
                maxWidth: 12,
                height: `${Math.max(10, (d.avg / max) * 100)}%`,
                borderRadius: '3px 3px 0 0',
                bgcolor: alpha(z.color, d.date === lastDate ? 1 : 0.35),
                transition: 'height .5s cubic-bezier(.2,.8,.2,1)',
              }}
            />
          ))}
        </Box>
      </Stack>

      {/* Contexto educativo honesto (nunca diagnóstico) */}
      <Typography sx={{ fontSize: 11, color: theme.palette.text.secondary, lineHeight: 1.5, mt: 1.25 }}>
        Média de 30 dias: <strong>{s.avg30} bpm</strong> · {s.days} dias registrados. Estudos prospectivos associam cada +10 bpm na frequência de repouso a maior risco cardiovascular — a <strong>tendência importa mais que o número isolado</strong>. Educativo; não substitui avaliação médica.
      </Typography>
    </AppCard>
  );
};
