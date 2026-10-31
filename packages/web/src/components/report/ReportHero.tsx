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
    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.07em', display: 'block', mt: 0.5 }}>{label}</Typography>
  </Box>
);

export const ReportHero = ({ resumo, counts, speaking, loading, onSpeak, onShare, onPrint, onRegen, sourceExams, baseDate, onOpenExam }: {
  resumo?: string; counts: { itens: number; atencao: number; positivos: number };
  speaking: boolean; loading: boolean; onSpeak: () => void; onShare: () => void; onPrint: () => void; onRegen: () => void;
  /** Exames que alimentaram a análise — rows compactas clicáveis (o título da página
   *  já diz "Relatório completo de saúde"; este card não repete outro título). */
  sourceExams?: SourceExam[];
  /** CAMADA 3 — data do exame MAIS RECENTE (dd/mm/aaaa, do DB): âncora de frescor no
   *  topo do herói. Relatório de 2024 não pode parecer leitura de hoje. */
  baseDate?: string | null;
  onOpenExam?: (id: string) => void;
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
    {/* ReUI Alert/Callout soft (dono 30/10): o aviso educativo vira callout com título
        em negrito + caption — destaque do disclaimer sem poluir (variante teal suave). */}
    <Stack direction="row" alignItems="center" spacing={1.5} sx={{
      p: 1.5, borderRadius: '16px',
      bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(32,178,170,0.10)' : 'rgba(32,178,170,0.07)',
      border: '1px solid', borderColor: alpha('#20b2aa', 0.22),
    }}>
      <Box sx={{ width: 46, height: 46, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(circle, rgba(32,178,170,.25), rgba(32,178,170,.05))', border: '1px solid', borderColor: alpha('#20b2aa', 0.25) }}>
        <DrExame size={36} sx={{ borderRadius: '50%' }} />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: 14, fontWeight: 800, color: 'text.primary', lineHeight: 1.3 }}>Análise educativa gerada pela IA</Typography>
        <Typography sx={{ fontSize: 12.5, color: (t) => tealText(t.palette.mode), fontWeight: 600, mt: 0.25 }}>— não substitui consulta médica</Typography>
      </Box>
    </Stack>

    {/* CAMADA 3 — âncora de frescor: DE QUAL exame o relatório fala. Pill teal discreto
        logo abaixo do cabeçalho; sem data conhecida, não renderiza (não inventa). */}
    {baseDate && (
      <Box sx={{ mt: 1.25, display: 'flex' }}>
        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, px: 1.25, py: 0.5, borderRadius: '999px', bgcolor: alpha('#20b2aa', 0.08), border: '1px solid', borderColor: alpha('#20b2aa', 0.22) }}>
          <Typography sx={{ fontSize: 12.5, fontWeight: 800, color: (t) => tealText(t.palette.mode) }}>
            📅 Baseado no exame de {baseDate}
          </Typography>
        </Box>
      </Box>
    )}

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
                    sx={{ height: 18, fontSize: 10.5, fontWeight: 700, bgcolor: 'rgba(32,178,170,.10)', color: (t) => tealText(t.palette.mode) }}
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
          fontWeight: 800, fontSize: 11.5, lineHeight: 1.1, whiteSpace: 'nowrap',
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
          fontWeight: 800, fontSize: 11.5, lineHeight: 1.1, whiteSpace: 'nowrap',
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
          fontWeight: 800, fontSize: 11.5, lineHeight: 1.1, whiteSpace: 'nowrap',
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

    {/* Resumo Textual — ReUI Prose (dono 30/10): papel branco + respiro de leitura
        (line-height 1.7) pro texto clínico denso parar de competir com o fundo tintado. */}
    {resumo && (
      <Box sx={{ mt: 2, p: { xs: 2, sm: 2.5 }, borderRadius: '16px', bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
        <Typography sx={{ fontSize: '0.95rem', lineHeight: 1.7, wordBreak: 'break-word', color: 'text.primary', fontWeight: 400 }}>
          {resumo}
        </Typography>
      </Box>
    )}
  </Box>
);
