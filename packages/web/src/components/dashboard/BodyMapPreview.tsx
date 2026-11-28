import { useState, type ReactNode } from 'react';
import { Box, Collapse, Stack, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import { AppCard } from '../AppCard';
import { SEM } from '../../theme';
import type { BodyRegionView, RegionLevel } from '../BodyMap';

/**
 * MAPA DO CORPO RECOLHIDO (28/11/26, pedido do dono: "um texto jogado não é premium").
 *
 * No celular o mapa inteiro ocupa quase duas telas, então ele começa fechado — mas fechado ele
 * já MOSTRA o corpo: cada sistema vira uma "pedra" com o símbolo e um anel na cor do estado,
 * os que pedem cuidado primeiro, e um placar curto (quantos na faixa, em atenção, fora). Tocar
 * numa pedra ou em "Abrir mapa" abre o mapa completo ali mesmo. Referências: Apple Saúde
 * (Resumo por categorias) e Samsung Health (cartões de sistema com estado em anel).
 * Estado sempre em palavra + cor (o placar) — o anel sozinho nunca é o único sinal.
 */
const ORDER: Record<RegionLevel, number> = { alterado: 0, atencao: 1, ok: 2, desatualizado: 3, sem_dados: 4 };
const MAX_PEBBLES = 5; // + a pedra "+N" = 6 colunas fixas: com 2 sistemas eles não se espalham

const short = (label: string) => (label || '').split('&')[0].split(' e ')[0].split('(')[0].trim();

export const BodyMapPreview = ({ regions, loaded, children }: { regions: BodyRegionView[] | null; loaded: boolean; children: ReactNode }) => {
  const t = useTheme();
  const dark = t.palette.mode === 'dark';
  const [open, setOpen] = useState(false);
  const list = (regions ?? []).filter((r) => r.level !== 'sem_dados');
  const sorted = [...list].sort((a, b) => ORDER[a.level] - ORDER[b.level]);
  const shown = sorted.slice(0, MAX_PEBBLES);
  const rest = sorted.length - shown.length;
  const nAlt = list.filter((r) => r.level === 'alterado').length;
  const nAtn = list.filter((r) => r.level === 'atencao').length;
  const nOk = list.filter((r) => r.level === 'ok').length;
  const color = (l: RegionLevel) =>
    l === 'ok' ? SEM.ok[dark ? 'dark' : 'light']
      : l === 'atencao' ? SEM.warn[dark ? 'dark' : 'light']
        : l === 'alterado' ? SEM.bad[dark ? 'dark' : 'light']
          : t.palette.text.secondary;
  const headline = !loaded ? 'Carregando seus sistemas…'
    : list.length === 0 ? 'Envie um exame para ver seus órgãos'
      : nAlt + nAtn === 0 ? `${list.length} sistemas, todos na faixa`
        : `${nAlt + nAtn} ${nAlt + nAtn === 1 ? 'sistema pede' : 'sistemas pedem'} cuidado`;
  const toggle = () => setOpen((v) => !v);

  return (
    <AppCard sx={{ p: 0, overflow: 'hidden', position: 'relative' }}>
      {/* brilho teal de fundo, só decorativo */}
      <Box aria-hidden sx={{
        position: 'absolute', top: -90, right: -70, width: 220, height: 220, borderRadius: '50%', pointerEvents: 'none',
        background: `radial-gradient(circle, ${alpha('#20b2aa', dark ? 0.18 : 0.12)} 0%, transparent 70%)`,
      }} />
      <Box sx={{ position: 'relative', px: 2, pt: 2, pb: open ? 1 : 2 }}>
        <Stack direction="row" alignItems="flex-start" spacing={1.5}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography component="h3" sx={{ fontFamily: 'Poppins, sans-serif', fontWeight: 800, fontSize: 17, lineHeight: 1.25 }}>
              Mapa do seu corpo
            </Typography>
            <Typography sx={{ fontSize: 13.5, fontWeight: 600, mt: 0.25, lineHeight: 1.35,
              color: loaded && nAlt + nAtn > 0 ? color(nAlt ? 'alterado' : 'atencao') : 'text.secondary' }}>
              {headline}
            </Typography>
          </Box>
        </Stack>

        {loaded && list.length > 0 && (
          <>
            {/* Pedras dos sistemas — piores primeiro */}
            <Stack direction="row" sx={{ mt: 2, gap: 1 }}>
              {shown.map((r) => {
                const c = color(r.level);
                return (
                  <Box key={r.key} component="button" type="button" onClick={() => setOpen(true)}
                    aria-label={`${r.label}: ${r.level === 'ok' ? 'na faixa' : r.level === 'atencao' ? 'atenção' : r.level === 'alterado' ? 'fora da faixa' : 'exame antigo'}. Abrir mapa`}
                    sx={{
                      flex: '0 0 calc((100% - 40px) / 6)', minWidth: 0, border: 0, bgcolor: 'transparent', p: 0, font: 'inherit', color: 'inherit', cursor: 'pointer',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.75, WebkitTapHighlightColor: 'transparent',
                      '&:active > span:first-of-type': { transform: 'scale(.94)' },
                      '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2, borderRadius: '12px' },
                    }}>
                    <Box component="span" sx={{
                      width: 48, height: 48, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 22, lineHeight: 1,
                      bgcolor: alpha(c, dark ? 0.16 : 0.08),
                      boxShadow: `inset 0 0 0 2.5px ${r.level === 'desatualizado' ? alpha(c, 0.4) : c}`,
                      ...(r.level === 'desatualizado' ? { outline: `2px dashed ${alpha(c, 0.5)}`, outlineOffset: -2.5, boxShadow: 'none' } : {}),
                      transition: 'transform .12s ease',
                    }}>
                      {r.emoji}
                    </Box>
                    <Typography component="span" noWrap sx={{ fontSize: 12, fontWeight: 600, color: 'text.secondary', maxWidth: '100%' }}>
                      {short(r.label)}
                    </Typography>
                  </Box>
                );
              })}
              {rest > 0 && (
                <Box component="button" type="button" onClick={() => setOpen(true)} aria-label={`Mais ${rest} sistemas. Abrir mapa`}
                  sx={{ flex: '0 0 calc((100% - 40px) / 6)', minWidth: 0, border: 0, bgcolor: 'transparent', p: 0, font: 'inherit', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.75 }}>
                  <Box component="span" sx={{ width: 48, height: 48, borderRadius: '50%', display: 'grid', placeItems: 'center', fontFamily: 'Poppins, sans-serif', fontWeight: 700, fontSize: 15, color: 'text.secondary', border: '1.5px dashed', borderColor: 'divider' }}>
                    +{rest}
                  </Box>
                  <Typography component="span" sx={{ fontSize: 12, fontWeight: 600, color: 'text.secondary' }}>mais</Typography>
                </Box>
              )}
            </Stack>

            {/* Placar em palavras (o anel nunca é o único sinal) */}
            <Stack direction="row" spacing={2} useFlexGap flexWrap="wrap" sx={{ mt: 2 }}>
              {[
                { n: nOk, l: 'na faixa', lv: 'ok' as RegionLevel },
                { n: nAtn, l: 'atenção', lv: 'atencao' as RegionLevel },
                { n: nAlt, l: 'fora', lv: 'alterado' as RegionLevel },
              ].filter((x) => x.n > 0).map((x) => (
                <Stack key={x.l} direction="row" alignItems="center" spacing={0.75}>
                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: color(x.lv) }} />
                  <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'text.secondary' }}>
                    <Box component="b" sx={{ color: 'text.primary', fontVariantNumeric: 'tabular-nums' }}>{x.n}</Box> {x.l}
                  </Typography>
                </Stack>
              ))}
            </Stack>
          </>
        )}

        <Box component="button" type="button" onClick={toggle} aria-expanded={open}
          sx={{
            mt: 2, width: '100%', minHeight: 44, borderRadius: '12px', cursor: 'pointer', font: 'inherit',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5,
            fontSize: 14, fontWeight: 700, color: SEM.tealDeep[dark ? 'dark' : 'light'],
            border: '1px solid', borderColor: alpha('#20b2aa', 0.35), bgcolor: alpha('#20b2aa', dark ? 0.1 : 0.05),
            '&:active': { bgcolor: alpha('#20b2aa', 0.14) },
            '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
          }}>
          {open ? 'Recolher mapa' : 'Abrir mapa completo'}
          <ExpandMoreRoundedIcon sx={{ fontSize: 20, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s ease' }} />
        </Box>
      </Box>
      <Collapse in={open} unmountOnExit>
        <Box sx={{ px: 1, pb: 1 }}>{children}</Box>
      </Collapse>
    </AppCard>
  );
};
