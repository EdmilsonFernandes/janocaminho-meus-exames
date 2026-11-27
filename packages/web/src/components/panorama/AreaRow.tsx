import { Box, Typography, useTheme } from '@mui/material';
import { alpha } from '@mui/material/styles';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import { useTranslate } from 'react-admin';
import { IconTile } from '../IconTile';
import { ageText, type AreaTileModel, type PanoramaKey } from '../../utils/panoramaPresenter';
import { AreaIcon } from './AreaIcon';
import { DataAge } from './DataAge';
import { toneColor, toneDot } from './tone';

const HEAD = 'Poppins, sans-serif';

/**
 * AreaRow — uma área em UMA linha, para o celular (27/11/26). Os azulejos quadrados gastavam
 * ~105 px de altura por área; com 9 a 12 áreas a tela virava uma rolagem sem fim. A linha mostra
 * a mesma coisa em ~66 px: ícone, nome, o número, o estado (cor + texto) e de quando é o dado.
 * Continua um <button> só, com o mesmo rótulo falado do azulejo; o toque abre a história da área.
 */
export const AreaRow = ({ tile, onOpen, last }: { tile: AreaTileModel; onOpen: (key: PanoramaKey) => void; last: boolean }) => {
  const translate = useTranslate();
  const theme = useTheme();
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
        display: 'flex', alignItems: 'center', gap: 1.5, width: '100%', minHeight: 64, px: 1.75, py: 1.25,
        textAlign: 'left', font: 'inherit', color: 'text.primary', bgcolor: 'transparent',
        border: 0, borderBottom: last ? 0 : '1px solid', borderColor: 'divider',
        cursor: 'pointer', appearance: 'none', WebkitTapHighlightColor: 'transparent',
        '&:active': { bgcolor: (t) => alpha(t.palette.primary.main, 0.07) },
        '&:focus-visible': { outline: 'none', boxShadow: (t) => `inset 0 0 0 2px ${alpha(t.palette.primary.main, 0.6)}` },
      }}
    >
      <IconTile tone={tile.stale ? 'neutral' : 'teal'} soft size={36} radius={11}>
        <AreaIcon area={tile.key} sx={{ fontSize: 19 }} />
      </IconTile>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
          <Typography component="span" sx={{ flex: 1, minWidth: 0, fontFamily: HEAD, fontWeight: 700, fontSize: 14.5, lineHeight: 1.25, overflowWrap: 'break-word' }}>
            {tile.name}
          </Typography>
          <Typography component="span" sx={{ flexShrink: 0, maxWidth: '58%', textAlign: 'right', fontFamily: HEAD, fontWeight: 800, fontSize: 18, lineHeight: 1.1, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
            {tile.big}
            {tile.unit && (
              <Typography component="span" sx={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 700, letterSpacing: 0, color: 'text.secondary', ml: 0.5 }}>
                {tile.unit}
              </Typography>
            )}
          </Typography>
        </Box>
        {(tile.pill || showsWhen) && (
          <Typography component="span" sx={{ display: 'block', mt: 0.5, fontSize: 12.5, lineHeight: 1.35, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
            {tile.pill && (
              <Box component="span" sx={{ color: toneColor(theme, tile.tone), fontWeight: 800 }}>
                <Box component="span" aria-hidden sx={{ display: 'inline-block', width: 6, height: 6, mr: 0.625, borderRadius: '50%', bgcolor: toneDot(theme, tile.tone), verticalAlign: 'middle', transform: 'translateY(-1px)' }} />
                {tile.pill}
              </Box>
            )}
            {tile.pill && showsWhen ? ' · ' : null}
            {tile.whenLead}
            {tile.whenLead && showsAge ? (tile.whenJoin === 'dot' ? ' · ' : ' ') : null}
            {showsAge && <DataAge age={tile.age} iso={tile.asOf} />}
          </Typography>
        )}
      </Box>
      <ChevronRightRoundedIcon aria-hidden sx={{ fontSize: 20, flexShrink: 0, color: 'text.disabled' }} />
    </Box>
  );
};
