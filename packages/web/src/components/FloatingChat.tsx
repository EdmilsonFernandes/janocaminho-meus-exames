import { Fab, Box } from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import { DrExame } from './DrExame';

/**
 * Dr. Exame flutuante (FAB).
 * No desktop, o robô segue o cursor DISCRETAMENTE (até 8px, só quando o mouse está perto)
 * + um pulso suave pra convidar o usuário a perguntar. No mobile (sem cursor) fica estático.
 */
export const FloatingChat = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const innerRef = useRef<HTMLDivElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // touch-only (mobile) não tem cursor → não segue
    if (window.matchMedia('(hover: none)').matches) return;
    let raf = 0;
    const onMove = (e: MouseEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const fab = fabRef.current;
        const inner = innerRef.current;
        if (!fab || !inner) return;
        const r = fab.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const dx = e.clientX - cx;
        const dy = e.clientY - cy;
        const dist = Math.hypot(dx, dy) || 1;
        // só reage quando o cursor está relativamente perto (<= 240px) — discreto
        if (dist > 240) { inner.style.transform = 'translate(0,0)'; return; }
        const pull = Math.min(8, 90 / dist); // mais perto → puxa mais (máx 8px)
        inner.style.transform = `translate(${(dx / dist) * pull}px, ${(dy / dist) * pull}px)`;
      });
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => { window.removeEventListener('mousemove', onMove); cancelAnimationFrame(raf); };
  }, []);

  // Esconde onde já existe chat/input/ação (não competir com outra ação na mesma tela):
  // /chat, /exams (lista tem o "+"), /exams/:id/show (chat inline), /exams/create (form de upload).
  if (pathname.startsWith('/chat') || /^\/exams(\/|$)/.test(pathname)) return null;
  return (
    <Fab
      ref={fabRef}
      onClick={() => navigate('/chat')}
      title="Pergunte ao Dr. Exame"
      color="primary"
      sx={{
        position: 'fixed', bottom: { xs: 76, md: 24 }, right: { xs: 14, md: 24 }, zIndex: 1200,
        width: 60, height: 60,
        boxShadow: '0 6px 18px rgba(32,178,170,.4)',
        animation: 'drPulse 2.8s ease-in-out infinite',
        '&:hover': { transform: 'scale(1.07)' },
      }}
    >
      <Box ref={innerRef} sx={{
        transition: 'transform .25s ease-out', display: 'flex', alignItems: 'center', justifyContent: 'center',
        pointerEvents: 'none', willChange: 'transform',
      }}>
        <DrExame size={46} sx={{ borderRadius: '50%' }} />
      </Box>
    </Fab>
  );
};
