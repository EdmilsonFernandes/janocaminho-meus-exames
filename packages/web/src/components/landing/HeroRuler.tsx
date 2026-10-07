import { Box } from '@mui/material';

/**
 * Régua de exame ilustrativa (assinatura visual da landing v3, estética Métrica Vital):
 * banda do laboratório + pin do valor + meta tracejada do médico — a história do
 * produto contada em UM visual. SVG inline (zero rede, zero lib) e animação CSS
 * sutil que respeita prefers-reduced-motion.
 *
 * Números do exemplo: ILUSTRATIVOS do mecanismo (faixas genéricas de hematócrito
 * 40–50% do laudo). Nada aqui é alegação clínica — os números citados em copy vêm
 * de packages/server/knowledge (SBEM/ES: 48–54% atenção, >54% protocolo).
 */

const TEAL = '#20b2aa';
const COPPER = '#d4a574';

type Props = {
  /** dark = fundo profundo Métrica Vital (variante esportiva); light = sobre papel */
  tone?: 'light' | 'dark';
  /** compact = faixa fina p/ embaixo do mockup do hero padrão */
  compact?: boolean;
  /** rótulo do valor do pin (ex.: "seu valor") */
  valueLabel?: string;
  /** rótulo da meta (ex.: "meta do seu médico") */
  goalLabel?: string;
  sx?: any;
};

export const HeroRuler = ({ tone = 'dark', compact = false, valueLabel = 'seu valor', goalLabel = 'meta do seu médico', sx }: Props) => {
  const dark = tone === 'dark';
  const labelColor = dark ? COPPER : '#b88a54';
  const subColor = dark ? 'rgba(255,255,255,.55)' : 'rgba(15,95,90,.55)';
  const labFill = dark ? 'rgba(255,255,255,.16)' : 'rgba(15,95,90,.14)';
  const trackFill = dark ? 'rgba(255,255,255,.05)' : 'rgba(15,95,90,.05)';
  const trackStroke = dark ? 'rgba(255,255,255,.22)' : 'rgba(15,95,90,.22)';
  const H = compact ? 92 : 168;

  return (
    <Box sx={{ width: '100%', position: 'relative', ...sx }} aria-hidden="true">
      <style>{`
        @keyframes hrPinIn { 0%{ transform: translateX(-46px); opacity:0 } 60%{ opacity:1 } 100%{ transform: translateX(0); opacity:1 } }
        @keyframes hrPinPulse { 0%,100%{ box-shadow: 0 0 0 0 rgba(32,178,170,.35) } 50%{ box-shadow: 0 0 0 7px rgba(32,178,170,0) } }
        .hr-pin { animation: hrPinIn .9s cubic-bezier(.16,1,.3,1) both, hrPinPulse 2.6s ease-in-out 1s infinite; }
        .hr-chip { animation: hrPinIn .9s .15s cubic-bezier(.16,1,.3,1) both; }
        @media (prefers-reduced-motion: reduce){ .hr-pin,.hr-chip{ animation:none !important } }
      `}</style>
      <Box
        component="svg"
        viewBox={`0 0 600 ${H}`}
        sx={{ width: '100%', height: 'auto', display: 'block' }}
        role="img"
        aria-label="Régua ilustrativa: faixa do laboratório, seu valor e a meta definida pelo seu médico no mesmo gráfico"
      >
        {/* tiques de régua (precisão de laboratório) */}
        {Array.from({ length: 41 }).map((_, i) => {
          const x = 12 + i * 14.4;
          const major = i % 5 === 0;
          return <line key={i} x1={x} y1={compact ? 8 : 14} x2={x} y2={(compact ? 8 : 14) + (major ? 12 : 6)} stroke={trackStroke} strokeWidth={major ? 1.6 : 1} />;
        })}
        {/* trilho */}
        <line x1="12" y1={H - 34} x2="588" y2={H - 34} stroke={trackStroke} strokeWidth={1} />
        {/* faixa do laboratório */}
        <rect x={48} y={H - 46} width={168} height={24} rx={12} fill={labFill} />
        {/* meta do médico (tracejada, teal) */}
        <rect x={312} y={H - 49} width={168} height={30} rx={15} fill="rgba(32,178,170,.10)" stroke={TEAL} strokeWidth={1.5} strokeDasharray="7 6" />
        {/* pin do valor */}
        <rect x={402} y={H - 56} width={7} height={44} rx={3.5} fill={TEAL} className="hr-pin" style={{ transformOrigin: 'center' }} />
        {!compact && (
          <circle cx={405.5} cy={H - 34} r={4.5} fill={TEAL} />
        )}
        {/* labels */}
        <text x={48} y={H - 12} fontSize={compact ? 11 : 12} fill={labelColor} letterSpacing="1.4" style={{ textTransform: 'uppercase', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontWeight: 700 }}>
          FAIXA DO LABORATÓRIO
        </text>
        <text x={588} y={H - 12} fontSize={compact ? 11 : 12} fill={labelColor} letterSpacing="1.4" textAnchor="end" style={{ textTransform: 'uppercase', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontWeight: 700 }}>
          {goalLabel.toUpperCase()}
        </text>
        {!compact && (
          <text x={12} y={H - 58} fontSize={12} fill={subColor} letterSpacing="1" style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}>
            {valueLabel.toUpperCase()}
          </text>
        )}
      </Box>
      {/* chip flutuante do valor (fora do SVG p/ sombra de vidro) */}
      <Box
        className="hr-chip"
        sx={{
          position: 'absolute',
          left: { xs: '56%', sm: '58.5%', md: '58.5%' },
          top: compact ? -6 : 6,
          transform: 'translateX(-50%)',
          bgcolor: dark ? 'rgba(9,51,48,.92)' : 'rgba(255,255,255,.96)',
          border: `1px solid ${dark ? 'rgba(32,178,170,.4)' : 'rgba(32,178,170,.3)'}`,
          borderRadius: '10px',
          px: 1.25,
          py: 0.4,
          color: dark ? '#e8eef0' : '#0f5f5a',
          fontSize: 12.5,
          fontWeight: 800,
          whiteSpace: 'nowrap',
          boxShadow: dark ? '0 8px 24px rgba(0,0,0,.35)' : '0 8px 22px rgba(15,95,90,.14)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          display: compact ? 'none' : 'block',
        }}
      >
        seu valor · com contexto
      </Box>
    </Box>
  );
};
