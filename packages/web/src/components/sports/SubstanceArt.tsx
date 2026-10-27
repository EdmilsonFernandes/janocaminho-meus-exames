// SubstanceArt (redesign hormonal v2 — spec 2026-10-27 §1) — ilustrações SVG vetoriais
// NEUTRAS por via de apresentação: sem marca real, sem logotipo, sem imitar embalagem
// (blueprint AAS §7 "Fotos": genéricas ilustrativas, alt neutro — aqui aria-hidden).
// Flat premium, 2 tons: cobre (contexto relatado) ou teal (produto/positivo).
import type { SubstanceArtKind } from './substanceCatalog';

const PALETTE = {
  copper: { main: '#d4a574', deep: '#b88a54' },
  teal: { main: '#20b2aa', deep: '#178f89' },
} as const;

/**
 * Ilustração de substância por via (ampola/frasco/comprimido/caneta/gel/seringa).
 * Puramente decorativa → aria-hidden; o nome acessível vive no texto ao lado.
 */
export const SubstanceArt = ({ kind, size = 64, tone = 'copper' }: {
  kind: SubstanceArtKind;
  size?: number;
  tone?: 'copper' | 'teal';
}) => {
  const { main: A, deep: B } = PALETTE[tone];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
      style={{ display: 'block', flexShrink: 0 }}
    >
      {kind === 'ampola' && (
        <>
          {/* corpo de vidro */}
          <rect x="21" y="27" width="22" height="32" rx="7" fill={A} />
          {/* líquido (parte inferior) */}
          <path d="M21 44h22v8a7 7 0 0 1-7 7H28a7 7 0 0 1-7-7z" fill={B} />
          {/* gargalo + topo selado à chama */}
          <rect x="27.5" y="13" width="9" height="15" fill={B} />
          <path d="M27.5 13c0-4.5 9-4.5 9 0v2.5h-9z" fill={B} />
          <rect x="25.5" y="24" width="13" height="3" rx="1.5" fill={B} />
          {/* reflexo do vidro */}
          <rect x="24.5" y="31" width="3" height="22" rx="1.5" fill="#fff" opacity=".4" />
        </>
      )}
      {kind === 'frasco' && (
        <>
          {/* tampa metálica */}
          <rect x="22" y="7" width="20" height="13" rx="2.5" fill={B} />
          <rect x="22" y="12.5" width="20" height="2.5" fill="#000" opacity=".12" />
          {/* ombro + corpo (frasco-ampola 10ml) */}
          <rect x="24" y="20" width="16" height="6" fill={A} />
          <rect x="19" y="25" width="26" height="33" rx="5" fill={A} />
          {/* líquido + rótulo */}
          <path d="M19 42h26v11a5 5 0 0 1-5 5H24a5 5 0 0 1-5-5z" fill={B} opacity=".85" />
          <rect x="19" y="42" width="26" height="12" fill="#fff" opacity=".18" />
          <rect x="23" y="29" width="3.5" height="22" rx="1.75" fill="#fff" opacity=".35" />
        </>
      )}
      {kind === 'comprimido' && (
        <>
          <ellipse cx="32" cy="55" rx="17" ry="3.5" fill="#000" opacity=".1" />
          <circle cx="32" cy="31" r="19" fill={A} />
          <path d="M13 31a19 19 0 0 0 38 0z" fill={B} opacity=".55" />
          {/* sulca de divisão */}
          <rect x="17.5" y="28.75" width="29" height="4.5" rx="2.25" fill="#fff" opacity=".55" />
          <path d="M20 20a17 17 0 0 1 9-5" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity=".35" fill="none" />
        </>
      )}
      {kind === 'caneta' && (
        <>
          <rect x="27" y="5" width="10" height="11" rx="3" fill={B} />
          <rect x="25" y="15" width="14" height="37" rx="5" fill={A} />
          {/* janela de dose */}
          <rect x="29" y="23" width="6" height="13" rx="2.5" fill="#fff" opacity=".4" />
          <g opacity=".5" fill={B}>
            <rect x="27" y="40" width="10" height="2" rx="1" />
            <rect x="27" y="44.5" width="10" height="2" rx="1" />
          </g>
          <rect x="26.5" y="52" width="11" height="5" rx="2" fill={B} />
          <rect x="30.75" y="57" width="2.5" height="5" rx="1.25" fill={B} />
        </>
      )}
      {kind === 'gel' && (
        <>
          {/* selagem superior (crimp) */}
          <rect x="26" y="6" width="12" height="9" rx="2" fill={B} />
          {/* corpo afinando */}
          <path d="M27 15h10l3.5 31h-17z" fill={A} />
          {/* tampa embaixo (tubo de pé) */}
          <rect x="22.5" y="46" width="19" height="12" rx="3" fill={B} />
          <rect x="26.6" y="24" width="10.8" height="12" rx="2.5" fill="#fff" opacity=".3" />
        </>
      )}
      {kind === 'seringa' && (
        <>
          <rect x="3" y="29.5" width="9" height="3" rx="1.5" fill={B} />
          <rect x="12" y="23" width="32" height="14" rx="3" fill={A} />
          <rect x="15.5" y="26" width="22" height="8" rx="1.5" fill="#fff" opacity=".4" />
          <rect x="44" y="20.5" width="4" height="19" rx="2" fill={B} />
          <rect x="48" y="28" width="11" height="4" rx="2" fill={B} />
          <rect x="57" y="24" width="4" height="12" rx="2" fill={B} />
        </>
      )}
    </svg>
  );
};
