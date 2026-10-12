import { Box, Stack, Tooltip, Typography, useTheme } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { AppCard } from './AppCard';
import { SEM } from '../theme';

/**
 * BodyMap — silhueta corporal com sistemas/regiões acendendo pelo estado dos marcadores.
 *
 * Dado vem pronto do server (`health.bodyRegions` — agregação honesta: pior nível dos
 * marcadores da região; sem marcador → 'sem_dados' em cinza, NUNCA verde). Clique na
 * região (silhueta ou lista) → Tendências do 1º marcador alterado da região.
 *
 * Layout: silhueta central (line-art teal) + lista de regiões abaixo — na lista cada
 * região mostra os marcadores no tooltip e leva a um toque de 44px (mobile-first).
 */

export type RegionLevel = 'ok' | 'atencao' | 'alterado' | 'sem_dados';

export interface BodyRegionMarkerView {
  nameCanonical: string;
  name: string;
  level: 'ok' | 'atencao' | 'alterado';
  valueText: string | null;
}

export interface BodyRegionView {
  key: string;
  label: string;
  emoji: string;
  level: RegionLevel;
  markers: BodyRegionMarkerView[];
}

const LEVEL_LABEL: Record<RegionLevel, string> = {
  ok: 'Em ordem',
  atencao: 'Atenção',
  alterado: 'Alterado',
  sem_dados: 'Sem dados',
};

/** Cor sólida da região pelo nível (adapta dark/light via SEM/text tokens). */
const useLevelColor = () => {
  const theme = useTheme();
  const dark = theme.palette.mode === 'dark';
  return (level: RegionLevel): string => {
    if (level === 'sem_dados') return dark ? '#64748b' : '#94a3b8';
    const tok = level === 'ok' ? SEM.ok : level === 'atencao' ? SEM.warn : SEM.bad;
    return dark ? tok.dark : tok.light;
  };
};

const fmtMarkers = (r: BodyRegionView) =>
  r.markers.length === 0
    ? 'Sem dados desta região nos seus exames.'
    : r.markers.map((m) => `${m.name}: ${m.valueText ?? '—'} (${LEVEL_LABEL[m.level]})`).join('\n');

/** Silhueta minimalista (line-art) + órgãos clicáveis. Cores por nível; cinza = sem dados. */
const Silhouette = ({ regions, colorOf, onPick }: {
  regions: BodyRegionView[];
  colorOf: (l: RegionLevel) => string;
  onPick: (r: BodyRegionView) => void;
}) => {
  const theme = useTheme();
  const teal = theme.palette.primary.main;
  const by = Object.fromEntries(regions.map((r) => [r.key, r]));
  const lvl = (k: string): RegionLevel => by[k]?.level ?? 'sem_dados';

  /** Grupo interativo: tooltip + clique + alvo de toque ≥44px (círculo invisível).
   *  Guard: região ausente (lista vazia / carregando) → não renderiza NADA — sem isto
   *  o primeiro paint com regions=null crashava o dashboard inteiro ("Algo deu errado"). */
  const Hit = ({ r, cx, cy, children }: { r?: BodyRegionView; cx?: number; cy?: number; children: React.ReactNode }) => {
    if (!r) return null;
    return (
      <Tooltip enterTouchDelay={0} title={<Box sx={{ whiteSpace: 'pre-line', fontSize: 12 }}><strong>{r.label}</strong>{'\n'}{fmtMarkers(r)}</Box>}>
        <g
          onClick={() => r.markers.length > 0 && onPick(r)}
          role="button"
          aria-label={`${r.label}: ${LEVEL_LABEL[r.level]}`}
          style={{ cursor: r.markers.length > 0 ? 'pointer' : 'default' }}
        >
          {children}
          {cx != null && cy != null && <circle cx={cx} cy={cy} r={20} fill="transparent" />}
        </g>
      </Tooltip>
    );
  };

  const organFill = (k: string) => {
    const c = colorOf(lvl(k));
    return { fill: alpha(c, lvl(k) === 'sem_dados' ? 0.14 : 0.34), stroke: c, strokeWidth: 1.4 };
  };

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center' }}>
      <svg viewBox="0 0 220 500" width="100%" style={{ maxWidth: 232 }} role="img" aria-label="Mapa corporal dos seus exames">
        {/* ── silhueta (line-art teal) ── */}
        <g fill="none" stroke={alpha(teal, 0.55)} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx={110} cy={40} r={26} /> {/* cabeça */}
          <path d="M78 78 Q110 68 142 78 Q158 84 160 104 Q162 150 154 200 Q150 240 152 268 Q110 286 68 268 Q70 240 66 200 Q58 150 60 104 Q62 84 78 78 Z" /> {/* tronco */}
          <path d="M76 84 Q64 104 58 134 Q52 164 48 198 Q46 216 46 232" strokeWidth="13" /> {/* braço esq */}
          <path d="M144 84 Q156 104 162 134 Q168 164 172 198 Q174 216 174 232" strokeWidth="13" /> {/* braço dir */}
          <path d="M86 274 Q84 320 84 360 Q84 402 80 442 Q78 456 78 462" strokeWidth="21" /> {/* perna esq */}
          <path d="M134 274 Q136 320 136 360 Q136 402 140 442 Q142 456 142 462" strokeWidth="21" /> {/* perna dir */}
        </g>

        {/* ── sangue: lavagem de fundo do tronco (sistêmico) ── */}
        <Hit r={by.sangue} cx={110} cy={168}>
          <ellipse cx={110} cy={168} rx={38} ry={64} {...organFill('sangue')} />
        </Hit>

        {/* ── pulmões (atrás do coração) ── */}
        <Hit r={by.pulmoes} cx={91} cy={126}>
          <ellipse cx={91} cy={126} rx={13} ry={23} {...organFill('pulmoes')} />
          <circle cx={129} cy={126} r={15} fill="transparent" />
          <ellipse cx={129} cy={126} rx={13} ry={23} {...organFill('pulmoes')} />
        </Hit>

        {/* ── fígado ── */}
        <Hit r={by.figado} cx={92} cy={166}>
          <ellipse cx={92} cy={166} rx={18} ry={11} {...organFill('figado')} />
        </Hit>

        {/* ── pâncreas ── */}
        <Hit r={by.pancreas} cx={112} cy={181}>
          <ellipse cx={112} cy={181} rx={13} ry={5.5} {...organFill('pancreas')} />
        </Hit>

        {/* ── rins ── */}
        <Hit r={by.rins} cx={96} cy={203}>
          <ellipse cx={96} cy={203} rx={7} ry={12} {...organFill('rins')} />
          <circle cx={124} cy={203} r={15} fill="transparent" />
          <ellipse cx={124} cy={203} rx={7} ry={12} {...organFill('rins')} />
        </Hit>

        {/* ── coração (sobre os pulmões) ── */}
        <Hit r={by.coracao} cx={113} cy={132}>
          <path d="M113 141 C 104 133 104 124 111 122 C 112.4 121.6 113.6 122 114.5 123 C 115.4 122 116.6 121.6 118 122 C 125 124 125 133 116 141 Z" {...organFill('coracao')} />
        </Hit>

        {/* ── cérebro (cabeça) ── */}
        <Hit r={by.cerebro} cx={110} cy={36}>
          <ellipse cx={110} cy={36} rx={17} ry={14} {...organFill('cerebro')} />
        </Hit>

        {/* ── músculos (braços) ── */}
        <Hit r={by.musculos} cx={57} cy={148}>
          <circle cx={57} cy={148} r={10} {...organFill('musculos')} />
          <circle cx={163} cy={148} r={15} fill="transparent" />
          <circle cx={163} cy={148} r={10} {...organFill('musculos')} />
        </Hit>

        {/* ── ossos: coluna + pelve ── */}
        <Hit r={by.ossos} cx={110} cy={266}>
          <line x1={110} y1={88} x2={110} y2={256} stroke={colorOf(lvl('ossos'))} strokeWidth={3} strokeDasharray="5 5" opacity={0.85} />
          <ellipse cx={110} cy={266} rx={17} ry={10} {...organFill('ossos')} />
        </Hit>
      </svg>
    </Box>
  );
};

export const BodyMap = ({ regions, loaded, onRegionClick }: {
  regions: BodyRegionView[] | null;
  loaded: boolean;
  onRegionClick: (r: BodyRegionView) => void;
}) => {
  const colorOf = useLevelColor();
  const list = regions ?? [];
  const withData = list.filter((r) => r.level !== 'sem_dados');
  // Empty state honesto: sem NENHUM marcador mapeado o mapa seria 100% cinza — card
  // inútil no dashboard vazio (que já tem CTA próprio). Some em vez de "acender nada".
  if (loaded && withData.length === 0) return null;

  return (
    <AppCard>
      <Typography sx={{ fontWeight: 800, fontSize: 15, mb: 0.25 }}>🧍 Mapa do corpo</Typography>
      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1 }}>
        Cada região acende conforme os marcadores dos seus exames. Toque para ver.
      </Typography>

      <Silhouette regions={list} colorOf={colorOf} onPick={onRegionClick} />

      <Stack spacing={0.5} sx={{ mt: 1.5 }} data-testid="bodymap-regions">
        {loaded && list.length === 0 && (
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>sem dados ainda</Typography>
        )}
        {list.map((r) => (
          <Tooltip key={r.key} enterTouchDelay={0} title={<Box sx={{ whiteSpace: 'pre-line', fontSize: 12 }}><strong>{r.label}</strong>{'\n'}{fmtMarkers(r)}</Box>}>
            <Stack
              direction="row"
              alignItems="center"
              spacing={1}
              onClick={() => r.markers.length > 0 && onRegionClick(r)}
              sx={{
                cursor: r.markers.length > 0 ? 'pointer' : 'default',
                minHeight: 44,
                px: 1,
                borderRadius: '12px',
                '&:hover': r.markers.length > 0 ? { bgcolor: (t) => alpha(t.palette.primary.main, 0.07) } : {},
                '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 },
              }}
              role="button"
              tabIndex={0}
              aria-label={`${r.label}: ${LEVEL_LABEL[r.level]}`}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (r.markers.length > 0) onRegionClick(r); } }}
            >
              <Box sx={{ fontSize: 16, lineHeight: 1 }}>{r.emoji}</Box>
              <Typography sx={{ flex: 1, fontSize: 13, fontWeight: 700, color: 'text.primary', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.label}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: colorOf(r.level), flexShrink: 0 }} />
                <Typography sx={{ fontSize: 12, fontWeight: 700, color: colorOf(r.level), whiteSpace: 'nowrap' }}>
                  {LEVEL_LABEL[r.level]}
                </Typography>
              </Box>
            </Stack>
          </Tooltip>
        ))}
      </Stack>

      {loaded && withData.length > 0 && (
        <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 1 }}>
          Regiões em cinza ainda não têm exames correspondentes.
        </Typography>
      )}
    </AppCard>
  );
};
