import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Box, Button, Dialog, Drawer, IconButton, Link, Typography, useMediaQuery, useTheme, type Theme } from '@mui/material';
import { alpha } from '@mui/material/styles';
import type { SxProps } from '@mui/material';
import ArrowBackIosNewRoundedIcon from '@mui/icons-material/ArrowBackIosNewRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import ArrowUpwardRoundedIcon from '@mui/icons-material/ArrowUpwardRounded';
import ArrowDownwardRoundedIcon from '@mui/icons-material/ArrowDownwardRounded';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined';
import FavoriteIcon from '@mui/icons-material/Favorite';
import PhoneInTalkIcon from '@mui/icons-material/PhoneInTalk';
import { useLocale, useTranslate } from 'react-admin';
import { GradientButton } from '../GradientButton';
import { DrExame } from '../DrExame';
import { usePrefersReducedMotion } from '../useCardPress';
import { RADIUS, tealText } from '../../theme';
import { ageText, type AreaTileModel, type Band, type StoryCard } from '../../utils/panoramaPresenter';
import { AreaIcon } from './AreaIcon';
import { DataAge } from './DataAge';
import { StoryBars, StoryLine } from './StoryCharts';
import { TrendSpark } from './TrendSpark';
import { toneColor, toneDot, toneWash } from './tone';

const HEAD = 'Poppins, sans-serif';
const EASE = 'cubic-bezier(.22,1,.36,1)';
const focusRing = { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 } as const;

export interface StorySheetProps {
  /** Áreas COM dado, na ordem da grade. */
  tiles: AreaTileModel[];
  /** Índice da área aberta; null = fechado. */
  areaIndex: number | null;
  onAreaChange: (index: number) => void;
  onClose: () => void;
  /** CTA do cartão de fim ("Gerar análise"): fecha a folha e dispara a análise. */
  onGenerate: () => void;
  generateLabel: string;
  navigate: (to: string) => void;
}

// ───────────────────────── peças do cartão ─────────────────────────
const Eyebrow = ({ children }: { children: string }) => (
  <Typography component="p" sx={{ fontSize: 13, fontWeight: 800, lineHeight: 1.35, color: (t) => tealText(t.palette.mode) }}>{children}</Typography>
);

const Body = ({ children, muted }: { children: string; muted?: boolean }) => (
  <Typography component="p" sx={{ fontSize: muted ? 13 : 15, lineHeight: 1.5, color: muted ? 'text.secondary' : 'text.primary', overflowWrap: 'break-word' }}>{children}</Typography>
);

const Title = ({ children }: { children: string }) => (
  <Typography component="p" sx={{ fontFamily: HEAD, fontSize: 23, fontWeight: 800, lineHeight: 1.2, overflowWrap: 'break-word' }}>{children}</Typography>
);

/** Pílula de estado do cartão de número (faixa, "em dia", ou "dado de há X" quando é antigo). */
const BandPill = ({ band }: { band: Band | null }) => {
  const theme = useTheme();
  if (!band) return null;
  return (
    <Box
      component="span"
      sx={{
        alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 0.75, maxWidth: '100%',
        minHeight: 28, height: 'auto', px: 1.25, py: 0.25, borderRadius: RADIUS.pill,
        bgcolor: toneWash(theme, band.tone), color: toneColor(theme, band.tone), fontSize: 13, fontWeight: 800, lineHeight: 1.35,
      }}
    >
      <Box component="span" aria-hidden sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: toneDot(theme, band.tone), flexShrink: 0 }} />
      {band.label}
    </Box>
  );
};

/** O círculo grande do topo do cartão: ícone da área, ou a seta (gradiente) do próximo passo. */
const Art = ({ children, go = false }: { children: ReactNode; go?: boolean }) => (
  <Box aria-hidden sx={{ flex: 'none', display: 'flex', justifyContent: 'center', pt: 0.75, pb: 0.5 }}>
    <Box sx={{
      width: 76, height: 76, borderRadius: '50%', display: 'grid', placeItems: 'center',
      ...(go
        ? { background: 'linear-gradient(135deg,#20b2aa,#178f89)', color: '#fff', boxShadow: '0 6px 16px rgba(32,178,170,.28)' }
        : { bgcolor: (t) => alpha(t.palette.primary.main, 0.13), color: (t) => (t.palette.mode === 'dark' ? '#5fc9c3' : '#178f89') }),
    }}>
      {children}
    </Box>
  </Box>
);

const crisisLink: SxProps<Theme> = {
  display: 'flex', alignItems: 'center', gap: 1, flex: 1, minHeight: 44, px: 1.5,
  borderRadius: RADIUS.button, border: '1.5px solid', borderColor: 'rgba(32,178,170,.55)',
  bgcolor: 'rgba(32,178,170,.10)', fontWeight: 800, fontSize: 14,
  color: (t) => tealText(t.palette.mode),
  '&:focus-visible': focusRing,
};

/** Um cartão da história. `active` controla se o botão dele entra na tabulação (redundante com `inert`). */
const StoryCardView = ({ card, area, active, onClose, onGenerate, generateLabel, navigate }: {
  card: StoryCard; area: AreaTileModel; active: boolean; onClose: () => void; onGenerate: () => void; generateLabel: string; navigate: (to: string) => void;
}) => {
  const translate = useTranslate();
  const locale = useLocale();
  const theme = useTheme();
  const nf = (v: number, dec = 1) => new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'pt-BR', { maximumFractionDigits: dec }).format(v);
  const note = area.screeningNote && card.kind !== 'crisis' && card.kind !== 'end';

  let content: ReactNode;
  if (card.kind === 'number') {
    content = (
      <>
        <Art><AreaIcon area={area.key} sx={{ fontSize: 38 }} /></Art>
        <Box sx={{ my: 'auto', display: 'flex', flexDirection: 'column', gap: 1.25 }}>
          {card.eyebrow && <Eyebrow>{card.eyebrow}</Eyebrow>}
          <Typography component="p" sx={{ fontFamily: HEAD, fontWeight: 800, fontSize: 'clamp(2.75rem, 15vw, 3.625rem)', lineHeight: 1, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere' }}>
            {card.big}
            {card.unit && (
              <Typography component="span" sx={{ fontFamily: 'Inter, sans-serif', fontSize: 15, fontWeight: 700, letterSpacing: 0, color: 'text.secondary', ml: 1 }}>{card.unit}</Typography>
            )}
          </Typography>
          <BandPill band={card.band} />
          {card.text && <Body>{card.text}</Body>}
        </Box>
        {card.spark && (
          <Box sx={{ flex: 'none', mt: 0.5 }}>
            <TrendSpark points={card.spark.points} tone={card.spark.tone} variant="inline" />
            <Typography sx={{ fontSize: 13, fontWeight: 600, lineHeight: 1.35, color: 'text.secondary', textAlign: 'center', mt: 0.25 }}>{card.spark.label}</Typography>
          </Box>
        )}
      </>
    );
  } else if (card.kind === 'line') {
    content = (
      <Box sx={{ my: 'auto', display: 'flex', flexDirection: 'column', gap: 1.25 }}>
        {card.eyebrow && <Eyebrow>{card.eyebrow}</Eyebrow>}
        <StoryLine
          points={card.points} ref={card.ref} unit={card.unit} x={card.x}
          ariaLabel={`${card.eyebrow}. ${translate('panorama.story.chart_value', { value: nf(card.points[card.points.length - 1], 2), unit: card.unit ? ` ${card.unit}` : '' })}. ${card.text}`}
        />
        {card.text && <Body>{card.text}</Body>}
        {/* Eixo categórico: a idade do último dado vai na legenda, nunca só na curva. */}
        <Typography component="p" sx={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4, color: 'text.secondary' }}>
          {card.lastLead}:{' '}<DataAge age={card.lastAge} />
        </Typography>
      </Box>
    );
  } else if (card.kind === 'bars') {
    content = (
      <Box sx={{ my: 'auto', display: 'flex', flexDirection: 'column', gap: 1.25 }}>
        {card.eyebrow && <Eyebrow>{card.eyebrow}</Eyebrow>}
        <StoryBars
          values={card.values} labels={card.labels}
          ariaLabel={`${card.eyebrow}: ${card.labels.map((l, i) => `${l} ${card.values[i]}`).join(', ')}.`}
        />
        {card.text && <Body>{card.text}</Body>}
        <Typography component="p" sx={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4, color: 'text.secondary' }}>
          {card.lastLead}:{' '}<DataAge age={card.lastAge} />
        </Typography>
      </Box>
    );
  } else if (card.kind === 'list') {
    content = (
      <Box sx={{ my: 'auto', display: 'flex', flexDirection: 'column', gap: 1.25 }}>
        {card.eyebrow && <Eyebrow>{card.eyebrow}</Eyebrow>}
        <Box role="list">
          {card.rows.map((r, i) => (
            <Box key={i} role="listitem" sx={{ display: 'flex', alignItems: 'center', gap: 1.25, py: 1.25, minHeight: 54, borderTop: i ? '1px solid' : 0, borderColor: 'divider' }}>
              <Box aria-hidden sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: toneDot(theme, r.tone), flexShrink: 0 }} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography component="p" sx={{ fontSize: 14, fontWeight: 700, lineHeight: 1.35, overflowWrap: 'break-word' }}>{r.name}</Typography>
                {r.detail && <Typography component="span" sx={{ display: 'block', fontSize: 13, fontWeight: 500, lineHeight: 1.35, color: 'text.secondary', mt: 0.25 }}>{r.detail}</Typography>}
              </Box>
              {r.value && (
                <Typography component="span" sx={{ fontFamily: HEAD, fontSize: 17, fontWeight: 800, whiteSpace: 'nowrap', color: toneColor(theme, r.tone), display: 'inline-flex', alignItems: 'center', gap: 0.25 }}>
                  {r.arrow === 'up' && <ArrowUpwardRoundedIcon sx={{ fontSize: 16 }} aria-hidden />}
                  {r.arrow === 'down' && <ArrowDownwardRoundedIcon sx={{ fontSize: 16 }} aria-hidden />}
                  {r.value}
                </Typography>
              )}
            </Box>
          ))}
        </Box>
        {card.text && <Body muted>{card.text}</Body>}
      </Box>
    );
  } else if (card.kind === 'crisis') {
    // Presença, não pânico: o mesmo recurso da tela de saúde mental (CVV 188 · SAMU 192).
    content = (
      <Box component="section" aria-label={card.call} sx={{ my: 'auto', p: 2, border: '1.5px solid', borderColor: (t) => alpha(t.palette.primary.main, 0.45), bgcolor: (t) => alpha(t.palette.primary.main, 0.08), borderRadius: '14px', display: 'flex', flexDirection: 'column', gap: 1.25 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.25 }}>
          <FavoriteIcon sx={{ fontSize: 20, color: (t) => tealText(t.palette.mode), mt: '2px' }} />
          <Typography component="p" sx={{ fontSize: 15, fontWeight: 700, lineHeight: 1.55 }}>{card.title}</Typography>
        </Box>
        <Body>{card.text}</Body>
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 1 }}>
          <Link href="tel:188" underline="none" sx={crisisLink}><PhoneInTalkIcon sx={{ fontSize: 20 }} />{card.call}</Link>
          <Link href="https://www.cvv.org.br/" target="_blank" rel="noopener noreferrer" underline="none" sx={crisisLink}><ChatBubbleOutlineIcon sx={{ fontSize: 20 }} />{card.chat}</Link>
        </Box>
        <Body muted>{card.urgent}</Body>
        <Body muted>{card.support}</Body>
      </Box>
    );
  } else if (card.kind === 'step') {
    content = (
      <>
        <Art go><ArrowForwardRoundedIcon sx={{ fontSize: 38 }} /></Art>
        <Box sx={{ my: 'auto', display: 'flex', flexDirection: 'column', gap: 1.25 }}>
          <Eyebrow>{translate('panorama.story.step_eyebrow')}</Eyebrow>
          <Title>{card.title}</Title>
          {card.text && <Body>{card.text}</Body>}
          <GradientButton fullWidth endIcon={<ArrowForwardRoundedIcon />} tabIndex={active ? 0 : -1} onClick={() => { onClose(); navigate(card.to); }} sx={{ mt: 0.5, '&:focus-visible': focusRing }}>
            {card.cta}
          </GradientButton>
          <Typography component="p" sx={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4, color: 'text.secondary', textAlign: 'center' }}>{translate('panorama.story.step_fine')}</Typography>
        </Box>
      </>
    );
  } else {
    content = (
      <>
        <Box aria-hidden sx={{ flex: 'none', display: 'flex', justifyContent: 'center', pt: 0.75, pb: 0.5 }}>
          <DrExame size={76} sx={{ borderRadius: '50%', border: '2px solid', borderColor: 'primary.main' }} />
        </Box>
        <Box sx={{ my: 'auto', display: 'flex', flexDirection: 'column', gap: 1.25 }}>
          <Eyebrow>{card.eyebrow}</Eyebrow>
          <Title>{card.title}</Title>
          <Body>{card.text}</Body>
          <GradientButton fullWidth endIcon={<ArrowForwardRoundedIcon />} tabIndex={active ? 0 : -1} onClick={onGenerate} sx={{ mt: 0.5, '&:focus-visible': focusRing }}>
            {generateLabel}
          </GradientButton>
          <Typography component="p" sx={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4, color: 'text.secondary', textAlign: 'center' }}>{translate('panorama.story.end_fine')}</Typography>
        </Box>
      </>
    );
  }

  return (
    <Box
      sx={{
        flex: 1, minWidth: 0, my: 0.5,
        bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: '20px',
        px: { xs: 2.25, md: 2.5 }, pt: 2.5, pb: 2.25,
        display: 'flex', flexDirection: 'column', gap: 1.25,
        // Sem altura fixa: se o texto aumentar (zoom, fonte grande), o cartão rola por dentro.
        overflowY: 'auto', overscrollBehaviorY: 'contain',
      }}
    >
      {content}
      {note && <Typography component="p" sx={{ mt: 'auto', pt: 1, fontSize: 13, fontWeight: 600, lineHeight: 1.4, color: 'text.secondary' }}>{translate('panorama.mind.screening')}</Typography>}
    </Box>
  );
};

const navBtn = (ghost: boolean): SxProps<Theme> => ({
  minHeight: 44, minWidth: 44, flexShrink: 0, px: ghost ? { xs: 1, sm: 1.25 } : { xs: 1.25, sm: 1.75 }, borderRadius: RADIUS.pill, textTransform: 'none',
  fontWeight: 800, fontSize: 14, whiteSpace: 'nowrap', '&:focus-visible': focusRing,
  '& .MuiButton-startIcon': { mx: 0 }, '& .MuiButton-endIcon': { ml: 0.5 },
  ...(ghost
    ? {
        color: (t: Theme) => tealText(t.palette.mode),
        '&:hover': { bgcolor: (t: Theme) => alpha('#0d9488', t.palette.mode === 'dark' ? 0.12 : 0.06) },
        '&.Mui-disabled': { color: 'text.secondary', opacity: 0.38 },
      }
    : {
        border: '1px solid',
        borderColor: (t: Theme) => alpha('#0d9488', t.palette.mode === 'dark' ? 0.4 : 0.35),
        color: (t: Theme) => tealText(t.palette.mode),
        bgcolor: (t: Theme) => alpha('#0d9488', t.palette.mode === 'dark' ? 0.08 : 0.04),
        '&:hover': { bgcolor: (t: Theme) => alpha('#0d9488', 0.12), borderColor: 'primary.main' },
      }),
});

// ───────────────────────── a folha de uma área ─────────────────────────
/** O conteúdo da folha. Remonta a cada troca de área (key), então sempre abre no 1º cartão. */
const StoryFrame = ({ area, index, total, onClose, onNextArea, onGenerate, generateLabel, navigate, titleId }: {
  area: AreaTileModel; index: number; total: number; onClose: () => void; onNextArea: () => void;
  onGenerate: () => void; generateLabel: string; navigate: (to: string) => void; titleId: string;
}) => {
  const translate = useTranslate();
  const theme = useTheme();
  const reduced = usePrefersReducedMotion();
  const countId = useId();
  const cards = area.story;
  const count = cards.length;
  const [card, setCard] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const booted = useRef(false);
  const dark = theme.palette.mode === 'dark';
  const lastCard = card >= count - 1;
  const isLastArea = index >= total - 1;

  // Leva a trilha até o cartão atual: instantâneo na abertura, suave ao navegar (sem animação com reduced-motion).
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollTo({ left: card * el.clientWidth, behavior: reduced || !booted.current ? 'auto' : 'smooth' });
    booted.current = true;
  }, [card, reduced]);

  // Girar o celular / redimensionar: realinha o cartão atual sem animação.
  useEffect(() => {
    const fix = () => {
      const el = trackRef.current;
      if (el) el.scrollTo({ left: card * el.clientWidth, behavior: 'auto' });
    };
    window.addEventListener('resize', fix);
    return () => window.removeEventListener('resize', fix);
  }, [card]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  // Depois que o dedo solta e a rolagem assenta, o cartão da frente vira o atual (NUNCA avança sozinho).
  const onScroll = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const el = trackRef.current;
      if (!el || !el.clientWidth) return;
      const i = Math.round(el.scrollLeft / el.clientWidth);
      if (i !== card) setCard(Math.max(0, Math.min(count - 1, i)));
    }, 120);
  };

  const goPrev = () => setCard((c) => Math.max(0, c - 1));
  const goNext = () => {
    if (!lastCard) setCard((c) => Math.min(count - 1, c + 1));
    else if (!isLastArea) onNextArea();
    else onClose();
  };
  // Esc fica com o próprio Modal do MUI (onClose); aqui só as setas.
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); goNext(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev(); }
  };

  return (
    <Box onKeyDown={onKeyDown} sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', pt: 'env(safe-area-inset-top)' }}>
      {/* Barra: fechar (44px) + progresso em segmentos, um por cartão. */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 1.25, pt: 1 }}>
        <IconButton onClick={onClose} aria-label={translate('panorama.story.close')} sx={{ width: 44, height: 44, flexShrink: 0, color: 'text.primary', '&:focus-visible': focusRing }}>
          <CloseOutlinedIcon sx={{ fontSize: 22 }} />
        </IconButton>
        <Box role="progressbar" aria-label={translate('panorama.story.progress')} aria-valuemin={1} aria-valuemax={count} aria-valuenow={card + 1} sx={{ flex: 1, display: 'flex', gap: 0.5 }}>
          {cards.map((_, i) => (
            <Box
              key={i}
              aria-hidden
              sx={{
                flex: 1, height: 4, borderRadius: '4px', overflow: 'hidden', position: 'relative',
                bgcolor: (t) => alpha(t.palette.text.primary, dark ? 0.22 : 0.28),
                '&::after': {
                  content: '""', position: 'absolute', inset: 0, bgcolor: 'primary.main', transformOrigin: 'left',
                  transform: i <= card ? 'scaleX(1)' : 'scaleX(0)',
                  transition: reduced ? 'none' : `transform .3s ${EASE}`,
                },
              }}
            />
          ))}
        </Box>
      </Box>

      {/* Nome da área + de quando é o dado + "área n de N". */}
      <Box sx={{ px: 2.25, pt: 0.25, pb: 1.25, display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 1, rowGap: 0 }}>
        <Typography component="h2" id={titleId} sx={{ fontFamily: HEAD, fontWeight: 700, fontSize: 17, lineHeight: 1.3 }}>
          {area.name}
        </Typography>
        {(area.whenLead || (area.whenJoin !== 'none' && ageText(area.age, translate))) && (
          <Typography component="span" sx={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3, color: 'text.secondary' }}>
            {area.whenLead}
            {area.whenLead && area.whenJoin !== 'none' && ageText(area.age, translate) ? (area.whenJoin === 'dot' ? ' · ' : ' ') : null}
            {area.whenJoin !== 'none' && <DataAge age={area.age} iso={area.asOf} />}
          </Typography>
        )}
        <Typography component="span" sx={{ ml: 'auto', fontSize: 13, fontWeight: 800, lineHeight: 1.3, color: (t) => tealText(t.palette.mode) }}>
          {translate('panorama.story.area_of', { n: index + 1, total })}
        </Typography>
      </Box>

      {/* Trilha: região rolável, focável e rotulada; cartões fora de vista ficam inertes. */}
      <Box
        ref={trackRef}
        role="region"
        tabIndex={0}
        aria-label={translate('panorama.story.region', { name: area.name, n: card + 1, total: count })}
        onScroll={onScroll}
        sx={{
          flex: 1, minHeight: 0, display: 'flex',
          overflowX: 'auto', overflowY: 'hidden', scrollSnapType: 'x mandatory', scrollbarWidth: 'none',
          '&::-webkit-scrollbar': { display: 'none' },
          '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2, borderRadius: '20px' },
        }}
      >
        {cards.map((c, i) => (
          <Box
            key={i}
            inert={i !== card}
            aria-hidden={i !== card}
            sx={{ flex: '0 0 100%', minWidth: 0, scrollSnapAlign: 'start', scrollSnapStop: 'always', display: 'flex', px: 1.75, pb: 1 }}
          >
            <StoryCardView card={c} area={area} active={i === card} onClose={onClose} onGenerate={onGenerate} generateLabel={generateLabel} navigate={navigate} />
          </Box>
        ))}
      </Box>

      {/* Rodapé: Anterior (fantasma — só o ícone no celular, como no esboço) · "cartão n de N" ·
          Próximo / Próxima área / Fechar. Os três ficam numa linha só em 360px. */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: { xs: 0.75, sm: 1.25 }, px: { xs: 1.25, sm: 1.75 }, pt: 1.25, pb: 'max(14px, env(safe-area-inset-bottom))' }}>
        <Button onClick={goPrev} disabled={card === 0} aria-label={translate('panorama.story.prev')} startIcon={<ArrowBackIosNewRoundedIcon />} sx={navBtn(true)}>
          <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>{translate('panorama.story.prev')}</Box>
        </Button>
        <Box id={countId} aria-live="polite" aria-atomic sx={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
          <Typography component="span" aria-hidden sx={{ fontSize: 13, fontWeight: 700, color: 'text.secondary', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
            {translate('panorama.story.count_short', { n: card + 1, total: count })}
          </Typography>
          <Typography component="span" sx={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)', whiteSpace: 'nowrap' }}>
            {translate('panorama.story.card_of', { n: card + 1, total: count })}
          </Typography>
        </Box>
        <Button onClick={goNext} endIcon={<ArrowForwardRoundedIcon />} sx={navBtn(false)}>
          {lastCard ? translate(isLastArea ? 'panorama.story.close' : 'panorama.story.next_area') : translate('panorama.story.next')}
        </Button>
      </Box>
    </Box>
  );
};

/**
 * StorySheet — o modo história: o detalhe de uma área, cartão por cartão.
 *
 * Celular: folha que ocupa a tela (MUI Drawer âncora inferior, o padrão dos bottom sheets do app).
 * Computador: caixa centrada (MUI Dialog). Manual em tudo — nunca avança sozinho (decisão do
 * dono): só swipe, botões de 44px, setas do teclado e Esc.
 * Acessibilidade: diálogo modal com título; cartões fora de vista ficam `inert` + `aria-hidden`
 * (fora da tabulação e do leitor de tela); a trilha é focável e rotulada ("Exames — cartão 2 de
 * 4"); o contador é anunciado (aria-live); respeita prefers-reduced-motion; o cartão não tem
 * altura fixa (rola se o texto aumentar).
 */
export const StorySheet = ({ tiles, areaIndex, onAreaChange, onClose, onGenerate, generateLabel, navigate }: StorySheetProps) => {
  const theme = useTheme();
  const desktop = useMediaQuery(theme.breakpoints.up('md'));
  const titleId = useId();
  const open = areaIndex != null && areaIndex >= 0 && areaIndex < tiles.length;

  // Durante a animação de saída a folha continua montada: guarda a última área aberta para o
  // conteúdo não sumir antes de ela deslizar para fora.
  const lastRef = useRef<{ index: number; area: AreaTileModel } | null>(null);
  if (open && tiles[areaIndex as number]) lastRef.current = { index: areaIndex as number, area: tiles[areaIndex as number] };
  const last = lastRef.current;
  const frame = last ? (
    <StoryFrame
      key={last.index}
      area={last.area}
      index={last.index}
      total={tiles.length}
      onClose={onClose}
      onNextArea={() => onAreaChange(Math.min(tiles.length - 1, last.index + 1))}
      onGenerate={onGenerate}
      generateLabel={generateLabel}
      navigate={navigate}
      titleId={titleId}
    />
  ) : null;

  if (desktop) {
    return (
      <Dialog
        open={open}
        onClose={onClose}
        aria-labelledby={titleId}
        slotProps={{
          paper: { sx: { display: 'flex', flexDirection: 'column', maxWidth: 440, width: '100%', height: 'min(780px, 92vh)', maxHeight: '92vh', m: 2, borderRadius: '24px', overflow: 'hidden', bgcolor: 'background.default' } },
          backdrop: { sx: { bgcolor: 'rgba(15,24,24,.55)' } },
        }}
      >
        {frame}
      </Dialog>
    );
  }

  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      slotProps={{
        paper: {
          role: 'dialog', 'aria-modal': true, 'aria-labelledby': titleId,
          sx: {
            display: 'flex', flexDirection: 'column', overflow: 'hidden', bgcolor: 'background.default',
            // Ocupa a tela (dvh respeita a barra do navegador; vh é o fallback).
            width: '100%', height: ['100vh', '100dvh'], maxWidth: 'none',
            borderTopLeftRadius: '20px', borderTopRightRadius: '20px',
            boxShadow: '0 -10px 40px -15px rgba(0,0,0,0.3)',
          },
        },
      }}
    >
      {frame}
    </Drawer>
  );
};
