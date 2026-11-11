import { Box, Stack, Typography, Grid, List, ListItem, ListItemIcon, ListItemText } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import DescriptionIcon from '@mui/icons-material/Description';
import ReportProblemIcon from '@mui/icons-material/ReportProblem';
import MedicationIcon from '@mui/icons-material/Medication';
import InsightsIcon from '@mui/icons-material/Insights';
import { ReportSectionCard } from './ReportSectionCard';
import { DestaqueCard } from './DestaqueCard';
import { RADIUS } from '../../theme';
import { Frame, FrameHeader, FramePanel } from '@/components/reui/frame';
import { Badge } from '@/components/reui/badge';
import { IconTile } from '@/components/reui/icon-tile';
import { FileText, AlertTriangle, ArrowUpRight } from 'lucide-react';

/**
 * Normaliza o campo estruturado em array — a IA às vezes devolve objeto/string único.
 * Cópia fiel do helper asArr do ConsolidatedReport (mesma robustudez).
 */
const asArr = (x: any): any[] => (Array.isArray(x) ? x : x == null ? [] : [x]);


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
  // CAMADA 3 — frescor (attachRecency no server): data-base + idade por marcador.
  recency?: {
    baseDate?: string | null;
    allOutdated?: boolean | null;
    markers?: { name: string; nameCanonical?: string | null; monthsSinceLast?: number | null; historical?: boolean | null }[];
  };
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
 * CLÍNICAS do ConsolidatedReport (exames-base, destaques, atenção, interações, leitura final).
 * É a visão do MÉDICO: ficam de fora "Perguntas ao médico" (o paciente envia; o médico só vê) e,
 * desde 11/11 (pedido do dono), o conteúdo escrito PARA o paciente — pontos positivos, sugestões
 * de nutrição e metas de saúde ("conforme orientação médica" não informa quem orienta).
 *
 * Cada seção é guardada por `asArr(...).length > 0`. Ícone-clicável só se `onOpenExam` for fornecido.
 *
 * Apresentação premium:
 *  - verde = sinal (apenas no ícone), texto neutro (text.primary) — sem "muro de chips";
 *  - `leituraFinal` longo vira bullets; curto mantém-se como prosa com header small-caps;
 *  - disclaimer vira footnote (caption text.secondary), não linha centrada flutuante.
 */
export const ConsolidatedReportBody = ({ analysis, sourceExams, onOpenExam, hideDuplicateSummary = false }: { analysis: any; sourceExams: any[]; onOpenExam?: (id: string) => void; hideDuplicateSummary?: boolean }) => {
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

  // CAMADA 3 — frescor por marcador (mesma chave normalizada do ConsolidatedReport): o
  // médico vê "há X meses" quando a medição passou de 6m — valor antigo não é quadro atual.
  const normKey = (x: string) => x.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  const recencyMap = new Map<string, number | null>();
  for (const rm of s.recency?.markers ?? []) {
    for (const key of [rm.name, rm.nameCanonical ?? '']) {
      if (key) recencyMap.set(normKey(key), rm.monthsSinceLast ?? null);
    }
  }
  const recencyAge = (name: string): number | null => {
    if (!recencyMap.size || !name) return null;
    const cn = normKey(name);
    if (recencyMap.has(cn)) return recencyMap.get(cn) ?? null;
    for (const [k, v] of recencyMap) if ((k.length >= 3 && cn.length >= 3) && (k.includes(cn) || cn.includes(k))) return v ?? null;
    return null;
  };
  // Data-base: recency (DB) com fallback pro 1º exame-base (relatórios antigos).
  const baseDate = s.recency?.baseDate ?? (sourceExams[0]?.performedAt ? fmtDate(sourceExams[0].performedAt) : null);

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
  // Evita exibir leituraFinal duplicada quando o resumoGeral no topo do dossiê já trouxe a síntese executiva.
  const leituraRaw = s.leituraFinal ? String(s.leituraFinal).trim() : '';
  const hasResumoAtTop = hideDuplicateSummary && Boolean(s.resumoGeral && String(s.resumoGeral).trim().length > 40);
  const showLeituraFinal = Boolean(leituraRaw && !hasResumoAtTop);
  const leituraSentences = leituraRaw ? splitSentences(leituraRaw) : [];
  const leituraAsBullets = leituraRaw.length > 280 && leituraSentences.length > 1;

  return (
    <>
      {/* CAMADA 3 — âncora de frescor (oculta quando já exibida no cabeçalho executivo ReUI) */}
      {baseDate && !hideDuplicateSummary && (
        <Box sx={{ mb: 1.5, display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
          <Typography variant="body2" sx={{ fontWeight: 700, color: 'primary.main' }}>
            📅 Baseado no exame mais recente ({baseDate})
          </Typography>
          {!!s.recency?.allOutdated && (
            <Typography variant="caption" sx={{ color: 'warning.main', fontWeight: 700 }}>
              — exames com mais de 6 meses: valores podem ter mudado
            </Typography>
          )}
        </Box>
      )}
      {sourceExams.length > 0 && (
        <ReportSectionCard icon={<DescriptionIcon />} title="Exames base do relatório" accent={theme.palette.primary.main} count={sourceExams.length} collapsible defaultExpanded={false}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {sourceExams.map((e: any, i: number) => (
              <div
                key={i}
                onClick={onOpenExam ? () => onOpenExam(e.id) : undefined}
                className={`flex items-center justify-between gap-2.5 rounded-xl border border-border/70 bg-muted/20 px-3 py-2.5 transition-colors ${onOpenExam ? 'cursor-pointer hover:border-primary/40 hover:bg-primary/5' : ''}`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <IconTile size="sm" variant="soft" className="text-teal-600">
                    <FileText className="size-3.5" />
                  </IconTile>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-foreground truncate" title={e.title}>
                      {e.title}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {e.performedAt ? fmtDate(e.performedAt) : 's/d'}
                      {e.sourceLab ? ` · ${trimLab(e.sourceLab)}` : ''}
                    </div>
                  </div>
                </div>
                {onOpenExam && <ArrowUpRight className="size-3.5 text-primary shrink-0" />}
              </div>
            ))}
          </div>
        </ReportSectionCard>
      )}

      {s.comparativo && s.comparativo.length > 0 && (
        <ReportSectionCard icon={<InsightsIcon />} title="Itens em destaque" accent="#0369a1" count={s.comparativo.length}>
          <Grid container spacing={1.5}>
            {s.comparativo.map((c: any, i: number) => <Grid key={i} size={{ xs: 12, md: 6 }}><DestaqueCard c={c} monthsSinceLast={recencyAge(String(c?.name ?? ''))} /></Grid>)}
          </Grid>
        </ReportSectionCard>
      )}

      {s.pontosAtencao && s.pontosAtencao.length > 0 && (
        <ReportSectionCard icon={<ReportProblemIcon />} title="Pontos de atenção" accent="#ef4444" count={s.pontosAtencao.length}>
          <Stack spacing={1.25}>
            {s.pontosAtencao.map((p: any, i: number) => (
              <div key={i} className="flex items-start gap-3 rounded-xl border border-red-500/25 bg-red-500/[0.05] p-3.5">
                <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-red-500/15 text-xs font-extrabold text-red-600 dark:text-red-400">
                  {i + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-red-600 dark:text-red-400 break-words">
                    {p.titulo}
                  </div>
                  <div className="mt-0.5 text-xs leading-relaxed text-foreground/90 break-words">
                    {p.detalhe}
                  </div>
                </div>
              </div>
            ))}
          </Stack>
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

      {showLeituraFinal && (
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

      {!showLeituraFinal && !hideDuplicateSummary && (
        /* Sem leituraFinal — disclaimer ainda vira footnote (não centrado). */
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.45 }}>
          {disclaimer}
        </Typography>
      )}
    </>
  );
};
