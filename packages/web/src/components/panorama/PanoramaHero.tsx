import { useState, type ReactNode } from 'react';
import { Box, Typography, useTheme } from '@mui/material';
import { alpha } from '@mui/material/styles';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import { useTranslate } from 'react-admin';
import { AppCard } from '../AppCard';
import { useCountUp } from '../../hooks/useCountUp';
import { usePrefersReducedMotion } from '../useCardPress';
import { RADIUS, tealText } from '../../theme';
import { joinNames, type HeroModel, type TickState, type Tone } from '../../utils/panoramaPresenter';
import { toneColor, toneDot, toneWash } from './tone';

const HEAD = 'Poppins, sans-serif';
/** Mesma circunferência do anel do herói da Home (r = 42) — o arco é a fração do placar. */
const CIRC = 2 * Math.PI * 42;

const Pill = ({ tone, label }: { tone: Tone; label: string }) => {
  const theme = useTheme();
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex', alignItems: 'center', gap: 0.5, height: 26, px: 1.25,
        borderRadius: RADIUS.pill, bgcolor: toneWash(theme, tone), color: toneColor(theme, tone),
        fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap',
      }}
    >
      <Box component="span" aria-hidden sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: toneDot(theme, tone) }} />
      {label}
    </Box>
  );
};

const tickColor = (state: TickState, dark: boolean): string => {
  if (state === 'on') return '#20b2aa';
  if (state === 'warn') return dark ? '#fbbf24' : '#f59e0b';
  return alpha(dark ? '#ffffff' : '#1a202c', state === 'stale' ? 0.34 : 0.14);
};

/**
 * PanoramaHero — o "como você está": anel do placar (mesmo número e mesmos rótulos da Home),
 * pílulas "N fora da faixa" / "N na faixa", o que mais puxa o placar para baixo, a nota de idade
 * dos dados e a faixa de cobertura com os tracinhos e o atalho "Completar".
 */
export const PanoramaHero = ({ hero, onComplete, actions }: {
  hero: HeroModel;
  onComplete: () => void;
  /** Ações do topo (ouvir o panorama, ir para a análise) — logo abaixo do placar. */
  actions?: ReactNode;
}) => {
  // No celular a explicação de onde vem o número fica recolhida: é lida uma vez, não toda visita.
  const [about, setAbout] = useState(false);
  const translate = useTranslate();
  const theme = useTheme();
  const reduced = usePrefersReducedMotion();
  const animated = useCountUp(hero.score);
  const dark = theme.palette.mode === 'dark';
  const hasScore = hero.score != null;
  const shown = animated ?? 0;
  const complete = hero.filled >= hero.total;

  return (
    <AppCard sx={{ p: { xs: '18px 16px 16px', md: 2.5 } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 2, md: 2.5 } }}>
        <Box
          role="img"
          aria-label={translate('panorama.hero.a11y_ring', { score: hero.score ?? 0 })}
          sx={{ position: 'relative', width: { xs: 96, md: 112 }, height: { xs: 96, md: 112 }, flexShrink: 0 }}
        >
          <Box component="svg" aria-hidden viewBox="0 0 100 100" sx={{ display: 'block', width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
            <defs>
              <linearGradient id="panoramaRingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#20b2aa" />
                <stop offset="50%" stopColor="#059669" />
                <stop offset="100%" stopColor="#20b2aa" />
              </linearGradient>
            </defs>
            <circle cx="50" cy="50" r="42" fill="none" stroke={alpha(theme.palette.text.primary, dark ? 0.10 : 0.07)} strokeWidth="8" />
            {hasScore && (
              <circle
                cx="50" cy="50" r="42" fill="none" stroke="url(#panoramaRingGrad)" strokeWidth="8" strokeLinecap="round"
                strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - Math.max(0, Math.min(100, shown)) / 100)}
                style={reduced ? undefined : { transition: 'stroke-dashoffset .8s cubic-bezier(.16,1,.3,1)' }}
              />
            )}
          </Box>
          <Box sx={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <Typography sx={{ fontFamily: HEAD, fontWeight: 800, fontSize: { xs: 30, md: 34 }, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
              {hasScore ? Math.round(shown) : '—'}
            </Typography>
            <Typography sx={{ fontSize: 12, fontWeight: 600, lineHeight: 1.2, color: 'text.secondary', mt: 0.25 }}>{translate('panorama.hero.of')}</Typography>
          </Box>
        </Box>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography component="h2" sx={{ fontFamily: HEAD, fontWeight: 800, fontSize: { xs: 21, md: 24 }, lineHeight: 1.15, textWrap: 'balance' }}>
            {hero.verdict}
          </Typography>
          {hero.noScoreText && (
            <Typography sx={{ mt: 0.5, fontSize: 13.5, lineHeight: 1.45, color: 'text.secondary' }}>{hero.noScoreText}</Typography>
          )}
          {(hero.outOfRange != null || hero.inRange != null) && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 1 }}>
              {!!hero.outOfRange && <Pill tone="warn" label={translate('panorama.hero.out_of_range', { count: hero.outOfRange })} />}
              {!!hero.inRange && <Pill tone="ok" label={translate('panorama.hero.in_range', { count: hero.inRange })} />}
            </Box>
          )}
        </Box>
      </Box>

      {(hero.pullLead || hero.nothingPulls) && (
        <Typography sx={{ mt: 1, fontSize: 13, lineHeight: 1.5, color: 'text.primary' }}>
          {hero.pullLead && (
            <>
              {hero.pullLead}{' '}
              <Box component="strong" sx={{ color: toneColor(theme, 'warn') }}>{joinNames(hero.pullDown, translate)}</Box>. {hero.holds}
            </>
          )}
          {hero.nothingPulls}
        </Typography>
      )}

      {actions && (
        <Box sx={{ mt: 1.5, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>{actions}</Box>
      )}

      {(hero.scoreSource || hero.newest) && (
        <Box
          component="button"
          type="button"
          onClick={() => setAbout((v) => !v)}
          aria-expanded={about}
          sx={{
            display: { xs: 'inline-flex', md: 'none' }, alignItems: 'center', gap: 0.25, minHeight: 44, mt: 0.5, p: 0,
            font: 'inherit', fontSize: 13, fontWeight: 700, color: 'text.secondary', bgcolor: 'transparent', border: 0,
            borderRadius: RADIUS.sm, cursor: 'pointer', appearance: 'none',
            '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
          }}
        >
          {translate('panorama.hero.about')}
          <ExpandMoreRoundedIcon sx={{ fontSize: 18, transform: about ? 'rotate(180deg)' : 'none' }} />
        </Box>
      )}

      {(hero.scoreSource || hero.newest) && (
        <Typography sx={{ display: { xs: about ? 'block' : 'none', md: 'block' }, mt: { xs: 0, md: 1.5 }, pt: { xs: 0, md: 1.5 }, borderTop: { xs: 0, md: '1px solid' }, borderColor: { md: 'divider' }, fontSize: 13, lineHeight: 1.5, color: 'text.secondary' }}>
          {hero.scoreSource}
          {hero.newest && <> {translate('panorama.hero.newest', { area: hero.newest.area, when: hero.newest.when })}</>}
          {hero.oldest && <> {translate('panorama.hero.oldest', { area: hero.oldest.area, when: hero.oldest.when })}</>}
        </Typography>
      )}

      <Box sx={{ mt: { xs: 1, md: 2 }, pt: { xs: 1.5, md: 2 }, borderTop: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
          <Typography component="span" sx={{ fontSize: 14, fontWeight: 600, lineHeight: 1.35 }}>
            {translate('panorama.hero.coverage', { filled: hero.filled, total: hero.total })}
          </Typography>
          {!complete && (
            <Box
              component="button"
              type="button"
              onClick={onComplete}
              sx={{
                display: 'inline-flex', alignItems: 'center', gap: 0.5, minHeight: 44, px: 0.5, flexShrink: 0,
                font: 'inherit', fontWeight: 800, fontSize: 13.5,
                color: (t) => tealText(t.palette.mode), cursor: 'pointer',
                border: 0, bgcolor: 'transparent', borderRadius: RADIUS.sm,
                '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
              }}
            >
              {translate('panorama.hero.complete')}
              <ArrowForwardRoundedIcon sx={{ fontSize: 18 }} />
            </Box>
          )}
        </Box>
        <Box role="img" aria-label={translate('panorama.hero.a11y_ticks', { filled: hero.filled, total: hero.total })} sx={{ display: 'flex', gap: 0.5, mt: 0.75 }}>
          {hero.ticks.map((state, i) => (
            <Box key={i} sx={{ flex: 1, height: 8, borderRadius: '4px', bgcolor: tickColor(state, dark) }} />
          ))}
        </Box>
      </Box>
    </AppCard>
  );
};
