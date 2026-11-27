import { Fragment, useEffect, useState, useRef, type ReactNode } from 'react';
import { plural, fmtDateShort, timeAgo } from '../../utils/format';
import { prefetchExam } from '../../utils/examPrefetch';
import { List, useListContext, useRefresh, useNotify, useTranslate } from 'react-admin';
import { track } from '../../utils/analytics';
import { chipA11y } from '../../utils/chipA11y';
import { IconTile } from '../../components/IconTile';
import { Chip, Box, CardContent, Typography, IconButton, Stack, LinearProgress, Button, Accordion, AccordionSummary, AccordionDetails, Alert, TextField, InputAdornment, ToggleButton, ToggleButtonGroup, useTheme, useMediaQuery } from '@mui/material';
import { alpha, lighten } from '@mui/material/styles';
import { DrExameRobot } from '../../components/DrExameRobot';
import ScienceIcon from '@mui/icons-material/Science';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ScheduleIcon from '@mui/icons-material/Schedule';
import FiberNewIcon from '@mui/icons-material/FiberNew';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import ImageIcon from '@mui/icons-material/Image';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CloseIcon from '@mui/icons-material/Close';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import LockIcon from '@mui/icons-material/Lock';
import BlockIcon from '@mui/icons-material/Block';
import ReplayIcon from '@mui/icons-material/Replay';
import SearchIcon from '@mui/icons-material/Search';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import { useNavigate } from 'react-router-dom';
import { useSelectedPatient } from '../../patient-context';
import { useReveal } from '../../hooks/useReveal';
import { celebrate } from '../../hooks/useCelebrate';
import { DUR } from '../../motion';
import { PrivacyText } from '../../hooks/usePrivacyMode';
import { API_URL, token, fetchPublicConfig } from '../../config';
import { ExplainButton } from '../../components/ExplainItem';
import { usePremium } from '../../components/PremiumGate';
import { groupByYear } from '../../utils/groupByYear';
import { categorizeExam, CATS } from '../../utils/medicalData';
import { PageContainer } from '../../components/layout/PageContainer';
import { PageHeader } from '../../components/layout/PageHeader';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { ListSkeleton } from '../../components/Skeleton';
import { EmptyState } from '../../components/EmptyState';
import { LabBadge } from '../../components/LabBadge';
import { AppCard } from '../../components/AppCard';
import { ProcessingStages } from '../../components/ProcessingStages';
import { DateLabel } from '../../components/DateLabel';
import { ChangesSinceExam, type Marker } from '../../components/dashboard/ChangesSinceExam';
import { ExamShow } from './ExamShow';
import { cleanExtractedLabel } from '../../utils/examDisplay';
import { openExamFile } from '../../utils/examFile';
import { ExamFilePreview } from '../../components/ExamFilePreview';
import { RADIUS, SEM, tealText } from '../../theme';
import { SecondaryButton } from '../../components/SecondaryButton';
import { prettyName } from '../../utils/names';
import { elapsedLabel } from '../../utils/elapsed';
import { Timeline, TimelineItem, TimelineSeparator, TimelineIndicator, TimelineHeader, TimelineTitle, TimelineDate, TimelineContent } from '@/components/reui/timeline';

// Status de PROCESSAMENTO (não clínico) → chave de paleta (token, sem hex literal).
const statusColor: Record<string, 'success' | 'error' | 'warning' | 'info' | 'default'> = { EXTRACTED: 'success', FAILED: 'error', UPLOADED: 'warning', EXTRACTING: 'info', REJECTED: 'default' };
const statusLabel: Record<string, string> = { EXTRACTED: 'Pronto', FAILED: 'Falhou', UPLOADED: 'Enviado', EXTRACTING: 'Extraindo', REJECTED: 'Rejeitado' };
const kindLabel: Record<string, string> = { LAB_PANEL: 'Laboratorial', IMAGING: 'Imagem', OTHER: 'Outro' };

/** Cor de paleta resolved (pra alpha em bgcolor) — default cai em text.secondary. */
const toneMain = (t: any, sc: string) => (sc === 'default' ? t.palette.text.secondary : (t.palette as any)[sc]?.main ?? t.palette.text.secondary);

const RECENT_DAYS = 90; // filtro "Recentes": últimos ~3 meses.

/** Tema mínimo p/ callbacks sx de cor por modo (indexar SEM com `any` dá TS7053). */
type ModeTheme = { palette: { mode: 'light' | 'dark' } };

/** Hover de cartão de LISTA (25/11/26, regra de profundidade do DS): o AppCard interativo levanta e ganha
 *  sombra sob o mouse; aqui só a borda acende — sombra fica com o que flutua. O sx do AppCard é espalhado por
 *  objeto, então o hover precisa vir inteiro (o dele é substituído, não mesclado). */
const QUIET_HOVER = { transform: 'none', boxShadow: 'none', borderColor: 'rgba(32,178,170,.55)' } as const;

/** Título de grupo da lista — mesmo nível do título de seção da Home (Poppins 17/700). */
const GROUP_TITLE_STYLE = { fontSize: 17, fontWeight: 700, lineHeight: 1.25, fontFamily: '"Poppins", sans-serif' } as const;

/** Texto de chip de status legível nos dois modos: o hex da paleta (#dc2626) dava 4,0:1 sobre a lavagem e
 *  quase sumia no escuro. Usa o par light/dark de SEM. */
const SEM_BY_TONE: Record<string, 'ok' | 'bad' | 'warn' | 'info'> = { success: 'ok', error: 'bad', warning: 'warn', info: 'info' };
const statusText = (t: ModeTheme, sc: string) => (SEM_BY_TONE[sc] ? SEM[SEM_BY_TONE[sc]][t.palette.mode] : toneMain(t, sc));

/** Texto de chip "na faixa" / "fora da faixa" sobre a própria lavagem: os tons -700 de SEM davam 4,49:1 e ~4,1:1
 *  no modo claro (medido em 25/11/26). No escuro os pares de SEM já passam. */
const okText = (t: ModeTheme) => (t.palette.mode === 'dark' ? SEM.ok.dark : '#065f46');
const warnText = (t: ModeTheme) => (t.palette.mode === 'dark' ? SEM.warn.dark : '#92400e');

/** Palavras curtas não quebram no meio: "Vitamina D — 25-OH" partia em "25-" / "OH" no celular. Cada pedaço de
 *  até `max` letras vira um trecho inseparável; nomes longos continuam quebrando onde couber. */
const UnbrokenWords = ({ text, max = 14 }: { text: string; max?: number }) => (
  <>
    {text.split(' ').map((w, i) => (
      <Fragment key={i}>
        {i > 0 && ' '}
        {w.length <= max ? <Box component="span" sx={{ whiteSpace: 'nowrap' }}>{w}</Box> : w}
      </Fragment>
    ))}
  </>
);

/** "22 resultados" / "Documento médico" — mesma frase do rodapé do card, para a linha de detalhe da timeline. */
const itemCountText = (r: any) => { const n: number = r?._count?.items ?? 0; return n > 0 ? plural(n, 'resultado') : 'Documento médico'; };

/** Título de grupo da lista ("Em processamento", "Não foi possível ler", "Não adicionados").
 *  Mesmo papel do título de seção da Home (25/11/26): 17px e o ícone do conjunto do app — antes o
 *  ícone era um emoji dentro do texto traduzido. A contagem fica ao lado, como antes. */
const GroupTitle = ({ icon, title, count, tone = 'neutral' }: { icon: ReactNode; title: string; count: number; tone?: 'info' | 'bad' | 'neutral' }) => {
  // SEM.bad em vez de error.main (25/11/26): o #dc2626 da paleta dava 3,7:1 no chip de contagem, sobre a lavagem.
  const color = (t: ModeTheme) => (tone === 'neutral' ? 'text.secondary' : SEM[tone === 'info' ? 'info' : 'bad'][t.palette.mode]);
  const wash = (t: ModeTheme) => (tone === 'neutral' ? 'action.hover' : alpha(SEM[tone === 'info' ? 'info' : 'bad'][t.palette.mode], 0.14));
  return (
    <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 0.75 }}>
      <Box sx={{ display: 'flex', color, '& svg': { fontSize: 20 } }} aria-hidden="true">{icon}</Box>
      <Typography component="h2" sx={{ ...GROUP_TITLE_STYLE, color, minWidth: 0 }}>{title}</Typography>
      <Chip size="small" label={count} sx={{ height: 24, minWidth: 24, px: 0.75, fontSize: 13, fontWeight: 700, bgcolor: wash, color }} />
    </Stack>
  );
};

/** Ano (int) de um exame — performedAt (data do exame) com fallback no envio (createdAt). */
const yearOf = (r: any): number | null => {
  const d = r?.performedAt ?? r?.createdAt;
  if (!d) return null;
  const y = new Date(d).getFullYear();
  return Number.isNaN(y) ? null : y;
};

/** Cartão de exame EM PROCESSAMENTO (UPLOADED/EXTRACTING) — sempre no TOPO da lista.
 *  Etapas visuais (ProcessingStages) + barra indeterminada (não há % real no
 *  servidor). Toca pra acompanhar a extração.
 *  E2: tempo decorrido INLINE (criação real do exame) — sem precisar entrar no detalhe
 *  pra saber "há quanto tempo está analisando" (queixa do dono 26/09). */
const ProcessingCard = ({ r, onCancel }: { r: any; onCancel?: (e: any) => void }) => {
  const navigate = useNavigate();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const start = r.createdAt ? new Date(r.createdAt).getTime() : 0;
  const elapsed = start ? Math.max(0, Math.floor((now - start) / 1000)) : 0;
  // Etapa corrente pelo status REAL do exame: EXTRACTING = IA já lendo o conteúdo.
  const stage = r.status === 'EXTRACTING' ? 1 : 0;
  return (
    <AppCard
      kind="interactive"
      onClick={() => navigate(`/exams/${r.id}/show`)}
      onPointerDown={() => prefetchExam(r.id)}
      sx={{
        overflow: 'hidden',
        // Entrada suave (audit motion 17/11): o card nasce 8px abaixo/97% e assenta —
        // mesma curva do dxDrawerItemFade do App. Antes teleportava após o submit.
        animation: 'dxProcCardIn 0.28s cubic-bezier(0.16, 1, 0.3, 1) backwards',
        '@keyframes dxProcCardIn': {
          from: { opacity: 0, transform: 'scale(0.97) translateY(8px)' },
          to: { opacity: 1, transform: 'none' },
        },
        '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
        '&:hover': QUIET_HOVER,
      }}
    >
      <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pt: 1.5, px: { xs: 1.5, sm: 2 } }}>
          <Box sx={{ flexShrink: 0, display: 'grid', placeItems: 'center' }}>
            <DrExameRobot size={48} />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 700, wordBreak: 'break-word', overflowWrap: 'anywhere', lineHeight: 1.2 }}>{r.title || 'Novo exame enviado'}</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              {r.status === 'EXTRACTING' ? 'Lendo os resultados…' : 'Exame recebido, preparando a leitura…'} {start ? <Box component="span" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{elapsedLabel(elapsed)}</Box> : null}
            </Typography>
          </Box>
          {onCancel && <IconButton onClick={(e) => { e.stopPropagation(); onCancel(e); }} title="Cancelar e excluir" aria-label="Cancelar e excluir exame" sx={{ flexShrink: 0, color: 'text.secondary', width: 44, height: 44 }}><CloseIcon sx={{ fontSize: 20 }} /></IconButton>}
          <ChevronRightIcon sx={{ color: 'text.disabled', flexShrink: 0, display: { xs: 'none', sm: 'block' } }} />
        </Box>
        {/* Orienta a espera: quanto costuma levar, se pode sair e como vai saber que terminou.
            (25/11/26) Em linha inteira, abaixo do cabeçalho: espremido na coluna do título eram 4 linhas
            num celular de 360px. Preso há mais de um dia ganha frase própria — "demorando mais" não descreve. */}
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.4, mt: 0.25, px: { xs: 1.5, sm: 2 } }}>
          {elapsed >= 86400
            ? 'A leitura está demorando muito mais que o normal. Não precisa reenviar: se não der para ler, avisamos e devolvemos o crédito.'
            : elapsed > 240
              ? 'Está demorando mais que o normal. Não precisa reenviar: se não der para ler, avisamos e devolvemos o crédito.'
              : 'Costuma levar de 1 a 3 minutos. Pode sair desta tela ou enviar outro exame: avisamos quando ficar pronto.'}
        </Typography>
      </CardContent>
      <Box sx={{ px: { xs: 1.5, sm: 2 }, pt: 1, pb: 1.25 }}>
        <ProcessingStages active={stage} />
      </Box>
      <LinearProgress sx={{ height: 4, '& .MuiLinearProgress-bar': { background: 'linear-gradient(90deg,#0ea5e9,#20b2aa)' } }} />
    </AppCard>
  );
};

/** Enquanto a contagem de valores fora da faixa não chega: selo neutro, sem dizer "na faixa". */
const CheckingChip = ({ height = 22 }: { height?: number }) => (
  <Chip size="small" label="conferindo valores…" sx={{ height, fontSize: 12, fontWeight: 600, borderRadius: RADIUS.pill, bgcolor: 'action.hover', color: 'text.secondary' }} />
);

/** HERO — último exame (mais recente extraído). Âncora de "qual é a situação agora". */
const ExamHero = ({ r, abnCount, onView, onPdf }: { r: any; abnCount: number | null; onView: () => void; onPdf: () => void }) => {
  const titleInfo = cleanExtractedLabel(r.title, kindLabel[r.kind] ?? 'Exame', 60);
  const itemCount: number = r._count?.items ?? 0;
  return (
    // Cartão limpo (regra de profundidade do DS, 25/11/26): sem tinta nem brilho decorativos.
    <AppCard sx={{ p: { xs: 2, md: 2.5 }, height: '100%' }}>
      {/* Sem uppercase/ls largo no label (audit: caixa alta = cara de dashboard admin, não app premium). */}
      <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'text.secondary' }}>Último exame</Typography>
      <Typography title={titleInfo.original || r.title} sx={{ fontFamily: 'Poppins, sans-serif', fontWeight: 800, fontSize: { xs: 19, md: 22 }, lineHeight: 1.2, mt: 0.25, wordBreak: 'break-word' }}>{titleInfo.text || 'Exame'}</Typography>
      <Box sx={{ mt: 0.5 }}><DateLabel date={r.performedAt} fallback="Sem data no laudo — abra para conferir" sx={{ fontSize: '0.82rem' }} /></Box>
      <Stack direction="row" spacing={1.5} sx={{ mt: 1, flexWrap: 'wrap', rowGap: 0.5, alignItems: 'center' }}>
        <Typography sx={{ fontSize: 14, color: 'text.secondary' }}>{itemCount} resultado{itemCount !== 1 ? 's' : ''}</Typography>
        {abnCount == null ? <CheckingChip /> : abnCount > 0 ? (
          <Chip size="small" label={`${abnCount} fora da faixa`} sx={{ height: 22, fontWeight: 700, borderRadius: RADIUS.pill, bgcolor: (t) => alpha(SEM.warn[t.palette.mode], 0.14), color: warnText }} />
        ) : (
          <Chip size="small" label="Todos na faixa" sx={{ height: 22, fontWeight: 700, borderRadius: RADIUS.pill, bgcolor: (t) => alpha(SEM.ok[t.palette.mode], 0.14), color: okText }} />
        )}
      </Stack>
      <Stack direction="row" spacing={1} sx={{ mt: 2.25 }}>
        {/* Ação discreta: o destaque da lista é o "+" de enviar exame (uma ação destaque por tela). */}
        <SecondaryButton onClick={onView} endIcon={<ArrowForwardIcon />} sx={{ flex: 1 }}>Ver análise</SecondaryButton>
        <Button variant="outlined" onClick={onPdf} startIcon={<PictureAsPdfOutlinedIcon />} sx={{ borderRadius: RADIUS.button, textTransform: 'none', fontWeight: 700, borderColor: 'divider', color: 'text.secondary' }}>Abrir laudo</Button>
      </Stack>
    </AppCard>
  );
};

/**
 * Último exame em UMA linha (celular): antes o cartão grande + "O que mudou" ocupavam a primeira
 * tela inteira e a lista de exames só aparecia rolando (dono, 16/11). O "O que mudou" continua
 * no Início; aqui a pessoa veio para ver os exames.
 */
const ExamHeroCompact = ({ r, abnCount, onView }: { r: any; abnCount: number | null; onView: () => void }) => {
  const titleInfo = cleanExtractedLabel(r.title, kindLabel[r.kind] ?? 'Exame', 60);
  const itemCount: number = r._count?.items ?? 0;
  return (
    <AppCard sx={{ p: 0 }}>
      <Box component="button" type="button" onClick={onView} onPointerDown={() => prefetchExam(r.id)} aria-label={`Abrir a análise do último exame: ${titleInfo.text || 'Exame'}`}
        sx={{ all: 'unset', boxSizing: 'border-box', width: '100%', minHeight: 72, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1.25, borderRadius: 'inherit',
          '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 }, '&:active': { transform: 'scale(0.99)' }, transition: 'transform 160ms cubic-bezier(0.22,1,0.36,1)' }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {/* Data + "de quando" junto do rótulo (25/11/26): "Último exame" sem idade do exame violava a regra
              "nenhum dado de saúde sem dizer de quando é" — e no celular esta linha é a única que cabe. */}
          <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'text.secondary' }}>
            Último exame{' '}
            {r.performedAt && (
              <Typography component="span" sx={{ fontSize: 12, fontWeight: 600, ml: 0.75 }}>
                · {fmtDateShort(r.performedAt)}{timeAgo(r.performedAt) ? ` · ${timeAgo(r.performedAt)}` : ''}
              </Typography>
            )}
          </Typography>
          {/* Até 2 linhas (27/11/26): com fonte ampliada o nome era cortado já na 1ª ("Check-up de rotina (…"). */}
          <Typography sx={{ fontFamily: 'Poppins, sans-serif', fontWeight: 800, fontSize: 16, lineHeight: 1.25, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflowWrap: 'anywhere' }}>{titleInfo.text || 'Exame'}</Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 0.25, alignItems: 'center', flexWrap: 'wrap', rowGap: 0.25 }}>
            <Typography sx={{ fontSize: 12.5, color: 'text.secondary' }}>{itemCount} resultado{itemCount !== 1 ? 's' : ''}</Typography>
            {abnCount == null ? <CheckingChip height={20} /> : (
            <Chip size="small" label={abnCount > 0 ? `${abnCount} fora da faixa` : 'Todos na faixa'}
              sx={{ height: 20, fontSize: 12, fontWeight: 700, borderRadius: RADIUS.pill, bgcolor: (t) => alpha((abnCount > 0 ? SEM.warn : SEM.ok)[t.palette.mode], 0.14), color: (t) => (abnCount > 0 ? warnText(t) : okText(t)) }} />
            )}
          </Stack>
        </Box>
        <Box aria-hidden sx={{ flexShrink: 0, width: 40, height: 40, borderRadius: '50%', display: 'grid', placeItems: 'center', color: '#fff', background: 'linear-gradient(135deg,#20b2aa,#178f89)' }}>
          <ArrowForwardIcon sx={{ fontSize: 20 }} />
        </Box>
      </Box>
    </AppCard>
  );
};

/** Toolbar Unificada de Filtros: Busca + Alternância por Data/Categoria + Régua Única de Chips (sem duplicação) */
const ExamFilterToolbar = ({
  q, setQ,
  sfilter, setSfilter,
  cat, setCat,
  view, setView,
  extractedCount,
  abnormalCount,
  recentCount,
  presentCats,
  catCounts,
  translate,
}: {
  q: string; setQ: (v: string) => void;
  sfilter: 'all' | 'altered' | 'recent'; setSfilter: (v: 'all' | 'altered' | 'recent') => void;
  cat: string; setCat: (v: string) => void;
  view: 'date' | 'category'; setView: (v: 'date' | 'category') => void;
  extractedCount: number;
  abnormalCount: number;
  recentCount: number;
  presentCats: typeof CATS;
  catCounts: Record<string, number>;
  translate: any;
}) => {
  const isAllActive = sfilter === 'all' && cat === 'all';
  const isAlteredActive = sfilter === 'altered';
  const isRecentActive = sfilter === 'recent';
  // No celular o campo tem ~190px: o exemplo "(TSH, glicose...)" saía cortado no meio. Fica só no desktop.
  const theme = useTheme();
  const isSm = useMediaQuery(theme.breakpoints.up('sm'));

  return (
    <Stack spacing={1} sx={{ mb: 0.5 }}>
      {/* Linha Topo: Busca + Alternador Discreto (Data vs Categoria) */}
      <Stack direction="row" spacing={1} alignItems="center">
        <TextField
          size="small"
          fullWidth
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={isSm ? 'Buscar exame (TSH, glicose...)' : 'Buscar exame…'}
          inputProps={{ 'aria-label': 'Buscar exame por nome' }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" sx={{ color: 'text.secondary' }} />
              </InputAdornment>
            ),
            endAdornment: q ? (
              <InputAdornment position="end">
                <IconButton size="small" onClick={() => setQ('')} edge="end" aria-label="Limpar busca">
                  <CloseIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            ) : null,
          }}
          sx={{ flex: 1, '& .MuiOutlinedInput-root': { borderRadius: RADIUS.button, bgcolor: 'background.paper', minHeight: { xs: 48, md: 44 } } }}
        />
        <ToggleButtonGroup
          exclusive
          size="small"
          value={view}
          onChange={(_, v) => { if (v) setView(v); }}
          sx={{ flexShrink: 0, bgcolor: 'background.paper', borderRadius: RADIUS.button, height: { xs: 48, md: 44 } }}
        >
          <ToggleButton value="date" aria-label="Visualizar por data" sx={{ px: { xs: 1.25, sm: 1.5 }, py: 0.5, minWidth: { xs: 48, sm: 0 }, minHeight: { xs: 48, md: 44 }, fontSize: 12, fontWeight: 700, textTransform: 'none', border: '1px solid', borderColor: 'divider', gap: 0.5 }}>
            <CalendarMonthIcon sx={{ fontSize: 16 }} />
            <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Data</Box>
          </ToggleButton>
          <ToggleButton value="category" aria-label="Visualizar por categoria" sx={{ px: { xs: 1.25, sm: 1.5 }, py: 0.5, minWidth: { xs: 48, sm: 0 }, minHeight: { xs: 48, md: 44 }, fontSize: 12, fontWeight: 700, textTransform: 'none', border: '1px solid', borderColor: 'divider', gap: 0.5 }}>
            <FolderOutlinedIcon sx={{ fontSize: 16 }} />
            <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Categoria</Box>
          </ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      {/* Régua de chips de filtro (filtros rápidos + categorias) */}
      <FilterChipRow>
        {/* Todos — inativo mode-aware (lavagem teal + texto AA por modo); ativo = sólido. */}
        <Chip
          size="small"
          label={translate('exams.all', { count: extractedCount })}
          onClick={() => { setSfilter('all'); setCat('all'); }}
          {...chipA11y(isAllActive)}
          sx={{
            height: 44,
            flexShrink: 0,
            fontWeight: 800,
            whiteSpace: 'nowrap',
            bgcolor: isAllActive ? '#0f5f5a' : (t) => alpha(t.palette.primary.main, 0.10),
            color: isAllActive ? '#fff' : (t) => tealText(t.palette.mode),
            border: '1px solid',
            borderColor: isAllActive ? '#0f5f5a' : (t) => alpha(t.palette.primary.main, 0.28),
          }}
        />

        {/* Alterados */}
        {abnormalCount > 0 && (
          <Chip
            size="small"
            icon={<WarningAmberIcon sx={{ fontSize: '15px !important', color: (t: ModeTheme) => `${isAlteredActive ? '#fff' : SEM.warn[t.palette.mode]} !important`, ml: 0.5, mr: -0.5 }} />}
            label={`Fora da faixa (${abnormalCount})`}
            onClick={() => { setSfilter(isAlteredActive ? 'all' : 'altered'); setCat('all'); }}
            {...chipA11y(isAlteredActive)}
            sx={{
              height: 44,
              flexShrink: 0,
              fontWeight: 800,
              whiteSpace: 'nowrap',
              bgcolor: isAlteredActive ? '#c2410c' : (t) => alpha(SEM.warn[t.palette.mode], 0.12),
              color: isAlteredActive ? '#fff' : (t) => SEM.warn[t.palette.mode],
              border: '1px solid',
              borderColor: isAlteredActive ? '#c2410c' : (t) => alpha(SEM.warn[t.palette.mode], 0.3),
            }}
          />
        )}

        {/* Recentes */}
        {recentCount > 0 && (
          <Chip
            size="small"
            icon={<ScheduleIcon sx={{ fontSize: '15px !important', color: (t: ModeTheme) => `${isRecentActive ? '#fff' : SEM.info[t.palette.mode]} !important`, ml: 0.5, mr: -0.5 }} />}
            label={`Recentes (${recentCount})`}
            onClick={() => { setSfilter(isRecentActive ? 'all' : 'recent'); setCat('all'); }}
            {...chipA11y(isRecentActive)}
            sx={{
              height: 44,
              flexShrink: 0,
              fontWeight: 700,
              whiteSpace: 'nowrap',
              bgcolor: isRecentActive ? '#0284c7' : (t) => alpha(SEM.info[t.palette.mode], 0.12),
              color: isRecentActive ? '#fff' : (t) => SEM.info[t.palette.mode],
              border: '1px solid',
              borderColor: isRecentActive ? '#0284c7' : (t) => alpha(SEM.info[t.palette.mode], 0.3),
            }}
          />
        )}

        {/* Categorias (Hemograma, Imagem, Hormônios...) — inativo clareia a cor da
            categoria no dark (hex do CATS foi calibrado p/ fundo claro). */}
        {presentCats.map((c) => {
          const isCatActive = cat === c.key && sfilter === 'all';
          const IconComp = c.icon;
          return (
            <Chip
              key={c.key}
              size="small"
              icon={<IconComp sx={{ fontSize: '15px !important', ml: 0.5, mr: -0.5 }} />}
              label={`${c.cat} (${catCounts[c.key]})`}
              onClick={() => { setCat(isCatActive ? 'all' : c.key); setSfilter('all'); }}
              {...chipA11y(isCatActive)}
              sx={{
                height: 44,
                flexShrink: 0,
                fontWeight: 700,
                whiteSpace: 'nowrap',
                bgcolor: isCatActive ? c.color : (t) => alpha(c.color, t.palette.mode === 'dark' ? 0.22 : 0.10),
                // Texto do chip em cinza escuro no modo claro: a cor da categoria em 13px dava 3,2:1 de
                // contraste (25/11/26). A cor da categoria segue no fundo, na borda e no ícone.
                color: isCatActive ? '#fff' : (t) => (t.palette.mode === 'dark' ? lighten(c.color, 0.35) : '#1e293b'),
                border: '1px solid',
                borderColor: isCatActive ? c.color : (t) => alpha(c.color, t.palette.mode === 'dark' ? 0.45 : 0.25),
                '& .MuiChip-icon': { color: isCatActive ? '#fff !important' : (t: ModeTheme) => `${t.palette.mode === 'dark' ? lighten(c.color, 0.35) : c.color} !important` },
              }}
            />
          );
        })}
      </FilterChipRow>
    </Stack>
  );
};

/**
 * Régua de chips de filtro da tela Exames.
 *
 * No celular é UMA linha que rola de lado com a barra escondida — e o chip da borda aparecia
 * CORTADO no meio do rótulo, sem sinal de que havia mais (dono 23/11: "o label aparece cortado").
 * Agora um degradê na borda direita (por mask, então vale no claro e no escuro) mostra a
 * continuação, e some quando a régua chega ao fim.
 *
 * No desktop (md+) o mouse não arrasta essa rolagem: os chips depois da borda ficavam cortados
 * E inalcançáveis. Lá a régua quebra linha — nenhum chip cortado, nenhum perdido.
 */
const FilterChipRow = ({ children }: { children: ReactNode }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setMore(el.scrollWidth - el.scrollLeft - el.clientWidth > 4);
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    ro?.observe(el);
    return () => { el.removeEventListener('scroll', update); ro?.disconnect(); };
  }, []);
  return (
    <Stack
      ref={ref}
      direction="row"
      spacing={0.75}
      sx={{
        overflowX: { xs: 'auto', md: 'visible' },
        flexWrap: { xs: 'nowrap', md: 'wrap' },
        rowGap: 0.75,
        py: 0.25,
        mx: -0.25,
        px: 0.25,
        '&::-webkit-scrollbar': { display: 'none' },
        ...(more ? {
          WebkitMaskImage: 'linear-gradient(to right, #000 calc(100% - 44px), transparent)',
          maskImage: 'linear-gradient(to right, #000 calc(100% - 44px), transparent)',
        } : {}),
      }}
    >
      {children}
    </Stack>
  );
};

/** Cards agrupados por ano OU por categoria + busca + filtros (Todos/Alterados/Recentes) + hero. */
const ExamCards = () => {
  const { data, isLoading, total } = useListContext<any>();
  const navigate = useNavigate();
  const translate = useTranslate();
  const refresh = useRefresh();
  const notify = useNotify();
  const premium = usePremium();
  const [pid] = useSelectedPatient();
  const theme = useTheme();
  const isMd = useMediaQuery(theme.breakpoints.up('md')); // desktop (sidebar visível) → master/detail
  const [selected, setSelected] = useState<string | null>(null);
  const reveal = useReveal(!!isLoading); // fade-in pós-skeleton (sem o "estalo" da troca seca)

  // Bônus de 1º exame no empty state — só pra quem ainda NÃO recebeu.
  const [firstBonus, setFirstBonus] = useState<number | null>(null);
  useEffect(() => {
    fetchPublicConfig().then((c) => setFirstBonus(c.freeSignup)).catch(() => setFirstBonus(null));
    fetch(`${API_URL}/auth/me`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.user?.firstExamBonusGranted) setFirstBonus(null); })
      .catch(() => {});
  }, []);

  // Agrupamento + filtros locais (a lista carrega tudo com perPage=1000).
  const [view, setView] = useState<'date' | 'category'>('date');
  const [cat, setCat] = useState<string>('all');
  const [sfilter, setSfilter] = useState<'all' | 'altered' | 'recent'>('all');
  const [q, setQ] = useState('');
  const [delTarget, setDelTarget] = useState<{ id: string; title: string } | null>(null);
  const [expandedAccordions, setExpandedAccordions] = useState<Record<string, boolean>>({});

  const isAccordionExpanded = (key: string, defaultVal: boolean) =>
    expandedAccordions[key] !== undefined ? expandedAccordions[key] : defaultVal;

  const toggleAccordion = (key: string, defaultVal: boolean) =>
    setExpandedAccordions((prev) => ({ ...prev, [key]: !isAccordionExpanded(key, defaultVal) }));

  // Contagem de alterados por exame (GET /items/abnormal → { items:[{examId,...}] }) +
  // "o que mudou" (health-summary topAttention/improving). Re-busca quando um processamento
  // termina (bump) — assim o hero e o filtro Alterados refletem o exame recém-extraído.
  const [abnByExam, setAbnByExam] = useState<Record<string, number>>({});
  // FALSA CALMA (27/11/26, medido no Android): antes da contagem chegar, `abnByExam[id] ?? 0` dava 0
  // e o cartão dizia "Todos na faixa" por ~600 ms — para um exame com 4 valores fora da faixa.
  // Sem a contagem, a tela não afirma nada sobre o resultado.
  const [abnReady, setAbnReady] = useState(false);
  const abnOf = (id: string): number | null => (abnReady ? (abnByExam[id] ?? 0) : null);
  const [worsened, setWorsened] = useState<Marker[]>([]);
  const [improved, setImproved] = useState<Marker[]>([]);
  const [hsLoaded, setHsLoaded] = useState(false);
  const [bump, setBump] = useState(0);

  // Re-busca a cada 5s enquanto há extrações. Quando a última vira EXTRACTED (processing >0 → 0),
  // o bônus/notificação foram concedidos server-side: avisa a wallet, o sino, e dá bump no hero.
  const processingCount = (data ?? []).filter((r: any) => r.status === 'UPLOADED' || r.status === 'EXTRACTING').length;
  const prevProcessingRef = useRef(processingCount);
  useEffect(() => {
    if (prevProcessingRef.current > 0 && processingCount === 0) {
      window.dispatchEvent(new Event('creditsChanged'));
      window.dispatchEvent(new Event('notificationsChanged'));
      setBump((b) => b + 1);
      track('exam_extracted'); // G4 — funil de ativação (no-op sem PostHog)
      // Celebração "exame pronto" — SÓ se NÃO é o 1º exame (o 1º tem o modal Celebration
      // dedicado no Dashboard; pill aqui seria celebração dupla).
      if ((data?.length ?? 0) !== 1) celebrate('exam_extracted', { count: prevProcessingRef.current });
    }
    prevProcessingRef.current = processingCount;
  }, [processingCount, data]);
  useEffect(() => {
    if (!processingCount) return;
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [processingCount, refresh]);

  useEffect(() => {
    let cancelled = false;
    const h = { Authorization: `Bearer ${token()}` };
    (async () => {
      try {
        const a = await fetch(`${API_URL}/items/abnormal?_start=0&_end=1000${pid ? `&patientId=${pid}` : ''}`, { headers: h });
        if (a.ok) {
          const arr = (await a.json())?.items ?? [];
          const m: Record<string, number> = {};
          for (const it of arr) { const eid = it?.examId; if (eid) m[eid] = (m[eid] ?? 0) + 1; }
          if (!cancelled) { setAbnByExam(m); setAbnReady(true); }
        }
      } catch { /* ignore */ }
      if (pid) {
        try {
          const hs = await fetch(`${API_URL}/patients/${pid}/health-summary`, { headers: h });
          if (hs.ok) {
            const hd = await hs.json();
            if (!cancelled) {
              // Mesma correção do Dashboard: "pioraram" = hd.worsening (tendência real), não
              // topAttention (alterados) — evita o mesmo marcador nas duas listas (dupliicação).
              setWorsened(Array.isArray(hd.worsening) ? hd.worsening.slice(0, 3) : []);
              setImproved(Array.isArray(hd.improving) ? hd.improving.slice(0, 3) : []);
              setHsLoaded(true);
            }
          }
        } catch { /* ignore */ }
      }
    })();
    return () => { cancelled = true; };
  }, [pid, bump]);

  if (isLoading) return <ListSkeleton count={4} />;

  const del = (e: any, id: string, title: string) => { e.stopPropagation(); setDelTarget({ id, title }); };
  const confirmDel = async () => {
    const t = delTarget; if (!t) return;
    try {
      const r = await fetch(`${API_URL}/exams/${t.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } });
      if (r.ok) { notify('Exame excluído', { type: 'success' }); refresh(); setBump((b) => b + 1); }
      else notify('Falha ao excluir', { type: 'error' });
    } catch { notify('Falha de conexão ao excluir.', { type: 'error' }); }
    finally { setDelTarget(null); }
  };
  const reextract = async (e: any, id: string) => {
    e.stopPropagation();
    const r = await fetch(`${API_URL}/exams/${id}/reextract`, { method: 'POST', headers: { Authorization: `Bearer ${token()}` } });
    if (r.ok) { notify('Re-extraindo…', { type: 'success' }); refresh(); } else notify('Falha ao re-extrair', { type: 'error' });
  };
  const openPdf = async (id: string) => {
    const ok = await openExamFile(id);
    if (!ok) notify('Não consegui abrir o laudo.', { type: 'error' });
  };

  const all = data ?? [];
  const processing = all.filter((r: any) => r.status === 'UPLOADED' || r.status === 'EXTRACTING');
  const failed = all.filter((r: any) => r.status === 'FAILED');
  const extracted = all.filter((r: any) => r.status === 'EXTRACTED');
  // REJECTED (CPF divergente): visíveis pro dono decidir (apelar ou excluir) — mas FORA do
  // histórico válido, hero, contagens e indicadores (nem entram em `extracted`).
  const rejected = all.filter((r: any) => r.status === 'REJECTED');

  // latestYear p/ gate Premium (do conjunto COMPLETO, não do filtrado — estável).
  const years = extracted.map(yearOf).filter((y): y is number => y != null);
  const latestYear = years.length ? Math.max(...years) : null;
  const isLocked = (r: any) => !premium && latestYear != null && yearOf(r) != null && (yearOf(r) as number) < latestYear;

  // Filtros: busca (título/lab) + categoria + status (Todos/Alterados/Recentes).
  const norm = (s: any) => (s == null ? '' : String(s)).toLowerCase().trim();
  const query = norm(q);
  const matchesSearch = (r: any) => !query || norm(r.title).includes(query) || norm(r.sourceLab).includes(query);
  const matchesCat = (r: any) => cat === 'all' || categorizeExam(r).key === cat;
  const matchesStatus = (r: any) => {
    if (sfilter === 'altered') return (abnByExam[r.id] ?? 0) > 0;
    if (sfilter === 'recent') { const d = r.performedAt ?? r.createdAt; return !!d && (Date.now() - new Date(d).getTime()) < RECENT_DAYS * 86400000; }
    return true;
  };
  const visible = extracted.filter((r: any) => matchesSearch(r) && matchesCat(r) && matchesStatus(r));
  const filtering = query !== '' || cat !== 'all' || sfilter !== 'all';

  // Hero + "o que mudou" só no modo padrão (sem busca/filtro) — resumo de entrada.
  // Hero NUNCA é exame com CPF divergente do perfil (documento de terceiro): o exame segue na
  // lista com seu aviso, mas "seu último exame" precisa ser SEU (auditoria premium 2026-08).
  const isDefaultView = !filtering;
  const cpfMismatch = (r: any) => r?.rawExtraction?.identityMatch?.method === 'cpf' && r?.rawExtraction?.identityMatch?.cpfMatch === false;
  const lastExam = extracted.find((r: any) => !cpfMismatch(r)) ?? null;

  // Contagem por categoria (do conjunto COMPLETO de extraídos — não muda com o filtro).
  const catCounts: Record<string, number> = {};
  for (const r of extracted) { const k = categorizeExam(r).key; catCounts[k] = (catCounts[k] ?? 0) + 1; }
  // Categorias presentes (só as que têm exame), da mais frequente pra menos.
  const presentCats = CATS.filter((c) => catCounts[c.key]).sort((a, b) => catCounts[b.key] - catCounts[a.key]);
  const abnormalCount = extracted.filter((r: any) => (abnByExam[r.id] ?? 0) > 0).length;
  const recentCount = extracted.filter((r: any) => { const d = r.performedAt ?? r.createdAt; return !!d && (Date.now() - new Date(d).getTime()) < RECENT_DAYS * 86400000; }).length;

  // Estado vazio HONESTO: se a lista só tem envios FAILED/REJECTED, "nenhum exame
  // enviado ainda" é mentira (contradiz a seção "não foi possível ler" logo acima).
  // Mostra estado neutro — as seções de atenção já explicam o que houve com cada envio.
  const emptyBlock = (
    filtering
      ? <EmptyState variant="card" emoji="🔍" title={translate('exams.empty_search_title')} desc={translate('exams.empty_search_desc')} />
      : failed.length > 0 || rejected.length > 0
        ? <EmptyState variant="card" title="Nenhum exame pronto ainda" desc="Os envios desta página precisam de atenção — re-extrai ou confere acima. Envie um novo documento quando quiser." />
        : <EmptyState variant="card" title={translate('exams.empty_title')} desc={translate('exams.empty_desc')} cta={translate('exams.send')} onCta={() => navigate('/exams/create')} cta2="Ver com dados de exemplo" onCta2={() => navigate('/?demo=1')} bonus={firstBonus ?? undefined} />
  );

  const renderCard = (r: any) => {
    const sc = statusColor[r.status] ?? 'default';
    const cc = categorizeExam(r);
    const titleInfo = cleanExtractedLabel(r.title, `Exame ${kindLabel[r.kind] ?? ''}`.trim(), 120); // clamp visual de 2 linhas faz o corte — não o "…" no meio
    const labInfo = cleanExtractedLabel(r.sourceLab, '', 46);
    const doctorInfo = cleanExtractedLabel((r as any).rawExtraction?.requestingDoctor, '', 46);
    const needsReview = !!r.reviewRequired || titleInfo.suspicious || labInfo.suspicious || doctorInfo.suspicious || !r.performedAt;
    const isNew = !!r.createdAt && Date.now() - new Date(r.createdAt).getTime() < 48 * 3600 * 1000;
    // Estado por dessaturação (padrão nativo): exame antigo (>12 meses, mesma régua
    // do staleMonths) perde a COR em vez de ganhar badge — a lista continua escaneável
    // e o olho pula direto nos recentes.
    const isOld = (() => { const d = r.performedAt ?? r.createdAt; return !!d && Date.now() - new Date(d).getTime() > 365 * 86400000; })();
    const altered = abnByExam[r.id] ?? 0;
    const alteredKnown = abnReady;
    const itemCount: number = r._count?.items ?? 0;
    const Icon = r.kind === 'IMAGING' ? ImageIcon : r.kind === 'LAB_PANEL' ? ScienceIcon : DescriptionOutlinedIcon;
    const CatIcon = cc.icon;
    return (
      <AppCard key={r.id} kind="interactive" onPointerDown={() => prefetchExam(r.id)} onClick={() => isMd ? setSelected(r.id) : navigate(`/exams/${r.id}/show`)} sx={{
        position: 'relative',
        overflow: 'hidden',
        border: '1px solid',
        borderColor: (t) => isMd && selected === r.id
          ? '#20b2aa'
          : altered > 0
            ? (t.palette.mode === 'dark' ? 'rgba(245,158,11,0.28)' : 'rgba(245,158,11,0.24)')
            : (t.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(15,118,110,0.12)'),
        // Borda em repouso (regra de profundidade do DS, 25/11/26): sem sombra, sem gradiente e sem
        // a faixa lateral colorida — quem diz que há valor fora da faixa é o chip do rodapé. No
        // desktop (master/detail) o card selecionado mantém o anel teal.
        boxShadow: isMd && selected === r.id ? '0 0 0 2px #20b2aa inset' : 'none',
        // Mouse (25/11/26): não levanta nem ganha sombra no hover — só a borda acende (regra de profundidade).
        // Antes o card selecionado no desktop ficava com um brilo teal por baixo só porque o cursor estava nele.
        '&:hover': isMd && selected === r.id ? { ...QUIET_HOVER, boxShadow: '0 0 0 2px #20b2aa inset', borderColor: '#20b2aa' } : QUIET_HOVER,
        ...(isOld ? { filter: 'grayscale(.85)', opacity: 0.72, transition: `filter ${DUR}ms ease, opacity ${DUR}ms ease` } : {}),
      }}>
        <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
          {/* Corpo principal do Card */}
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, pt: 1.75, pb: 1.5, pl: 2, pr: 1.5 }}>
            {/* Variante `soft` do IconTile (padrão ReUI): lavagem + ícone forte, para listas densas. */}
            <IconTile soft tone={altered > 0 ? 'amber' : r.kind === 'IMAGING' ? 'sky' : 'teal'}>
              <Icon sx={{ fontSize: 22 }} />
            </IconTile>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              {/* Título clamp-2 + botão de explicação IA */}
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
                <Typography
                  title={titleInfo.original || r.title}
                  sx={{
                    fontFamily: '"Poppins", sans-serif',
                    fontWeight: 700,
                    fontSize: 16,
                    lineHeight: 1.28,
                    color: 'text.primary',
                    display: '-webkit-box',
                    WebkitBoxOrient: 'vertical',
                    WebkitLineClamp: 2,
                    overflow: 'hidden',
                    overflowWrap: 'anywhere',
                  }}
                >
                  <PrivacyText><UnbrokenWords text={titleInfo.text || 'Exame'} /></PrivacyText>
                </Typography>
                {/* "?" ao lado do título só onde sobra largura (tablet/desktop). No celular ele vai para o rodapé. */}
                <Box onClick={(e) => e.stopPropagation()} sx={{ flexShrink: 0, mt: -0.25, display: { xs: 'none', sm: 'block' } }}>
                  <ExplainButton name={r.title} />
                </Box>
              </Box>

              {/* Meta: Data + Laboratório + Categoria completa (sem truncar "Hormô...") */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap', rowGap: 0.5, mt: 0.6 }}>
                <DateLabel date={r.performedAt} fallback="s/ data" />
                {r.sourceLab && <LabBadge raw={r.sourceLab} />}
                <Box
                  component="span"
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.4,
                    px: 0.85,
                    py: 0.15,
                    borderRadius: '6px',
                    fontSize: 12,
                    fontWeight: 700,
                    bgcolor: `${cc.color}14`,
                    // Texto legível: a cor da categoria em 12px dava 3,3:1 no modo claro (25/11/26).
                    color: (t) => (t.palette.mode === 'dark' ? lighten(cc.color, 0.35) : '#334155'),
                    border: `1px solid ${cc.color}28`,
                    whiteSpace: 'nowrap',
                  }}
                >
                  <CatIcon sx={{ fontSize: 12 }} />
                  {cc.cat}
                </Box>
              {/* "Conferir dados" ao lado da categoria (25/11/26): no rodapé ele quebrava sozinho
                  para uma segunda linha e o rodapé deixava de ser uma linha só. */}
              {needsReview && (
                <Chip
                  size="small"
                  label={translate('exams.review')}
                  sx={{
                    bgcolor: (t) => alpha(SEM.warn[t.palette.mode], 0.14),
                    // #b45309 sobre a própria lavagem dava 4,1:1 no modo claro (medido em 25/11/26).
                    color: warnText,
                    fontWeight: 800,
                    height: 24,
                    fontSize: 12,
                  }}
                />
              )}
            </Box>

              {!labInfo.text && labInfo.suspicious && (
                <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'warning.main', fontWeight: 700, lineHeight: 1.3, mt: 0.35 }}>
                  <WarningAmberIcon sx={{ fontSize: 14 }} aria-hidden="true" />
                  Laboratório em revisão
                </Typography>
              )}
              {doctorInfo.text && (
                <Typography
                  variant="caption"
                  title={`Dr. ${doctorInfo.original}`}
                  sx={{
                    display: 'block',
                    color: 'text.secondary',
                    fontWeight: 600,
                    fontSize: 13,
                    lineHeight: 1.35,
                    mt: 0.4,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {/* Caixa normal ("Dr. Daniel Cesar Shirane"): o laudo manda em maiúsculas e o nome
                      saía como "Dr. DANIEL CESAR SHIR…". */}
                  Dr. {prettyName(doctorInfo.text)}
                </Typography>
              )}
            </Box>

            {/* Alvo de 44px no celular (o ícone é pequeno, o dedo não) e seta só onde sobra espaço: no celular ela
                custava 22px da largura do título e o card já é inteiro clicável. */}
            <Stack direction="row" alignItems="center" spacing={0.25} sx={{ flexShrink: 0, mt: -0.25 }}>
              <IconButton
                onClick={(e) => del(e, r.id, r.title)}
                title="Excluir"
                aria-label={`Excluir exame ${r.title}`}
                sx={{ p: 1, width: 44, height: 44, color: 'text.secondary', '&:hover': { color: 'error.main' } }}
              >
                <DeleteOutlineIcon sx={{ fontSize: 20 }} />
              </IconButton>
              <ChevronRightIcon sx={{ color: 'text.disabled', fontSize: 20, display: { xs: 'none', sm: 'block' } }} />
            </Stack>
          </Box>

          {/* Rodapé do card: UMA linha de texto — "22 resultados · Todos na faixa" (25/11/26). Antes
              era uma faixa pintada com caixinhas; o chip "Pronto" sumiu (só aparece o que pede ação). */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 1,
              px: 2,
              py: 1,
              borderTop: '1px solid',
              borderColor: (t) => (t.palette.mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(15,118,110,0.08)'),
            }}
          >
            {itemCount > 0 ? (
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                <Box
                  component="span"
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.5,
                    fontSize: 13,
                    fontWeight: 700,
                    color: 'text.primary',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  <Box component="strong" sx={{ fontWeight: 800 }}>{itemCount}</Box>
                  <Box component="span" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                    {itemCount === 1 ? 'resultado' : 'resultados'}
                  </Box>
                </Box>

                <Box
                  component="span"
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.5,
                    px: 1,
                    py: 0.25,
                    borderRadius: '7px',
                    bgcolor: (t) =>
                      altered > 0
                        ? t.palette.mode === 'dark'
                          ? 'rgba(245,158,11,0.16)'
                          : 'rgba(245,158,11,0.12)'
                        : alpha(SEM.ok[t.palette.mode], 0.12),
                    border: '1px solid',
                    borderColor: (t) =>
                      altered > 0
                        ? t.palette.mode === 'dark'
                          ? 'rgba(245,158,11,0.35)'
                          : 'rgba(245,158,11,0.28)'
                        : alpha(SEM.ok[t.palette.mode], 0.25),
                    fontSize: 12,
                    fontWeight: 800,
                    // "#b45309" sobre a própria lavagem dava ~4,1:1 no claro (25/11/26).
                    color: (t) => (altered > 0 ? warnText(t) : okText(t)),
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  <Box
                    component="span"
                    sx={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      bgcolor: 'currentColor',
                    }}
                  />
                  {/* Mesmo termo da Home ("fora da faixa") — antes "alterados". */}
                  {altered > 0 ? `${altered} fora da faixa` : 'Todos na faixa'}
                </Box>
              </Stack>
            ) : (
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                Documento médico
              </Typography>
            )}

            <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" alignItems="center">
              {/* "?" no rodapé, no celular (25/11/26): ao lado do título ele custava 32px da largura e nomes comuns
                  ("Hemograma completo") quebravam em duas linhas. A margem negativa mantém o rodapé com 40px. */}
              <Box onClick={(e) => e.stopPropagation()} sx={{ flexShrink: 0, display: { xs: 'block', sm: 'none' }, my: -0.5 }}>
                <ExplainButton name={r.title} />
              </Box>
              {isNew && (
                <Chip
                  size="small"
                  icon={<FiberNewIcon sx={{ fontSize: '14px !important' }} />}
                  label="Novo"
                  sx={{
                    height: 20,
                    fontWeight: 700,
                    bgcolor: (t) => alpha(SEM.ok[t.palette.mode], 0.14),
                    color: (t) => SEM.ok[t.palette.mode],
                    '& .MuiChip-icon': { color: (t: ModeTheme) => `${SEM.ok[t.palette.mode]} !important` },
                  }}
                />
              )}
              {/* "Pronto" não é informação: todo exame da lista que chegou aqui está pronto. O chip de
                  status só aparece quando diz algo diferente (Falhou, Enviado, Extraindo, Rejeitado). */}
              {r.status !== 'EXTRACTED' && (
              <Chip
                size="small"
                label={statusLabel[r.status] ?? r.status}
                sx={{
                  height: 24,
                  fontSize: 12,
                  fontWeight: 700,
                  bgcolor: (t) => alpha(toneMain(t, sc), 0.12),
                  color: (t) => statusText(t, sc),
                }}
              />
              )}
            </Stack>
          </Box>
        </CardContent>
        {(r.status === 'EXTRACTING' || r.status === 'UPLOADED') && <LinearProgress sx={{ height: 3 }} />}
        {r.status === 'FAILED' && (
          <Box onClick={(e) => e.stopPropagation()} sx={{ px: 1.5, pb: 1.25 }}>
            {/* PREVIEW do arquivo enviado (dono 21/11: "ver o que mandou" no erro). A 1ª versão
                dependia de `filePath` (que a API nunca manda) e punha o token na URL do <img>
                (401) → nunca apareceu. Agora: a API diz `fileKind` e a foto baixa com header. */}
            {r.fileKind === 'image' && <ExamFilePreview examId={r.id} sx={{ mb: 0.75 }} />}
            <Typography component="span" sx={{ color: (t) => SEM.bad[t.palette.mode], display: 'flex', alignItems: 'flex-start', gap: 0.5, lineHeight: 1.4, fontSize: 13 }}>
              <WarningAmberIcon sx={{ fontSize: 16, flexShrink: 0, mt: '2px' }} aria-hidden="true" />
              {(r.extractionError || 'Falha na leitura do documento').slice(0, 140)}
            </Typography>
            <Button size="small" onClick={(e) => reextract(e, r.id)} startIcon={<ReplayIcon />} sx={{ mt: 0.5, textTransform: 'none', fontWeight: 700, minHeight: 44, color: (t) => tealText(t.palette.mode) }}>{translate('exams.reextract')}</Button>
          </Box>
        )}
        {r.status === 'REJECTED' && (
          <Box onClick={(e) => e.stopPropagation()} sx={{ px: 1.5, pb: 1.25 }}>
            <Typography component="span" sx={{ color: 'text.secondary', display: 'flex', alignItems: 'flex-start', gap: 0.5, lineHeight: 1.4, fontSize: 13 }}>
              <BlockIcon sx={{ fontSize: 16, flexShrink: 0, mt: '2px', color: 'text.disabled' }} aria-hidden="true" />
              Não conseguimos adicionar este exame: o CPF identificado no documento é diferente do CPF da sua conta. Ele não entra nas suas análises.
            </Typography>
            <Button size="small" color="primary" onClick={(e) => { e.stopPropagation(); navigate(`/suporte?exam=${r.id}`); }} sx={{ mt: 0.5, textTransform: 'none', fontWeight: 700 }}>Acredito que houve um erro</Button>
          </Box>
        )}
      </AppCard>
    );
  };

  // --- VISÃO POR DATA (padrão) e por CATEGORIA, ambas filtrando pela busca/categoria/status.
  const dateGroups = groupByYear(visible, (r) => r.performedAt ?? r.createdAt);
  const visibleUnlocked = visible.filter((r: any) => !isLocked(r));
  const lockedCount = visible.length - visibleUnlocked.length;
  const catGroups = presentCats
    .map((c) => ({ cat: c, items: visibleUnlocked.filter((r: any) => categorizeExam(r).key === c.key) }))
    .filter((g) => g.items.length);

  const lockCard = (key: string, label: string, count: number) => (
    <AppCard key={key} sx={{ p: 1.75, display: 'flex', alignItems: 'center', gap: 1.5 }}>
      <LockIcon sx={{ color: '#178f89' }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography component="h2" sx={{ ...GROUP_TITLE_STYLE, lineHeight: 1.25 }}>{label}</Typography>
        <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>{translate('exams.history_premium')}</Typography>
      </Box>
      {/* Ação discreta: o destaque da lista é o "+" de enviar exame. */}
      <SecondaryButton onClick={() => navigate('/planos')} sx={{ flexShrink: 0 }}>{translate('common.view_plans')}</SecondaryButton>
    </AppCard>
  );

  // DESKTOP (md+): master/detail — lista à esquerda, detalhe/contexto à direita.
  // Mobile (<md) cai no `return` abaixo (lista → navega pra /exams/:id/show).
  const heroMd = isDefaultView && lastExam ? (
    <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: '1fr', alignItems: 'stretch' }}>
      <ExamHero r={lastExam} abnCount={abnOf(lastExam.id)} onView={() => setSelected(lastExam.id)} onPdf={() => openPdf(lastExam.id)} />
      <ChangesSinceExam worsened={worsened} improved={improved} loaded={hsLoaded} onView={() => navigate('/tendencias')} />
    </Box>
  ) : null;
  if (isMd) {
    return (
      <Box sx={{ ...reveal, display: 'grid', gridTemplateColumns: { md: 'minmax(0,440px) 1fr', lg: 'minmax(0,520px) 1fr', xl: 'minmax(0,560px) 1fr' }, gap: 2, alignItems: 'start', maxWidth: 1500, mx: 'auto' }}>
        {/* LISTA (esquerda) — sticky, scroll próprio */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, position: 'sticky', top: 8, maxHeight: 'calc(100dvh - 16px)', overflowY: 'auto', pr: 0.5 }}>
          <PageHeader icon={<DescriptionOutlinedIcon />} title={translate('exams.title')} subtitle={translate('exams.subtitle', { count: total ?? 0 })} />
          <ConfirmDialog open={!!delTarget} onClose={() => setDelTarget(null)} onConfirm={confirmDel} title={translate('exams.delete_title')} message={delTarget ? translate('exams.delete_msg', { title: delTarget.title }) : ''} confirmLabel={translate('ra.action.delete')} />
          <ExamFilterToolbar
            q={q} setQ={setQ}
            sfilter={sfilter} setSfilter={setSfilter}
            cat={cat} setCat={setCat}
            view={view} setView={setView}
            extractedCount={extracted.length}
            abnormalCount={abnormalCount}
            recentCount={recentCount}
            presentCats={presentCats}
            catCounts={catCounts}
            translate={translate}
          />
          {processing.length > 0 && (
            <Box>
              <GroupTitle icon={<ScheduleIcon />} title={translate('exams.processing')} count={processing.length} tone="info" />
              <Stack spacing={1.5}>{processing.map((r: any) => <ProcessingCard key={r.id} r={r} onCancel={(e: any) => del(e, r.id, r.title || 'Exame em processamento')} />)}</Stack>
            </Box>
          )}
          {failed.length > 0 && (
            <Box>
              <GroupTitle icon={<WarningAmberIcon />} title={translate('exams.failed_title')} count={failed.length} tone="bad" />
              <Alert severity="warning" icon={false} sx={{ mb: 1.25, borderRadius: RADIUS.sectionCard, py: 0.75, '& .MuiAlert-message': { fontSize: 13 } }}>
                {failed.length === 1 ? translate('exams.failed_msg_one') : translate('exams.failed_msg_many', { count: failed.length })} {translate('exams.failed_action')} <strong>{translate('exams.reextract')}</strong>.
              </Alert>
              <Stack spacing={1.5}>{failed.map((r: any) => renderCard(r))}</Stack>
            </Box>
          )}
          {rejected.length > 0 && (
            <Box>
              <GroupTitle icon={<BlockIcon />} title="Não adicionados (CPF divergente)" count={rejected.length} />
              <Alert severity="info" icon={false} sx={{ mb: 1.25, borderRadius: RADIUS.sectionCard, py: 0.75, '& .MuiAlert-message': { fontSize: 13 } }}>
                Exames cujo CPF do documento difere do CPF da conta ficam de fora das análises. Se o documento é seu, toque em "Acredito que houve um erro" e o suporte confere (OCR pode errar).
              </Alert>
              <Stack spacing={1.5}>{rejected.map((r: any) => renderCard(r))}</Stack>
            </Box>
          )}
          {view === 'category' && lockedCount > 0 && lockCard('cat-lock', `${plural(lockedCount, 'exame')} de anos anteriores fazem parte do histórico Premium.`, lockedCount)}
          {view === 'date' && (
            <>
              {/* CONTRATO item 5 (decisão dono 05/11): timeline narrativa quando o
                  usuário tem POUCOS exames (≤6) — a "história de saúde" dele em
                  vez de cards soltos. Acima dos cards, some sozinha quando cresce. */}
              {visible.length > 0 && visible.length <= 6 && (
                <Timeline defaultValue={visible.length}>
                  {[...visible]
                    .sort((a: any, b: any) => new Date(b.performedAt ?? b.createdAt).getTime() - new Date(a.performedAt ?? a.createdAt).getTime())
                    .slice(0, 6)
                    .map((r: any, i: number) => (
                      <TimelineItem key={r.id} step={i + 1}>
                        <TimelineSeparator />
                        <TimelineIndicator />
                        <TimelineHeader>
                          <TimelineTitle>{i === 0 ? 'Mais recente' : (r.title ?? 'Exame')}</TimelineTitle>
                          <TimelineDate>{fmtDateShort(r.performedAt ?? r.createdAt)}</TimelineDate>
                        </TimelineHeader>
                        {/* Sem repetir o título do cabeçalho (25/11/26): a linha de baixo diz quantos resultados o
                            exame tem — e traz o nome quando o cabeçalho é "Mais recente". Antes o título saía duas
                            vezes e a data num formato diferente do resto da lista. */}
                        <TimelineContent>
                          {[i === 0 ? (r.title ?? 'Exame') : '', itemCountText(r)].filter(Boolean).join(' · ')}
                        </TimelineContent>
                      </TimelineItem>
                    ))}
                </Timeline>
              )}
              {dateGroups.length === 0 && processing.length === 0 && emptyBlock}
              {dateGroups.map((g) => {
                const locked = !premium && g.year !== latestYear && g.year != null;
                if (locked) return lockCard(String(g.year), `${g.label} • ${plural(g.items.length, 'exame')}`, g.items.length);
                const defaultExp = premium || g.year === latestYear || (g.year === null && g.items.some((r: any) => r.status === 'FAILED'));
                const expKey = `date-${g.year}`;
                return (
                  <Accordion key={String(g.year)} expanded={isAccordionExpanded(expKey, defaultExp)} onChange={() => toggleAccordion(expKey, defaultExp)} disableGutters elevation={0} sx={{ borderRadius: `${RADIUS.sectionCard} !important`, border: '1px solid', borderColor: 'transparent', backgroundColor: 'transparent', '&:before': { display: 'none' } }}>
                    <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ fontSize: 30, color: '#178f89', bgcolor: 'rgba(32,178,170,.12)', borderRadius: '50%', p: 0.6 }} />} sx={{ minHeight: '48px !important', '& .MuiAccordionSummary-content': { my: 0.75, alignItems: 'center' } }}>
                      <Typography component="h2" sx={{ display: 'flex', alignItems: 'center', gap: 0.75, fontSize: 17, fontWeight: 700, fontFamily: '"Poppins", sans-serif', lineHeight: 1.25, flex: '1 1 auto', minWidth: 0 }}><CalendarMonthIcon sx={{ fontSize: 20, color: (t) => tealText(t.palette.mode) }} />{g.label}</Typography>
                      <Chip size="small" label={`${g.items.length} ${g.items.length === 1 ? 'exame' : 'exames'}`} sx={{ ml: 1.5, bgcolor: 'action.hover', color: 'text.primary', height: 22, fontSize: 12, fontWeight: 600, flexShrink: 0 }} />
                    </AccordionSummary>
                    <AccordionDetails sx={{ p: 1, display: 'flex', flexDirection: 'column', gap: 1.5 }}>{g.items.map(renderCard)}</AccordionDetails>
                  </Accordion>
                );
              })}
            </>
          )}
          {view === 'category' && (
            <>
              {catGroups.length === 0 && processing.length === 0 && emptyBlock}
              {catGroups.map(({ cat: c, items }) => {
                const defaultExp = catGroups.length <= 3;
                const expKey = `cat-${c.key}`;
                return (
                  <Accordion key={c.key} expanded={isAccordionExpanded(expKey, defaultExp)} onChange={() => toggleAccordion(expKey, defaultExp)} disableGutters elevation={0} sx={{ borderRadius: `${RADIUS.sectionCard} !important`, border: '1px solid', borderColor: 'transparent', backgroundColor: 'transparent', '&:before': { display: 'none' } }}>
                    <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ fontSize: 30, color: c.color, bgcolor: c.color + '1f', borderRadius: '50%', p: 0.6 }} />} sx={{ minHeight: '48px !important', '& .MuiAccordionSummary-content': { my: 0.75, alignItems: 'center' } }}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, fontSize: 17, fontWeight: 700, lineHeight: 1.25, flex: "1 1 auto", minWidth: 0 }}><Box component={c.icon} sx={{ fontSize: 20, color: c.color }} />{c.cat}</Box>
                      <Chip size="small" label={`${items.length}`} sx={{ ml: 1.5, bgcolor: c.color + '1a', color: c.color, height: 20, flexShrink: 0 }} />
                    </AccordionSummary>
                    <AccordionDetails sx={{ p: 1, display: 'flex', flexDirection: 'column', gap: 1.5 }}>{items.map(renderCard)}</AccordionDetails>
                  </Accordion>
                );
              })}
            </>
          )}
        </Box>
        {/* DETALHE / CONTEXTO (direita) — selecionado inline, senão hero + "o que mudou" */}
        <Box sx={{ position: 'sticky', top: 8, maxHeight: 'calc(100dvh - 16px)', overflowY: 'auto', pl: 1 }}>
          {selected ? <ExamShow inlineId={selected} /> : (heroMd ?? <EmptyState emoji="👈" title="Selecione um exame" desc="Toque num exame à esquerda pra ver o detalhe completo." />)}
        </Box>
      </Box>
    );
  }

  return (
    <PageContainer width="content" sx={{ ...reveal, display: 'flex', flexDirection: 'column', gap: 1.5, pb: { xs: 10, sm: 5 } }}>
      <PageHeader icon={<DescriptionOutlinedIcon />} title={translate('exams.title')} subtitle={translate('exams.subtitle', { count: total ?? 0 })} />

      <ConfirmDialog
        open={!!delTarget}
        onClose={() => setDelTarget(null)}
        onConfirm={confirmDel}
        title={translate('exams.delete_title')}
        message={delTarget ? translate('exams.delete_msg', { title: delTarget.title }) : ''}
        confirmLabel={translate('ra.action.delete')}
      />

      {/* Toolbar Unificada de Filtros: Busca + Alternância + Régua Única de Chips */}
      <ExamFilterToolbar
        q={q} setQ={setQ}
        sfilter={sfilter} setSfilter={setSfilter}
        cat={cat} setCat={setCat}
        view={view} setView={setView}
        extractedCount={extracted.length}
        abnormalCount={abnormalCount}
        recentCount={recentCount}
        presentCats={presentCats}
        catCounts={catCounts}
        translate={translate}
      />

      {/* HERO + "O que mudou" — só no modo padrão (sem busca/filtro), resumo de entrada. */}
      {isDefaultView && lastExam && (
        <Box sx={{ display: { xs: 'block', sm: 'none' } }}>
          <ExamHeroCompact r={lastExam} abnCount={abnOf(lastExam.id)} onView={() => navigate(`/exams/${lastExam.id}/show`)} />
        </Box>
      )}
      {isDefaultView && lastExam && (
        <Box sx={{ display: { xs: 'none', sm: 'grid' }, gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: '1.6fr 1fr' }, alignItems: 'stretch' }}>
          <ExamHero r={lastExam} abnCount={abnOf(lastExam.id)} onView={() => navigate(`/exams/${lastExam.id}/show`)} onPdf={() => openPdf(lastExam.id)} />
          <ChangesSinceExam worsened={worsened} improved={improved} loaded={hsLoaded} onView={() => navigate('/tendencias')} />
        </Box>
      )}

      {/* FAB "＋ Enviar exame" está no AppLayout (ExamCreateFab) — sempre acima do rodapé. */}
      {processing.length > 0 && (
        <Box>
          <GroupTitle icon={<ScheduleIcon />} title={translate('exams.processing')} count={processing.length} tone="info" />
          <Stack spacing={1.5}>
            {processing.map((r: any) => <ProcessingCard key={r.id} r={r} onCancel={(e: any) => del(e, r.id, r.title || 'Exame em processamento')} />)}
          </Stack>
        </Box>
      )}
      {failed.length > 0 && (
        <Box>
          <GroupTitle icon={<WarningAmberIcon />} title={translate('exams.failed_title')} count={failed.length} tone="bad" />
          <Alert severity="warning" icon={false} sx={{ mb: 1.25, borderRadius: RADIUS.sectionCard, py: 0.75, '& .MuiAlert-message': { fontSize: 13 } }}>
            {failed.length === 1 ? translate('exams.failed_msg_one') : translate('exams.failed_msg_many', { count: failed.length })} {translate('exams.failed_action')} <strong>{translate('exams.reextract')}</strong>.
          </Alert>
          <Stack spacing={1.5}>
            {failed.map((r: any) => renderCard(r))}
          </Stack>
        </Box>
      )}
      {rejected.length > 0 && (
        <Box>
          <GroupTitle icon={<BlockIcon />} title="Não adicionados (CPF divergente)" count={rejected.length} />
          <Alert severity="info" icon={false} sx={{ mb: 1.25, borderRadius: RADIUS.sectionCard, py: 0.75, '& .MuiAlert-message': { fontSize: 13 } }}>
            Exames cujo CPF do documento difere do CPF da conta ficam de fora das análises. Se o documento é seu, toque em "Acredito que houve um erro" e o suporte confere (OCR pode errar).
          </Alert>
          <Stack spacing={1.5}>
            {rejected.map((r: any) => renderCard(r))}
          </Stack>
        </Box>
      )}

      {/* Nudge Premium (apenas na visão por categoria — anos anteriores ocultos) */}
      {view === 'category' && lockedCount > 0 && lockCard('cat-lock', `${plural(lockedCount, 'exame')} de anos anteriores fazem parte do histórico Premium.`, lockedCount)}

      {/* Grupos (data OU categoria) */}
      {view === 'date' && (
        <>
          {dateGroups.length === 0 && processing.length === 0 && emptyBlock}
          {dateGroups.map((g) => {
            const locked = !premium && g.year !== latestYear && g.year != null;
            if (locked) return lockCard(String(g.year), `${g.label} • ${plural(g.items.length, 'exame')}`, g.items.length);
            const defaultExp = premium || g.year === latestYear || (g.year === null && g.items.some((r: any) => r.status === 'FAILED'));
            const expKey = `date-${g.year}`;
            return (
              <Accordion key={String(g.year)} expanded={isAccordionExpanded(expKey, defaultExp)} onChange={() => toggleAccordion(expKey, defaultExp)} disableGutters elevation={0}
                sx={{ borderRadius: `${RADIUS.sectionCard} !important`, border: '1px solid', borderColor: 'transparent', backgroundColor: 'transparent', '&:before': { display: 'none' } }}>
                <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ fontSize: 30, color: '#178f89', bgcolor: 'rgba(32,178,170,.12)', borderRadius: '50%', p: 0.6 }} />} sx={{ minHeight: '48px !important', '& .MuiAccordionSummary-content': { my: 0.75, alignItems: 'center' } }}>
                  <Typography component="h2" sx={{ display: 'flex', alignItems: 'center', gap: 0.75, fontSize: 17, fontWeight: 700, fontFamily: '"Poppins", sans-serif', lineHeight: 1.25, flex: '1 1 auto', minWidth: 0 }}><CalendarMonthIcon sx={{ fontSize: 20, color: (t) => tealText(t.palette.mode) }} />{g.label}</Typography>
                  <Chip size="small" label={`${g.items.length} ${g.items.length === 1 ? 'exame' : 'exames'}`} sx={{ ml: 1.5, bgcolor: 'action.hover', color: 'text.primary', height: 22, fontSize: 12, fontWeight: 600, flexShrink: 0 }} />
                </AccordionSummary>
                <AccordionDetails sx={{ p: 1, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  {g.items.map(renderCard)}
                </AccordionDetails>
              </Accordion>
            );
          })}
        </>
      )}

      {view === 'category' && (
        <>
          {catGroups.length === 0 && processing.length === 0 && emptyBlock}
          {catGroups.map(({ cat: c, items }) => {
            const defaultExp = catGroups.length <= 3;
            const expKey = `cat-${c.key}`;
            return (
              <Accordion key={c.key} expanded={isAccordionExpanded(expKey, defaultExp)} onChange={() => toggleAccordion(expKey, defaultExp)} disableGutters elevation={0}
                sx={{ borderRadius: `${RADIUS.sectionCard} !important`, border: '1px solid', borderColor: 'transparent', backgroundColor: 'transparent', '&:before': { display: 'none' } }}>
                <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ fontSize: 30, color: c.color, bgcolor: c.color + '1f', borderRadius: '50%', p: 0.6 }} />} sx={{ minHeight: '48px !important', '& .MuiAccordionSummary-content': { my: 0.75, alignItems: 'center' } }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, fontSize: 17, fontWeight: 700, fontFamily: '"Poppins", sans-serif', lineHeight: 1.25, flex: "1 1 auto", minWidth: 0 }}><Box component={c.icon} sx={{ fontSize: 20, color: c.color }} />{c.cat}</Box>
                  <Chip size="small" label={`${items.length}`} sx={{ ml: 1.5, bgcolor: c.color + '1a', color: (t) => (t.palette.mode === 'dark' ? lighten(c.color, 0.35) : '#1e293b'), height: 20, flexShrink: 0 }} />
                </AccordionSummary>
                <AccordionDetails sx={{ p: 1, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  {items.map(renderCard)}
                </AccordionDetails>
              </Accordion>
            );
          })}
        </>
      )}
    </PageContainer>
  );
};

export const ExamList = () => {
  const [pid] = useSelectedPatient();
  return (
    // component="div" (25/11/26): a lista assenta no fundo da página. O react-admin envolve tudo num
    // cartão branco por padrão — caixa dentro de caixa dentro de caixa com os grupos e os cards.
    // minWidth 0 vai junto: era o que o App.tsx garantia no cartão antigo (o card não pode inchar
    // além da viewport no celular).
    <List key={pid} sort={{ field: 'performedAt', order: 'DESC' }} exporter={false} perPage={1000} pagination={false} filter={{ patientId: pid || 'none' }} actions={false} empty={false} component="div"
      sx={{ minWidth: 0, maxWidth: '100%', '& .RaList-main, & .RaList-content': { minWidth: 0, maxWidth: '100%' } }}>
      <ExamCards />
    </List>
  );
};
