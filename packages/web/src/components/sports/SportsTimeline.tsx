// SportsTimeline (E4.2 §5) — linha do tempo UNIFICADA do modo esportivo: exames
// (performedAt) + substâncias declaradas (startedAt) + atividade do Health Connect
// (se disponível). Padrão visual da página Timeline (dot colorido + linha vertical);
// aqui em versão compacta pro dashboard. HC AUSENTE = "sem dados de atividade"
// (NUNCA zero — honestidade de estado). Dados antigos ganham chip temporal.
import { Box, Stack, Typography, Chip, useTheme } from '@mui/material';
import { alpha } from '@mui/material/styles';
import ScienceIcon from '@mui/icons-material/Science';
import MedicationIcon from '@mui/icons-material/Medication';
import DirectionsRunIcon from '@mui/icons-material/DirectionsRun';
import { AppCard } from '../AppCard';
import { EmptyState } from '../EmptyState';
import { isStaleExam } from '../../utils/alertPriority';
import { RADIUS } from '../../theme';

export interface SportsEvent {
  id: string;
  date: string | null;
  title: string;
  detail?: string | null;
  type: 'exam' | 'substancia' | 'atividade';
  abnormalCount?: number;
}

export const SportsTimeline = ({ events, hasActivityData, max = 8 }: {
  events: SportsEvent[];
  /** false = Health Connect sem dados registrados → linha honesta, não "0 treinos". */
  hasActivityData: boolean;
  max?: number;
}) => {
  const theme = useTheme();
  const sorted = [...events]
    .filter((e) => e.date)
    .sort((a, b) => new Date(b.date!).getTime() - new Date(a.date!).getTime());
  const shown = sorted.slice(0, max);

  const dot = (type: SportsEvent['type'], alerta: boolean) => {
    if (type === 'substancia') return { color: '#d4a574', icon: <MedicationIcon sx={{ fontSize: 12, color: '#fff' }} /> };
    if (type === 'atividade') return { color: theme.palette.success.main, icon: <DirectionsRunIcon sx={{ fontSize: 12, color: '#fff' }} /> };
    return { color: alerta ? theme.palette.error.main : '#0d9488', icon: <ScienceIcon sx={{ fontSize: 12, color: '#fff' }} /> };
  };

  return (
    <AppCard sx={{ p: { xs: 2, sm: 2.5 } }}>
      <Typography component="h2" sx={{ fontFamily: 'Poppins, sans-serif', fontWeight: 700, fontSize: 15, mb: 0.5 }}>
        Linha do tempo do atleta
      </Typography>
      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 2 }}>
        Exames, substâncias declaradas{hasActivityData ? ' e treinos registrados' : ''} — dos mais recentes.
      </Typography>

      {shown.length === 0 ? (
        <EmptyState emoji="🗓️" title="Nada por aqui ainda"
          desc="Envie um exame ou declare uma substância para construir sua linha do tempo esportiva." />
      ) : (
        <Box sx={{ position: 'relative', pl: 3.5 }}>
          {/* Linha vertical (padrão Timeline.tsx) */}
          <Box sx={{ position: 'absolute', left: 14, top: 8, bottom: 8, width: 3, borderRadius: '12px', background: 'linear-gradient(#0d9488,#d4a574)' }} />
          <Stack spacing={1.5}>
            {shown.map((e) => {
              const alerta = e.type === 'exam' && (e.abnormalCount ?? 0) > 0;
              const d = dot(e.type, alerta);
              const stale = e.type === 'exam' && isStaleExam(e.date);
              return (
                <Box key={e.id} sx={{ position: 'relative' }}>
                  <Box sx={{ position: 'absolute', left: -3.5, top: 6, width: 22, height: 22, borderRadius: '50%', bgcolor: d.color, border: `3px solid ${theme.palette.background.paper}`, boxShadow: '0 2px 6px rgba(0,0,0,.2)', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {d.icon}
                  </Box>
                  <Box sx={{ ml: 1.5, borderRadius: RADIUS.tile, bgcolor: alpha(d.color, 0.05), border: `1px solid ${alpha(d.color, 0.2)}`, px: 1.5, py: 1, minWidth: 0 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1} sx={{ minWidth: 0 }}>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 700, fontSize: 13.5, lineHeight: 1.25, wordBreak: 'break-word' }}>{e.title}</Typography>
                        {e.detail && <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', lineHeight: 1.3 }}>{e.detail}</Typography>}
                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                          {e.date ? new Date(e.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : 's/d'}
                        </Typography>
                      </Box>
                      <Stack spacing={0.5} sx={{ flexShrink: 0 }}>
                        {e.type === 'exam' && alerta && <Chip size="small" label={`${e.abnormalCount} alterado${e.abnormalCount === 1 ? '' : 's'}`} sx={{ height: 20, fontSize: 10.5, fontWeight: 700, bgcolor: 'error.main', color: '#fff' }} />}
                        {stale && <Chip size="small" label="antigo" sx={{ height: 20, fontSize: 10.5, fontWeight: 700, bgcolor: 'action.hover', color: 'text.secondary' }} />}
                      </Stack>
                    </Stack>
                  </Box>
                </Box>
              );
            })}
          </Stack>
          {sorted.length > shown.length && (
            <Typography variant="caption" sx={{ display: 'block', mt: 1.5, color: 'text.secondary' }}>
              +{sorted.length - shown.length} eventos anteriores
            </Typography>
          )}
        </Box>
      )}

      {/* HC ausente ≠ zero — estado honesto (AC §E4.3) */}
      {!hasActivityData && (
        <Typography variant="caption" sx={{ display: 'block', mt: 2, color: 'text.secondary' }}>
          📴 Sem dados de atividade — conecte o Health Connect no app para os treinos entrarem aqui.
        </Typography>
      )}
    </AppCard>
  );
};
