// SportsAlertBanner (E4.2) — banner de alerta no TOPO do painel esportivo. MESMA fonte
// do dashboard normal (health-state do /dashboard-summary: byPriority + staleWarning +
// worsening) — o modo esportivo REAPRESENTA, nunca recalcula nem esconde (§E6: contexto
// é texto, nunca supressor). Apresentação: AppCard accent warning + ÍCONE + TEXTO
// (não-só-cor) + tags dos marcadores em piora (padrão do preview §2).
import { Box, Button, Chip, Stack, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { useNavigate } from 'react-router-dom';
import { AppCard } from '../AppCard';
import { SEM } from '../../theme';
import { fmtNum } from '../../utils/format';
import type { Marker } from '../dashboard/ChangesSinceExam';

export const SportsAlertBanner = ({ loaded, exams, importante, moderada, staleWarning, worsened }: {
  loaded: boolean;
  exams: number;
  importante: number;
  moderada: number;
  staleWarning: string;
  worsened: Marker[];
}) => {
  const navigate = useNavigate();
  if (!loaded) return null;
  const attention = importante + moderada;

  // Sem exames → o banner vazio não existe (EmptyState geral cuida do estado vazio).
  if (exams === 0) return null;

  // Nada pedindo atenção → linha positiva curta (não some sem dizer nada).
  if (attention === 0) {
    return (
      <AppCard kind="accent" tone="success" sx={{ p: 1.75, mb: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <CheckCircleOutlineIcon sx={{ color: (t) => SEM.ok[t.palette.mode], flexShrink: 0 }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 800, fontSize: 14 }}>Nada crítico no momento</Typography>
          {staleWarning && <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>⏳ {staleWarning}</Typography>}
        </Box>
      </AppCard>
    );
  }

  return (
    <AppCard kind="accent" tone="warning" sx={{ p: { xs: 1.75, sm: 2 }, mb: 2 }}>
      <Stack direction="row" spacing={1.5} alignItems="flex-start">
        <WarningAmberIcon sx={{ color: (t) => SEM.warn[t.palette.mode], flexShrink: 0, mt: 0.25 }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography component="h2" sx={{ fontWeight: 800, fontSize: 15, lineHeight: 1.25 }}>
            {attention} {attention === 1 ? 'marcador pede' : 'marcadores pedem'} atenção
            {importante > 0 ? ` — ${importante} importante${importante > 1 ? 's' : ''}` : ''}
          </Typography>
          <Typography sx={{ fontSize: 13, color: 'text.secondary', mt: 0.5, lineHeight: 1.45 }}>
            {importante > 0
              ? 'Os importantes merecem prioridade na próxima consulta — leve o painel esportivo ao seu médico.'
              : 'Ajustes moderados — comente nas consultas e acompanhe a tendência.'}
          </Typography>
          {/* Tags dos que pioraram (preview §2): nome + valor + seta — dado real do health-summary */}
          {worsened.length > 0 && (
            <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
              {worsened.slice(0, 3).map((m, i) => {
                const v = m.latest?.valueNumeric ?? null;
                const dir = v != null && m.refHigh != null && v > m.refHigh ? '↑'
                  : v != null && m.refLow != null && v < m.refLow ? '↓'
                    : m.flag === 'HIGH' ? '↑' : '↓';
                return (
                  <Chip key={`${m.nameCanonical || m.name}-${i}`} size="small"
                    label={`${m.name}${v != null ? ` ${fmtNum(v)}${m.unit ? ' ' + m.unit : ''}` : ''} ${dir}`}
                    sx={{ height: 24, fontSize: 12, fontWeight: 700, bgcolor: (t) => alpha(SEM.warn[t.palette.mode], 0.10), color: (t) => SEM.warn[t.palette.mode] }} />
                );
              })}
            </Stack>
          )}
          {staleWarning && (
            <Chip size="small" label={`⏳ ${staleWarning}`} sx={{ mt: 1, height: 24, fontSize: 11.5, fontWeight: 700, bgcolor: 'action.hover', color: 'text.secondary' }} />
          )}
          <Box sx={{ mt: 1.25 }}>
            <Button size="small" onClick={() => navigate('/alterados')} sx={{ textTransform: 'none', fontWeight: 800, borderRadius: '10px', px: 1.5, color: (t) => SEM.warn[t.palette.mode] }}>
              Ver todos os alterados →
            </Button>
          </Box>
        </Box>
      </Stack>
    </AppCard>
  );
};
