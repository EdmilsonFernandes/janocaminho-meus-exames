import { Box, Typography, useTheme } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { useTranslate } from 'react-admin';
import { IconTile, type IconTileTone } from '../IconTile';
import { usePrefersReducedMotion } from '../useCardPress';
import { RADIUS } from '../../theme';
import { ageText, type AreaTileModel, type PanoramaKey } from '../../utils/panoramaPresenter';
import { AreaIcon } from './AreaIcon';
import { DataAge } from './DataAge';
import { TrendSpark } from './TrendSpark';
import { toneColor, toneDot, toneWash } from './tone';

const HEAD = 'Poppins, sans-serif';

/**
 * AreaTile — um azulejo de "Suas áreas": ícone, nome, número grande + unidade, de quando é o
 * dado, pílula de estado e a linha de tendência discreta no pé.
 *
 * É um <button> de verdade (um alvo só, sem nada aninhado): leitor de tela anuncia nome, valor,
 * data e estado de uma vez; o foco é visível. No computador ganha a frase da área (`take`).
 * Dado antigo: ícone cinza, pílula neutra "dado de há X" — nunca a cor de "em dia".
 */
export const AreaTile = ({ tile, onOpen }: { tile: AreaTileModel; onOpen: (key: PanoramaKey) => void }) => {
  const translate = useTranslate();
  const theme = useTheme();
  const reduced = usePrefersReducedMotion();
  const color = toneColor(theme, tile.tone);
  const wash = toneWash(theme, tile.tone);
  const dot = toneDot(theme, tile.tone);
  const iconTone: IconTileTone = tile.stale ? 'neutral' : 'teal';
  // O "de quando": a parte da data já formatada + a idade do dado, sempre pelo <DataAge>.
  const showsAge = tile.whenJoin !== 'none' && !!ageText(tile.age, translate);
  const showsWhen = !!tile.whenLead || showsAge;

  return (
    <Box
      component="button"
      type="button"
      onClick={() => onOpen(tile.key)}
      aria-label={tile.ariaLabel}
      data-area={tile.key}
      sx={{
        position: 'relative', overflow: 'hidden', isolation: 'isolate',
        display: 'flex', flexDirection: 'column', gap: 0.5, textAlign: 'left',
        width: '100%', minWidth: 0, minHeight: { xs: 156, md: 196 }, p: { xs: '12px 12px 18px', md: 3 },
        bgcolor: 'background.paper', color: 'text.primary', font: 'inherit',
        border: '1px solid', borderColor: 'divider', borderRadius: RADIUS.card,
        cursor: 'pointer', appearance: 'none', WebkitTapHighlightColor: 'transparent',
        transition: reduced ? 'none' : 'transform .16s cubic-bezier(.22,1,.36,1), border-color .16s ease',
        '&:hover': { borderColor: (t) => alpha(t.palette.primary.main, t.palette.mode === 'dark' ? 0.45 : 0.5) },
        ...(reduced ? {} : { '&:active': { transform: 'scale(.97)' } }),
        '&:focus-visible': { outline: 'none', boxShadow: (t) => `0 0 0 3px ${alpha(t.palette.primary.main, 0.5)}` },
      }}
    >
      {/* Nome: reserva duas linhas para o número ficar na mesma altura em toda a grade. */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, minHeight: 38, position: 'relative', zIndex: 1 }}>
        <IconTile tone={iconTone} soft size={28} radius={9}>
          <AreaIcon area={tile.key} sx={{ fontSize: 16 }} />
        </IconTile>
        <Typography component="span" sx={{ fontFamily: HEAD, fontWeight: 700, fontSize: 14, lineHeight: 1.2, pt: '3px', overflowWrap: 'break-word' }}>
          {tile.name}
        </Typography>
      </Box>

      <Typography
        component="span"
        sx={{
          display: 'block', position: 'relative', zIndex: 1, mt: 0.25,
          fontFamily: HEAD, fontWeight: 800, fontSize: 27, lineHeight: 1.05, letterSpacing: '-0.025em',
          fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere',
        }}
      >
        {tile.big}
        {tile.unit && (
          <Typography component="span" sx={{ fontFamily: 'Inter, sans-serif', fontSize: 12.5, fontWeight: 700, letterSpacing: 0, color: 'text.secondary', ml: 0.625 }}>
            {tile.unit}
          </Typography>
        )}
      </Typography>

      {tile.take && (
        <Typography sx={{ display: { xs: 'none', md: 'block' }, position: 'relative', zIndex: 1, mt: 0.75, fontSize: 13.5, lineHeight: 1.45, color: 'text.secondary' }}>
          {tile.take}
        </Typography>
      )}

      <Box sx={{ mt: 'auto', pt: { xs: 1.5, md: 1 }, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.5, position: 'relative', zIndex: 1 }}>
        {showsWhen && (
          <Typography component="span" sx={{ fontSize: 12, fontWeight: 600, lineHeight: 1.3, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
            {tile.whenLead}
            {tile.whenLead && showsAge ? (tile.whenJoin === 'dot' ? ' · ' : ' ') : null}
            {showsAge && <DataAge age={tile.age} iso={tile.asOf} />}
          </Typography>
        )}
        {tile.pill && (
          <Box
            component="span"
            sx={{
              display: 'inline-flex', alignItems: 'center', gap: 0.5, minWidth: 0, maxWidth: '100%',
              minHeight: 22, height: 'auto', px: 1, py: 0.25, borderRadius: RADIUS.pill,
              bgcolor: wash, color, fontSize: 12, fontWeight: 800, lineHeight: 1.25, textAlign: 'left',
            }}
          >
            <Box component="span" aria-hidden sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: dot, flexShrink: 0 }} />
            {tile.pill}
          </Box>
        )}
      </Box>

      <TrendSpark points={tile.spark} tone={tile.sparkTone} />
    </Box>
  );
};
