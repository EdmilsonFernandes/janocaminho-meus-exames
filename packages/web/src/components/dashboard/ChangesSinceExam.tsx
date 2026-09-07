import { Stack, Typography, Box, Chip, Button } from '@mui/material';
import { alpha } from '@mui/material/styles';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { AppCard } from '../AppCard';
import { fmtNum } from '../../utils/format';

/**
 * Marker — recorte mínimo de um marcador vindo do health-summary (topAttention / improving).
 * Mantido aqui (e exportado) pra Dashboard V2 e Meus Exames compartilharem o mesmo shape.
 */
export interface Marker {
  name: string;
  nameCanonical?: string; // chave de agrupamento (guards de dedupe) — opcional: fontes antigas só trazem name
  unit?: string;
  latest?: { valueNumeric?: number | null };
  refHigh?: number | null;
  refLow?: number | null;
  flag?: string;
}

const flagDir = (m: Marker, isImproved = false) => {
  const v = m.latest?.valueNumeric;
  if (v != null && m.refHigh != null && v > m.refHigh) return '↑';
  if (v != null && m.refLow != null && v < m.refLow) return '↓';
  if (isImproved) return '↓';
  return m.flag === 'HIGH' ? '↑' : m.flag === 'LOW' ? '↓' : '•';
};
const fmtMarker = (m: Marker) =>
  m.latest?.valueNumeric != null ? `${fmtNum(m.latest.valueNumeric)}${m.unit ? ' ' + m.unit : ''}` : '—';

/**
 * ChangesSinceExam — "Desde seu último exame": o que piorou (topAttention) e o que melhorou.
 *
 * Primitiva compartilhada (Dashboard V2 + Meus Exames). Dados vêm do `/patients/:id/health-summary`
 * (campos `topAttention` / `improving`) — NÃO há cálculo clínico aqui; só apresentação.
 */
export const ChangesSinceExam = ({
  worsened,
  improved,
  onView,
  loaded,
  title = 'O que mudou nos seus exames',
  ctaLabel = 'Ver evolução completa',
}: {
  worsened: Marker[];
  improved: Marker[];
  onView: () => void;
  loaded: boolean;
  title?: string;
  ctaLabel?: string;
}) => {
  if (loaded && worsened.length === 0 && improved.length === 0) return null;
  const worsenedNames = new Set(worsened.map((m) => (m.nameCanonical || m.name).toUpperCase()));
  const improvedUnique = improved.filter((m) => !worsenedNames.has((m.nameCanonical || m.name).toUpperCase()));
  return (
    <AppCard kind="default" sx={{ p: { xs: 2, md: 2.5 }, height: '100%' }}>
      <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</Typography>
      <Stack direction="row" spacing={1.5} sx={{ mt: 1, mb: 1.5, flexWrap: 'wrap', rowGap: 0.5 }}>
        {worsened.length > 0 && (
          <Chip
            size="small"
            icon={<TrendingUpIcon />}
            label={`${worsened.length} ${worsened.length === 1 ? 'piorou' : 'pioraram'}`}
            sx={{
              bgcolor: alpha('#dc2626', 0.12),
              color: '#b91c1c',
              fontWeight: 800,
              borderRadius: '8px',
              animation: 'dxSpringChip 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
              '@keyframes dxSpringChip': {
                '0%': { transform: 'scale(0.8)', opacity: 0 },
                '100%': { transform: 'scale(1)', opacity: 1 },
              },
            }}
          />
        )}
        {improvedUnique.length > 0 && (
          <Chip
            size="small"
            icon={<TrendingDownIcon />}
            label={`${improvedUnique.length} ${improvedUnique.length === 1 ? 'melhorou' : 'melhoraram'}`}
            sx={{
              bgcolor: alpha('#047857', 0.12),
              color: '#047857',
              fontWeight: 800,
              borderRadius: '8px',
              animation: 'dxSpringChip 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) 0.1s both',
            }}
          />
        )}
        {worsened.length === 0 && improved.length === 0 && <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>Carregando…</Typography>}
      </Stack>
      <Stack spacing={1.2}>
        {worsened.slice(0, 3).map((m, i) => (
          <Box
            key={`w${i}`}
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              p: '6px 10px',
              borderRadius: '10px',
              bgcolor: alpha('#dc2626', 0.04),
              borderLeft: '3px solid #dc2626',
              animation: `dxMarkerIn .3s ease ${i * 0.06}s both`,
              '@keyframes dxMarkerIn': { from: { opacity: 0, transform: 'translateX(-8px)' }, to: { opacity: 1, transform: 'none' } },
            }}
          >
            <Typography sx={{ fontSize: 13.5, color: 'text.primary', fontWeight: 600 }}>
              <Box component="span" sx={{ color: '#dc2626', mr: 0.75, fontWeight: 800 }}>{flagDir(m, false)}</Box>
              {m.name}
            </Typography>
            <Typography sx={{ fontSize: 13, color: 'text.secondary', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtMarker(m)}</Typography>
          </Box>
        ))}

        {worsened.length > 0 && improvedUnique.length > 0 && (
          <Box sx={{ borderBottom: '1px dashed', borderColor: 'divider', my: 0.5 }} />
        )}

        {improvedUnique.slice(0, 3).map((m, i) => (
          <Box
            key={`i${i}`}
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              p: '6px 10px',
              borderRadius: '10px',
              bgcolor: alpha('#047857', 0.04),
              borderLeft: '3px solid #047857',
              animation: `dxMarkerIn .3s ease ${(worsened.length + i) * 0.06}s both`,
            }}
          >
            <Typography sx={{ fontSize: 13.5, color: 'text.primary', fontWeight: 600 }}>
              <Box component="span" sx={{ color: '#047857', mr: 0.75, fontWeight: 800 }}>{flagDir(m, true)}</Box>
              {m.name}
            </Typography>
            <Typography sx={{ fontSize: 13, color: 'text.secondary', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtMarker(m)}</Typography>
          </Box>
        ))}
      </Stack>
      <Box sx={{ mt: 1.5 }}>
        <Button variant="text" onClick={onView} endIcon={<ArrowForwardIcon />} sx={{ p: 0, px: 0.5, minHeight: 36, alignSelf: 'flex-start', textTransform: 'none', fontWeight: 800, color: 'primary.main', '&:hover': { bgcolor: 'rgba(32,178,170,.08)' } }}>{ctaLabel}</Button>
      </Box>
    </AppCard>
  );
};
