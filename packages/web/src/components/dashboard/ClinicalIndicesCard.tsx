import { useState } from 'react';
import { Box, Chip, Collapse, Stack, Tooltip, Typography, useTheme } from '@mui/material';
import { alpha } from '@mui/material/styles';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import { AppCard } from '../AppCard';
import { SEM, tealText } from '../../theme';

/**
 * ClinicalIndicesCard — Índices Clínicos CALCULADOS (determinísticos, zero IA).
 *
 * O "combo oculto" dos painéis premium: razões e fórmulas da literatura (Castelli I/II,
 * TG/HDL, AIP, HOMA-IR, TYG, FIB-4, eGFR, não-HDL, LH/FSH, FAI) computadas server-side
 * a partir dos valores JÁ extraídos. Só aparece o que tem TODOS os insumos — sem dado
 * não há índice (honestidade: ausência nunca vira "bom").
 *
 * Colapsável por padrão (o dashboard é longo; o card anuncia "(N calculados)" no
 * header). Cada chip carrega tooltip com fórmula + interpretação + fonte citada.
 */

export type IndexLevel = 'bom' | 'atencao' | 'alterado';

export interface ClinicalIndexView {
  key: string;
  name: string;
  value: number;
  unit: string;
  level: IndexLevel;
  interpretation: string;
  source: string;
  howTo: string;
}

const fmt = (v: number) => String(v).replace('.', ',');

const LEVEL_LABEL: Record<IndexLevel, string> = { bom: 'Bom', atencao: 'Atenção', alterado: 'Alterado' };

/** Chip AA nos dois modos: borda + texto pelo token SEM (light/dark). */
const ChipLevel = ({ idx }: { idx: ClinicalIndexView }) => {
  const theme = useTheme();
  const dark = theme.palette.mode === 'dark';
  const color = idx.level === 'bom' ? SEM.ok : idx.level === 'atencao' ? SEM.warn : SEM.bad;
  const c = dark ? color.dark : color.light;
  return (
    <Tooltip
      enterTouchDelay={0}
      title={
        <Box sx={{ maxWidth: 300 }}>
          <Typography sx={{ fontWeight: 800, fontSize: 13, mb: 0.5 }}>{idx.name}</Typography>
          <Typography sx={{ fontSize: 12, mb: 0.5 }}>
            <strong>{idx.howTo}</strong> = {fmt(idx.value)} {idx.unit}
          </Typography>
          <Typography sx={{ fontSize: 12, mb: 0.5 }}>{idx.interpretation}</Typography>
          <Typography sx={{ fontSize: 11, opacity: 0.8, fontStyle: 'italic' }}>Fonte: {idx.source}</Typography>
        </Box>
      }
    >
      <Chip
        size="small"
        label={
          <Box component="span" sx={{ display: 'inline-flex', alignItems: 'baseline', gap: 0.5 }}>
            <Box component="span">{idx.name}</Box>
            <Box component="span" sx={{ fontWeight: 800 }}>{fmt(idx.value)}</Box>
            <Box component="span" sx={{ opacity: 0.75, fontSize: 11 }}>{idx.unit === 'razão' || idx.unit === 'índice' || idx.unit === 'log' ? '' : idx.unit}</Box>
          </Box>
        }
        sx={{
          borderRadius: '8px',
          fontWeight: 700,
          fontSize: 12,
          borderColor: alpha(c, 0.55),
          color: c,
          bgcolor: alpha(c, 0.08),
          '& .MuiChip-label': { px: 1.25 },
          maxWidth: '100%',
        }}
        variant="outlined"
      />
    </Tooltip>
  );
};

export const ClinicalIndicesCard = ({ indices, loaded }: { indices: ClinicalIndexView[] | null; loaded: boolean }) => {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const list = indices ?? [];
  if (loaded && list.length === 0) return null; // sem insumo completo → sem card (empty state já existe no dashboard)

  const nOk = list.filter((i) => i.level === 'bom').length;
  const nAt = list.filter((i) => i.level === 'atencao').length;
  const nAl = list.filter((i) => i.level === 'alterado').length;

  return (
    <AppCard>
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        onClick={() => setOpen((o) => !o)}
        sx={{ cursor: 'pointer', userSelect: 'none', py: 0.25, '&:focus-visible': { outline: `2px solid ${tealText(theme.palette.mode)}`, outlineOffset: 4 }, borderRadius: '8px' }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen((o) => !o); } }}
        aria-expanded={open}
      >
        <Typography sx={{ fontWeight: 800, fontSize: 15, flex: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
          📊 Índices Clínicos
          <Box component="span" sx={{ fontWeight: 700, fontSize: 12.5, color: 'text.secondary' }}>
            ({loaded ? `${list.length} calculado${list.length === 1 ? '' : 's'}` : '…'})
          </Box>
        </Typography>
        <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 0.75, fontSize: 12, fontWeight: 700 }}>
          {nOk > 0 && <Box component="span" sx={{ color: theme.palette.mode === 'dark' ? SEM.ok.dark : SEM.ok.light }}>{nOk} ✓</Box>}
          {nAt > 0 && <Box component="span" sx={{ color: theme.palette.mode === 'dark' ? SEM.warn.dark : SEM.warn.light }}>{nAt} !</Box>}
          {nAl > 0 && <Box component="span" sx={{ color: theme.palette.mode === 'dark' ? SEM.bad.dark : SEM.bad.light }}>{nAl} ✕</Box>}
        </Box>
        <KeyboardArrowDownIcon sx={{ color: 'text.secondary', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
      </Stack>

      <Collapse in={open} timeout="auto" unmountOnExit>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, pt: 1.5 }}>
          {loaded ? list.map((idx) => <ChipLevel key={idx.key} idx={idx} />) : (
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>carregando…</Typography>
          )}
        </Box>
        <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 1.25, lineHeight: 1.5 }}>
          Fórmulas da literatura calculadas automaticamente a partir dos seus exames — conteúdo educativo, não diagnóstico. Toque em um índice para ver a fórmula e a fonte.
        </Typography>
      </Collapse>
    </AppCard>
  );
};
