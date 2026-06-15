import { Box } from '@mui/material';

/** Mascote da marca (mesma identidade do ecossistema EdEspeto). */
export const DrExame = ({ size = 64, sx }: { size?: number; sx?: any }) => (
  <Box
    component="img"
    src={`${import.meta.env.BASE_URL}brand.jpg`}
    alt="Dr. Exame"
    sx={{ width: size, height: size, display: 'block', borderRadius: '18%', objectFit: 'cover', ...sx }}
  />
);
