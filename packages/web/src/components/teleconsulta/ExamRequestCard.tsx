// ExamRequestCard — pedido de exame do médico (F3 §3a). Presentational: status
// com chips de cor (tokens §5 do doc de UX), nota do médico, ações do PACIENTE
// delegadas ao container via onAction (Autorizar/Agendar/Negar). Médico vê só
// status ("Paciente vê e responde no app dele") — D7: médico não tem push.
import { Box, Button, Chip, Stack, Typography, useTheme } from '@mui/material';
import AssignmentIcon from '@mui/icons-material/Assignment';
import type { ExamRequest, ExamRequestAction, TeleconsultaRole } from './types';

export interface ExamRequestCardProps {
  req: ExamRequest;
  role: TeleconsultaRole;
  /** Paciente respondendo: (req, action). Ausente (ou papel médico) = sem ações. */
  onAction?: (req: ExamRequest, action: ExamRequestAction) => void;
  /** Desabilita as ações (envio em andamento no container). */
  busy?: boolean;
}

/** Tokens §5: âmbar pendência · teal status · neutro negado — AA nos 2 modos. */
const chipStyle = (kind: 'amber' | 'teal' | 'muted', mode: 'light' | 'dark') => {
  if (kind === 'amber') return { bgcolor: mode === 'dark' ? 'rgba(245,158,11,.14)' : 'rgba(245,158,11,.15)', color: mode === 'dark' ? '#fbbf24' : '#92400e' };
  if (kind === 'teal') return { bgcolor: mode === 'dark' ? 'rgba(95,201,195,.12)' : 'rgba(15,118,110,.10)', color: mode === 'dark' ? '#5fc9c3' : '#0f766e' };
  return { bgcolor: 'action.hover', color: 'text.secondary' };
};

const fmtDay = (d?: string | null) => {
  if (!d) return null;
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? null : dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
};

export const ExamRequestCard = ({ req, role, onAction, busy }: ExamRequestCardProps) => {
  const theme = useTheme();
  const mode = theme.palette.mode;
  const status = req.status === 'declined' ? 'denied' : req.status;
  const pending = status === 'pending';
  // Paciente pode agir: papel paciente + pendente + handler fornecido.
  const canAct = role === 'patient' && pending && !!onAction;

  const statusChip = (() => {
    if (status === 'pending') {
      return <Chip size="small" label={role === 'doctor' ? 'Aguardando paciente' : 'Aguardando você'} sx={{ height: 24, fontSize: 12, fontWeight: 700, borderRadius: '8px', ...chipStyle('amber', mode) }} />;
    }
    if (status === 'authorized') {
      return <Chip size="small" label="Autorizado" sx={{ height: 24, fontSize: 12, fontWeight: 700, borderRadius: '8px', ...chipStyle('teal', mode) }} />;
    }
    if (status === 'scheduled') {
      const day = fmtDay(req.scheduledFor ?? req.dueDate);
      return <Chip size="small" label={day ? `Agendado p/ ${day}` : 'Agendado'} sx={{ height: 24, fontSize: 12, fontWeight: 700, borderRadius: '8px', ...chipStyle('teal', mode) }} />;
    }
    return <Chip size="small" label="Negado" sx={{ height: 24, fontSize: 12, fontWeight: 700, borderRadius: '8px', ...chipStyle('muted', mode) }} />;
  })();

  return (
    <Box
      sx={{
        p: 2,
        borderRadius: '16px',
        bgcolor: 'background.paper',
        border: '1px solid',
        borderColor: pending ? 'rgba(245,158,11,.35)' : 'divider',
      }}
    >
      <Stack direction="row" alignItems="flex-start" spacing={1.25}>
        <Box sx={{ width: 36, height: 36, borderRadius: '12px', display: 'grid', placeItems: 'center', flexShrink: 0, bgcolor: 'rgba(32,178,170,.10)' }}>
          <AssignmentIcon sx={{ fontSize: 18, color: (t) => (t.palette.mode === 'dark' ? '#5fc9c3' : '#0f766e') }} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 800, fontSize: 15, color: 'text.primary', lineHeight: 1.3, wordBreak: 'break-word' }}>
            {req.title}
          </Typography>
          {req.note ? (
            <Typography sx={{ fontSize: 13, color: 'text.secondary', mt: 0.5, lineHeight: 1.55 }}>
              “{req.note}”
            </Typography>
          ) : null}
          <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
            {statusChip}
            <Typography variant="caption" sx={{ fontSize: 11.5, color: 'text.secondary' }}>
              pedido em {fmtDay(req.createdAt) ?? '—'}
            </Typography>
          </Stack>

          {/* Paciente pendente: ações inline (mesma lógica do sheet in-call §2b). */}
          {canAct && (
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mt: 1.5 }}>
              <Button
                size="small"
                variant="contained"
                disabled={busy}
                onClick={() => onAction!(req, 'authorize')}
                sx={{
                  minHeight: 44, px: 2.5, borderRadius: '999px', textTransform: 'none', fontWeight: 800, fontSize: 13.5,
                  background: 'linear-gradient(135deg,#20b2aa,#178f89)', boxShadow: '0 4px 12px rgba(32,178,170,.30)',
                  '&:hover': { background: 'linear-gradient(135deg,#1aa39b,#12706b)' },
                }}
              >
                Autorizar
              </Button>
              <Button
                size="small"
                variant="outlined"
                disabled={busy}
                onClick={() => onAction!(req, 'schedule')}
                sx={{ minHeight: 44, px: 2.5, borderRadius: '999px', textTransform: 'none', fontWeight: 700, fontSize: 13.5, borderColor: 'rgba(32,178,170,.45)', color: (t) => (t.palette.mode === 'dark' ? '#5fc9c3' : '#0f766e') }}
              >
                Agendar
              </Button>
              <Button
                size="small"
                disabled={busy}
                onClick={() => onAction!(req, 'deny')}
                sx={{ minHeight: 44, borderRadius: '999px', textTransform: 'none', fontWeight: 700, fontSize: 13.5, color: 'error.main' }}
              >
                Negar
              </Button>
            </Stack>
          )}

          {/* Médico diante de pendente: sem push (D7) — explica onde a resposta chega. */}
          {role === 'doctor' && pending && (
            <Typography variant="caption" sx={{ display: 'block', mt: 1, fontSize: 11.5, color: 'text.secondary' }}>
              Paciente vê e responde no app dele.
            </Typography>
          )}
        </Box>
      </Stack>
    </Box>
  );
};
