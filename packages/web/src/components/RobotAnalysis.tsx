/**
 * RobotAnalysis — "Dr. Exame analisando" (28/09, pedido do dono: animação premium
 * de desenhista nos momentos de geração — resumo, relatório completo, extração).
 *
 * Cena (identidade da marca: robô mascote + teal #20b2aa + cobre #d4a574):
 * o robô caminha por uma esteira de cartões de exame enquanto a lupa escaneia;
 * cada cartão "confere" (✓ pop teal) conforme passa. Partículas sutis sobem.
 * Loop ~2,6s, tudo CSS/SVG inline (zero lib). prefers-reduced-motion: cena
 * congelada com os cartões já conferidos (a informação "está trabalhando"
 * continua — só o movimento sai, WCAG 2.3.3).
 */
import { Box } from '@mui/material';

const NO_MOTION = { '@media (prefers-reduced-motion: reduce)': { animation: 'none !important' } } as const;

const kWalk = 'dxWalk';   // robô avança 1 passo (bounce + deslocamento)
const kScan = 'dxScan';   // cone da lupa varre o cartão
const kCheck = 'dxCheck'; // ✓ do cartão confere
const kFloat = 'dxFloat'; // cartões fluem pra esquerda (esteira)
const kSpark = 'dxSpark'; // partícula sobe e some

/**
 * @param label texto sob a cena (ex.: "Gerando seu relatório completo…")
 */
export const RobotAnalysis = ({ label }: { label?: string }) => (
  <Box
    role="status"
    aria-live="polite"
    aria-label={label || 'Analisando'}
    sx={{ width: '100%', maxWidth: 320, mx: 'auto', textAlign: 'center' }}
  >
    <Box
      component="svg"
      viewBox="0 0 320 132"
      sx={{ width: '100%', display: 'block' }}
    >
      <defs>
        <linearGradient id="dxScanGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#20b2aa" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#20b2aa" stopOpacity="0.02" />
        </linearGradient>
        <style>{`
          @keyframes ${kWalk} { 0%,100% { transform: translateX(0) translateY(0); } 45% { transform: translateX(3px) translateY(-3px); } 60% { transform: translateX(4px) translateY(0); } }
          @keyframes ${kScan} { 0% { transform: translateX(-14px); opacity:0; } 20% { opacity:1; } 80% { opacity:1; } 100% { transform: translateX(14px); opacity:0; } }
          @keyframes ${kCheck} { 0%,15% { transform: scale(0); opacity:0; } 30% { transform: scale(1.35); opacity:1; } 45%,100% { transform: scale(1); opacity:1; } }
          @keyframes ${kFloat} { from { transform: translateX(0); } to { transform: translateX(-64px); } }
          @keyframes ${kSpark} { 0% { transform: translateY(0); opacity:0; } 25% { opacity:.8; } 100% { transform: translateY(-16px); opacity:0; } }
          .dx-walk { animation: ${kWalk} 1.3s ease-in-out infinite; transform-origin: 50% 100%; }
          .dx-scan { animation: ${kScan} 1.3s ease-in-out infinite; }
          .dx-check { animation: ${kCheck} 1.3s ease-in-out infinite; }
          .dx-belt { animation: ${kFloat} 1.3s linear infinite; }
          .dx-spark { animation: ${kSpark} 1.3s ease-out infinite; }
          @media (prefers-reduced-motion: reduce) {
            .dx-walk, .dx-scan, .dx-check, .dx-belt, .dx-spark { animation: none !important; }
            .dx-check { opacity: 1; transform: none; }
            .dx-scan { opacity: 0; }
          }
        `}</style>
      </defs>

      {/* partículas sobindo ao redor do robô */}
      {[[86, 52], [104, 44], [122, 56]].map(([x, y], i) => (
        <circle key={i} className="dx-spark" cx={x} cy={y} r={1.8} fill="#20b2aa" style={{ animationDelay: `${i * 0.4}s` }} />
      ))}

      {/* ── ROBÔ (silhueta da marca: cabeça arredondada + antena + corpo) ── */}
      <g className="dx-walk">
        {/* antena + bolinha cobre */}
        <line x1="96" y1="30" x2="96" y2="38" stroke="#178f89" strokeWidth="2" strokeLinecap="round" />
        <circle cx="96" cy="28" r="3" fill="#d4a574" />
        {/* cabeça */}
        <rect x="78" y="38" width="36" height="26" rx="10" fill="#20b2aa" />
        {/* visor/olhos */}
        <rect x="84" y="46" width="24" height="9" rx="4.5" fill="#eafffb" />
        <circle cx="91" cy="50.5" r="2.2" fill="#0f766e" />
        <circle cx="100" cy="50.5" r="2.2" fill="#0f766e" />
        {/* corpo */}
        <rect x="82" y="66" width="28" height="20" rx="8" fill="#178f89" />
        {/* estrelinha da IA (identidade) */}
        <text x="96" y="80" textAnchor="middle" fontSize="9" fill="#eafffb">✨</text>
        {/* pernas (passinho) */}
        <rect x="86" y="87" width="6" height="12" rx="3" fill="#0f766e" />
        <rect x="99" y="87" width="6" height="12" rx="3" fill="#0f766e" />
      </g>

      {/* ── LUPA + CONE DE ESCANEAMENTO ── */}
      <g className="dx-walk" style={{ animationDelay: '0.06s' }}>
        <circle cx="122" cy="70" r="8" fill="none" stroke="#0f766e" strokeWidth="3" />
        <line x1="127.5" y1="75.5" x2="133" y2="81" stroke="#0f766e" strokeWidth="3.5" strokeLinecap="round" />
      </g>
      <polygon className="dx-scan" points="114,64 130,64 138,96 106,96" fill="url(#dxScanGrad)" />

      {/* ── ESTEIRA DE CARTÕES DE EXAME (fluem pra esquerda, conferindo ✓) ── */}
      <g className="dx-belt">
        {[0, 1, 2].map((i) => (
          <g key={i} transform={`translate(${168 + i * 64} 58)`}>
            <rect width="52" height="34" rx="8" fill="#ffffff" stroke="#d8ece9" strokeWidth="1.5" />
            <rect x="7" y="9" width="30" height="4" rx="2" fill="#cbcbcb" />
            <rect x="7" y="17" width="22" height="4" rx="2" fill="#e3e3e3" />
            <rect x="7" y="25" width="26" height="3" rx="1.5" fill="#efefef" />
            {/* ✓ confere — delay acompanha a posição na esteira */}
            <circle className="dx-check" style={{ animationDelay: `${0.12 + i * 0.28}s` }} cx="41" cy="9" r="7" fill="#20b2aa" />
            <path className="dx-check" style={{ animationDelay: `${0.12 + i * 0.28}s` }} d="M37.5 9 l2.6 2.8 l4.6 -5.4" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        ))}
        {/* reposição: cartão entrando pela direita (já conferido, some sob o robô) */}
        <g transform="translate(360 58)">
          <rect width="52" height="34" rx="8" fill="#ffffff" stroke="#d8ece9" strokeWidth="1.5" />
          <rect x="7" y="9" width="30" height="4" rx="2" fill="#cbcbcb" />
          <rect x="7" y="17" width="22" height="4" rx="2" fill="#e3e3e3" />
        </g>
      </g>

      {/* linha do chão */}
      <line x1="24" y1="102" x2="296" y2="102" stroke="#d8ece9" strokeWidth="2" strokeLinecap="round" strokeDasharray="1 7" />
    </Box>

    {label && (
      <Box sx={{ mt: 1, fontSize: 13, fontWeight: 700, color: (t) => (t.palette.mode === 'dark' ? '#5fc9c3' : '#0f766e'), fontFamily: '"Poppins",sans-serif' }}>
        {label}
      </Box>
    )}
    <Box aria-hidden sx={{ ...NO_MOTION }} />
  </Box>
);
