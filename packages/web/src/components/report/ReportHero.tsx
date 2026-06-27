import type { ReactNode } from 'react';
import { Card, CardContent, Box, Stack, Typography, Button, CircularProgress, Grid } from '@mui/material';
import { alpha } from '@mui/material/styles';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import VolumeUpIcon from '@mui/icons-material/RecordVoiceOver';
import ShareIcon from '@mui/icons-material/Share';
import PrintIcon from '@mui/icons-material/Print';
import { DrExame } from '../DrExame';
import { CreditBadge, CREDIT_COSTS } from '../CreditBadge';

const StatTile = ({ value, label, accent }: { value: ReactNode; label: string; accent: string }) => (
  <Box sx={{ textAlign: 'center', px: 0.5, py: 1, borderRadius: '12px', bgcolor: alpha(accent, 0.08), border: `1px solid ${alpha(accent, 0.15)}` }}>
    <Typography sx={{ fontWeight: 800, color: accent, fontSize: 22, lineHeight: 1 }}>{value}</Typography>
    <Typography variant="caption" sx={{ color: 'text.secondary' }}>{label}</Typography>
  </Box>
);

/**
 * Hero do relatório: robô Dr.Exame em círculo radial (assinatura do dashboard) +
 * faixa de stats (Itens / Atenção / Positivos) + toolbar (ouvir/compartilhar/imprimir/
 * atualizar + créditos) + resumo geral. Espelha o AiCard (gradient + watermark) e o
 * MetricCard (stat tiles). Sem inventar score — honesto aos dados.
 */
export const ReportHero = ({ resumo, counts, speaking, loading, onSpeak, onShare, onPrint, onRegen }: {
  resumo?: string; counts: { itens: number; atencao: number; positivos: number };
  speaking: boolean; loading: boolean; onSpeak: () => void; onShare: () => void; onPrint: () => void; onRegen: () => void;
}) => (
  <Card sx={{ overflow: 'hidden', position: 'relative', background: 'linear-gradient(135deg, rgba(32,178,170,.12), rgba(212,165,116,.08))', border: '1px solid', borderColor: 'rgba(32,178,170,.25)' }}>
    <AutoAwesomeIcon sx={{ position: 'absolute', right: -14, bottom: -20, fontSize: 150, color: '#d4a574', opacity: 0.12, pointerEvents: 'none' }} />
    <CardContent sx={{ position: 'relative' }}>
      <Stack direction="row" alignItems="center" spacing={1.5}>
        <Box sx={{ width: 52, height: 52, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(circle, rgba(32,178,170,.22), rgba(32,178,170,.04))' }}>
          <DrExame size={40} sx={{ borderRadius: '50%' }} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>Relatório consolidado 🩺</Typography>
          <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>Análise educativa — não substitui consulta médica</Typography>
        </Box>
      </Stack>

      <Grid container spacing={1} sx={{ mt: 1.5 }}>
        <Grid size={{ xs: 4 }}><StatTile value={counts.itens} label="Itens" accent="#0b5cab" /></Grid>
        <Grid size={{ xs: 4 }}><StatTile value={counts.atencao} label="Atenção" accent="#ef4444" /></Grid>
        <Grid size={{ xs: 4 }}><StatTile value={counts.positivos} label="Positivos" accent="#10b981" /></Grid>
      </Grid>

      <Stack direction="row" spacing={1} sx={{ mt: 1.5 }} useFlexGap flexWrap="wrap" alignItems="center">
        <Button size="small" variant="contained" startIcon={<VolumeUpIcon />} onClick={onSpeak} disabled={!resumo}>{speaking ? 'Parar' : 'Ouvir'}</Button>
        <Button size="small" variant="outlined" onClick={onShare} aria-label="Compartilhar" sx={{ minWidth: 0, px: 1.25 }}><ShareIcon /></Button>
        <Button size="small" variant="outlined" onClick={onPrint} aria-label="Imprimir / PDF" sx={{ minWidth: 0, px: 1.25 }}><PrintIcon /></Button>
        <Button size="small" variant="outlined" onClick={onRegen} disabled={loading} startIcon={loading ? <CircularProgress size={14} color="inherit" /> : <AutoAwesomeIcon />}>{loading ? 'Gerando…' : '↻ Atualizar'}</Button>
        <CreditBadge amount={CREDIT_COSTS.consolidated} />
      </Stack>

      {resumo && <Typography sx={{ mt: 2, fontSize: '1.05rem', lineHeight: 1.7, wordBreak: 'break-word' }}>{resumo}</Typography>}
    </CardContent>
  </Card>
);
