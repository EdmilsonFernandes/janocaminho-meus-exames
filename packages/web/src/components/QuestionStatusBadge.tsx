import { Chip } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ScheduleIcon from '@mui/icons-material/Schedule';

/** Badge UNIFICADO de status de pergunta ao médico. Antes tinha 3 paletas diferentes
 *  (laranja no inbox, âmbar na tab, esmeralda no Questions). Agora: 1 design só.
 *  open = âmbar "Aguardando" (ícone relógio). answered = teal "Respondida" (check). */
export const QuestionStatusBadge = ({ status, size = 'small' as const }: { status: string; size?: 'small' | 'medium' }) => {
  const isOpen = status !== 'answered';
  return (
    <Chip
      size={size}
      icon={isOpen ? <ScheduleIcon sx={{ fontSize: size === 'small' ? 13 : 16 }} /> : <CheckCircleIcon sx={{ fontSize: size === 'small' ? 13 : 16 }} />}
      label={isOpen ? 'Aguardando' : 'Respondida'}
      sx={{
        height: size === 'small' ? 22 : 26,
        fontSize: size === 'small' ? 10 : 12,
        fontWeight: 700,
        bgcolor: isOpen ? 'rgba(245,158,11,.12)' : 'rgba(32,178,170,.12)',
        color: isOpen ? '#b45309' : '#178f89',
        '& .MuiChip-icon': { color: isOpen ? '#b45309' : '#178f89' },
      }}
    />
  );
};
