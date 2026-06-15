import { Chip } from '@mui/material';

const COLORS: Record<string, any> = {
  NORMAL: 'success',
  HIGH: 'warning',
  LOW: 'warning',
  ABNORMAL: 'error',
  CRITICAL: 'error',
  UNKNOWN: 'default',
};

const LABELS: Record<string, string> = {
  NORMAL: 'Normal',
  HIGH: 'Acima',
  LOW: 'Abaixo',
  ABNORMAL: 'Alterado',
  CRITICAL: 'Crítico',
  UNKNOWN: '—',
};

export const Flag = ({ flag }: { flag: string }) => (
  <Chip
    size="small"
    color={COLORS[flag] ?? 'default'}
    label={LABELS[flag] ?? flag}
    variant={flag === 'NORMAL' ? 'outlined' : 'filled'}
  />
);
