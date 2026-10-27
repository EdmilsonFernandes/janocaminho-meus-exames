// PremiumGymArt — ilustração vetorial AUTORAL da landing esportiva (AAS §8/§9):
// academia premium estilizada (rack, anilhas, halteres) + linha de exames ao fundo
// = a ponte conceitual "você acompanha cargas ↔ nós acompanhamos exames".
// Flat premium (estilo Stripe/Linear), paleta da marca (teal #20b2aa · cobre #d4a574),
// sem foto de banco de imagens (licença/LGPD/identidade). Dark/light aware.
import { useTheme } from '@mui/material';

export const PremiumGymArt = ({ height = { xs: 220, sm: 300, md: 360 } as never }: { height?: any }) => {
  const dark = useTheme().palette.mode === 'dark';
  const bg1 = dark ? '#0f1818' : '#eef7f6';
  const bg2 = dark ? '#12282a' : '#d9efec';
  const glass = dark ? 'rgba(32,178,170,.10)' : 'rgba(255,255,255,.65)';
  const steel = dark ? '#1e383a' : '#c3ded9';
  const steelDark = dark ? '#152b2d' : '#a8ccc6';
  const chartLine = dark ? 'rgba(232,238,240,.5)' : 'rgba(23,143,137,.55)';
  return (
    <svg
      viewBox="0 0 640 400"
      role="img"
      aria-label="Academia premium estilizada com rack de anilhas e gráfico de exames ao fundo"
      style={{ width: '100%', height: 'auto', display: 'block', maxHeight: height }}
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id="pga-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={bg2} />
          <stop offset="1" stopColor={bg1} />
        </linearGradient>
        <linearGradient id="pga-teal" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#20b2aa" />
          <stop offset="1" stopColor="#178f89" />
        </linearGradient>
        <linearGradient id="pga-copper" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#e0b98c" />
          <stop offset="1" stopColor="#d4a574" />
        </linearGradient>
        <radialGradient id="pga-halo" cx="0.5" cy="0.28" r="0.55">
          <stop offset="0" stopColor="rgba(32,178,170,.28)" />
          <stop offset="1" stopColor="rgba(32,178,170,0)" />
        </radialGradient>
      </defs>

      {/* fundo + halo premium */}
      <rect x="0" y="0" width="640" height="400" rx="24" fill="url(#pga-bg)" />
      <rect x="0" y="0" width="640" height="400" rx="24" fill="url(#pga-halo)" />

      {/* linha de EXAMES ao fundo (a ponte conceitual) */}
      <g opacity="0.9">
        <polyline
          points="40,300 110,262 180,278 250,214 320,232 390,168 460,184 530,120 600,136"
          fill="none" stroke={chartLine} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
        />
        {[
          [110, 262], [250, 214], [390, 168], [530, 120],
        ].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="4.5" fill="#fff" stroke="url(#pga-teal)" strokeWidth="2.5" />
        ))}
      </g>

      {/* rack central com barra e anilhas */}
      <g>
        {/* estrutura */}
        <rect x="268" y="120" width="14" height="210" rx="7" fill={steelDark} />
        <rect x="358" y="120" width="14" height="210" rx="7" fill={steelDark} />
        <rect x="252" y="104" width="136" height="16" rx="8" fill={steel} />
        <rect x="276" y="160" width="88" height="10" rx="5" fill={steel} opacity="0.8" />
        {/* barra */}
        <rect x="188" y="196" width="264" height="10" rx="5" fill={steel} />
        {/* anilhas cobre (esq) */}
        {[0, 1].map((i) => (
          <g key={i}>
            <circle cx="214" cy="196" r={30 - i * 2} fill="url(#pga-copper)" />
            <circle cx="214" cy="196" r={12 - i} fill={bg1} />
          </g>
        ))}
        <circle cx="206" cy="196" r="34" fill="none" stroke="url(#pga-copper)" strokeWidth="7" opacity="0.55" transform="translate(0,38)" />
        {/* anilhas teal (dir) */}
        {[0, 1].map((i) => (
          <g key={i}>
            <circle cx="426" cy="196" r={30 - i * 2} fill="url(#pga-teal)" />
            <circle cx="426" cy="196" r={12 - i} fill={bg1} />
          </g>
        ))}
      </g>

      {/* banco premium */}
      <g>
        <rect x="470" y="252" width="130" height="18" rx="9" fill="url(#pga-teal)" />
        <rect x="500" y="270" width="12" height="52" rx="6" fill={steelDark} />
        <rect x="560" y="270" width="12" height="52" rx="6" fill={steelDark} />
      </g>

      {/* halteres em primeiro plano */}
      <g>
        {/* halter cobre */}
        <rect x="70" y="318" width="150" height="12" rx="6" fill={steel} />
        <rect x="78" y="302" width="22" height="44" rx="10" fill="url(#pga-copper)" />
        <rect x="190" y="302" width="22" height="44" rx="10" fill="url(#pga-copper)" />
        {/* halter teal */}
        <rect x="420" y="332" width="150" height="12" rx="6" fill={steel} />
        <rect x="428" y="316" width="22" height="44" rx="10" fill="url(#pga-teal)" />
        <rect x="540" y="316" width="22" height="44" rx="10" fill="url(#pga-teal)" />
      </g>

      {/* vidro/reflexo premium */}
      <rect x="0" y="0" width="640" height="400" rx="24" fill={glass} opacity="0.35" />
      {/* chão */}
      <ellipse cx="320" cy="368" rx="290" ry="18" fill="rgba(32,178,170,.10)" />
    </svg>
  );
};
