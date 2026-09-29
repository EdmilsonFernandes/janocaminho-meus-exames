/**
 * RobotAnalysis v2 — "Dr. Exame analisando" (28/09 noite: rework com os princípios
 * das skills de animação — web-animation-skills + character-animation-creator).
 *
 * Técnicas aplicadas (v1 → v2):
 * - Walk cycle 4 fases (contato 0% → rebaixamento 12,5% → passagem 25% → elevação 37,5%,
 *   espelhado até 100%): pernas giram NO QUADRIL ±22° ease-in-out (não somem/aparecem).
 * - Squash & stretch no corpo no rebaixamento (scaleY .94 × scaleX 1.03 — volume
 *   preservado); head-bob 2× por ciclo defasado do pé.
 * - Overlap/secundária: antena + bolinha cobre com LAG (delay negativo -0.12s) e
 *   rotação oposta ±4°; estrelinha com fase própria.
 * - Anticipation da lupa: recua/sobe ANTES de descer o scan (attack: anticipation →
 *   contact → recovery).
 * - ✓ confere por STROKE DRAW-ON (pathLength=1, dashoffset, ease-out) + overshoot
 *   cubic-bezier(.34,1.56,.64,1) — não fade.
 * - Loop invisível: TUDO comensurável a 1.3s; stagger SÓ com delays negativos.
 * - Easing intencional: linear SÓ na esteira/partículas (deslocamento contínuo).
 * - transform-box: fill-box + transform-origin em CADA parte animada (senão gira
 *   em volta da origem do viewBox).
 * - prefers-reduced-motion em TIERS: deslocamentos saem (esteira/pernas/scan), mas
 *   fica um micro-fade (opacity) do ✓ — loading essencial não congela seco, e nada
 *   de animation:none quebrando estados (usa duração ~0 com iteration 1).
 * - Compositor-only: só transform/opacity (60fps); will-change apenas no robô e trilho.
 */
import { Box } from '@mui/material';

const T = '1.3s'; // duração-mestra do ciclo (tudo é múltiplo/divisor dela)

export const RobotAnalysis = ({ label }: { label?: string }) => (
  <Box role="status" aria-live="polite" aria-label={label || 'Analisando'} sx={{ width: '100%', maxWidth: 320, mx: 'auto', textAlign: 'center' }}>
    <Box component="svg" viewBox="0 0 320 132" sx={{ width: '100%', display: 'block' }}>
      <defs>
        <linearGradient id="dxScanGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#20b2aa" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#20b2aa" stopOpacity="0.02" />
        </linearGradient>
        <style>{`
          /* ── walk cycle 4 fases (espelhado): corpo com bob+squash, pernas no quadril ── */
          @keyframes dxBody {
            0%   { transform: translateY(0) scale(1,1); }
            12.5% { transform: translateY(2%) scale(1.03,0.94); } /* rebaixamento: peso aceito */
            25%  { transform: translateY(-1.5%) scale(1,1.02); }  /* passagem: sobe */
            37.5% { transform: translateY(-2%) scale(1,1); }      /* elevação: impulso */
            50%  { transform: translateY(0) scale(1,1); }
            62.5% { transform: translateY(2%) scale(1.03,0.94); }
            75%  { transform: translateY(-1.5%) scale(1,1.02); }
            87.5% { transform: translateY(-2%) scale(1,1); }
            100% { transform: translateY(0) scale(1,1); }
          }
          @keyframes dxLegL { /* perna esquerda gira no quadril — contato/passa/eleva */
            0%   { transform: rotate(22deg); }
            25%  { transform: rotate(2deg) scaleY(0.92); }
            37.5% { transform: rotate(-22deg); }
            50%  { transform: rotate(-22deg); }
            75%  { transform: rotate(-2deg); }
            87.5% { transform: rotate(22deg); }
            100% { transform: rotate(22deg); }
          }
          @keyframes dxLegR { /* espelho da esquerda (meio ciclo de defasagem) */
            0%   { transform: rotate(-22deg); }
            25%  { transform: rotate(-2deg); }
            37.5% { transform: rotate(22deg); }
            50%  { transform: rotate(22deg); }
            75%  { transform: rotate(2deg) scaleY(0.92); }
            87.5% { transform: rotate(-22deg); }
            100% { transform: rotate(-22deg); }
          }
          /* secundárias com LAG: antena acompanha o corpo atrasada e inclina ao contrário */
          @keyframes dxAntenna {
            0%   { transform: translateY(0) rotate(0deg); }
            12.5% { transform: translateY(2.4%) rotate(-4deg); }
            25%  { transform: translateY(-1.2%) rotate(3deg); }
            37.5% { transform: translateY(-1.6%) rotate(-2deg); }
            50%  { transform: translateY(0) rotate(0deg); }
            62.5% { transform: translateY(2.4%) rotate(4deg); }
            75%  { transform: translateY(-1.2%) rotate(-3deg); }
            87.5% { transform: translateY(-1.6%) rotate(2deg); }
            100% { transform: translateY(0) rotate(0deg); }
          }
          /* head-bob 2× por ciclo (uma por passo), defasado do corpo */
          @keyframes dxHead {
            0%,25%,50%,75%,100% { transform: translateY(0); }
            12.5%,62.5% { transform: translateY(1.8%); }
            37.5%,87.5% { transform: translateY(-1.4%); }
          }
          /* lupa: anticipation (recua/sobe) → contato (desce) → recovery */
          @keyframes dxMagnifier {
            0%   { transform: translate(0,0) rotate(0deg); }
            15%  { transform: translate(-2px,-6%) rotate(-8deg) scale(1.06); } /* anticipation */
            30%  { transform: translate(1px,2%) rotate(3deg); }                /* contato */
            55%  { transform: translate(0,0) rotate(0deg); }                   /* recovery */
            100% { transform: translate(0,0) rotate(0deg); }
          }
          /* cone de escaneamento: só aparece DEPOIS da anticipation da lupa */
          @keyframes dxScan {
            0%,18% { transform: translateX(-14px); opacity:0; }
            30% { opacity:1; }
            60% { transform: translateX(14px); opacity:0; }
            100% { transform: translateX(14px); opacity:0; }
          }
          /* ✓ DRAW-ON por stroke (pathLength=1) + overshoot no fim */
          @keyframes dxCheckDraw {
            0%,22% { stroke-dashoffset: 1; transform: scale(0); opacity: 0; }
            30% { transform: scale(1.15); opacity: 1; stroke-dashoffset: 0.55; }
            48% { stroke-dashoffset: 0; }
            60% { transform: scale(1); }
            100% { stroke-dashoffset: 0; transform: scale(1); opacity: 1; }
          }
          @keyframes dxCheckPop { /* círculo do ✓: pop com overshoot */
            0%,22% { transform: scale(0); opacity: 0; }
            32% { transform: scale(1.25); opacity: 1; }
            45% { transform: scale(0.95); }
            55%,100% { transform: scale(1); opacity: 1; }
          }
          @keyframes dxBelt { from { transform: translateX(0); } to { transform: translateX(-64px); } }
          @keyframes dxSpark { 0% { transform: translateY(0); opacity:0; } 25% { opacity:.8; } 100% { transform: translateY(-16px); opacity:0; } }

          .dx-part { transform-box: fill-box; }
          .dx-body  { animation: dxBody ${T} ease-in-out infinite; transform-origin: 50% 100%; will-change: transform; }
          .dx-leg   { animation: dxLegL ${T} ease-in-out infinite; transform-origin: 50% 0%; transform-box: fill-box; }
          .dx-leg-r { animation-name: dxLegR; }
          .dx-ant   { animation: dxAntenna ${T} ease-in-out infinite; animation-delay: -0.12s; transform-origin: 50% 100%; transform-box: fill-box; }
          .dx-head  { animation: dxHead ${T} ease-in-out infinite; transform-origin: 50% 100%; transform-box: fill-box; }
          .dx-mag   { animation: dxMagnifier ${T} ease-in-out infinite; transform-origin: 50% 50%; transform-box: fill-box; }
          .dx-scan  { animation: dxScan ${T} ease-in-out infinite; }
          .dx-check-draw { animation: dxCheckDraw ${T} cubic-bezier(.34,1.56,.64,1) infinite; transform-origin: 50% 50%; transform-box: fill-box; }
          .dx-check-pop  { animation: dxCheckPop  ${T} cubic-bezier(.34,1.56,.64,1) infinite; transform-origin: 50% 50%; transform-box: fill-box; }
          .dx-belt  { animation: dxBelt ${T} linear infinite; will-change: transform; }
          .dx-spark { animation: dxSpark ${T} ease-out infinite; transform-box: fill-box; }

          /* reduced-motion em TIERS (accessible-skill): deslocamento grande sai,
             micro-fade essencial fica (não congelar seco, não matar animationend). */
          @media (prefers-reduced-motion: reduce) {
            .dx-body, .dx-leg, .dx-ant, .dx-head, .dx-mag, .dx-scan, .dx-belt, .dx-spark {
              animation-duration: 0.01ms; animation-iteration-count: 1; /* estado final do loop */
            }
            /* ✓ continua: draw ~instantâneo + pop discreto em opacity (Tier 3: loading) */
            .dx-check-draw { animation-duration: 0.01ms; animation-iteration-count: 1; stroke-dashoffset: 0; transform: none; opacity: 1; }
            .dx-check-pop  { animation-duration: 0.01ms; animation-iteration-count: 1; transform: none; opacity: 1; }
          }
        `}</style>
      </defs>

      {/* partículas (stagger SÓ com delays negativos) */}
      {[[86, 50], [104, 42], [122, 54]].map(([x, y], i) => (
        <circle key={i} className="dx-spark" cx={x} cy={y} r={1.8} fill="#20b2aa" style={{ animationDelay: `${-0.325 * i}s` }} />
      ))}

      {/* ── ROBÔ ── */}
      <g className="dx-body" style={{ transformBox: 'fill-box' }}>
        {/* antena (secundária com lag) */}
        <g className="dx-ant">
          <line x1="96" y1="30" x2="96" y2="38" stroke="#178f89" strokeWidth="2" strokeLinecap="round" />
          <circle cx="96" cy="28" r="3" fill="#d4a574" />
        </g>
        {/* cabeça (bob 2×) */}
        <g className="dx-head">
          <rect x="78" y="38" width="36" height="26" rx="10" fill="#20b2aa" />
          <rect x="84" y="46" width="24" height="9" rx="4.5" fill="#eafffb" />
          <circle cx="91" cy="50.5" r="2.2" fill="#0f766e" />
          <circle cx="100" cy="50.5" r="2.2" fill="#0f766e" />
        </g>
        {/* corpo + estrelinha (identidade ✨) */}
        <rect x="82" y="66" width="28" height="20" rx="8" fill="#178f89" />
        <text x="96" y="80" textAnchor="middle" fontSize="9" fill="#eafffb">✨</text>
        {/* pernas giram no quadril (4 fases espelhadas) */}
        <rect className="dx-part dx-leg" x="86" y="87" width="6" height="12" rx="3" fill="#0f766e" />
        <rect className="dx-part dx-leg dx-leg-r" x="99" y="87" width="6" height="12" rx="3" fill="#0f766e" />
      </g>

      {/* ── LUPA (anticipation → contato) + CONE (só depois dela) ── */}
      <g className="dx-mag">
        <circle cx="122" cy="70" r="8" fill="none" stroke="#0f766e" strokeWidth="3" />
        <line x1="127.5" y1="75.5" x2="133" y2="81" stroke="#0f766e" strokeWidth="3.5" strokeLinecap="round" />
      </g>
      <polygon className="dx-scan" points="114,64 130,64 138,96 106,96" fill="url(#dxScanGrad)" />

      {/* ── ESTEIRA DE CARTÕES — ✓ draw-on com stagger negativo ── */}
      <g className="dx-belt">
        {[0, 1, 2].map((i) => (
          <g key={i} transform={`translate(${168 + i * 64} 58)`}>
            <rect width="52" height="34" rx="8" fill="#ffffff" stroke="#d8ece9" strokeWidth="1.5" />
            <rect x="7" y="9" width="30" height="4" rx="2" fill="#cbcbcb" />
            <rect x="7" y="17" width="22" height="4" rx="2" fill="#e3e3e3" />
            <rect x="7" y="25" width="26" height="3" rx="1.5" fill="#efefef" />
            <circle className="dx-check-pop" style={{ animationDelay: `${-0.13 - i * 0.325}s` }} cx="41" cy="9" r="7" fill="#20b2aa" />
            <path
              className="dx-check-draw"
              style={{ animationDelay: `${-0.13 - i * 0.325}s` }}
              pathLength={1}
              d="M37.5 9 l2.6 2.8 l4.6 -5.4"
              fill="none"
              stroke="#fff"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="1"
            />
          </g>
        ))}
        {/* reposição: entra pela direita na MESMA velocidade linear (loop invisível) */}
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
  </Box>
);
