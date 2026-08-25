import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Box } from '@mui/material';

/**
 * ScrollReveal — fade-in-up quando o elemento entra no viewport (IntersectionObserver).
 * Uso: <ScrollReveal delay={0.1}> <Seção/> </ScrollReveal>
 *
 * Trend #1 em landing pages premium 2026 (Saaspo: 93/3.097 páginas tagueadas com
 * scroll animations — mais comum que dark mode e gradientes). O efeito é leve:
 * translateY(24px)→0 + opacity 0→1, com delay escalonado pra criar ritmo de leitura.
 */
export const ScrollReveal = ({ children, delay = 0, sx }: { children: ReactNode; delay?: number; sx?: any }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
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
        transform: visible ? 'translateY(0)' : 'translateY(24px)',
        transition: `opacity .6s cubic-bezier(.16,1,.3,1) ${delay}s, transform .6s cubic-bezier(.16,1,.3,1) ${delay}s`,
        willChange: 'opacity, transform',
        ...sx,
      }}
    >
      {children}
    </Box>
  );
};

/**
 * AnimatedNumber — contador que anima de 0 até o valor alvo quando visível.
 * Padrão Function Health ("160+ lab tests detecting 1000+ conditions").
 */
export const AnimatedNumber = ({ value, suffix = '', prefix = '', duration = 1.2, sx }: {
  value: number; suffix?: string; prefix?: string; duration?: number; sx?: any;
}) => {
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !started.current) {
        started.current = true;
        const start = performance.now();
        const tick = (now: number) => {
          const t = Math.min((now - start) / (duration * 1000), 1);
          const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
          setDisplay(Math.round(eased * value));
          if (t < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        obs.disconnect();
      }
    }, { threshold: 0.3 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [value, duration]);

  return (
    <Box component="span" ref={ref} sx={{ fontVariantNumeric: 'tabular-nums', ...sx }}>
      {prefix}{display.toLocaleString('pt-BR')}{suffix}
    </Box>
  );
};
