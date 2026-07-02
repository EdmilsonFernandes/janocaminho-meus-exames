import { Chip } from '@mui/material';
import { displayStatus, type StatusTone } from '../utils/examStatus';

// Badge de status do item de exame. Usa displayStatus (helper central) — UNKNOWN nunca aparece cru:
// vira "S/ referência", "Contexto" (LDL/não-HDL) etc. Caller passa name/refLow/refHigh pra permitir
// a distinção (quando disponível).
const TONE_COLOR: Record<StatusTone, any> = {
  normal: 'success',
  atencao: 'warning',
  critico: 'error',
  neutro: 'default',
  contexto: 'info',
};

export const Flag = ({ flag, name, refLow, refHigh }: { flag: string; name?: string | null; refLow?: number | null; refHigh?: number | null }) => {
  const s = displayStatus(flag, name, refLow, refHigh);
  return (
    <Chip
      size="small"
      color={TONE_COLOR[s.tone] ?? 'default'}
      label={s.short}
      variant={s.tone === 'normal' ? 'outlined' : 'filled'}
      title={s.label}
    />
  );
};
