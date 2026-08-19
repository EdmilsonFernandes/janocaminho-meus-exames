import { Box, Stack, Typography, Grid, List, ListItem, ListItemIcon, ListItemText } from '@mui/material';
import { useTheme } from '@mui/material/styles';
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
import { RADIUS } from '../../theme';

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
 * Quebra a leitura final em frases curtas (bullets scannáveis) quando o texto é longo.
 * Divide em ". " ou "\n"; descarta vazios; normaliza pontuação terminal.
 */
const splitSentences = (raw: string): string[] => {
  const seen = new Set<string>();
  return raw
    .split(/\.\s+|\n+|;\s+/)
    .map((s) => s.trim())
    .filter((s) => {
      if (!s || seen.has(s.toLowerCase())) return false;
      seen.add(s.toLowerCase());
      return true;
    })
    .map((s) => (/[.!?:]$/.test(s) ? s : `${s}.`));
};

/**
 * ConsolidatedReportBody — corpo do relatório consolidado READ-ONLY. Renderiza todas as seções
 * do ConsolidatedReport (exames-base, destaques, atenção, positivos, interações, nutrição,
 * metas, leitura final) EXCETO "Perguntas ao médico" (o paciente envia; o médico só vê).
 *
 * Cada seção é guardada por `asArr(...).length > 0`. Ícone-clicável só se `onOpenExam` for fornecido.
 *
 * Apresentação premium:
 *  - verde = sinal (apenas no ícone), texto neutro (text.primary) — sem "muro de chips";
 *  - `leituraFinal` longo vira bullets; curto mantém-se como prosa com header small-caps;
 *  - disclaimer vira footnote (caption text.secondary), não linha centrada flutuante.
 */
export const ConsolidatedReportBody = ({ analysis, sourceExams, onOpenExam }: { analysis: any; sourceExams: any[]; onOpenExam?: (id: string) => void }) => {
  const theme = useTheme();
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

  const disclaimer = s.disclaimer || 'Análise educativa gerada por IA a partir dos exames do paciente. A interpretação final deve ser feita por profissional de saúde.';

  // leituraFinal: bullets se passa do limite (várias frases); senão prosa.
  const leituraRaw = s.leituraFinal ? String(s.leituraFinal).trim() : '';
  const leituraSentences = leituraRaw ? splitSentences(leituraRaw) : [];
  const leituraAsBullets = leituraRaw.length > 280 && leituraSentences.length > 1;

  return (
    <>
      {sourceExams.length > 0 && (
        <ReportSectionCard icon={<DescriptionIcon />} title="Exames base do relatório" accent={theme.palette.primary.main} count={sourceExams.length}>
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
        <ReportSectionCard icon={<InsightsIcon />} title="Itens em destaque" accent="#0369a1" count={s.comparativo.length}>
          <Grid container spacing={1.5}>
            {s.comparativo.map((c: any, i: number) => <Grid key={i} size={{ xs: 12, md: 6 }}><DestaqueCard c={c} /></Grid>)}
          </Grid>
        </ReportSectionCard>
      )}

      {s.pontosAtencao && s.pontosAtencao.length > 0 && (
        <ReportSectionCard icon={<ReportProblemIcon />} title="Pontos de atenção" accent="#ef4444" count={s.pontosAtencao.length}>
          <Stack spacing={1.25}>
            {s.pontosAtencao.map((p: any, i: number) => (
              <Box key={i} sx={{ borderRadius: RADIUS.tile, p: 1.5, bgcolor: 'rgba(239,68,68,0.06)', border: '1px solid', borderColor: 'rgba(239,68,68,0.22)' }}>
                <Typography sx={{ fontWeight: 700, color: 'error.main', wordBreak: 'break-word' }}>{i + 1}. {p.titulo}</Typography>
                <Typography variant="body2" sx={{ mt: 0.25, wordBreak: 'break-word', color: 'text.primary' }}>{p.detalhe}</Typography>
              </Box>
            ))}
          </Stack>
        </ReportSectionCard>
      )}

      {s.coisasBoas && s.coisasBoas.length > 0 && (
        <ReportSectionCard icon={<CheckCircleIcon />} title="Pontos estáveis / dentro do esperado" accent={theme.palette.primary.main} count={s.coisasBoas.length} collapsible defaultExpanded={false}>
          {/* Verde = sinal (apenas ícone). Texto neutro (text.primary). Sem muro de chips. */}
          <List dense disablePadding>
            {s.coisasBoas.map((b: any, i: number) => (
              <ListItem key={i} disableGutters alignItems="flex-start" sx={{ py: 0.4 }}>
                <ListItemIcon sx={{ minWidth: 30, mt: 0.25, color: 'success.main' }}>
                  <CheckCircleIcon sx={{ fontSize: 20 }} />
                </ListItemIcon>
                <ListItemText
                  primary={txt(b)}
                  primaryTypographyProps={{ sx: { wordBreak: 'break-word', color: 'text.primary', lineHeight: 1.5 } }}
                />
              </ListItem>
            ))}
          </List>
        </ReportSectionCard>
      )}

      {interacoes.length > 0 && (
        <ReportSectionCard icon={<MedicationIcon />} title="Interações com medicação" accent="#f59e0b" count={interacoes.length} collapsible defaultExpanded={false}>
          <Stack spacing={1}>
            {interacoes.map((m: any, i: number) => (
              <Box key={i} sx={{ p: 1.5, borderRadius: RADIUS.tile, bgcolor: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.22)' }}>
                <Typography sx={{ fontWeight: 700, wordBreak: 'break-word' }}>{m.medicamento} <Box component="span" sx={{ color: 'text.secondary', fontWeight: 600 }}>× {m.analito}</Box></Typography>
                <Typography variant="body2" color="text.secondary" sx={{ wordBreak: 'break-word' }}>{m.observacao}</Typography>
              </Box>
            ))}
          </Stack>
        </ReportSectionCard>
      )}

      {s.sugestoesNutricao && s.sugestoesNutricao.length > 0 && (
        <ReportSectionCard icon={<RestaurantIcon />} title="Sugestões de nutrição" accent="#047857" count={s.sugestoesNutricao.length} collapsible defaultExpanded={false}>
          <Stack spacing={0.5}>
            {s.sugestoesNutricao.map((b: any, i: number) => <Typography key={i} variant="body2" sx={{ py: 0.25, wordBreak: 'break-word' }}>🥗 {txt(b)}</Typography>)}
          </Stack>
        </ReportSectionCard>
      )}

      {s.metasSaude && s.metasSaude.length > 0 && (
        <ReportSectionCard icon={<TrackChangesIcon />} title="Metas de saúde" accent="#0369a1" count={s.metasSaude.length} collapsible defaultExpanded={false}>
          <Grid container spacing={1.5}>
            {s.metasSaude.map((m: any, i: number) => <Grid key={i} size={{ xs: 12, md: 6 }}><MetaCard m={m} /></Grid>)}
          </Grid>
        </ReportSectionCard>
      )}

      {leituraRaw && (
        <Box sx={{ p: 2.5, borderRadius: RADIUS.card, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider' }}>
          <Typography
            variant="overline"
            sx={{
              display: 'block',
              mb: 1,
              color: 'primary.main',
              fontWeight: 800,
              letterSpacing: '0.08em',
              lineHeight: 1.4,
            }}
          >
            Leitura final
          </Typography>
          {leituraAsBullets ? (
            <List dense disablePadding>
              {leituraSentences.map((sen, i) => (
                <ListItem key={i} disableGutters alignItems="flex-start" sx={{ py: 0.35 }}>
                  <ListItemIcon sx={{ minWidth: 22, mt: 0.4, color: 'primary.main', fontWeight: 800, fontSize: 13 }}>
                    {i + 1}.
                  </ListItemIcon>
                  <ListItemText
                    primary={sen}
                    primaryTypographyProps={{ sx: { wordBreak: 'break-word', lineHeight: 1.65, color: 'text.primary' } }}
                  />
                </ListItem>
              ))}
            </List>
          ) : (
            <Typography sx={{ lineHeight: 1.7, wordBreak: 'break-word' }}>{leituraRaw}</Typography>
          )}
          {/* Disclaimer como footnote dentro da última seção — caption, text.secondary, left-aligned. */}
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2, lineHeight: 1.45 }}>
            {disclaimer}
          </Typography>
        </Box>
      )}

      {!leituraRaw && (
        /* Sem leituraFinal — disclaimer ainda vira footnote (não centrado). */
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.45 }}>
          {disclaimer}
        </Typography>
      )}
    </>
  );
};
