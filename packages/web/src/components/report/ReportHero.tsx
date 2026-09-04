import type { ReactNode } from 'react';
import { CardContent, Box, Stack, Typography, Button, CircularProgress, Grid } from '@mui/material';
import { alpha } from '@mui/material/styles';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import VolumeUpIcon from '@mui/icons-material/RecordVoiceOver';
import ShareIcon from '@mui/icons-material/Share';
import PrintIcon from '@mui/icons-material/Print';
import DescriptionIcon from '@mui/icons-material/Description';
import type { SourceExam } from '@meus-exames/shared';
import { DrExame } from '../DrExame';
import { AppCard } from '../AppCard';

const StatTile = ({ value, label, accent }: { value: ReactNode; label: string; accent: string }) => (
  <Box sx={{
    textAlign: 'center', px: 1, py: 1.25, borderRadius: '16px',
    bgcolor: alpha(accent, 0.08),
    border: '1px solid', borderColor: alpha(accent, 0.18),
    boxShadow: `0 4px 12px ${alpha(accent, 0.05)}`,
    transition: 'transform .15s ease',
    '&:hover': { transform: 'translateY(-2px)' }
  }}>
    <Typography sx={{ fontWeight: 800, color: accent, fontSize: 24, lineHeight: 1, fontFamily: 'Poppins, sans-serif' }}>{value}</Typography>
    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, fontSize: 12 }}>{label}</Typography>
  </Box>
);

export const ReportHero = ({ resumo, counts, speaking, loading, onSpeak, onShare, onPrint, onRegen, sourceExams, onOpenExam }: {
  resumo?: string; counts: { itens: number; atencao: number; positivos: number };
  speaking: boolean; loading: boolean; onSpeak: () => void; onShare: () => void; onPrint: () => void; onRegen: () => void;
  /** Exames que alimentaram a análise — rows compactas clicáveis (o título da página
   *  já diz "Relatório completo de saúde"; este card não repete outro título). */
  sourceExams?: SourceExam[]; onOpenExam?: (id: string) => void;
}) => (
  <Box sx={(t) => ({
    position: 'relative', overflow: 'hidden', p: { xs: 2, sm: 2.5 }, borderRadius: '16px',
    background: t.palette.mode === 'dark'
      ? 'linear-gradient(135deg, rgba(20,35,35,0.9), rgba(15,25,25,0.85))'
      : 'linear-gradient(135deg, rgba(255,255,255,0.95), rgba(240,250,249,0.85))',
    backdropFilter: 'blur(20px) saturate(180%)',
    border: '1px solid', borderColor: alpha(t.palette.primary.main, 0.18),
    boxShadow: '0 10px 36px rgba(32,178,170,0.08)'
  })}>
    <AutoAwesomeIcon sx={{ position: 'absolute', right: -14, bottom: -20, fontSize: 150, color: '#d4a574', opacity: 0.08, pointerEvents: 'none' }} />
    <Stack direction="row" alignItems="center" spacing={1.5}>
      <Box sx={{ width: 54, height: 54, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(circle, rgba(32,178,170,.25), rgba(32,178,170,.05))', boxShadow: '0 4px 14px rgba(32,178,170,0.2)' }}>
        <DrExame size={42} sx={{ borderRadius: '50%' }} />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: 14, color: 'text.secondary', fontWeight: 600, lineHeight: 1.35 }}>Análise educativa gerada pela IA<br />— não substitui consulta médica</Typography>
      </Box>
    </Stack>

    <Grid container spacing={1.25} sx={{ mt: 1.5 }}>
      <Grid size={{ xs: 4 }}><StatTile value={counts.itens} label="Itens" accent="#0369a1" /></Grid>
      <Grid size={{ xs: 4 }}><StatTile value={counts.atencao} label="Atenção" accent="#ef4444" /></Grid>
      <Grid size={{ xs: 4 }}><StatTile value={counts.positivos} label="Positivos" accent="#059669" /></Grid>
    </Grid>

    {/* "Baseado em N exames" — ANTES era uma seção própria com linhas body2 📄 (feia,
        ocupava um bloco inteiro da tela). Agora é parte do herói: rows compactas
        clicáveis (ícone + título + data·lab, ellipsis com title completo). */}
    {sourceExams && sourceExams.length > 0 && onOpenExam && (
      <Box sx={{ mt: 1.75 }}>
        <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
          Baseado em {sourceExams.length} exame{sourceExams.length === 1 ? '' : 's'} — toque para abrir:
        </Typography>
        <Stack spacing={0.5} sx={{ mt: 0.5 }}>
          {sourceExams.map((e, i) => {
            const dt = e.performedAt ? new Date(`${String(e.performedAt).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : '';
            const lab = (e.sourceLab || '').trim();
            const labShort = lab.length > 42 ? `${lab.slice(0, 42)}…` : lab;
            return (
              <Box
                key={i}
                component="button"
                onClick={() => onOpenExam(e.id)}
                title={`${e.title}${dt ? ` — ${dt}` : ''}${lab ? ` • ${lab}` : ''}`}
                sx={{
                  display: 'flex', alignItems: 'center', gap: 1, width: '100%', textAlign: 'left',
                  p: 0.75, borderRadius: '8px', cursor: 'pointer',
                  border: '1px solid', borderColor: 'divider', bgcolor: 'transparent',
                  transition: 'background-color .15s ease, border-color .15s ease',
                  '&:hover': { bgcolor: alpha('#20b2aa', 0.06), borderColor: alpha('#20b2aa', 0.35) },
                }}
              >
                <Box sx={{ width: 28, height: 28, borderRadius: '8px', display: 'grid', placeItems: 'center', flexShrink: 0, bgcolor: alpha('#20b2aa', 0.12), color: '#178f89' }}>
                  <DescriptionIcon sx={{ fontSize: 16 }} />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography noWrap sx={{ fontSize: 13, fontWeight: 700, color: 'text.primary' }}>{e.title}</Typography>
                  <Typography noWrap variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                    {dt}{labShort ? ` • ${labShort}` : ''}
                  </Typography>
                </Box>
              </Box>
            );
          })}
        </Stack>
      </Box>
    )}

    <Stack direction="row" spacing={1} sx={{ mt: 2 }} useFlexGap flexWrap="wrap" alignItems="center">
      <Button size="small" variant="contained" startIcon={<VolumeUpIcon />} onClick={onSpeak} disabled={!resumo}
        sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 800, px: 2, bgcolor: '#178f89', boxShadow: 'none', '&:hover': { bgcolor: '#0f766e', boxShadow: 'none' } }}>
        {speaking ? 'Parar' : 'Ouvir'}
      </Button>
      <Button size="small" variant="outlined" onClick={onShare} aria-label="Compartilhar"
        sx={{ minWidth: 0, px: 1.5, borderRadius: '999px', borderColor: 'rgba(32,178,170,0.3)', color: '#178f89', '&:hover': { borderColor: '#178f89', bgcolor: 'rgba(32,178,170,0.06)' } }}>
        <ShareIcon fontSize="small" />
      </Button>
      <Button size="small" variant="outlined" onClick={onPrint} aria-label="Imprimir / PDF"
        sx={{ minWidth: 0, px: 1.5, borderRadius: '999px', borderColor: 'rgba(32,178,170,0.3)', color: '#178f89', '&:hover': { borderColor: '#178f89', bgcolor: 'rgba(32,178,170,0.06)' } }}>
        <PrintIcon fontSize="small" />
      </Button>
      <Button size="small" variant="outlined" onClick={onRegen} disabled={loading} startIcon={loading ? <CircularProgress size={14} color="inherit" /> : <AutoAwesomeIcon />}
        sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 800, px: 1.75, borderColor: 'rgba(32,178,170,0.3)', color: '#178f89', '&:hover': { borderColor: '#178f89', bgcolor: 'rgba(32,178,170,0.06)' } }}>
        {loading ? 'Gerando…' : 'Atualizar relatório'}
      </Button>
    </Stack>

    {resumo && <Typography sx={{ mt: 2, fontSize: '0.98rem', lineHeight: 1.65, wordBreak: 'break-word', color: 'text.primary', fontWeight: 400 }}>{resumo}</Typography>}
  </Box>
);
