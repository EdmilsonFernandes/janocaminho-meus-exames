import { Box } from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import { DrExame } from './DrExame';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';

/**
 * Dr. Exame flutuante — atalho pro chat.
 * Robô (sem círculo/borda verde sólida) sobre uma AURA teal pulsante (glow borrado) +
 * badge ✨ (AutoAwesome = símbolo universal de IA) que pisca. Flutua leve e, no desktop,
 * segue o cursor discretamente quando ele chega perto.
 */
export const FloatingChat = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const innerRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // touch-only (mobile) não tem cursor → não segue
    if (window.matchMedia('(hover: none)').matches) return;
    let raf = 0;
    const onMove = (e: MouseEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const wrap = wrapRef.current;
        const inner = innerRef.current;
        if (!wrap || !inner) return;
        const r = wrap.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const dx = e.clientX - cx;
        const dy = e.clientY - cy;
        const dist = Math.hypot(dx, dy) || 1;
        // só reage quando o cursor está relativamente perto (<= 240px) — discreto
        if (dist > 240) { inner.style.transform = 'translate(0,0)'; return; }
        const pull = Math.min(9, 100 / dist); // mais perto → puxa mais (máx 9px)
        inner.style.transform = `translate(${(dx / dist) * pull}px, ${(dy / dist) * pull}px)`;
      });
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => { window.removeEventListener('mousemove', onMove); cancelAnimationFrame(raf); };
  }, []);

  // Esconde onde já existe chat/input/ação (não competir com outra ação na mesma tela):
  // /chat, /exams (lista tem o "+"), /exams/:id/show (chat inline), /exams/create (form de upload).
  // Escondido onde já existe IA/menu: dashboard (tem AiCard hero + botão Dr.Exame no rodapé), /chat, /exams.
  if (pathname === '/' || pathname.startsWith('/chat') || /^\/exams(\/|$)/.test(pathname)) return null;

  return (
    <>
      <style>{`
        @keyframes drAura { 0%,100%{transform:scale(.92);opacity:.4} 50%{transform:scale(1.14);opacity:.72} }
        @keyframes drBob { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }
        @keyframes drSpark { 0%,100%{transform:scale(.82) rotate(0deg);opacity:.65} 45%{transform:scale(1.18) rotate(18deg);opacity:1} 70%{transform:scale(1) rotate(8deg);opacity:.9} }
      `}</style>
      <Box
        ref={wrapRef}
        component="button"
        aria-label="Pergunte ao Dr. Exame"
        onClick={() => navigate('/chat')}
        title="Pergunte ao Dr. Exame"
        sx={{
          position: 'fixed', bottom: { xs: 'calc(var(--me-bottom-nav-h, 76px) + 14px)', md: 22 }, right: { xs: 12, md: 22 }, zIndex: 1200,
          width: 46, height: 46, p: 0, bgcolor: 'transparent',
          border: 'none', borderRadius: '50%', cursor: 'pointer',
          boxShadow: 'none',
          '&:active': { transform: 'scale(.94)' },
        }}
      >
        {/* AURA teal pulsante (glow borrado — substitui o círculo/borda sólidos) */}
        <Box sx={{
          position: 'absolute', inset: -10, borderRadius: '50%', pointerEvents: 'none',
          background: 'radial-gradient(circle, rgba(32,178,170,.26) 0%, rgba(32,178,170,.10) 45%, transparent 72%)',
          filter: 'blur(6px)', animation: 'drAura 2.6s ease-in-out infinite',
        }} />
        {/* Robô + badge ✨ (seguem o cursor no desktop) */}
        <Box ref={innerRef} sx={{
          position: 'relative', width: '100%', height: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'transform .25s ease-out', willChange: 'transform',
        }}>
          <Box sx={{ animation: 'drBob 3.4s ease-in-out infinite' }}>
            <DrExame size={34} sx={{ borderRadius: '26%', filter: 'drop-shadow(0 1px 2px rgba(15,61,58,.20))' }} />
          </Box>
          {/* Badge ✨ IA — símbolo universal de inteligência artificial */}
          <Box sx={{
            position: 'absolute', top: -2, right: -2, width: 18, height: 18, borderRadius: '50%',
            bgcolor: '#178f89',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'drSpark 2.2s ease-in-out infinite',
          }}>
            <AutoAwesomeIcon sx={{ fontSize: 10, color: '#fff' }} />
          </Box>
        </Box>
      </Box>
    </>
  );
};
