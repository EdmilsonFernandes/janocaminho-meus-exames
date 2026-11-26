import { Box, Typography, useTheme } from '@mui/material';
import { alpha } from '@mui/material/styles';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { useTranslate } from 'react-admin';
import { ageText, type ChangeCardModel } from '../../utils/panoramaPresenter';
import { IconTile } from '../IconTile';
import { usePrefersReducedMotion } from '../useCardPress';
import { RADIUS } from '../../theme';
import { AreaIcon } from './AreaIcon';
import { toneColor } from './tone';

const HEAD = 'Poppins, sans-serif';

/**
 * ChangeCard — um cartão de "O que mudou": área, título com a tendência, "antes → depois" com a
 * unidade e de quando é o dado novo.
 *
 * Dois layouts: `carousel` (celular, dentro do SnapRow) e `row` (computador, empilhado).
 * O tom color só o número novo — e nunca sozinho: o título já diz a tendência em palavras.
 * O card abre o modo história da área quando ela tem azulejo; se não tem, vira leitura simples.
 */
export const ChangeCard = ({ card, layout, onOpen }: { card: ChangeCardModel; layout: 'carousel' | 'row'; onOpen?: () => void }) => {
  const translate = useTranslate();
  const theme = useTheme();
  const reduced = usePrefersReducedMotion();
  const color = toneColor(theme, card.tone);
  const row = layout === 'row';
  const when = [card.whenLead, ageText(card.age, translate)].filter(Boolean).join(card.whenJoin === 'dot' ? ' · ' : ' ');

  const body = (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: 12.5, fontWeight: 700, color: 'text.secondary', ...(row && { gridColumn: 1, gridRow: '1 / span 2', alignSelf: 'start' }) }}>
        <IconTile tone="teal" soft size={32} radius={10}>
          <AreaIcon area={card.key} sx={{ fontSize: 18 }} />
        </IconTile>
        {card.area}
      </Box>

      <Typography component="span" sx={{ fontFamily: HEAD, fontSize: 16, fontWeight: 700, lineHeight: 1.25, color: 'text.primary', ...(row && { gridColumn: 2, gridRow: 1, alignSelf: 'end' }) }}>
        {card.title}
      </Typography>

      {/* O "antes → depois" já vai no rótulo acessível do cartão; aqui é leitura visual. */}
      <Box aria-hidden sx={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: 0.5, mt: 0.25, fontVariantNumeric: 'tabular-nums', ...(row && { gridColumn: 3, gridRow: 1, justifySelf: 'end', m: 0, flexWrap: 'nowrap' }) }}>
        <Box component="span" sx={{ color: 'text.disabled', fontWeight: 700, fontSize: 14 }}>{card.before}</Box>
        <ArrowForwardRoundedIcon sx={{ fontSize: 18, color: 'text.disabled', alignSelf: 'center' }} />
        <Box component="span" sx={{ fontFamily: HEAD, fontSize: 24, fontWeight: 800, lineHeight: 1.1, color }}>{card.after}</Box>
        {card.unit && <Box component="span" sx={{ fontSize: 13, color: 'text.secondary' }}>{card.unit}</Box>}
      </Box>

      {card.sub && (
        <Typography sx={{ fontSize: 12.5, lineHeight: 1.4, color: 'text.secondary', ...(row && { gridColumn: '2 / span 2', gridRow: 2, alignSelf: 'start' }) }}>{card.sub}</Typography>
      )}
      {when && (
        <Typography sx={{ fontSize: 12.5, lineHeight: 1.4, color: 'text.secondary', mt: row ? 0 : 'auto', ...(row && { gridColumn: '2 / span 2', gridRow: card.sub ? 3 : 2, alignSelf: 'start' }) }}>
          {when}
        </Typography>
      )}
    </>
  );

  const surface = {
    width: '100%', minWidth: 0, textAlign: 'left', font: 'inherit', color: 'text.primary', appearance: 'none',
    bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: RADIUS.card,
    ...(row
      ? { display: 'grid', gridTemplateColumns: 'minmax(140px, 168px) minmax(0, 1fr) auto', columnGap: 1.75, p: '10px 14px' }
      : { display: 'flex', flexDirection: 'column', gap: 0.5, flex: '0 0 min(300px, 84%)', scrollSnapAlign: 'start', scrollSnapStop: 'always', minHeight: 142, p: '14px 14px 12px' }),
  };

  if (!onOpen) return <Box sx={surface}>{body}</Box>;

  return (
    <Box
      component="button"
      type="button"
      onClick={onOpen}
      aria-label={translate('panorama.a11y.change', { area: card.area, title: card.title, before: card.before, after: card.after, unit: card.unit })}
      sx={{
        ...surface,
        cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
        transition: reduced ? 'none' : 'transform .16s cubic-bezier(.22,1,.36,1), border-color .16s ease',
        '&:hover': { borderColor: (t) => alpha(t.palette.primary.main, t.palette.mode === 'dark' ? 0.45 : 0.5) },
        ...(reduced ? {} : { '&:active': { transform: 'scale(.97)' } }),
        '&:focus-visible': { outline: 'none', boxShadow: (t) => `0 0 0 3px ${alpha(t.palette.primary.main, 0.5)}` },
      }}
    >
      {body}
    </Box>
  );
};
