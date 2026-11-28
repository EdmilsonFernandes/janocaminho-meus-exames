import { useEffect, useState } from 'react';
import { Box } from '@mui/material';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import { DrExame } from './DrExame';

/**
 * ROBÔ VIVO DA BARRA (28/11/26, pedido do dono: "ele é a IA que fala sobre seus exames — poderia
 * ficar ali com algum efeito").
 *
 * Camadas, de trás para a frente (só transform/opacity — compositor da GPU, quase zero bateria):
 *   1. AURA: anel em gradiente cônico teal → menta → cobre girando devagar atrás do robô. É a
 *      "assinatura de IA" (família Gemini/Siri) nas cores da marca — teal + o cobre premium.
 *   2. HALO: duas ondas teal saem do robô e se desfazem, depois ~9s de descanso (presença sem
 *      piscar o tempo todo — ciclo de 12s).
 *   3. ROBÔ: flutua 2px para cima e para baixo (respiração, 4,8s).
 *   4. ESTRELINHA ✨: selo branco sobre teal no canto (DS: símbolo universal de IA, sempre
 *      visível) que cintila de vez em quando.
 *   5. OI: ao abrir o app, uma vez por sessão, o robô dá um pulinho e a estrelinha brilha.
 * Na tela do chat ("on") ele para de flutuar e fica aceso — você já está falando com ele.
 * prefers-reduced-motion: tudo parado (o robô e a estrelinha continuam lá, sem movimento).
 */
const HELLO_KEY = 'dx_robot_hello';
const EASE = 'cubic-bezier(.16,1,.3,1)';

export const RobotOrb = ({ on, dark }: { on: boolean; dark: boolean }) => {
  const [hello, setHello] = useState(false);
  useEffect(() => {
    try {
      if (sessionStorage.getItem(HELLO_KEY)) return;
      sessionStorage.setItem(HELLO_KEY, '1');
    } catch { /* sem storage: sem pulinho */ }
    const t0 = window.setTimeout(() => setHello(true), 900); // depois do Início pintar
    const t1 = window.setTimeout(() => setHello(false), 2600);
    return () => { window.clearTimeout(t0); window.clearTimeout(t1); };
  }, []);

  const ring = dark ? 'rgba(20,30,30,0.95)' : '#ffffff';
  return (
    <Box aria-hidden sx={{
      position: 'relative', width: 52, height: 52,
      transform: on ? 'translateY(-12px) scale(1.06)' : 'translateY(-9px)',
      transition: `transform .3s ${EASE}`,
      '@keyframes dxOrbSpin': { to: { transform: 'rotate(360deg)' } },
      '@keyframes dxOrbHalo': {
        '0%': { transform: 'scale(.92)', opacity: 0 },
        '3%': { opacity: 0.55 },
        '16%': { transform: 'scale(1.55)', opacity: 0 },
        '100%': { transform: 'scale(1.55)', opacity: 0 },
      },
      '@keyframes dxOrbFloat': {
        '0%, 100%': { transform: 'translateY(0)' },
        '50%': { transform: 'translateY(-2px)' },
      },
      '@keyframes dxOrbTwinkle': {
        '0%, 82%, 100%': { transform: 'scale(1) rotate(0deg)' },
        '88%': { transform: 'scale(1.35) rotate(18deg)' },
        '94%': { transform: 'scale(.9) rotate(-6deg)' },
      },
      '@keyframes dxOrbHello': {
        '0%': { transform: 'translateY(0) scale(1)' },
        '30%': { transform: 'translateY(-7px) scale(1.08)' },
        '55%': { transform: 'translateY(0) scale(.96)' },
        '75%': { transform: 'translateY(-2px) scale(1.02)' },
        '100%': { transform: 'translateY(0) scale(1)' },
      },
      '@keyframes dxOrbGlow': {
        '0%, 100%': { opacity: 0.55, transform: 'rotate(0deg) scale(1)' },
        '50%': { opacity: 0.9, transform: 'rotate(180deg) scale(1.12)' },
        '100%': { transform: 'rotate(360deg) scale(1)' },
      },
      '@keyframes dxOrbShine': {
        '0%, 70%': { transform: 'translateX(-130%) rotate(25deg)', opacity: 0 },
        '72%': { opacity: 1 },
        '86%': { transform: 'translateX(130%) rotate(25deg)', opacity: 1 },
        '87%, 100%': { transform: 'translateX(130%) rotate(25deg)', opacity: 0 },
      },
      '@keyframes dxOrbBurst': {
        '0%': { transform: 'scale(.6)', opacity: 0 },
        '30%': { opacity: 1 },
        '100%': { transform: 'scale(2.1)', opacity: 0 },
      },
      '@media (prefers-reduced-motion: reduce)': {
        '& *, & *::before, & *::after': { animation: 'none !important' },
      },
    }}>
      {/* 0. BRILHO GEMINI — cópia borrada do gradiente que vaza luz em volta e "respira" */}
      <Box sx={{
        position: 'absolute', inset: -9, borderRadius: '50%',
        background: 'conic-gradient(from 90deg, #20b2aa, #7fe3d8, #d4a574, #5fc9c3, #20b2aa)',
        filter: 'blur(11px)', opacity: on ? 1 : 0.8,
        animation: `dxOrbGlow ${on ? 4 : 9}s ease-in-out infinite`,
      }} />
      {/* 2. halo — duas ondas defasadas */}
      {[0, 0.55].map((d) => (
        <Box key={d} sx={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          border: '2px solid rgba(32,178,170,.6)',
          opacity: 0,
          animation: on ? 'none' : `dxOrbHalo 12s ${EASE} ${2 + d}s infinite`,
        }} />
      ))}
      {/* 1. aura girando */}
      <Box sx={{
        position: 'absolute', inset: -4, borderRadius: '50%',
        background: 'conic-gradient(from 0deg, #20b2aa, #8ff0e4, #e8b887, #20b2aa 55%, #5fc9c3 80%, #20b2aa)',
        filter: on ? 'saturate(1.25) brightness(1.05)' : 'none',
        boxShadow: on ? '0 0 22px rgba(32,178,170,.65)' : '0 8px 22px rgba(32,178,170,.42), 0 2px 6px rgba(32,178,170,.25)',
        animation: `dxOrbSpin ${on ? 3.2 : 7}s linear infinite`,
        transition: `box-shadow .3s ${EASE}`,
      }} />
      {/* 3. robô (com o pulinho de "oi") */}
      <Box sx={{
        position: 'absolute', inset: 0, borderRadius: '50%',
        animation: hello ? `dxOrbHello 1.1s ${EASE} both` : on ? 'none' : 'dxOrbFloat 4.8s ease-in-out infinite',
      }}>
        <Box sx={{
          position: 'relative', width: '100%', height: '100%', borderRadius: '50%', display: 'grid', placeItems: 'center',
          background: 'linear-gradient(135deg, #20b2aa, #178f89)',
          border: '2px solid', borderColor: dark ? 'rgba(20,30,30,0.6)' : 'rgba(255,255,255,0.85)',
        }}>
          <DrExame size={36} sx={{ borderRadius: '50%' }} />
          {/* reflexo: um feixe de luz cruza o robô de tempos em tempos */}
          <Box sx={{ position: 'absolute', inset: 2.5, borderRadius: '50%', overflow: 'hidden', pointerEvents: 'none' }}>
            <Box sx={{
              position: 'absolute', top: '-20%', bottom: '-20%', left: '30%', width: '38%',
              background: 'linear-gradient(90deg, transparent, rgba(255,255,255,.55), transparent)',
              opacity: 0, animation: `dxOrbShine 8s ${EASE} 3s infinite`,
            }} />
          </Box>
        </Box>
        {/* 4. estrelinha ✨ da IA */}
        <Box sx={{
          position: 'absolute', top: -3, right: -4, width: 20, height: 20, borderRadius: '50%',
          display: 'grid', placeItems: 'center', color: '#fff',
          background: 'linear-gradient(135deg, #2bc4bb, #128a84)',
          border: '2px solid', borderColor: ring,
          boxShadow: '0 2px 6px rgba(15,110,104,.4)',
          animation: hello ? 'none' : `dxOrbTwinkle 6.5s ${EASE} 1.5s infinite`,
          '& svg': { fontSize: 12 },
        }}>
          <AutoAwesomeRoundedIcon />
        </Box>
        {/* 5. brilho do "oi" */}
        {hello && (
          <Box sx={{
            position: 'absolute', top: -3, right: -4, width: 20, height: 20, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(212,165,116,.9), rgba(32,178,170,0) 70%)',
            animation: `dxOrbBurst .9s ${EASE} .25s both`, pointerEvents: 'none',
          }} />
        )}
      </Box>
    </Box>
  );
};
