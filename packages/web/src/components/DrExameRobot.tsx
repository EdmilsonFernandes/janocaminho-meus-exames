import { Box } from '@mui/material';

/**
 * Mascote Dr. Exame em SVG VIVO (26/10 — premium: olhos piscam, antena com lag).
 * Uso em CENAS ANIMADAS (BootSplash, AnalysisScan). Para usos estáticos segue o
 * PNG oficial via <DrExame /> (app-icon.png — identidade inegociável).
 *
 * Por que SVG aqui (e não o PNG):
 * - "Robô vivo" pede olhos piscando em CSS — impossível sobre bitmap.
 * - Fix 29/09 (herdado): <img> PNG não-decodificada pinta PRETO/estirada nos
 *   primeiros frames do WebView Android; SVG renderiza instantâneo, sem decode.
 * - Identidade preservada: teal #20b2aa/#178f89 + cobre #d4a574 + escudo + ✨
 *   (mesma linguagem do RobotAnalysis, já aceita como mascote no app).
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
      <linearGradient id="drRoboShade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#ffffff" stopOpacity="0.16" />
        <stop offset="100%" stopColor="#04201d" stopOpacity="0.2" />
      </linearGradient>
    </defs>

    {/* Antena cobre (identidade) — bob com lag defasado */}
    <g
      className="dr-robo-ant"
      style={{ transformBox: 'fill-box', transformOrigin: '50% 100%', animation: 'drRoboAnt 3.2s ease-in-out -0.4s infinite' }}
    >
      <line x1="48" y1="9" x2="48" y2="17.5" stroke="#178f89" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="48" cy="7" r="3.6" fill="#d4a574" />
    </g>

    {/* Cabeça */}
    <rect x="20" y="17" width="56" height="42" rx="15" fill="#20b2aa" />
    <rect x="20" y="17" width="56" height="42" rx="15" fill="url(#drRoboShade)" />
    <rect x="27" y="26" width="42" height="24" rx="11" fill="#eafffb" />

    {/* Olhos piscando (vida) */}
    <g
      className="dr-robo-eyes"
      style={{ transformBox: 'fill-box', transformOrigin: 'center', animation: 'drRoboBlink 4.4s ease-in-out infinite' }}
    >
      <circle cx="40" cy="38" r="4.4" fill="#0f4f4a" />
      <circle cx="56" cy="38" r="4.4" fill="#0f4f4a" />
      <circle cx="41.6" cy="36.4" r="1.3" fill="#ffffff" opacity="0.85" />
      <circle cx="57.6" cy="36.4" r="1.3" fill="#ffffff" opacity="0.85" />
    </g>
    {/* Sorriso sutil */}
    <path d="M43 45.5 Q48 49 53 45.5" stroke="#0f4f4a" strokeWidth="1.8" strokeLinecap="round" fill="none" opacity="0.55" />

    {/* Corpo + escudo + estrelinha (identidade: robô+escudo, ✨ IA) */}
    <rect x="26" y="62" width="44" height="26" rx="10" fill="#178f89" />
    <rect x="26" y="62" width="44" height="26" rx="10" fill="url(#drRoboShade)" />
    <path
      d="M48 66 l7.5 3 v6.2 c0 4.6 -3.2 7.6 -7.5 9.3 c-4.3 -1.7 -7.5 -4.7 -7.5 -9.3 V69 Z"
      fill="#eafffb"
      opacity="0.94"
    />
    <text x="48" y="81.5" textAnchor="middle" fontSize="9" fill="#178f89">✨</text>
  </Box>
);
