import { useState, useEffect } from 'react';
import { Box, Typography } from '@mui/material';
import { DrExameRobot } from './DrExameRobot';

/** Cicla mensagens a cada `interval` ms (micro-interação: reduz a sensação de espera). */
function useRotatingText(msgs: string[], interval = 1800): { text: string; key: number } {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (msgs.length <= 1) return;
    const t = setInterval(() => setIndex((prev) => (prev + 1) % msgs.length), interval);
    return () => clearInterval(t);
  }, [msgs.length, interval]);
  return { text: msgs[index] ?? '', key: index };
}

/**
 * BootSplash premium v3 (26/10 — "robô vivo"):
 *  - Robô SVG VIVO: olhos piscando (CSS) + antena cobre com lag + micro bounce
 *    com squash/stretch. SVG não depende de decode de bitmap no WebView Android
 *    (fix 29/09 preservado por construção: nada de <img> PNG aqui).
 *  - 3 anéis sonar concêntricos teal, defasados (como chamada recebida).
 *  - Barra de progresso que RESPIRA (glow opacidade + drift) — substitui o ECG
 *    + dots antigos (menos competição visual, um foco por tela).
 *  - Perf: SEM filter:blur animado (mesh blobs antigos custavam GPU no Android);
 *    aura agora é radial-gradient estático com respiração em transform/opacity.
 *    Só propriedades de compositor; will-change só onde paga.
 *  - Saída `isExiting`: fade + scale refinado (420ms, cubic-bezier padrão MUI).
 *  - Fundo #031412 = MESMA cor do splash nativo (capacitor.config.ts) → handoff
 *    seamless; nativo fica estático (sistema controla o fade — Android 12+).
 *  - prefers-reduced-motion: entradas em fade simples, loops decorativos param.
 */
export const BootSplash = ({
  title = 'Dr. Exame',
  subtitle,
  messages,
  isExiting = false,
  footNote,
  leaveLabel,
  onLeave,
}: {
  title?: string;
  subtitle?: string;
  messages?: string[];
  isExiting?: boolean;
  /** Esperas que CONTINUAM server-side: avisa que pode sair sem perder (anti-ansiedade). */
  footNote?: string;
  leaveLabel?: string;
  onLeave?: () => void;
}) => {
  const { text: rotatingMsg, key: msgKey } = useRotatingText(messages && messages.length > 1 ? messages : []);
  const currentSub = messages && messages.length ? rotatingMsg : subtitle ?? 'Seu assistente de saúde com IA';

  return (
    <Box
      sx={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: '#031412',
        color: '#fff',
        overflow: 'hidden',
        userSelect: 'none',
        pointerEvents: isExiting ? 'none' : 'auto',
        animation: isExiting ? 'bsExit 420ms cubic-bezier(0.4, 0, 0.2, 1) forwards' : 'none',
      }}
    >
      {/* --- Aura teal respirando (radial-gradient SEM blur — barato no WebView) --- */}
      <Box
        className="bs-aura"
        sx={{
          position: 'absolute',
          top: '26%',
          left: '50%',
          ml: '-260px',
          width: 520,
          height: 520,
          maxWidth: '130vw',
          maxHeight: '130vw',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(32,178,170,0.22) 0%, rgba(23,143,137,0.08) 55%, transparent 75%)',
          animation: 'bsAura 3.8s ease-in-out infinite alternate',
        }}
      />
      {/* Grid pontilhado sutil de profundidade */}
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'radial-gradient(rgba(255, 255, 255, 0.045) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
          opacity: 0.55,
        }}
      />

      {/* --- Palco central --- */}
      <Box
        sx={{
          position: 'relative',
          zIndex: 2,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 2,
          px: 3,
          textAlign: 'center',
        }}
      >
        {/* Emblema: entrada spring (mesmo fix 29/09, agora com SVG) + micro bounce */}
        <Box
          className="bs-emblem"
          sx={{
            position: 'relative',
            animation:
              'bsIn 560ms cubic-bezier(0.34, 1.3, 0.32, 1) both, bsBounce 3.4s ease-in-out 560ms infinite',
            '@media (prefers-reduced-motion: reduce)': {
              animation: 'bsInFade 360ms ease-out both',
            },
          }}
        >
          {/* 3 anéis sonar concêntricos defasados (chamada recebida) */}
          {[
            { op: 0.5, d: '0s' },
            { op: 0.36, d: '0.45s' },
            { op: 0.24, d: '0.9s' },
          ].map((r, i) => (
            <Box
              key={i}
              className="bs-ring"
              sx={{
                position: 'absolute',
                inset: -16,
                borderRadius: '50%',
                border: '1.5px solid',
                borderColor: `rgba(45, 212, 191, ${r.op})`,
                animation: `bsRing 2.7s cubic-bezier(0, 0.2, 0.8, 1) ${r.d} infinite`,
              }}
            />
          ))}

          {/* Moldura de vidro (sem backdrop-filter — caro no Android; look via camadas) */}
          <Box
            sx={{
              position: 'relative',
              width: 124,
              height: 124,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%',
              bgcolor: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.2)',
              boxShadow: '0 18px 44px rgba(0,0,0,0.5), inset 0 1px 2px rgba(255,255,255,0.35), 0 0 34px rgba(32,178,170,0.28)',
              overflow: 'hidden',
            }}
          >
            {/* Brilho metálico passando (shimmer) */}
            <Box
              className="bs-shimmer"
              sx={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(105deg, transparent 32%, rgba(255,255,255,0.38) 50%, transparent 68%)',
                transform: 'translateX(-110%)',
                animation: 'bsShimmer 3.4s ease-in-out infinite',
                pointerEvents: 'none',
              }}
            />
            <DrExameRobot size={100} />
          </Box>
        </Box>

        {/* --- Título com gradiente --- */}
        <Box sx={{ mt: 1 }}>
          <Typography
            variant="h3"
            sx={{
              fontWeight: 900,
              fontFamily: '"Poppins", "Inter", sans-serif',
              fontSize: { xs: 30, sm: 36 },
              letterSpacing: '-0.03em',
              background: 'linear-gradient(135deg, #ffffff 0%, #ccfbf1 45%, #2dd4bf 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              textShadow: '0 10px 30px rgba(20, 184, 166, 0.3)',
            }}
          >
            {title}
          </Typography>

          {/* Badge de status com mensagens rotativas (progresso perceptido) */}
          <Box
            sx={{
              mt: 1.2,
              px: 2.2,
              py: 0.75,
              borderRadius: '999px',
              bgcolor: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(45, 212, 191, 0.22)',
              boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 1.2,
              minHeight: 34,
            }}
          >
            <Box
              className="bs-dot"
              sx={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                bgcolor: '#2dd4bf',
                boxShadow: '0 0 10px #2dd4bf',
                animation: 'bsDotPulse 1.4s ease-in-out infinite',
              }}
            />
            <Typography
              key={msgKey}
              sx={{
                fontSize: 14,
                fontWeight: 600,
                color: 'rgba(240, 253, 250, 0.92)',
                letterSpacing: '-0.01em',
                animation: 'bsTextFade 0.35s ease-out forwards',
              }}
            >
              {currentSub}
            </Typography>
          </Box>
        </Box>

        {/* --- Barra de progresso que respira --- */}
        <Box
          sx={{
            mt: 0.5,
            position: 'relative',
            width: 210,
            height: 6,
            borderRadius: 999,
            bgcolor: 'rgba(255,255,255,0.09)',
            overflow: 'hidden',
          }}
        >
          <Box
            className="bs-glow"
            sx={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: '58%',
              borderRadius: 999,
              background: 'linear-gradient(90deg, #178f89, #2dd4bf)',
              transformOrigin: 'left center',
              animation: 'bsBarBreathe 2.6s ease-in-out infinite',
            }}
          />
          {/* Ponto de luz que percorre (leitura em andamento) */}
          <Box
            className="bs-drift"
            sx={{
              position: 'absolute',
              top: 1,
              left: '50%',
              ml: '-7px',
              width: 14,
              height: 4,
              borderRadius: 999,
              bgcolor: '#9ff5ec',
              boxShadow: '0 0 8px rgba(120, 240, 228, 0.9)',
              animation: 'bsDrift 1.9s ease-in-out infinite alternate',
            }}
          />
        </Box>

        {/* Rodapé opcional: "pode sair" (esperas que continuam server-side — anti-ansiedade). */}
        {(footNote || (leaveLabel && onLeave)) && (
          <Box sx={{ mt: 2.5, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.25, zIndex: 2 }}>
            {footNote && (
              <Typography sx={{ fontSize: 12.5, color: 'rgba(204,251,241,.78)', maxWidth: 330, lineHeight: 1.55, px: 2, textWrap: 'balance' }}>
                {footNote}
              </Typography>
            )}
            {leaveLabel && onLeave && (
              <Box
                component="button"
                type="button"
                onClick={onLeave}
                sx={{ px: 2.5, py: 0.85, borderRadius: '999px', border: '1px solid rgba(45,212,191,.45)', bgcolor: 'rgba(45,212,191,.10)', color: '#ccfbf1', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', '&:hover': { bgcolor: 'rgba(45,212,191,.18)' } }}
              >
                {leaveLabel} →
              </Box>
            )}
          </Box>
        )}
      </Box>

      {/* --- Keyframes: só transform/opacity (compositor, 60fps) --- */}
      <style>{`
        /* Entrada spring (overshoot) — estado inicial no 0% + fill both (nunca há
           frame sem estilo; herda a garantia do fix 29/09, agora com SVG). */
        @keyframes bsIn {
          0% { opacity: 0; transform: translateY(10px) scale(0.86); }
          55% { opacity: 1; }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes bsInFade { from { opacity: 0; } to { opacity: 1; } }
        /* Micro bounce com squash & stretch (volume preservado) */
        @keyframes bsBounce {
          0%, 100% { transform: translateY(0) scale(1, 1); }
          50% { transform: translateY(-6px) scale(0.99, 1.015); }
        }
        @keyframes bsAura {
          0% { transform: scale(0.97); opacity: 0.55; }
          100% { transform: scale(1.06); opacity: 0.95; }
        }
        @keyframes bsRing {
          0% { transform: scale(0.94); opacity: 0.8; }
          100% { transform: scale(1.62); opacity: 0; }
        }
        @keyframes bsShimmer {
          0% { transform: translateX(-110%); }
          32%, 100% { transform: translateX(110%); }
        }
        @keyframes bsDotPulse {
          0%, 100% { opacity: 0.4; transform: scale(0.85); }
          50% { opacity: 1; transform: scale(1.25); }
        }
        @keyframes bsTextFade {
          0% { opacity: 0; transform: translateY(4px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        /* Barra respirando: brilho cresce/decresce sem sair do trilho */
        @keyframes bsBarBreathe {
          0%, 100% { opacity: 0.55; transform: scaleX(0.94); }
          50% { opacity: 1; transform: scaleX(1); }
        }
        @keyframes bsDrift {
          0% { transform: translateX(-92px); }
          100% { transform: translateX(92px); }
        }
        @keyframes bsExit {
          0% { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(1.05); visibility: hidden; }
        }
        @keyframes bsBarGlow { 0%, 100% { opacity: 0.5; } 50% { opacity: 0.95; } }
        /* prefers-reduced-motion: loops decorativos param; loading essencial respira em opacity */
        @media (prefers-reduced-motion: reduce) {
          .bs-ring, .bs-shimmer, .bs-dot, .bs-drift { animation: none !important; }
          .bs-ring { opacity: 0.18; transform: none; }
          .bs-glow { animation: bsBarGlow 2.6s ease-in-out infinite !important; transform: none !important; }
          .bs-aura { animation: none !important; opacity: 0.6; }
          .bs-emblem { animation: bsInFade 360ms ease-out both !important; }
        }
      `}</style>
    </Box>
  );
};
