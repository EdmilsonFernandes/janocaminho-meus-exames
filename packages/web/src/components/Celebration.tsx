import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Box, Typography, Button, Stack } from '@mui/material';
import { DrExame } from './DrExame';
import { GradientButton } from './GradientButton';

/**
 * Celebration — o "momento woowww" do 1º exame extraído (pico emocional da jornada;
 * a pesquisa de ativação mostrou que é AQUI que o funil vive).
 *
 * Overlay full-screen com confetti canvas (teal/cobre/emerald — cores da marca, SEM lib),
 * robô na aura e CTA "Ver minha análise". Dispara 1× por paciente (flag dx1st:{pid} no
 * DashboardV2). prefers-reduced-motion → sem confetti/sem bounce (o momento informativo
 * permanece). Textos com wrap e clamp — nada de overflow com fonte grande no celular.
 */
const CONFETTI_COLORS = ['#20b2aa', '#178f89', '#d4a574', '#34d399', '#ffffff'];

const reducedMotion = () => {
  try { return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};

/** Confetti canvas puro — ~46 partículas caindo com rotação, auto-para em ~4,2s. */
const ConfettiCanvas = () => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (reducedMotion()) return;
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => { canvas.width = canvas.offsetWidth * dpr; canvas.height = canvas.offsetHeight * dpr; };
    resize();
    window.addEventListener('resize', resize);
    const W = () => canvas.width, H = () => canvas.height;
    const pieces = Array.from({ length: 46 }, () => ({
      x: Math.random() * W(), y: -Math.random() * H() * 0.4,
      w: (6 + Math.random() * 5) * dpr, h: (8 + Math.random() * 7) * dpr,
      vx: (Math.random() - 0.5) * 1.6 * dpr, vy: (1.6 + Math.random() * 2.2) * dpr,
      rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.18,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      sway: Math.random() * Math.PI * 2,
    }));
    const started = performance.now();
    let raf = 0;
    const tick = (ts: number) => {
      const t = (ts - started) / 1000;
      ctx.clearRect(0, 0, W(), H());
      for (const p of pieces) {
        p.x += p.vx + Math.sin(t * 3 + p.sway) * 0.6 * dpr;
        p.y += p.vy;
        p.rot += p.vr;
        if (p.y > H() + 20 * dpr) { p.y = -20 * dpr; p.x = Math.random() * W(); }
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = t > 3.4 ? Math.max(0, 1 - (t - 3.4) / 0.8) : 1; // fade-out final
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (t < 4.2) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);
  return <Box component="canvas" ref={ref} aria-hidden="true" sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />;
};

export const Celebration = ({ open, firstName, onDone, onCta }: {
  open: boolean;
  firstName?: string;
  /** Fecha E marca a flag 1×-por-paciente (chamado em qualquer saída). */
  onDone: () => void;
  onCta: () => void;
}) => {
  if (!open) return null;
  // PORTAL pro body: sem isto o overlay fica preso no stacking context da página e
  // dialogs MUI (portaled, z1300) pintam POR CIMA e engolem os cliques (bug do QA).
  // SSR (renderToString) renderiza in-place — contrato de teste continua válido.
  const overlay = (
    <Box
      role="dialog"
      aria-modal="true"
      aria-label="Celebração do primeiro exame"
      onClick={onDone}
      sx={{
        position: 'fixed', inset: 0, zIndex: 1400,
        display: 'grid', placeItems: 'center', p: 2,
        pt: 'calc(env(safe-area-inset-top, 0px) + 16px)',
        pb: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
        bgcolor: 'rgba(10,26,25,0.55)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
      }}
    >
      <ConfettiCanvas />
      <Box
        onClick={(e) => e.stopPropagation()}
        sx={{
          position: 'relative', zIndex: 1,
          width: '100%', maxWidth: 380,
          bgcolor: 'background.paper',
          borderRadius: '24px',
          border: '1px solid rgba(32,178,170,.25)',
          boxShadow: '0 24px 64px rgba(0,0,0,.35), 0 0 0 1px rgba(255,255,255,.06) inset',
          p: { xs: 2.5, sm: 3.5 },
          textAlign: 'center',
          animation: 'dxCelebratePop .55s cubic-bezier(.34,1.56,.64,1) both',
          '@keyframes dxCelebratePop': {
            from: { opacity: 0, transform: 'translateY(28px) scale(.9)' },
            to: { opacity: 1, transform: 'translateY(0) scale(1)' },
          },
          '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
        }}
      >
        <Box sx={{
          width: 104, height: 104, mx: 'auto', mb: 2, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'radial-gradient(circle at 50% 40%, rgba(32,178,170,.28), rgba(32,178,170,.06) 70%)',
          boxShadow: '0 0 0 6px rgba(32,178,170,.08)',
          animation: 'dxCelebrateBounce 1.1s ease-in-out infinite',
          '@keyframes dxCelebrateBounce': { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-9px)' } },
          '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
        }}>
          <DrExame size={68} sx={{ borderRadius: '50%' }} />
        </Box>
        <Typography sx={{ fontFamily: 'Poppins, sans-serif', fontWeight: 800, fontSize: { xs: 'clamp(1.15rem, 5.5vw, 1.45rem)' }, lineHeight: 1.2, color: 'text.primary', textWrap: 'balance' }}>
          🎉 {firstName ? `${firstName}, seu` : 'Seu'} primeiro exame virou análise!
        </Typography>
        <Typography sx={{ color: 'text.secondary', mt: 1, fontSize: 14.5, lineHeight: 1.55, maxWidth: 300, mx: 'auto' }}>
          O Dr. Exame já leu tudo e montou a sua visão de saúde. Bora ver o resultado?
        </Typography>
        <Stack spacing={1.25} sx={{ mt: 2.5 }}>
          <GradientButton onClick={onCta} sx={{ width: '100%', py: 1.2, fontSize: 15 }}>
            Ver minha análise
          </GradientButton>
          <Button onClick={onDone} sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 700, color: 'text.secondary' }}>
            Continuar no painel
          </Button>
        </Stack>
      </Box>
    </Box>
  );
  return typeof document !== 'undefined' ? createPortal(overlay, document.body) : overlay;
};
