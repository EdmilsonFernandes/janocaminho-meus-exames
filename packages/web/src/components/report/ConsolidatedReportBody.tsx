import { Box, Stack, Typography, Grid, Chip } from '@mui/material';
import DescriptionIcon from '@mui/icons-material/Description';
import ReportProblemIcon from '@mui/icons-material/ReportProblem';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import MedicationIcon from '@mui/icons-material/Medication';
import RestaurantIcon from '@mui/icons-material/Restaurant';
import TrackChangesIcon from '@mui/icons-material/TrackChanges';
import InsightsIcon from '@mui/icons-material/Insights';
import { ReportSectionCard } from './ReportSectionCard';
import { DestaqueCard } from './DestaqueCard';
import { MetaCard } from './MetaCard';

/**
 * Normaliza o campo estruturado em array — a IA às vezes devolve objeto/string único.
 * Cópia fiel do helper asArr do ConsolidatedReport (mesma robustudez).
 */
const asArr = (x: any): any[] => (Array.isArray(x) ? x : x == null ? [] : [x]);

/** Coerção de itens heterogêneos (string | objeto) em string legível. Cópia do ConsolidatedReport. */
const txt = (x: any): string => typeof x === 'string' ? x : (x?.texto || x?.titulo || x?.detalhe || x?.name || (x && typeof x === 'object' ? JSON.stringify(x) : String(x ?? '')));

const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString('pt-BR') : 's/d');

interface StructuredSummary {
  resumoGeral?: string;
  comparativo?: any[];
  pontosAtencao?: any[];
  coisasBoas?: any[];
  leituraFinal?: string;
  interacoesMedicamentos?: any[];
  sugestoesNutricao?: any[];
  metasSaude?: any[];
  disclaimer?: string;
}

/**
 * ConsolidatedReportBody — corpo do relatório consolidado READ-ONLY. Renderiza todas as seções
 * do ConsolidatedReport (exames-base, destaques, atenção, positivos, interações, nutrição,
 * metas, leitura final) EXCETO "Perguntas ao médico" (o paciente envia; o médico só vê).
 *
 * Cada seção é guardada por `asArr(...).length > 0`. Ícone-clicável só se `onOpenExam` for fornecido.
 */
export const ConsolidatedReportBody = ({ analysis, sourceExams, onOpenExam }: { analysis: any; sourceExams: any[]; onOpenExam?: (id: string) => void }) => {
  if (!analysis) return null;
  const s: StructuredSummary | undefined = analysis.structured
    ? {
        ...analysis.structured,
        comparativo: asArr(analysis.structured.comparativo),
        pontosAtencao: asArr(analysis.structured.pontosAtencao),
        coisasBoas: asArr(analysis.structured.coisasBoas),
        interacoesMedicamentos: asArr(analysis.structured.interacoesMedicamentos),
        sugestoesNutricao: asArr(analysis.structured.sugestoesNutricao),
        metasSaude: asArr(analysis.structured.metasSaude),
      }
    : undefined;
  if (!s) return null;

  // Interações reais (objeto c/ medicamento/observação) — filtro igual ao ConsolidatedReport.
  const interacoes = (s.interacoesMedicamentos ?? []).filter(
    (m: any) => m && typeof m === 'object' && (String(m.medicamento || '').trim() || String(m.observacao || '').trim())
  );
  const trimLab = (lab?: string | null) => {
    if (!lab) return '';
    const v = lab.trim();
    return v.length > 42 ? `${v.slice(0, 42)}…` : v;
  };

  return (
    <>
      {sourceExams.length > 0 && (
        <ReportSectionCard icon={<DescriptionIcon />} title="Exames base do relatório" accent="#20b2aa" count={sourceExams.length}>
          <Stack spacing={0.5} useFlexGap>
            {sourceExams.map((e: any, i: number) => (
              <Box key={i} onClick={onOpenExam ? () => onOpenExam(e.id) : undefined} sx={{ cursor: onOpenExam ? 'pointer' : 'default', '&:hover': onOpenExam ? { opacity: 0.8 } : {} }}>
                <Typography variant="body2" title={e.sourceLab || undefined} sx={{ wordBreak: 'break-word', overflowWrap: 'anywhere', color: onOpenExam ? 'primary.main' : 'text.primary', fontWeight: onOpenExam ? 600 : 400, lineHeight: 1.35 }}>
                  📄 {e.title}{e.performedAt ? ` — ${fmtDate(e.performedAt)}` : ''}{e.sourceLab ? ` • ${trimLab(e.sourceLab)}` : ''}
                </Typography>
              </Box>
            ))}
          </Stack>
        </ReportSectionCard>
      )}

      {s.comparativo && s.comparativo.length > 0 && (
        <ReportSectionCard icon={<InsightsIcon />} title="Itens em destaque" accent="#0b5cab" count={s.comparativo.length}>
          <Grid container spacing={1.5}>
            {s.comparativo.map((c: any, i: number) => <Grid key={i} size={{ xs: 12, md: 6 }}><DestaqueCard c={c} /></Grid>)}
          </Grid>
        </ReportSectionCard>
      )}

      {s.pontosAtencao && s.pontosAtencao.length > 0 && (
        <ReportSectionCard icon={<ReportProblemIcon />} title="Pontos de atenção" accent="#ef4444" count={s.pontosAtencao.length}>
          <Stack spacing={1.25}>
            {s.pontosAtencao.map((p: any, i: number) => (
              <Box key={i}>
                <Typography sx={{ fontWeight: 700, wordBreak: 'break-word' }}>{i + 1}. {p.titulo}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25, wordBreak: 'break-word' }}>{p.detalhe}</Typography>
              </Box>
            ))}
          </Stack>
        </ReportSectionCard>
      )}

      {s.coisasBoas && s.coisasBoas.length > 0 && (
        <ReportSectionCard icon={<CheckCircleIcon />} title="Pontos positivos" accent="#059669" count={s.coisasBoas.length} collapsible defaultExpanded={false}>
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            {s.coisasBoas.map((b: any, i: number) => <Chip key={i} sx={{ bgcolor: '#05966918', color: '#059669', fontWeight: 600, maxWidth: '100%', whiteSpace: 'normal', height: 'auto', py: 0.5, lineHeight: 1.3 }} label={txt(b)} />)}
          </Stack>
        </ReportSectionCard>
      )}

      {interacoes.length > 0 && (
        <ReportSectionCard icon={<MedicationIcon />} title="Interações com medicação" accent="#f59e0b" count={interacoes.length} collapsible defaultExpanded={false}>
          <Stack spacing={1}>
            {interacoes.map((m: any, i: number) => (
              <Box key={i} sx={{ p: 1.5, borderRadius: '12px', bgcolor: '#f59e0b0d', border: '1px solid #f59e0b26' }}>
                <Typography sx={{ fontWeight: 700, wordBreak: 'break-word' }}>{m.medicamento} <Box component="span" sx={{ color: 'text.secondary', fontWeight: 600 }}>× {m.analito}</Box></Typography>
                <Typography variant="body2" color="text.secondary" sx={{ wordBreak: 'break-word' }}>{m.observacao}</Typography>
              </Box>
            ))}
          </Stack>
        </ReportSectionCard>
      )}

      {s.sugestoesNutricao && s.sugestoesNutricao.length > 0 && (
        <ReportSectionCard icon={<RestaurantIcon />} title="Sugestões de nutrição" accent="#16a34a" count={s.sugestoesNutricao.length} collapsible defaultExpanded={false}>
          <Stack spacing={0.5}>
            {s.sugestoesNutricao.map((b: any, i: number) => <Typography key={i} variant="body2" sx={{ py: 0.25, wordBreak: 'break-word' }}>🥗 {txt(b)}</Typography>)}
          </Stack>
        </ReportSectionCard>
      )}

      {s.metasSaude && s.metasSaude.length > 0 && (
        <ReportSectionCard icon={<TrackChangesIcon />} title="Metas de saúde" accent="#0288d1" count={s.metasSaude.length} collapsible defaultExpanded={false}>
          <Grid container spacing={1.5}>
            {s.metasSaude.map((m: any, i: number) => <Grid key={i} size={{ xs: 12, md: 6 }}><MetaCard m={m} /></Grid>)}
          </Grid>
        </ReportSectionCard>
      )}

      {s.leituraFinal && (
        <Box sx={{ p: 2.5, borderRadius: '16px', background: 'linear-gradient(135deg, rgba(11,92,171,.10), rgba(11,92,171,.04))', border: '1px solid', borderColor: 'divider' }}>
          <Typography sx={(t) => ({ fontWeight: 800, color: t.palette.mode === 'dark' ? '#5b9bd5' : '#0b5cab', mb: 0.5, fontFamily: '"Poppins",sans-serif' })}>📌 Leitura final</Typography>
          <Typography sx={{ lineHeight: 1.7, wordBreak: 'break-word' }}>{s.leituraFinal}</Typography>
        </Box>
      )}

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center' }}>
        {s.disclaimer || 'Análise educativa gerada por IA a partir dos exames do paciente. A interpretação final deve ser feita por profissional de saúde.'}
      </Typography>
    </>
  );
};
