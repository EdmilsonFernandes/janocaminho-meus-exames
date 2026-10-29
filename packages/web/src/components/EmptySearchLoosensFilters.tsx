// Lucian UX/UI Prompt #092 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#092
// Portado do elemento "Empty search that loosens filters": lupa varrendo estentes +
// botões que oferecem remover um filtro com a contagem que a remoção traria.
// Adaptações: sem a barra de busca/grid do elemento (a tela "Encontrar especialistas"
// já tem filtros próprios); footprint fixo 340×480 → fluido max-width 360; cores
// --ux-* mapeadas pros tokens teal/cobre do Dr. Exame (dark via useTheme).
import { useRef } from 'react';
import { Box, Button, Typography, useTheme } from '@mui/material';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { tealText } from '../theme';

export interface LooseFilterOption {
  /** Nome curto do filtro que será riscado (ex.: cidade digitada, especialidade). */
  label: string;
  /** Quantos resultados existem no diretório sem este filtro (payload atual). */
  count: number;
  /** Limpa o filtro correspondente no estado da tela (dispara re-busca). */
  onRemove: () => void;
}

export interface EmptySearchAction {
  label: string;
  onClick: () => void;
  primary?: boolean;
}

const SPRING = 'cubic-bezier(.34,1.45,.64,1)';

/**
 * Estado vazio inteligente para busca com filtros ativos. Se `options` tem itens,
 * cada botão risca um filtro e mostra quantos resultados a remoção traria (padrão
 * #092). `actions` renderiza pills secundárias (CTA da jornada) no estilo `.pop`.
 */
export const EmptySearchLoosensFilters = ({ query, note, options, actions = [] }: {
  query: string;
  note: string;
  options: LooseFilterOption[];
  actions?: EmptySearchAction[];
}) => {
  const t = useTheme();
  const dark = t.palette.mode === 'dark';
  const rootRef = useRef<HTMLDivElement>(null);
  const accent = tealText(t.palette.mode);
  const surface2 = dark ? 'rgba(255,255,255,0.05)' : '#f0f7f6';
  const surface3 = dark ? 'rgba(255,255,255,0.10)' : '#e2efed';
  const danger = dark ? '#f87171' : '#dc2626';

  const removeFilter = (opt: LooseFilterOption) => {
    // Foco morreria com o botão — devolve pro container (tabIndex -1) como no original.
    if (rootRef.current?.contains(document.activeElement)) {
      rootRef.current.focus({ preventScroll: true });
    }
    opt.onRemove();
  };

  const title = query
    ? `Nenhum “${query}” com estes filtros`
    : options.length ? 'Nada com estes filtros' : 'Nenhum especialista encontrado';

  return (
    <Box
      ref={rootRef}
      tabIndex={-1}
      sx={{
        outline: 'none',
        display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
        width: '100%', maxWidth: 360, mx: 'auto',
        '@keyframes lucian092scan': {
          '0%,100%': { transform: 'translate(0px, 0px) rotate(0deg)' },
          '25%': { transform: 'translate(46px, 10px) rotate(8deg)' },
          '50%': { transform: 'translate(78px, -4px) rotate(-4deg)' },
          '75%': { transform: 'translate(30px, -8px) rotate(-10deg)' },
        },
        '@keyframes lucian092up': {
          from: { opacity: 0, transform: 'translateY(14px) scale(0.95)' },
        },
      }}
    >
      {/* Lupa varrendo as estantes — motion values originais: 3.6s ease-in-out infinite */}
      <Box component="svg" viewBox="0 0 150 92" aria-hidden="true"
        sx={{ width: 150, height: 92, overflow: 'visible', flexShrink: 0 }}>
        <Box component="path" d="M8 30h134M8 56h134M8 82h134"
          sx={{ fill: 'none', stroke: 'divider', strokeWidth: 3, strokeLinecap: 'round', strokeDasharray: '2 9' }} />
        <Box component="g" sx={{ animation: 'lucian092scan 3.6s ease-in-out infinite' }}>
          <Box component="circle" cx={34} cy={38} r={20}
            sx={{ fill: 'rgba(32,178,170,0.12)', stroke: 'text.primary', strokeWidth: 5 }} />
          <Box component="path" d="M24 30a12 12 0 0 1 8-5"
            sx={{ fill: 'none', stroke: '#fff', strokeOpacity: 0.7, strokeWidth: 3 }} />
          <Box component="path" d="M48 52l14 14"
            sx={{ fill: 'none', stroke: 'text.primary', strokeWidth: 7, strokeLinecap: 'round' }} />
        </Box>
      </Box>

      <Typography sx={{
        mt: '10px', fontSize: '16.5px', fontWeight: 800, letterSpacing: '-0.035em',
        fontFamily: '"Poppins",sans-serif', color: 'text.primary',
      }}>{title}</Typography>
      <Typography sx={{
        mt: '4px', fontSize: 12.5, fontWeight: 600, color: 'text.secondary',
        maxWidth: 320,
      }}>{note}</Typography>

      {/* Sugestões: risca um filtro + contagem que a remoção traria (stagger 80ms) */}
      {options.length > 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%', mt: '14px' }}>
          {options.map((o, i) => (
            <Button
              key={o.label}
              fullWidth
              onClick={() => removeFilter(o)}
              aria-label={`Remover filtro ${o.label}: ${o.count} ${o.count === 1 ? 'resultado' : 'resultados'}`}
              disableRipple
              sx={{
                display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
                height: 46, minHeight: 46, px: '12px', pl: '8px', borderRadius: '14px',
                bgcolor: surface2, color: 'text.secondary',
                fontSize: 13, fontWeight: 700, justifyContent: 'flex-start',
                textTransform: 'none',
                animation: `lucian092up .45s ${SPRING} backwards`,
                animationDelay: `${i * 80 + 100}ms`,
                transition: `background-color .2s, transform .3s ${SPRING}`,
                '&:hover': { bgcolor: surface3, color: 'text.primary', transform: 'none',
                  '& .lucian092-arrow': { transform: 'translateX(3px)' } },
                '&:active': { transform: 'scale(0.97)' },
                '&:focus-visible': { outline: `2px solid ${dark ? '#5fc9c3' : '#20b2aa'}`, outlineOffset: 3 },
              }}
            >
              <Box component="s"
                sx={{
                  height: 28, px: '10px', borderRadius: '999px', display: 'inline-flex',
                  alignItems: 'center', flexShrink: 0,
                  bgcolor: 'background.paper', boxShadow: `inset 0 0 0 1px ${dark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.17)'}`,
                  textDecoration: 'line-through', textDecorationColor: danger,
                  fontSize: 12.5, fontWeight: 700, color: 'text.primary',
                  maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{o.label}</Box>
              <Box component="span" sx={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                <Box component="b" sx={{ color: accent, fontWeight: 800 }}>
                  {o.count} {o.count === 1 ? 'resultado' : 'resultados'}
                </Box>{' '}no diretório
              </Box>
              <ArrowForwardRoundedIcon className="lucian092-arrow"
                sx={{ width: 15, height: 15, flexShrink: 0, transition: `transform .3s ${SPRING}` }} />
            </Button>
          ))}
        </Box>
      )}

      {/* Pills `.pop` do elemento: ações secundárias da jornada */}
      {actions.length > 0 && (
        <Box sx={{
          display: 'flex', flexDirection: 'row', justifyContent: 'center',
          flexWrap: 'wrap', gap: '6px', width: '100%', mt: '14px',
        }}>
          {actions.map((a, i) => (
            <Button
              key={a.label}
              variant={a.primary ? 'contained' : 'outlined'}
              onClick={a.onClick}
              sx={{
                minHeight: 44, px: '14px', borderRadius: '999px', textTransform: 'none',
                fontWeight: 800, fontSize: 13,
                animation: `lucian092up .45s ${SPRING} backwards`,
                animationDelay: `${(options.length + i) * 80 + 150}ms`,
                ...(!a.primary && {
                  borderColor: 'rgba(32,178,170,0.5)',
                  color: dark ? '#5fc9c3' : '#0f766e',
                  '&:hover': { borderColor: dark ? '#5fc9c3' : '#178f89', bgcolor: 'rgba(32,178,170,0.08)' },
                }),
              }}
            >{a.label}</Button>
          ))}
        </Box>
      )}
    </Box>
  );
};
