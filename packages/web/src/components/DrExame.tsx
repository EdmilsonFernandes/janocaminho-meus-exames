import { Box } from '@mui/material';

/** Mascote Dr. Exame — usa o ÍCONE OFICIAL do app (mesmo do launcher/ic_launcher), não um robô inventado. */
export const DrExame = ({ size = 64, sx }: { size?: number; sx?: any }) => (
  <Box
    component="img"
    src={`${import.meta.env.BASE_URL}app-icon.png`}
    alt="Dr. Exame"
    sx={{ width: size, height: size, display: 'block', borderRadius: '16%', objectFit: 'cover', ...sx }}
  />
);
