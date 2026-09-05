import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Box } from '@mui/material';

/**
 * ScrollReveal — fade-up suave ao entrar na viewport.
 *
 * CSS-only animation trigada por IntersectionObserver (1x). Sem lib de animação.
 * `delay` escalona a entrada entre seções do Dashboard (0, 60, 120ms…).
 */
export const ScrollReveal = ({
  children,
  delay = 0,
  sx,
}: {
  children: ReactNode;
  delay?: number;
  sx?: object;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Preferência do usuário: sem animação se `prefers-reduced-motion`.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVisible(true);
      return;
    }
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold: 0.08, rootMargin: '0px 0px -40px 0px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <Box
      ref={ref}
      sx={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'none' : 'translateY(18px)',
        transition: `opacity .5s cubic-bezier(.16,1,.3,1) ${delay}ms, transform .5s cubic-bezier(.16,1,.3,1) ${delay}ms`,
        willChange: visible ? 'auto' : 'opacity, transform',
        ...sx,
      }}
    >
      {children}
    </Box>
  );
};
