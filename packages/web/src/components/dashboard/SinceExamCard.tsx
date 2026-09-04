import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Stack, Typography, Skeleton, alpha, useTheme } from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { AppCard } from '../AppCard';
import { fmtNum } from '../../utils/format';
import { API_URL, token } from '../../config';

/**
 * SinceExamCard — "Desde seu último exame" (assinatura do produto).
 *
 * Mostra o que mudou no dia-a-dia (atividade, peso, pressão) ENTRE exames,
 * lado a lado com as mudanças nos exames. O usuário vê a história completa:
 * "eu me exercitei mais E meu LDL caiu — aconteceram juntos".
 *
 * Só aparece quando: há exame extraído + atividade sincronizada + mudanças ≥5%.
 * Sem Health Connect → o card simplesmente não existe (nada quebra).
 */

interface HabitChange {
  metric: string; label: string; emoji: string; unit: string;
  from: number; to: number; deltaPct: number; direction: 'up' | 'down';
}
interface ExamChange {
  name: string; direction: string; deltaPct: number | null;
}
interface SinceExamData {
  hasData: boolean;
  lastExamDate?: string;
  habitChanges?: HabitChange[];
  examChanges?: ExamChange[];
  coverage?: number;
}

export const SinceExamCard = ({ lastExamAt }: { lastExamAt?: string | null }) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const [data, setData] = useState<SinceExamData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!lastExamAt) { setLoading(false); return; }
    setLoading(true);
    fetch(`${API_URL}/measurements/since-exam`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [lastExamAt]);

  // Sem exames ou sem atividade → card não existe
  if (!lastExamAt || (!loading && (!data?.hasData || !data?.habitChanges?.length))) return null;

  const examDate = data?.lastExamDate
    ? new Date(`${data.lastExamDate}T12:00:00`).toLocaleDateString('pt-BR', { month: 'long' })
    : '';

  const habitCount = data?.habitChanges?.length ?? 0;
  const examCount = data?.examChanges?.filter((e) => e.direction !== 'stable').length ?? 0;

  return (
    <AppCard kind="tinted" tone="primary" sx={{ p: 2 }}>
      {/* Header — "Seu dia a dia desde {mês}": este card é sobre HÁBITOS (atividade/peso/PA);
          o card de marcadores ao lado já cobre "o que mudou nos exames" (sem duplicar título). */}
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.25 }}>
        <TrendingUpIcon sx={{ fontSize: 19, color: 'primary.dark' }} />
        <Typography sx={{ fontFamily: '"Poppins",sans-serif', fontWeight: 700, fontSize: 15 }}>
          Seu dia a dia {examDate && <Box component="span" sx={{ color: 'text.secondary', fontWeight: 600 }}>desde {examDate}</Box>}
        </Typography>
      </Stack>

      {/* Hábitos que mudaram */}
      <Stack spacing={0.75}>
        {data?.habitChanges?.map((h) => (
          <Stack key={h.metric} direction="row" spacing={1} alignItems="center">
            <Box component="span" sx={{ fontSize: 16, width: 24, textAlign: 'center', flexShrink: 0 }}>{h.emoji}</Box>
            <Typography sx={{ fontSize: 13, color: 'text.secondary', flex: 1, minWidth: 0 }}>
              {h.label}
            </Typography>
            <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flexShrink: 0 }}>
              {h.direction === 'up'
                ? <TrendingUpIcon sx={{ fontSize: 14, color: 'success.main' }} />
                : <TrendingDownIcon sx={{ fontSize: 14, color: h.metric.includes('peso') || h.metric.includes('Systolic') ? 'success.main' : 'primary.main' }} />}
              <Typography sx={{ fontSize: 13, fontWeight: 700, color: 'text.primary' }}>
                {h.deltaPct > 0 ? '+' : ''}{fmtNum(h.deltaPct, 0)}%
              </Typography>
            </Stack>
          </Stack>
        ))}
      </Stack>

      {/* Exames que mudaram (se houver) */}
      {examCount > 0 && (
        <Box sx={{ mt: 1.5, pt: 1.25, borderTop: `1px solid ${alpha(theme.palette.primary.main, 0.15)}` }}>
          <Typography sx={{ fontSize: 11, color: 'text.secondary', fontWeight: 700, mb: 0.5, textTransform: 'none' }}>
            Exames que também mudaram
          </Typography>
          <Stack spacing={0.5}>
            {data?.examChanges?.filter((e) => e.direction !== 'stable').slice(0, 3).map((e) => (
              <Stack key={e.name} direction="row" spacing={1} alignItems="center">
                <Typography sx={{ fontSize: 13, color: 'text.secondary', flex: 1, minWidth: 0 }}>
                  🧪 {e.name}
                </Typography>
                <Typography sx={{ fontSize: 13, fontWeight: 700, color: e.direction === 'improved' ? 'success.main' : 'error.main' }}>
                  {e.direction === 'improved' ? '↓' : '↑'} {fmtNum(Math.abs(e.deltaPct ?? 0), 0)}%
                </Typography>
              </Stack>
            ))}
          </Stack>
        </Box>
      )}

      {/* Síntese */}
      {(habitCount > 0 || examCount > 0) && (
        <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 1.5, lineHeight: 1.45 }}>
          {habitCount > 0 && examCount > 0
            ? `${habitCount} hábito${habitCount > 1 ? 's' : ''} e ${examCount} exame${examCount > 1 ? 's' : ''} evoluíram no mesmo período — contexto que ajuda a entender seus resultados.`
            : habitCount > 0
              ? `${habitCount} hábito${habitCount > 1 ? 's' : ''} mudou desde seu último exame.`
              : 'Seus exames mudaram — veja a evolução completa.'}
        </Typography>
      )}

      {/* CTA */}
      <Stack
        direction="row"
        spacing={0.5}
        alignItems="center"
        onClick={() => navigate('/relatorio')}
        sx={{ mt: 1.25, cursor: 'pointer', color: 'primary.dark', '&:hover': { opacity: 0.8 } }}
      >
        <Typography sx={{ fontSize: 13, fontWeight: 700 }}>Ver relatório completo</Typography>
        <ArrowForwardIcon sx={{ fontSize: 14 }} />
      </Stack>
    </AppCard>
  );
};
