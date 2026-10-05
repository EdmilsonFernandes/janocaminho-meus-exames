import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Box } from '@mui/material';
import { useStore } from 'react-admin';
import { DUR } from '../motion';

/**
 * Modo privacidade visual (padrão de app financeiro, adaptado pra SAÚDE): oculta na
 * tela o que é sensível pra ser visto em público — nome do exame (HIV, psiquiatria,
 * hormonais...). Global (AppBar/Perfil), persistido, off por padrão. Tap no texto
 * borrado revela por 5s e re-oculta sozinho.
 */
export function usePrivacyMode() {
  const [on, setOn] = useStore('privacyMode', false);
  return { privacyOn: on, setPrivacyOn: setOn };
}

/** Texto sensível: com modo privacidade LIGADO nasce BORRADO; tap = revela 5s. */
export const PrivacyText = ({ children, sx }: { children: ReactNode; sx?: any }) => {
  const { privacyOn } = usePrivacyMode();
  const [revealed, setRevealed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  if (!privacyOn) return <Box component="span" sx={sx}>{children}</Box>;
  const hidden = !revealed;
  return (
    <Box
      component="span"
      onClick={(e) => {
        if (!hidden) return;
        e.stopPropagation(); // não abre o exame — o tap aqui é só pra LER
        setRevealed(true);
        timer.current = setTimeout(() => setRevealed(false), 5000);
      }}
      title={hidden ? 'Toque para revelar por 5 segundos' : undefined}
      sx={{
        ...sx,
        ...(hidden && {
          filter: 'blur(6px)', cursor: 'pointer', userSelect: 'none',
          transition: `filter ${DUR}ms ease`,
        }),
      }}
    >
      {children}
    </Box>
  );
};
