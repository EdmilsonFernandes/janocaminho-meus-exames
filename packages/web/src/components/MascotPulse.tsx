import type { ReactNode } from 'react';
import { Box } from '@mui/material';
import { keyframes } from '@mui/material/styles';

/** Anel que NASCE do círculo do mascote, expande e some (efeito "presença viva" —
 *  padrão de app nativo premium, aplicado com a cor da marca). */
const ring = keyframes`
  0%   { transform: scale(.92); opacity: .8; }
  70%  { opacity: .12; }
  100% { transform: scale(1.85); opacity: 0; }
`;

/** Aura pulsante em volta do mascote — 2 anéis defasados (metade do ciclo) criam o
 *  "coração batendo" contínuo. Envolva o núcleo (círculo c/ robô) como children.
 *  - Login (fundo teal): ringColor BRANCO translúcido (visível sobre a marca).
 *  - Diálogo Sobre (fundo paper): ringColor TEAL translúcido.
 *  prefers-reduced-motion: anéis desligados (só o núcleo, sem movimento). */
export const MascotPulse = ({ size = 92, ringColor = 'rgba(32,178,170,.35)', sx, children }: {
  size?: number; ringColor?: string; sx?: any; children: ReactNode;
}) => (
  <Box sx={{ position: 'relative', width: size, height: size, ...sx }}>
    {[0, 1].map((i) => (
      <Box key={i} aria-hidden sx={{
        position: 'absolute', inset: 0, borderRadius: '50%',
        border: `2px solid ${ringColor}`,
        animation: `${ring} 2.6s ease-out ${i * 1.3}s infinite`,
        '@media (prefers-reduced-motion: reduce)': { animation: 'none', opacity: 0 },
      }} />
    ))}
    {children}
  </Box>
);
