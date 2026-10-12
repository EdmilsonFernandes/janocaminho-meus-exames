import { Box, Stack, Typography, Chip } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { NameToggle } from '../HealthSummary';
import { ExplainButton } from '../ExplainItem';
import { tealText } from '../../theme';

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
    const cor = leitura?.toLowerCase().includes('aten') ? '#c2410c' : up ? '#0369a1' : '#047857';
    return <Chip size="small" sx={{ bgcolor: alpha(cor, 0.09), color: cor, fontWeight: 700 }} label={`${up ? '↑' : '↓'} ${d > 0 ? '+' : ''}${Number(d.toFixed(2))}`} />;
  }
  if (leitura) return <Chip size="small" variant="outlined" label={leitura} sx={{ fontSize: 12, maxWidth: 170 }} />;
  return null;
};

const prettyName = (n: string) => {
  if (!n) return '';
  const tokens = n.split(/[_\s]+/);
  return tokens.map((tok) => {
    if (tok.length <= 4 && /^[A-Z0-9]+$/.test(tok) && !['ACIDO', 'URICO', 'BILIRRUBINA', 'DIRETA', 'INDIRETA', 'TOTAL'].includes(tok)) return tok;
    return tok.charAt(0).toUpperCase() + tok.slice(1).toLowerCase();
  }).join(' ');
};

export const DestaqueCard = ({ c, monthsSinceLast }: { c: { name: string; anterior?: string | null; atual?: string | null; leitura?: string | null; entenda?: string | null }; monthsSinceLast?: number | null }) => {
  // CAMADA 3 — medição envelhecida (>6m): chip CINZA "há X meses" substitui o badge de cor.
  // Cor implicaria leitura atual; cinza comunica "isto é velho, valor pode ter mudado".
  const aged = monthsSinceLast != null && monthsSinceLast > 6;
  return (
  <Box sx={{ p: 1.75, height: '100%', borderRadius: '12px', bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', boxShadow: '0 2px 8px rgba(0,0,0,0.03)', overflow: 'hidden' }}>
    <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={1}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <NameToggle name={prettyName(c.name)} entenda={c.entenda} />
        <Stack direction="row" spacing={0.75} alignItems="baseline" sx={{ mt: 0.75 }} flexWrap="wrap" useFlexGap>
          <Typography variant="body2" color="text.secondary" sx={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{c.anterior || '—'}</Typography>
          <Typography sx={{ fontWeight: 800, color: (t) => tealText(t.palette.mode) }}>→</Typography>
          <Typography sx={{ fontWeight: 800, color: aged ? 'text.secondary' : '#0f6e68', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{c.atual || '—'}</Typography>
        </Stack>
      </Box>
      <Stack direction="column" alignItems="flex-end" spacing={0.5} sx={{ flexShrink: 0 }}>
        {aged ? (
          <Box title={`Última medição há ${monthsSinceLast} ${monthsSinceLast === 1 ? 'mês' : 'meses'} — o valor pode ter mudado. Converse com seu médico sobre refazer.`}>
            <Chip size="small" label={`há ${monthsSinceLast} ${monthsSinceLast === 1 ? 'mês' : 'meses'}`} sx={{ bgcolor: 'action.hover', color: 'text.secondary', fontWeight: 700 }} />
          </Box>
        ) : (
          <Variation anterior={c.anterior} atual={c.atual} leitura={c.leitura} />
        )}
        <ExplainButton name={c.name} />
      </Stack>
    </Stack>
  </Box>
  );
};
