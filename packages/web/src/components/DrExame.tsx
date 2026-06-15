import { Box } from '@mui/material';

/** Mascote Dr. Exame (robô-doutor). Usa import.meta.env.BASE_URL pra funcionar em sub-caminho e no APK. */
export const DrExame = ({ size = 64, sx }: { size?: number; sx?: any }) => (
  <Box
    component="img"
    src={`${import.meta.env.BASE_URL}dr-exame.svg`}
    alt="Dr. Exame"
    sx={{ width: size, height: size, display: 'block', ...sx }}
  />
);
