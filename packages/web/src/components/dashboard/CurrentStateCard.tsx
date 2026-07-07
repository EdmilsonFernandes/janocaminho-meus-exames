import { useEffect, useState } from 'react';
import { Box, Card, CardContent, Typography, Stack, Chip, CircularProgress, Button } from '@mui/material';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { useNavigate } from 'react-router-dom';
import { API_URL, token } from '../../config';
import { useSelectedPatient } from '../../patient-context';
import { fmtVal, unitSuffix } from '../../utils/format';
import { PRIORITY_META } from '../../utils/alertPriority';

/**
 * "Meu estado atual" — o payoff visível da camada de estado de saúde (M1).
 * Consome GET /patients/:id/health-summary (Layer 2) e mostra: score, contagem por
 * prioridade, principais marcações de atenção (com tendência) e aviso de marcador desatualizado.
 * Não-alarmista, educativo — a decisão é sempre do médico.
 */
type Priority = 'normal' | 'leve' | 'moderada' | 'importante';
type Trend = 'melhorou' | 'piorou' | 'estavel' | 'primeiro' | 'aumentando' | 'reduzindo';
interface Marker {
  name: string; unit: string | null;
  latest: { valueText: string | null; valueNumeric: number | null; stale: boolean; ageMonths: number | null };
  prior: { valueText: string | null; valueNumeric: number | null } | null;
  deltaPct: number | null; priority: Priority; trend: Trend;
}
interface Summary {
  markers: number; score: number | null; byPriority: Record<Priority, number>;
  topAttention: Marker[]; improving: Marker[]; worsening: Marker[]; stale: Marker[];
}

const PRIO_COLOR: Record<Priority, string> = {
  normal: '#16a34a', leve: PRIORITY_META.leve.color, moderada: PRIORITY_META.moderada.color, importante: PRIORITY_META.importante.color,
};
const TREND_META: Record<Trend, { label: string; color: string }> = {
  melhorou: { label: 'Melhorou', color: '#16a34a' },
  piorou: { label: 'Atenção — piorou', color: '#dc2626' },
  estavel: { label: 'Estável', color: '#64748b' },
  primeiro: { label: '1º exame', color: '#64748b' },
  aumentando: { label: 'Em aumento', color: '#d97706' },
  reduzindo: { label: 'Em queda', color: '#0284c7' },
};

export const CurrentStateCard = () => {
  const navigate = useNavigate();
  const [pid] = useSelectedPatient();
  const [s, setS] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!pid) { setLoading(false); setS(null); return; }
    setLoading(true);
    fetch(`${API_URL}/patients/${pid}/health-summary`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setS(d ?? null))
      .catch(() => setS(null))
      .finally(() => setLoading(false));
  }, [pid]);

  if (loading) {
    return <Card sx={{ mt: 2, borderRadius: 4, minHeight: 96, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5 }}><CircularProgress size={22} sx={{ color: 'primary.main' }} /><Typography sx={{ fontWeight: 600, color: 'text.secondary' }}>Montando seu estado atual…</Typography></Card>;
  }
  if (!s || s.markers === 0) {
    return (
      <Card sx={{ mt: 2, borderRadius: 4, border: '1px solid', borderColor: 'divider', background: 'linear-gradient(135deg, rgba(32,178,170,.08), rgba(32,178,170,.02))' }}>
        <CardContent>
          <Stack direction="row" spacing={1.2} alignItems="center">
            <MonitorHeartIcon sx={{ color: 'primary.main' }} />
            <Box>
              <Typography sx={{ fontWeight: 800 }}>Meu estado atual</Typography>
              <Typography variant="body2" color="text.secondary">Envie um exame pra ver seu estado de saúde atual aqui — valores, tendências e o que mudou.</Typography>
            </Box>
          </Stack>
        </CardContent>
      </Card>
    );
  }

  const abnormal = s.markers - s.byPriority.normal;
  const top = s.topAttention.slice(0, 3);

  return (
    <Card sx={{ mt: 2, borderRadius: 4, border: '1px solid', borderColor: 'divider', background: 'linear-gradient(135deg, rgba(32,178,170,.08), rgba(32,178,170,.02))' }}>
      <CardContent>
        <Stack direction="row" spacing={1.2} alignItems="center" sx={{ mb: 1.25 }}>
          <MonitorHeartIcon sx={{ color: 'primary.main' }} />
          <Typography sx={{ fontWeight: 800, flex: 1 }}>Meu estado atual</Typography>
        </Stack>

        <Typography variant="body2" sx={{ mb: 1.25, color: 'text.primary', lineHeight: 1.4 }}>
          {abnormal === 0
            ? `Tudo dentro da faixa nos seus ${s.markers} marcador${s.markers > 1 ? 'es' : ''} mais recentes. Continue assim!`
            : `${abnormal} de ${s.markers} marcador${s.markers > 1 ? 'es' : ''} merecem atenção — vale revisar com seu médico.`}
        </Typography>

        {/* Contagem por prioridade (não-alarmista) */}
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: top.length ? 1.25 : 0 }}>
          {s.byPriority.importante > 0 && <Chip size="small" label={`${PRIORITY_META.importante.emoji} ${s.byPriority.importante} importante${s.byPriority.importante > 1 ? 's' : ''}`} sx={{ fontWeight: 700, height: 22, bgcolor: PRIO_COLOR.importante + '22', color: PRIO_COLOR.importante }} />}
          {s.byPriority.moderada > 0 && <Chip size="small" label={`${PRIORITY_META.moderada.emoji} ${s.byPriority.moderada} moderada${s.byPriority.moderada > 1 ? 's' : ''}`} sx={{ fontWeight: 700, height: 22, bgcolor: PRIO_COLOR.moderada + '22', color: PRIO_COLOR.moderada }} />}
          {s.byPriority.leve > 0 && <Chip size="small" label={`${PRIORITY_META.leve.emoji} ${s.byPriority.leve} leve${s.byPriority.leve > 1 ? 's' : ''}`} sx={{ fontWeight: 700, height: 22, bgcolor: PRIO_COLOR.leve + '22', color: PRIO_COLOR.leve }} />}
          {s.byPriority.normal > 0 && <Chip size="small" label={`✅ ${s.byPriority.normal} ${s.byPriority.normal > 1 ? 'normais' : 'normal'}`} sx={{ fontWeight: 700, height: 22, bgcolor: PRIO_COLOR.normal + '22', color: PRIO_COLOR.normal }} />}
        </Stack>

        {/* Principais marcações de atenção (com tendência) */}
        {top.length > 0 && (
          <Stack spacing={0.75} sx={{ mb: 1.25 }}>
            {top.map((m, i) => {
              const tm = TREND_META[m.trend];
              const u = unitSuffix({ valueText: m.latest.valueText, unit: m.unit });
              // "antes {prior}" — deixa claro que o número grande (latest) é o ATUAL e o % é a mudança desde o exame anterior.
              const priorStr = m.prior && (m.prior.valueText || m.prior.valueNumeric != null)
                ? fmtVal({ valueText: m.prior.valueText, valueNumeric: m.prior.valueNumeric })
                : null;
              return (
                <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.4, borderBottom: i < top.length - 1 ? '1px dashed' : 'none', borderColor: 'divider' }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</Typography>
                    <Typography variant="caption" sx={{ color: tm.color, fontWeight: 700 }}>{tm.label}{priorStr ? ` · antes ${priorStr}` : ''}{m.deltaPct != null ? ` · ${m.deltaPct > 0 ? '+' : ''}${Math.round(m.deltaPct)}%` : ''}</Typography>
                  </Box>
                  <Typography sx={{ fontWeight: 800, color: PRIO_COLOR[m.priority], fontSize: '1.05rem', flexShrink: 0 }}>{fmtVal({ valueText: m.latest.valueText, valueNumeric: m.latest.valueNumeric })}{u ? <Typography component="span" sx={{ fontSize: '0.7rem', color: 'text.secondary', ml: 0.3 }}>{u}</Typography> : null}</Typography>
                </Box>
              );
            })}
          </Stack>
        )}

        {/* Marcador desatualizado — nudge pra refazer */}
        {s.stale.length > 0 && (
          <Typography variant="caption" sx={{ display: 'block', color: '#9a6b00', mb: 1.25 }}>⏳ {s.stale.length} marcador(es) não mede(m) há mais de 1 ano — considere refazer com seu médico.</Typography>
        )}

        <Button fullWidth variant="outlined" size="small" endIcon={<ChevronRightIcon />} onClick={() => navigate('/alterados')} sx={{ borderRadius: 99, textTransform: 'none', fontWeight: 700, py: 1.1 }}>Ver valores alterados</Button>
      </CardContent>
    </Card>
  );
};
