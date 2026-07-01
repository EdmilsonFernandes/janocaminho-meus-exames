import { Box, Stack, Typography, Chip } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { NameToggle } from '../HealthSummary';
import { ExplainButton } from '../ExplainItem';

// Mesmo parser numérico do HealthSummary (vírgula decimal, separador de milhar).
const num = (s?: string | null): number | null => {
  if (!s) return null;
  const m = String(s).replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.').match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
};

const Variation = ({ anterior, atual, leitura }: { anterior?: string | null; atual?: string | null; leitura?: string | null }) => {
  const a = num(anterior), b = num(atual);
  if (a != null && b != null) {
    const d = b - a;
    if (Math.abs(d) < 1e-9) return <Chip size="small" label="estável" sx={{ bgcolor: 'action.hover', color: 'text.secondary' }} />;
    const up = d > 0;
    const cor = leitura?.toLowerCase().includes('aten') ? '#e65100' : up ? '#1565c0' : '#2e7d32';
    return <Chip size="small" sx={{ bgcolor: alpha(cor, 0.09), color: cor, fontWeight: 700 }} label={`${up ? '↑' : '↓'} ${d > 0 ? '+' : ''}${Number(d.toFixed(2))}`} />;
  }
  if (leitura) return <Chip size="small" variant="outlined" label={leitura} sx={{ fontSize: 12, maxWidth: 170 }} />;
  return null;
};

/** Item em destaque (comparativo): nome (NameToggle) + anterior → atual + variação + explicar. */
export const DestaqueCard = ({ c }: { c: { name: string; anterior?: string | null; atual?: string | null; leitura?: string | null; entenda?: string | null } }) => (
  <Box sx={{ p: 1.5, height: '100%', borderRadius: '12px', bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
    <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={1}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <NameToggle name={c.name} entenda={c.entenda} />
        <Stack direction="row" spacing={0.75} alignItems="baseline" sx={{ mt: 0.5 }} flexWrap="wrap" useFlexGap>
          <Typography variant="body2" color="text.secondary" sx={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{c.anterior || '—'}</Typography>
          <Typography sx={{ fontWeight: 800, color: 'primary.main' }}>→</Typography>
          <Typography sx={(t) => ({ fontWeight: 800, color: t.palette.mode === 'dark' ? '#5b9bd5' : '#0b5cab', wordBreak: 'break-word', overflowWrap: 'anywhere' })}>{c.atual || '—'}</Typography>
        </Stack>
      </Box>
      <Stack direction="column" alignItems="flex-end" spacing={0.5} sx={{ flexShrink: 0 }}>
        <Variation anterior={c.anterior} atual={c.atual} leitura={c.leitura} />
        <ExplainButton name={c.name} />
      </Stack>
    </Stack>
  </Box>
);
