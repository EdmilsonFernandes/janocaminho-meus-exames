import { Box, type SxProps, type Theme } from '@mui/material';
import { useEffect, useRef, useState, type ReactNode } from 'react';

// Reveal (F5) — fade + translateY ao entrar no viewport (IntersectionObserver).
// Progressivo: se JS/fail ou prefers-reduced-motion, mostra o conteúdo direto.
// `once` = revela uma vez e desconecta (não re-esconde ao rolar pra cima).
type RevealProps = {
  children: ReactNode;
  delay?: number;
  sx?: SxProps<Theme>;
};

export const Reveal = ({ children, delay = 0, sx }: RevealProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setShown(true);
            io.disconnect();
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Box
      ref={ref}
      sx={{
        transition: 'opacity .6s ease, transform .6s cubic-bezier(.22,1,.36,1)',
        transitionDelay: `${delay}ms`,
        opacity: shown ? 1 : 0,
        transform: shown ? 'none' : 'translateY(24px)',
        ...sx,
      }}
    >
      {children}
    </Box>
  );
};
