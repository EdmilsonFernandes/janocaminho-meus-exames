import { Box } from '@mui/material';

/** Mascote Dr. Exame — usa o ÍCONE OFICIAL do app adaptado ao tamanho correto com suporte a srcset e alta densidade. */
export const DrExame = ({ size = 64, sx }: { size?: number; sx?: any }) => {
  const base = import.meta.env.BASE_URL;
  const iconSrc =
    size <= 48
      ? `${base}app-icon-48.png`
      : size <= 96
      ? `${base}app-icon-96.png`
      : size <= 192
      ? `${base}app-icon-192.png`
      : `${base}app-icon.png`;

  const srcSet = `${base}app-icon-48.png 48w, ${base}app-icon-96.png 96w, ${base}app-icon-192.png 192w, ${base}app-icon.png 512w`;

  return (
    <Box
      component="img"
      src={iconSrc}
      srcSet={srcSet}
      sizes={`${size}px`}
      alt="Dr. Exame"
      sx={{ width: size, height: size, display: 'block', borderRadius: '16%', objectFit: 'cover', ...sx }}
    />
  );
};
