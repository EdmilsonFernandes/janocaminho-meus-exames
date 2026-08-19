import { Stack, Typography, Box, Chip, Button } from '@mui/material';
import { alpha } from '@mui/material/styles';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { AppCard } from '../AppCard';

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

const flagDir = (m: Marker) => {
  const v = m.latest?.valueNumeric;
  if (v != null && m.refHigh != null && v > m.refHigh) return '↑';
  if (v != null && m.refLow != null && v < m.refLow) return '↓';
  return m.flag === 'HIGH' ? '↑' : m.flag === 'LOW' ? '↓' : '•';
};
const fmtMarker = (m: Marker) =>
  m.latest?.valueNumeric != null ? `${m.latest.valueNumeric}${m.unit ? ' ' + m.unit : ''}` : '—';

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
  title = 'Desde seu último exame',
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
  // GUARDA anti-duplicação: um marcador nunca aparece nas duas listas (piorou × melhorou são
  // excludentes por tendência, mas blindamos o render — defesa em profundidade p/ qualquer fonte).
  const worsenedNames = new Set(worsened.map((m) => (m.nameCanonical || m.name).toUpperCase()));
  const improvedUnique = improved.filter((m) => !worsenedNames.has((m.nameCanonical || m.name).toUpperCase()));
  return (
    <AppCard kind="default" sx={{ p: { xs: 2, md: 2.5 }, height: '100%' }}>
      <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'text.secondary' }}>{title}</Typography>
      <Stack direction="row" spacing={2} sx={{ mt: 1, mb: 1.5, flexWrap: 'wrap', rowGap: 0.5 }}>
        {worsened.length > 0 && <Chip size="small" icon={<TrendingUpIcon />} label={`${worsened.length} ${worsened.length === 1 ? 'piorou' : 'pioraram'}`} sx={{ bgcolor: alpha('#dc2626', 0.12), color: '#b91c1c', fontWeight: 700 }} />}
        {improvedUnique.length > 0 && <Chip size="small" icon={<TrendingDownIcon />} label={`${improvedUnique.length} ${improvedUnique.length === 1 ? 'melhorou' : 'melhoraram'}`} sx={{ bgcolor: alpha('#047857', 0.12), color: '#047857', fontWeight: 700 }} />}
        {worsened.length === 0 && improved.length === 0 && <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>Carregando…</Typography>}
      </Stack>
      <Stack spacing={1.1}>
        {worsened.slice(0, 3).map((m, i) => (
          <Stack key={`w${i}`} direction="row" justifyContent="space-between" alignItems="baseline">
            <Typography sx={{ fontSize: 13.5, color: 'text.primary', fontWeight: 600 }}><Box component="span" sx={{ color: '#b91c1c', mr: 0.5 }}>{flagDir(m)}</Box>{m.name}</Typography>
            <Typography sx={{ fontSize: 13, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>{fmtMarker(m)}</Typography>
          </Stack>
        ))}
        {improvedUnique.slice(0, 2).map((m, i) => (
          <Stack key={`i${i}`} direction="row" justifyContent="space-between" alignItems="baseline">
            <Typography sx={{ fontSize: 13.5, color: 'text.primary', fontWeight: 600 }}><Box component="span" sx={{ color: '#047857', mr: 0.5 }}>{flagDir(m)}</Box>{m.name}</Typography>
            <Typography sx={{ fontSize: 13, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>{fmtMarker(m)}</Typography>
          </Stack>
        ))}
      </Stack>
      <Box sx={{ mt: 1.5 }}>
        {/* CTA SECUNDÁRIO do par de cards do hero: a ação primária é o "Ver análise" do
            ExamHero — aqui é link discreto (teal, sem fundo). Antes: GradientButton com
            variant="text" (que vencia o contained interno) = gradiente cru em cima de um
            botão text → bloco verde "cortante" (feedback do dono). */}
        <Button variant="text" onClick={onView} endIcon={<ArrowForwardIcon />} sx={{ p: 0, px: 0.5, minHeight: 40, alignSelf: 'flex-start', textTransform: 'none', fontWeight: 800, color: 'primary.dark', '&:hover': { bgcolor: 'rgba(32,178,170,.08)' } }}>{ctaLabel}</Button>
      </Box>
    </AppCard>
  );
};
