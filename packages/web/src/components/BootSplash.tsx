import { useState, useEffect } from 'react';
import { Box, Typography } from '@mui/material';
import { DrExame } from './DrExame';

/** Cicla mensagens a cada `interval` ms (micro-interação: reduz a sensação de espera). */
function useRotatingText(msgs: string[], interval = 2000): string {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (msgs.length <= 1) return;
    const t = setInterval(() => setI((p) => (p + 1) % msgs.length), interval);
    return () => clearInterval(t);
  }, [msgs.length, interval]);
  return msgs[i] ?? '';
}

/**
 * Tela premium de carregamento.
 *  - Fundo: gradiente RADIAL escuro ("palco") com glow teal atrás do robô — sem cor chapada.
 *  - Robô: círculo perfeito com borda brilhante + glow (não parece "foto 3x4").
 *  - Mensagens ROTATIVAS (se `messages` passado) — dá contexto do que tá acontecendo.
 */
export const BootSplash = ({
  title = 'Meus Exames',
  subtitle,
  messages,
}: {
  title?: string;
  subtitle?: string;
  messages?: string[];
}) => {
  const rotating = useRotatingText(messages && messages.length > 1 ? messages : []);
  const sub = messages && messages.length ? rotating : subtitle ?? 'Seu assistente de saúde com IA';
  return (
    <Box sx={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1.5,
      background: 'radial-gradient(circle at 50% 38%, #114843 0%, #0a2521 55%, #061614 100%)', color: '#fff',
    }}>
      <Box sx={{ position: 'relative', animation: 'bootBreathe 2.2s ease-in-out infinite' }}>
        <Box sx={{ position: 'absolute', inset: -24, borderRadius: '50%', background: 'radial-gradient(circle, rgba(32,178,170,.5), transparent 70%)', filter: 'blur(10px)' }} />
        <DrExame size={108} sx={{ borderRadius: '50%', border: '3px solid rgba(255,255,255,.22)', boxShadow: '0 0 34px rgba(32,178,170,.55)' }} />
      </Box>
      <Typography variant="h4" sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif', letterSpacing: '-0.02em', mt: 1.5 }}>{title}</Typography>
      <Typography sx={{ opacity: 0.85, fontSize: 15, minHeight: 22, transition: 'opacity .3s' }}>{sub}</Typography>
      <Box sx={{ width: 200, height: 26, mt: 1, opacity: 0.9, '& path': { strokeDasharray: 260, animation: 'bootBeat 2.4s linear infinite' } }}>
        <svg viewBox="0 0 200 26" fill="none" preserveAspectRatio="none">
          <path d="M0 13 H46 L54 4 L64 22 L74 13 H118 L128 7 L138 19 L148 13 H200" stroke="#5fc9c3" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Box>
      <Box sx={{ display: 'flex', gap: 0.6, mt: 1.5 }}>
        {[0, 1, 2].map((i) => (
          <Box key={i} sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#5fc9c3', animation: `bootDot 1.2s ${i * 0.15}s ease-in-out infinite` }} />
        ))}
      </Box>
      <style>{`
        @keyframes bootBreathe{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-8px) scale(1.05)}}
        @keyframes bootDot{0%,80%,100%{opacity:.3;transform:scale(.7)}40%{opacity:1;transform:scale(1.15)}}
        @keyframes bootBeat{0%{stroke-dashoffset:260}45%{stroke-dashoffset:0}55%{stroke-dashoffset:0}100%{stroke-dashoffset:-260}}
      `}</style>
    </Box>
  );
};
