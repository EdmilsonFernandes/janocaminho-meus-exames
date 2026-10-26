import { Box } from '@mui/material';

/**
 * Mascote Dr. Exame em SVG VIVO — agora FIEL ao app-icon.png (26/10, v2).
 * Uso em CENAS ANIMADAS (BootSplash, AnalysisScan). Para usos estáticos segue o
 * PNG oficial via <DrExame /> (app-icon.png — identidade inegociável).
 *
 * Anatomia extraída por mapa de pixels 64×64 do app-icon.png (sharp):
 * - Cabeça/corpo MENTA-CLARO (#90e4cd→#7fd8be) — robô claro, NÃO teal com placa branca.
 * - Testa: faixa COBRE (#e5ae61→#c08349) — assinatura premium do ícone.
 * - Rosto: VISOR ESCURO petróleo (#16303a) com olhos MENTA brilhando + boca clara.
 * - Antena: bobina menta com miolo cobre (no ícone: círculo c/ centro cobre).
 * - Corpo menta com faixa cobre no peito + escudo escuro c/ ✨ (IA) + braços cobre
 *   + pés menta-escura. Strokes #178f89 seguram o robô claro em fundo claro.
 *
 * Por que SVG aqui (e não o PNG):
 * - "Robô vivo" pede olhos piscando em CSS — impossível sobre bitmap.
 * - Fix 29/09 (herdado): <img> PNG não-decodificada pinta PRETO/estirada nos
 *   primeiros frames do WebView Android; SVG renderiza instantâneo, sem decode.
 *
 * Perf: só transform/opacity (compositor), transform-box: fill-box por parte.
 * prefers-reduced-motion: blink e antena param (regra no <style>).
 */
export const DrExameRobot = ({ size = 104, sx }: { size?: number; sx?: any }) => (
  <Box
    component="svg"
    className="dr-robo-svg"
    viewBox="0 0 96 96"
    role="img"
    aria-label="Dr. Exame"
    sx={{ width: size, height: size, display: 'block', mx: 'auto', ...sx }}
  >
    <style>{`
      @keyframes drRoboAnt { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-1.8px); } }
      @keyframes drRoboBlink { 0%, 93%, 100% { transform: scaleY(1); } 96.5% { transform: scaleY(0.08); } }
      @media (prefers-reduced-motion: reduce) {
        .dr-robo-svg .dr-robo-ant, .dr-robo-svg .dr-robo-eyes { animation: none !important; }
      }
    `}</style>
    <defs>
      <linearGradient id="drRoboMint" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#b2f0dc" />
        <stop offset="100%" stopColor="#7fd8be" />
      </linearGradient>
      <linearGradient id="drRoboCopper" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#e5ae61" />
        <stop offset="100%" stopColor="#c08349" />
      </linearGradient>
      <linearGradient id="drRoboShade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#ffffff" stopOpacity="0.14" />
        <stop offset="100%" stopColor="#04201d" stopOpacity="0.18" />
      </linearGradient>
    </defs>

    {/* Antena — bobina menta com miolo COBRE (mapa ícone: círculo c/ centro cobre) */}
    <g
      className="dr-robo-ant"
      style={{ transformBox: 'fill-box', transformOrigin: '50% 100%', animation: 'drRoboAnt 3.2s ease-in-out -0.4s infinite' }}
    >
      <line x1="48" y1="11" x2="48" y2="17" stroke="#1d544f" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="48" cy="8.6" r="4.6" fill="url(#drRoboMint)" stroke="#178f89" strokeWidth="0.7" />
      <circle cx="48" cy="8.6" r="2" fill="url(#drRoboCopper)" />
    </g>

    {/* Cabeça MENTA (robô claro — fundo do ícone é quem é teal) */}
    <rect x="24" y="16" width="48" height="27" rx="13" fill="url(#drRoboMint)" stroke="#178f89" strokeWidth="0.8" strokeOpacity="0.55" />
    <rect x="24" y="16" width="48" height="27" rx="13" fill="url(#drRoboShade)" />
    {/* Testa cobre — faixa horizontal da assinatura */}
    <rect x="29.5" y="19.5" width="37" height="6.6" rx="3.3" fill="url(#drRoboCopper)" stroke="#946c3a" strokeWidth="0.5" strokeOpacity="0.6" />

    {/* Visor escuro petróleo (rosto do ícone: vidro escuro) */}
    <rect x="29" y="28.6" width="38" height="12.8" rx="6.4" fill="#16303a" stroke="#0d2432" strokeWidth="0.8" />
    <rect x="32" y="30" width="32" height="1.6" rx="0.8" fill="#ffffff" opacity="0.08" />

    {/* Olhos MENTA brilhando no visor (vida) */}
    <g
      className="dr-robo-eyes"
      style={{ transformBox: 'fill-box', transformOrigin: 'center', animation: 'drRoboBlink 4.4s ease-in-out infinite' }}
    >
      <circle cx="38.8" cy="33.6" r="5.6" fill="#90e4cd" opacity="0.22" />
      <circle cx="57.2" cy="33.6" r="5.6" fill="#90e4cd" opacity="0.22" />
      <circle cx="38.8" cy="33.6" r="3.7" fill="#b9f2e0" />
      <circle cx="57.2" cy="33.6" r="3.7" fill="#b9f2e0" />
      <circle cx="40.2" cy="32.3" r="1.1" fill="#ffffff" opacity="0.9" />
      <circle cx="58.6" cy="32.3" r="1.1" fill="#ffffff" opacity="0.9" />
    </g>
    {/* Sorriso claro dentro do visor */}
    <path d="M43.4 38.7 Q48 41 52.6 38.7" stroke="#b9f2e0" strokeWidth="1.6" strokeLinecap="round" fill="none" opacity="0.9" />

    {/* Braços cobre (mapa ícone: laterais cobre do corpo) */}
    <rect x="21.5" y="49" width="7" height="18" rx="3.5" fill="url(#drRoboCopper)" stroke="#946c3a" strokeWidth="0.5" strokeOpacity="0.6" />
    <rect x="67.5" y="49" width="7" height="18" rx="3.5" fill="url(#drRoboCopper)" stroke="#946c3a" strokeWidth="0.5" strokeOpacity="0.6" />

    {/* Corpo MENTA + faixa cobre no peito + escudo escudo c/ ✨ (IA) */}
    <rect x="31" y="43.5" width="34" height="34" rx="11" fill="url(#drRoboMint)" stroke="#178f89" strokeWidth="0.8" strokeOpacity="0.55" />
    <rect x="31" y="43.5" width="34" height="34" rx="11" fill="url(#drRoboShade)" />
    <rect x="36.5" y="47.5" width="23" height="5.2" rx="2.6" fill="url(#drRoboCopper)" stroke="#946c3a" strokeWidth="0.5" strokeOpacity="0.6" />
    <path
      d="M48 55.5 l8.2 3.4 v6.2 c0 5 -3.5 8.2 -8.2 10 c-4.7 -1.8 -8.2 -5 -8.2 -10 v-6.2 Z"
      fill="#16303a"
      stroke="#ca8f46"
      strokeWidth="1"
    />
    <text x="48" y="72" textAnchor="middle" fontSize="8" fill="#eafffb">✨</text>

    {/* Pés menta-escura */}
    <rect x="35" y="79.5" width="10.5" height="6" rx="3" fill="#6fcdb3" stroke="#178f89" strokeWidth="0.6" strokeOpacity="0.7" />
    <rect x="50.5" y="79.5" width="10.5" height="6" rx="3" fill="#6fcdb3" stroke="#178f89" strokeWidth="0.6" strokeOpacity="0.7" />
  </Box>
);
