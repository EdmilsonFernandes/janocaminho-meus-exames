import { Box } from '@mui/material';

/** Mascote Dr. Exame — robô de saúde (teal + cobre). */
export const DrExame = ({ size = 64, sx }: { size?: number; sx?: any }) => (
  <Box
    component="img"
    src={`${import.meta.env.BASE_URL}brand.png`}
    alt="Dr. Exame"
    sx={{ width: size, height: size, display: 'block', borderRadius: '16%', objectFit: 'cover', ...sx }}
  />
);
