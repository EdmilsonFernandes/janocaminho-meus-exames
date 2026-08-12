import { Chip } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import type { Priority } from '../utils/alertPriority';
import { PRIORITY_META } from '../utils/alertPriority';
import { RADIUS } from '../theme';

/**
 * SeverityBadge — badge de severidade clínica REUTILIZÁVEL (primitiva do design system).
 *
 * Comunica severidade por **emoji + TEXTO + tom** (nunca só cor — acessível WCAG 1.4.1).
 * Substitui os `<Chip>` ad-hoc espalhados por ValoresAlterados/DoctorValoresAlterados/etc.,
 * unificando a semântica clínica (importante / moderada / leve / normal / conferir).
 *
 * Cores: PRIORITY_META (fonte única) via theme.palette + alpha() — sem hex literal.
 * Usa RADIUS.pill (token string). `size="small"` cabe em linhas densas (altura 22).
 *
 * Uso:
 *   <SeverityBadge severity="importante" />
 *   <SeverityBadge severity="moderada" size="small" />
 *   <SeverityBadge state="check" title="Faixa possivelmente incorreta" />
 *   <SeverityBadge state="normal" />
 */
export type SeverityState = 'normal' | 'check';

interface Props {
  /** Severidade clínica (requer endpoint de prioridade). Mutuamente exclusivo c/ `state`. */
  severity?: Priority;
  /** Estado não-clínico: 'normal' (dentro da ref) ou 'check' (faixa a conferir). */
  state?: SeverityState;
  size?: 'small' | 'medium';
  /** Tooltip acessível (explica o que o badge significa). */
  title?: string;
}

const STATE_META: Record<SeverityState, { emoji: string; label: string; paletteKey: 'success' | 'text' }> = {
  normal: { emoji: '🟢', label: 'Na referência', paletteKey: 'success' },
  check: { emoji: '⚠️', label: 'Faixa a conferir', paletteKey: 'text' },
};

export const SeverityBadge = ({ severity, state, size = 'small', title }: Props) => {
  const theme = useTheme();
  let emoji: string;
  let label: string;
  let color: string;
  let hint: string | undefined;

  if (severity) {
    const m = PRIORITY_META[severity];
    emoji = m.emoji;
    label = m.label;
    color = m.color;
    hint = m.hint;
  } else {
    const s = STATE_META[state ?? 'normal'];
    emoji = s.emoji;
    label = s.label;
    color = s.paletteKey === 'success' ? theme.palette.success.main : theme.palette.text.secondary;
    hint = state === 'check' ? 'A faixa de referência pode estar com escala errada — confira no documento original.' : undefined;
  }

  return (
    <Chip
      size={size}
      label={`${emoji} ${label}`}
      title={title ?? hint}
      aria-label={label}
      sx={{
        height: size === 'small' ? 22 : 26,
        fontWeight: 700,
        borderRadius: RADIUS.pill,
        bgcolor: alpha(color, 0.15),
        color,
        '& .MuiChip-label': { px: 1, fontSize: size === 'small' ? 11 : 12 },
      }}
    />
  );
};
