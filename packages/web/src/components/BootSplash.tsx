import { useState, useEffect } from 'react';
import { Box, Typography } from '@mui/material';
import { DrExame } from './DrExame';

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
 * Tela ultra-premium de carregamento (Nível iFood / 99Food / Nubank).
 *  - Fundo: iluminação viva em movimento (mesh blobs animadas + aura neon).
 *  - Emblema 3D Glassmorphic: moldura de vidro temperado, brilho metálico e ondas de sonar holográficas.
 *  - ECG Neon em Tempo Real: traçado de batimento com ponto condutor de luz radiante.
 *  - Suporte a transição suave de saída (`isExiting`).
 */
export const BootSplash = ({
  title = 'Dr. Exame',
  subtitle,
  messages,
  isExiting = false,
}: {
  title?: string;
  subtitle?: string;
  messages?: string[];
  isExiting?: boolean;
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
        animation: isExiting ? 'bootExit 420ms cubic-bezier(0.4, 0, 0.2, 1) forwards' : 'none',
      }}
    >
      {/* --- Camada de Iluminação Mesh Viva (Background Atmosphere) --- */}
      <Box
        sx={{
          position: 'absolute',
          top: '25%',
          left: '30%',
          width: '50vw',
          height: '50vw',
          maxWidth: 500,
          maxHeight: 500,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(20, 184, 166, 0.35) 0%, rgba(13, 148, 136, 0.15) 50%, transparent 70%)',
          filter: 'blur(60px)',
          animation: 'meshBlob1 8s ease-in-out infinite alternate',
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          bottom: '20%',
          right: '25%',
          width: '45vw',
          height: '45vw',
          maxWidth: 450,
          maxHeight: 450,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(45, 212, 191, 0.25) 0%, rgba(15, 118, 110, 0.1) 60%, transparent 80%)',
          filter: 'blur(70px)',
          animation: 'meshBlob2 10s ease-in-out infinite alternate',
        }}
      />

      {/* Grid sutil de profundidade */}
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'radial-gradient(rgba(255, 255, 255, 0.04) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
          opacity: 0.6,
        }}
      />

      {/* --- Palco Central --- */}
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
        {/* Container do Emblema 3D */}
        <Box sx={{ position: 'relative', animation: 'bootFloat 3.6s ease-in-out infinite' }}>
          {/* Resplendor Neon Traseiro */}
          <Box
            sx={{
              position: 'absolute',
              inset: -32,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(45, 212, 191, 0.45) 0%, rgba(20, 184, 166, 0.1) 65%, transparent 80%)',
              filter: 'blur(16px)',
              animation: 'bootPulseAura 2.4s ease-in-out infinite alternate',
            }}
          />

          {/* Ondas Sonar / Radar Holográfico */}
          <Box
            sx={{
              position: 'absolute',
              inset: -12,
              borderRadius: '50%',
              border: '1.5px solid rgba(45, 212, 191, 0.4)',
              animation: 'bootSonar 2.8s cubic-bezier(0, 0.2, 0.8, 1) infinite',
            }}
          />
          <Box
            sx={{
              position: 'absolute',
              inset: -12,
              borderRadius: '50%',
              border: '1.5px solid rgba(45, 212, 191, 0.3)',
              animation: 'bootSonar 2.8s 0.9s cubic-bezier(0, 0.2, 0.8, 1) infinite',
            }}
          />

          {/* Moldura Glassmorphic com Shimmer Sweep Metálico */}
          <Box
            sx={{
              position: 'relative',
              p: '6px',
              borderRadius: '50%',
              background: 'linear-gradient(145deg, rgba(255,255,255,0.28) 0%, rgba(45,212,191,0.15) 50%, rgba(255,255,255,0.05) 100%)',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5), inset 0 1px 2px rgba(255,255,255,0.4)',
              backdropFilter: 'blur(16px)',
              overflow: 'hidden',
            }}
          >
            {/* Varredura Shimmer */}
            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.45) 50%, transparent 70%)',
                transform: 'translateX(-100%)',
                animation: 'bootShimmer 3.2s infinite ease-in-out',
                pointerEvents: 'none',
              }}
            />

            {/* Ícone Dr. Exame */}
            <DrExame
              size={112}
              sx={{
                borderRadius: '50%',
                boxShadow: '0 8px 30px rgba(13, 148, 136, 0.6)',
                border: '2px solid rgba(255,255,255,0.25)',
              }}
            />
          </Box>
        </Box>

        {/* --- Título da Marca Premium com Gradiente --- */}
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

          {/* Badge de Status / Mensagens Rotativas */}
          <Box
            sx={{
              mt: 1.2,
              px: 2.2,
              py: 0.75,
              borderRadius: '999px',
              bgcolor: 'rgba(255, 255, 255, 0.06)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(45, 212, 191, 0.22)',
              boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 1.2,
              minHeight: 34,
            }}
          >
            {/* Indicador Neon Pulsante */}
            <Box
              sx={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                bgcolor: '#2dd4bf',
                boxShadow: '0 0 10px #2dd4bf',
                animation: 'bootDotPulse 1.4s ease-in-out infinite',
              }}
            />
            <Typography
              key={msgKey}
              sx={{
                fontSize: 13.5,
                fontWeight: 600,
                color: 'rgba(240, 253, 250, 0.92)',
                letterSpacing: '-0.01em',
                animation: 'bootTextFade 0.35s ease-out forwards',
              }}
            >
              {currentSub}
            </Typography>
          </Box>
        </Box>

        {/* --- Monitor de ECG Neon em Tempo Real --- */}
        <Box sx={{ position: 'relative', width: 220, height: 32, mt: 1 }}>
          <svg viewBox="0 0 220 32" fill="none" style={{ width: '100%', height: '100%' }}>
            {/* Linha de fundo semi-transparente */}
            <path
              d="M0 16 H60 L68 6 L76 26 L84 16 H130 L138 9 L146 23 L154 16 H220"
              stroke="rgba(45, 212, 191, 0.2)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Traçado Neon Dinâmico com Rastro */}
            <path
              d="M0 16 H60 L68 6 L76 26 L84 16 H130 L138 9 L146 23 L154 16 H220"
              stroke="#2dd4bf"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                strokeDasharray: 280,
                filter: 'drop-shadow(0 0 6px #2dd4bf)',
                animation: 'bootBeatTrace 2.2s linear infinite',
              }}
            />
          </svg>
        </Box>

        {/* Esferas de carregamento de apoio */}
        <Box sx={{ display: 'flex', gap: 0.8, mt: 0.5 }}>
          {[0, 1, 2].map((i) => (
            <Box
              key={i}
              sx={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                bgcolor: '#2dd4bf',
                animation: `bootDotWave 1.2s ${i * 0.18}s ease-in-out infinite`,
              }}
            />
          ))}
        </Box>
      </Box>

      {/* --- Animações Keyframes CSS de Altíssima Desempenho (60 FPS) --- */}
      <style>{`
        @keyframes bootFloat {
          0%, 100% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-7px) scale(1.02); }
        }
        @keyframes bootPulseAura {
          0% { transform: scale(0.95); opacity: 0.6; }
          100% { transform: scale(1.15); opacity: 0.95; }
        }
        @keyframes bootSonar {
          0% { transform: scale(1); opacity: 0.7; }
          100% { transform: scale(1.75); opacity: 0; }
        }
        @keyframes bootShimmer {
          0% { transform: translateX(-110%); }
          30%, 100% { transform: translateX(110%); }
        }
        @keyframes bootDotPulse {
          0%, 100% { opacity: 0.4; transform: scale(0.85); }
          50% { opacity: 1; transform: scale(1.25); }
        }
        @keyframes bootTextFade {
          0% { opacity: 0; transform: translateY(4px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes bootBeatTrace {
          0% { stroke-dashoffset: 280; }
          50% { stroke-dashoffset: 0; }
          100% { stroke-dashoffset: -280; }
        }
        @keyframes bootDotWave {
          0%, 80%, 100% { opacity: 0.25; transform: scale(0.7); }
          40% { opacity: 1; transform: scale(1.2); }
        }
        @keyframes meshBlob1 {
          0% { transform: translate(0, 0) scale(1); }
          100% { transform: translate(-30px, 40px) scale(1.15); }
        }
        @keyframes meshBlob2 {
          0% { transform: translate(0, 0) scale(1); }
          100% { transform: translate(40px, -30px) scale(1.1); }
        }
        @keyframes bootExit {
          0% { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(1.07); visibility: hidden; }
        }
      `}</style>
    </Box>
  );
};
