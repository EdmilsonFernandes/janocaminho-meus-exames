import { Box, Typography } from '@mui/material';
import { fmtDateShort, timeAgo } from '../utils/format';

/**
 * DateLabel — data absoluta + relativa ("04 ago 2026 · há 9 dias").
 *
 * Primitiva canônica de data do design-system. Substitui o padrão de chamar `fmtDateShort`
 * isolado (só absoluto) e o helper `timeAgo` que vivia duplicado em ~5 telas. Em saúde, a data
 * é informação crítica (§11): a absoluta precisa estar sempre presente; a relativa complementa.
 *
 * - `relative=false` → só a absoluta.
 * - Sem data → renderiza `fallback` (ex.: "Data não identificada") ou nada.
 * - A parte absoluta vem em peso primário; a relativa, mais sutil.
 */
export const DateLabel = ({
  date,
  relative = true,
  fallback,
  sx,
}: {
  date?: string | Date | null;
  relative?: boolean;
  fallback?: string;
  sx?: object;
}) => {
  if (!date) {
    return fallback ? (
      <Typography component="span" variant="caption" sx={{ color: 'text.secondary', ...(sx as object) }}>{fallback}</Typography>
    ) : null;
  }
  const rel = relative ? timeAgo(date) : '';
  return (
    <Typography component="span" variant="caption" sx={{ color: 'text.secondary', lineHeight: 1, ...(sx as object) }}>
      <Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>{fmtDateShort(date)}</Box>
      {rel ? <Box component="span" sx={{ ml: 0.5 }}>· {rel}</Box> : null}
    </Typography>
  );
};
