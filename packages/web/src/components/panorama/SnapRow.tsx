import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Box, Stack, useMediaQuery, useTheme } from '@mui/material';
import { alpha } from '@mui/material/styles';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import { useSnapCarousel } from '../../hooks/useSnapCarousel';
import { RADIUS } from '../../theme';

/**
 * SnapRow — a fileira de "O que mudou".
 *
 * Celular: carrossel de rolagem com snap (arrasta de lado) e bolinhas, movido pelo hook que o app
 * já usa (`useSnapCarousel`: pausa no toque, no foco e com a aba oculta; não anda sozinho com
 * prefers-reduced-motion). Computador: os mesmos cartões empilhados, sem carrossel.
 * Estado vazio: UMA faixa discreta — nenhum cartão fantasma para preencher a fileira.
 */
export const SnapRow = ({ items, label, emptyText }: { items: ReactNode[]; label: string; emptyText: ReactNode }) => {
  const theme = useTheme();
  const stacked = useMediaQuery(theme.breakpoints.up('md'));
  const ref = useRef<HTMLDivElement>(null);
  const { dragHandlers, dragSx } = useSnapCarousel(ref);
  const [active, setActive] = useState(0);
  const timer = useRef<number | undefined>(undefined);
  const count = items.length;

  useEffect(() => () => window.clearTimeout(timer.current), []);

  // Depois que a rolagem assenta, descobre qual cartão está na frente e acende a bolinha.
  const onScroll = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const el = ref.current;
      const first = el?.firstElementChild as HTMLElement | null;
      if (!el || !first) return;
      const gap = parseFloat(getComputedStyle(el).columnGap || '12') || 12;
      const i = Math.round(el.scrollLeft / Math.max(1, first.getBoundingClientRect().width + gap));
      setActive(Math.max(0, Math.min(count - 1, i)));
    }, 80);
  };

  if (!count) {
    return (
      <Box
        role="status"
        sx={{
          display: 'flex', alignItems: 'center', gap: 1.25, p: '14px 16px', minHeight: 56,
          border: '1px dashed', borderColor: (t) => alpha(t.palette.text.primary, 0.28), borderRadius: RADIUS.card,
          color: 'text.secondary', fontSize: 14, lineHeight: 1.45,
        }}
      >
        <HistoryOutlinedIcon sx={{ fontSize: 20, flexShrink: 0 }} />
        {emptyText}
      </Box>
    );
  }

  if (stacked) return <Stack spacing={1}>{items}</Stack>;

  return (
    <Box>
      <Box
        ref={ref}
        role="region"
        aria-label={label}
        onScroll={onScroll}
        {...dragHandlers}
        sx={{
          ...dragSx,
          display: 'flex', gap: 1.5, overflowX: 'auto', overflowY: 'hidden',
          scrollSnapType: 'x mandatory', scrollbarWidth: 'none',
          px: 0.25, mx: -0.25, pb: 1,
          '&::-webkit-scrollbar': { display: 'none' },
        }}
      >
        {items}
      </Box>
      {count > 1 && (
        <Box aria-hidden sx={{ display: 'flex', justifyContent: 'center', gap: 0.625, mt: 0.25, mb: 0.5 }}>
          {items.map((_, i) => (
            <Box
              key={i}
              sx={{
                width: i === active ? 16 : 6, height: 6, borderRadius: 3,
                bgcolor: i === active ? 'primary.main' : (t) => alpha(t.palette.text.primary, 0.22),
                transition: 'width .25s cubic-bezier(.22,1,.36,1)',
                '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
              }}
            />
          ))}
        </Box>
      )}
    </Box>
  );
};
