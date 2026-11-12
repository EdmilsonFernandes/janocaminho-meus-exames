import type { ReactNode } from 'react';
import { CardContent, Box, Stack, Typography, Button, CircularProgress, Grid, Chip } from '@mui/material';
import { alpha } from '@mui/material/styles';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import ShareIcon from '@mui/icons-material/Share';
import PrintIcon from '@mui/icons-material/Print';
import DescriptionIcon from '@mui/icons-material/Description';
import type { SourceExam } from '@meus-exames/shared';
import { DrExame } from '../DrExame';
import { AppCard } from '../AppCard';
import { tealText } from '../../theme';
import { VoiceSummaryPlayer } from '../VoiceSummaryPlayer';
import { Frame, FrameHeader, FramePanel, FrameFooter } from '@/components/reui/frame';
import { Badge } from '@/components/reui/badge';

const StatTile = ({ value, label, accent }: { value: ReactNode; label: string; accent: string }) => (
  <Box sx={{
    textAlign: 'center', px: 1, py: 1.25, borderRadius: '16px',
    bgcolor: alpha(accent, 0.08),
    border: '1px solid', borderColor: alpha(accent, 0.18),
    boxShadow: `0 4px 12px ${alpha(accent, 0.05)}`,
    transition: 'transform .15s ease',
    '&:hover': { transform: 'translateY(-2px)' }
  }}>
    <Typography sx={{ fontWeight: 900, color: accent, fontSize: 25, lineHeight: 1, fontFamily: 'Poppins, sans-serif', fontVariantNumeric: 'tabular-nums' }}>{value}</Typography>
    {/* ReUI Stats (dono 30/10): rótulo caixa-alta com tracking — número é quem fala */}
    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: '.07em', display: 'block', mt: 0.5 }}>{label}</Typography>
  </Box>
);

export const ReportHero = ({ resumo, counts, speaking, loading, onSpeak, onShare, onPrint, onRegen, sourceExams, baseDate, onOpenExam }: {
  resumo?: string; counts: { itens: number; atencao: number; positivos: number };
  speaking: boolean; loading: boolean; onSpeak: () => void; onShare: () => void; onPrint: () => void; onRegen: () => void;
  sourceExams?: SourceExam[];
  baseDate?: string | null;
  onOpenExam?: (id: string) => void;
}) => (
  <Frame variant="default">
    <FrameHeader className="flex flex-row items-center justify-between gap-3 flex-wrap pb-2.5">
      <div className="flex items-center gap-3 min-w-0">
        <Box sx={{ width: 42, height: 42, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(circle, rgba(32,178,170,.25), rgba(32,178,170,.05))', border: '1px solid', borderColor: alpha('#20b2aa', 0.25) }}>
          <DrExame size={32} sx={{ borderRadius: '50%' }} />
        </Box>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-heading text-sm sm:text-base font-extrabold text-foreground">
              Dossiê Consolidado de Saúde
            </span>
            <Badge variant="info-light" size="xs">
              Dr. Exame IA
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Análise educativa — não substitui consulta médica
            {baseDate ? ` · Exame mais recente: ${baseDate}` : ''}
          </p>
        </div>
      </div>
    </FrameHeader>
    <FramePanel className="p-4 sm:p-5">

    {/* Cápsula de Áudio Premium do Dr. Exame NO TOPO (Executivo e Imediato) */}
    {resumo && (
      <Box sx={{ mt: 1.75 }}>
        <VoiceSummaryPlayer
          text={resumo}
          title="Dr. Exame Explica em Áudio"
          subtitle="Ouça a síntese clínica do laudo em 1 min"
          colorScheme="teal"
          badgeLabel="Dr. Exame Voz"
          compact
        />
      </Box>
    )}

    <Grid container spacing={1.25} sx={{ mt: 1.5 }}>
      {/* Itens = neutro (mock do dono): cor só onde há semântica — atenção/positivos */}
      <Grid size={{ xs: 4 }}><StatTile value={counts.itens} label="Itens" accent="#64748b" /></Grid>
      <Grid size={{ xs: 4 }}><StatTile value={counts.atencao} label="Atenção" accent="#ef4444" /></Grid>
      <Grid size={{ xs: 4 }}><StatTile value={counts.positivos} label="Positivos" accent="#059669" /></Grid>
    </Grid>

    {/* "Baseado em N exames" — strip horizontal compacto estilo carrossel */}
    {sourceExams && sourceExams.length > 0 && onOpenExam && (
      <Box sx={{ mt: 1.75 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.75 }}>
          <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Baseado em {sourceExams.length} exames analisados
          </Typography>
          <Typography variant="caption" sx={{ color: (t) => tealText(t.palette.mode), fontWeight: 700 }}>
            Toque para abrir →
          </Typography>
        </Stack>
        <Box sx={{
          display: 'flex', gap: 1, overflowX: 'auto', py: 0.5, px: 0.2,
          scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' },
        }}>
          {sourceExams.map((e, i) => {
            const dt = e.performedAt ? new Date(`${String(e.performedAt).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : '';
            const lab = (e.sourceLab || '').trim();
            const labShort = lab.length > 18 ? `${lab.slice(0, 18)}…` : lab;
            return (
              <Box
                key={i}
                component="button"
                onClick={() => onOpenExam(e.id)}
                title={`${e.title}${dt ? ` — ${dt}` : ''}${lab ? ` • ${lab}` : ''}`}
                sx={{
                  display: 'inline-flex', alignItems: 'center', gap: 1,
                  px: 1.25, py: 0.75, borderRadius: '999px', cursor: 'pointer', flexShrink: 0,
                  border: '1px solid', borderColor: 'divider', bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.04)' : '#ffffff',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                  transition: 'all .15s ease',
                  '&:hover': { bgcolor: alpha('#20b2aa', 0.08), borderColor: '#20b2aa', transform: 'translateY(-1px)' },
                }}
              >
                <DescriptionIcon sx={{ fontSize: 15, color: '#0d9488' }} />
                <Typography noWrap sx={{ fontSize: 12.5, fontWeight: 700, color: 'text.primary', maxWidth: 160 }}>
                  {e.title}
                </Typography>
                {(dt || labShort) && (
                  <Chip
                    size="small"
                    label={[dt, labShort].filter(Boolean).join(' • ')}
                    sx={{ height: 18, fontSize: 12, fontWeight: 700, bgcolor: 'rgba(32,178,170,.10)', color: (t) => tealText(t.palette.mode) }}
                  />
                )}
              </Box>
            );
          })}
        </Box>
      </Box>
    )}

    {/* Barra de Ações Rápidas (Atualizar, Compartilhar, Imprimir) — grid 3 colunas fluida sem quebra */}
    <Box sx={{
      mt: 1.75,
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: 1,
    }}>
      {/* ReUI (mock do dono 30/10): ação vira AZULEJO vertical (ícone sobre rótulo) —
          cabe nos 3 sem truncar no xs, mesma pegada dos quick-actions nativos. */}
      <Button
        size="small"
        onClick={onRegen}
        disabled={loading}
        aria-label="Atualizar relatório"
        title="Atualizar relatório"
        sx={{
          display: 'flex', flexDirection: 'column', gap: 0.5, py: 1.1, px: 0.5,
          borderRadius: '14px', textTransform: 'none', minWidth: 0,
          fontWeight: 800, fontSize: 12, lineHeight: 1.1, whiteSpace: 'nowrap',
          color: 'text.secondary',
          bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.04)' : '#ffffff',
          border: '1px solid', borderColor: 'divider',
          boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
          transition: 'all .15s ease',
          '&:hover': { color: (t) => tealText(t.palette.mode), borderColor: alpha('#20b2aa', 0.45), bgcolor: alpha('#20b2aa', 0.06) },
        }}
      >
        {loading ? <CircularProgress size={17} color="inherit" /> : <AutoAwesomeIcon sx={{ fontSize: 19 }} />}
        {loading ? 'Gerando…' : 'Atualizar'}
      </Button>

      <Button
        size="small"
        onClick={onShare}
        aria-label="Compartilhar"
        sx={{
          display: 'flex', flexDirection: 'column', gap: 0.5, py: 1.1, px: 0.5,
          borderRadius: '14px', textTransform: 'none', minWidth: 0,
          fontWeight: 800, fontSize: 12, lineHeight: 1.1, whiteSpace: 'nowrap',
          color: 'text.secondary',
          bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.04)' : '#ffffff',
          border: '1px solid', borderColor: 'divider',
          boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
          transition: 'all .15s ease',
          '&:hover': { color: (t) => tealText(t.palette.mode), borderColor: alpha('#20b2aa', 0.45), bgcolor: alpha('#20b2aa', 0.06) },
        }}
      >
        <ShareIcon sx={{ fontSize: 19 }} />
        Compartilhar
      </Button>

      <Button
        size="small"
        onClick={onPrint}
        aria-label="Imprimir / PDF"
        sx={{
          display: 'flex', flexDirection: 'column', gap: 0.5, py: 1.1, px: 0.5,
          borderRadius: '14px', textTransform: 'none', minWidth: 0,
          fontWeight: 800, fontSize: 12, lineHeight: 1.1, whiteSpace: 'nowrap',
          color: 'text.secondary',
          bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.04)' : '#ffffff',
          border: '1px solid', borderColor: 'divider',
          boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
          transition: 'all .15s ease',
          '&:hover': { color: (t) => tealText(t.palette.mode), borderColor: alpha('#20b2aa', 0.45), bgcolor: alpha('#20b2aa', 0.06) },
        }}
      >
        <PrintIcon sx={{ fontSize: 19 }} />
        Imprimir / PDF
      </Button>
    </Box>

    {/* Resumo Textual — ReUI Prose */}
    {resumo && (
      <Box sx={{ mt: 2, p: { xs: 2, sm: 2.5 }, borderRadius: '16px', bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
        <Typography sx={{ fontSize: '0.95rem', lineHeight: 1.7, wordBreak: 'break-word', color: 'text.primary', fontWeight: 400 }}>
          {resumo}
        </Typography>
      </Box>
    )}
    </FramePanel>
    <FrameFooter className="px-4 py-2 text-xs text-muted-foreground flex items-center justify-between flex-wrap gap-2">
      <span>Síntese gerada com extração determinística de laudos · Leve à sua próxima consulta</span>
      {sourceExams && sourceExams.length > 0 && (
        <span className="font-semibold text-foreground">{sourceExams.length} laudos considerados</span>
      )}
    </FrameFooter>
  </Frame>
);
