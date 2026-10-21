import { Box, Stack, Typography } from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import { fmtNum } from '../../utils/format';

/**
 * SinceExamCard — CONTEÚDO da aba "Hábitos" do card "O que mudou" (ChangesSinceExam).
 *
 * Desde o merge (fix F3 vocabulário/merge), os dois cards irmãos — "O que mudou nos
 * seus exames" e "Seu dia a dia desde {mês}" — viraram UM card com 2 abas
 * (Exames | Hábitos). Este arquivo ficou responsável apenas pelo conteúdo de hábitos:
 * sem AppCard, sem título de card, sem CTA próprio (o CTA único vive no card-pai).
 *
 * O dado vem do `/measurements/since-exam` (buscado pelo card-pai) e mostra o que
 * mudou no dia-a-dia (atividade, peso, pressão) ENTRE exames.
 */

export interface HabitChange {
  metric: string; label: string; emoji: string; unit: string;
  from: number; to: number; deltaPct: number; direction: 'up' | 'down';
}
export interface ExamChange {
  name: string; direction: string; deltaPct: number | null;
}
export interface SinceExamData {
  hasData: boolean;
  lastExamDate?: string;
  habitChanges?: HabitChange[];
  examChanges?: ExamChange[];
  coverage?: number;
}

export const SinceExamCard = ({ data }: { data: SinceExamData | null }) => {
  if (!data?.hasData || !data.habitChanges?.length) return null;

  const examDate = data.lastExamDate
    ? new Date(`${data.lastExamDate}T12:00:00`).toLocaleDateString('pt-BR', { month: 'long' })
    : '';
  const habitCount = data.habitChanges.length;

  return (
    <Box sx={{ mt: 0.5 }}>
      {/* Sub-linha da aba — o card-pai já tem o título "O que mudou" */}
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <TrendingUpIcon sx={{ fontSize: 18, color: 'primary.dark' }} />
        <Typography sx={{ fontWeight: 700, fontSize: 13.5 }}>
          Seu dia a dia {examDate && <Box component="span" sx={{ color: 'text.secondary', fontWeight: 600 }}>desde {examDate}</Box>}
        </Typography>
      </Stack>

      {/* Hábitos que mudaram */}
      <Stack spacing={0.75}>
        {data.habitChanges.map((h) => (
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

      {/* Síntese */}
      {habitCount > 0 && (
        <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 1.25, lineHeight: 1.45 }}>
          {habitCount} hábito{habitCount > 1 ? 's' : ''} mudou{habitCount > 1 ? 'ram' : ''} desde seu último exame — contexto que ajuda a entender seus resultados.
        </Typography>
      )}
    </Box>
  );
};
