import { useEffect, useState, useRef } from 'react';
import { List, useListContext, useRefresh, useNotify, useTranslate } from 'react-admin';
import { track } from '../../utils/analytics';
import { chipA11y } from '../../utils/chipA11y';
import { Chip, Box, CardContent, Typography, IconButton, Stack, LinearProgress, Button, Accordion, AccordionSummary, AccordionDetails, Alert, CircularProgress, TextField, InputAdornment, ToggleButton, ToggleButtonGroup, useTheme, useMediaQuery } from '@mui/material';
import { alpha, lighten } from '@mui/material/styles';
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
import { GradientButton } from '../../components/GradientButton';
import { ProcessingStages } from '../../components/ProcessingStages';
import { DateLabel } from '../../components/DateLabel';
import { ChangesSinceExam, type Marker } from '../../components/dashboard/ChangesSinceExam';
import { ExamShow } from './ExamShow';
import { cleanExtractedLabel } from '../../utils/examDisplay';
import { openExamFile } from '../../utils/examFile';
import { RADIUS, SEM, tealText } from '../../theme';

// Status de PROCESSAMENTO (não clínico) → chave de paleta (token, sem hex literal).
const statusColor: Record<string, 'success' | 'error' | 'warning' | 'info' | 'default'> = { EXTRACTED: 'success', FAILED: 'error', UPLOADED: 'warning', EXTRACTING: 'info', REJECTED: 'default' };
const statusLabel: Record<string, string> = { EXTRACTED: 'Pronto', FAILED: 'Falhou', UPLOADED: 'Enviado', EXTRACTING: 'Extraindo', REJECTED: 'Rejeitado' };
const kindLabel: Record<string, string> = { LAB_PANEL: 'Laboratorial', IMAGING: 'Imagem', OTHER: 'Outro' };

/** Cor de paleta resolved (pra alpha em bgcolor) — default cai em text.secondary. */
const toneMain = (t: any, sc: string) => (sc === 'default' ? t.palette.text.secondary : (t.palette as any)[sc]?.main ?? t.palette.text.secondary);

const RECENT_DAYS = 90; // filtro "Recentes": últimos ~3 meses.

/** Tema mínimo p/ callbacks sx de cor por modo (indexar SEM com `any` dá TS7053). */
type ModeTheme = { palette: { mode: 'light' | 'dark' } };

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
  const mm = Math.floor(elapsed / 60);
  const ss = (elapsed % 60).toString().padStart(2, '0');
  // Etapa corrente pelo status REAL do exame: EXTRACTING = IA já lendo o conteúdo.
  const stage = r.status === 'EXTRACTING' ? 1 : 0;
  return (
    <AppCard kind="interactive" onClick={() => navigate(`/exams/${r.id}/show`)} sx={{ overflow: 'hidden' }}>
      <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.5, '&:last-child': { pb: 1.5 } }}>
        <CircularProgress size={32} thickness={5} sx={{ color: 'info.main', flexShrink: 0 }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700, wordBreak: 'break-word', overflowWrap: 'anywhere', lineHeight: 1.2 }}>{r.title || 'Novo exame enviado'}</Typography>
          <Typography variant="caption" color="text.secondary">
            Dr. Exame está extraindo… {start ? <Box component="span" sx={{ fontWeight: 700, fontFamily: 'monospace' }}>há {mm}:{ss}</Box> : null} · toque para acompanhar
          </Typography>
        </Box>
        {onCancel && <IconButton size="small" onClick={(e) => { e.stopPropagation(); onCancel(e); }} title="Cancelar e excluir" aria-label="Cancelar e excluir exame" sx={{ flexShrink: 0, color: 'text.secondary', p: 1.25 }}><CloseIcon fontSize="small" /></IconButton>}
        <ChevronRightIcon sx={{ color: 'text.disabled', flexShrink: 0 }} />
      </CardContent>
      <Box sx={{ px: { xs: 1.5, sm: 2 }, pb: 1.25 }}>
        <ProcessingStages active={stage} />
      </Box>
      <LinearProgress sx={{ height: 4, '& .MuiLinearProgress-bar': { background: 'linear-gradient(90deg,#0ea5e9,#20b2aa)' } }} />
    </AppCard>
  );
};

/** HERO — último exame (mais recente extraído). Âncora de "qual é a situação agora". */
const ExamHero = ({ r, abnCount, onView, onPdf }: { r: any; abnCount: number; onView: () => void; onPdf: () => void }) => {
  const titleInfo = cleanExtractedLabel(r.title, kindLabel[r.kind] ?? 'Exame', 60);
  const itemCount: number = r._count?.items ?? 0;
  const tone = abnCount > 0 ? 'warning' : 'primary';
  return (
    <AppCard kind="tinted" tone={tone} tone2="secondary" glow sx={{ p: { xs: 2, md: 2.5 }, height: '100%' }}>
      {/* Sem uppercase/ls largo no label (audit: caixa alta = cara de dashboard admin, não app premium). */}
      <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'text.secondary' }}>Último exame</Typography>
      <Typography title={titleInfo.original || r.title} sx={{ fontFamily: 'Poppins, sans-serif', fontWeight: 800, fontSize: { xs: 19, md: 22 }, lineHeight: 1.2, mt: 0.25, wordBreak: 'break-word' }}>{titleInfo.text || 'Exame'}</Typography>
      <Box sx={{ mt: 0.5 }}><DateLabel date={r.performedAt} fallback="Data não identificada no PDF" sx={{ fontSize: '0.82rem' }} /></Box>
      <Stack direction="row" spacing={1.5} sx={{ mt: 1, flexWrap: 'wrap', rowGap: 0.5, alignItems: 'center' }}>
        <Typography sx={{ fontSize: 14, color: 'text.secondary' }}>{itemCount} resultado{itemCount !== 1 ? 's' : ''}</Typography>
        {abnCount > 0 ? (
          <Chip size="small" label={`${abnCount} alterado${abnCount === 1 ? '' : 's'}`} sx={{ height: 22, fontWeight: 700, borderRadius: RADIUS.pill, bgcolor: (t) => alpha(SEM.warn[t.palette.mode], 0.14), color: (t) => SEM.warn[t.palette.mode] }} />
        ) : (
          <Chip size="small" label="Nada alterado" sx={{ height: 22, fontWeight: 700, borderRadius: RADIUS.pill, bgcolor: (t) => alpha(SEM.ok[t.palette.mode], 0.14), color: (t) => SEM.ok[t.palette.mode] }} />
        )}
      </Stack>
      <Stack direction="row" spacing={1} sx={{ mt: 2.25 }}>
        <GradientButton onClick={onView} endIcon={<ArrowForwardIcon />} sx={{ flex: 1 }}>Ver análise</GradientButton>
        <Button variant="outlined" onClick={onPdf} startIcon={<PictureAsPdfOutlinedIcon />} sx={{ borderRadius: RADIUS.button, textTransform: 'none', fontWeight: 700, borderColor: 'divider', color: 'text.secondary' }}>Abrir laudo</Button>
      </Stack>
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

  return (
    <Stack spacing={1} sx={{ mb: 0.5 }}>
      {/* Linha Topo: Busca + Alternador Discreto (Data vs Categoria) */}
      <Stack direction="row" spacing={1} alignItems="center">
        <TextField
          size="small"
          fullWidth
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={translate('exams.search_ph')}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" sx={{ color: 'text.secondary' }} />
              </InputAdornment>
            ),
          }}
          sx={{ flex: 1, '& .MuiOutlinedInput-root': { borderRadius: RADIUS.button, bgcolor: 'background.paper' } }}
        />
        <ToggleButtonGroup
          exclusive
          size="small"
          value={view}
          onChange={(_, v) => { if (v) setView(v); }}
          sx={{ flexShrink: 0, bgcolor: 'background.paper', borderRadius: RADIUS.button, height: 40 }}
        >
          <ToggleButton value="date" sx={{ px: 1.25, py: 0.5, fontSize: 12, fontWeight: 700, textTransform: 'none', border: '1px solid', borderColor: 'divider', gap: 0.5 }}>
            <CalendarMonthIcon sx={{ fontSize: 16 }} /> Data
          </ToggleButton>
          <ToggleButton value="category" sx={{ px: 1.25, py: 0.5, fontSize: 12, fontWeight: 700, textTransform: 'none', border: '1px solid', borderColor: 'divider', gap: 0.5 }}>
            <FolderOutlinedIcon sx={{ fontSize: 16 }} /> Categoria
          </ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      {/* Linha Única de Chips (Filtros Rápidos + Categorias de Saúde) */}
      <Stack
        direction="row"
        spacing={0.75}
        sx={{
          overflowX: 'auto',
          flexWrap: 'nowrap',
          py: 0.25,
          mx: -0.25,
          px: 0.25,
          '&::-webkit-scrollbar': { display: 'none' },
        }}
      >
        {/* Todos — inativo mode-aware (lavagem teal + texto AA por modo); ativo = sólido. */}
        <Chip
          size="small"
          label={translate('exams.all', { count: extractedCount })}
          onClick={() => { setSfilter('all'); setCat('all'); }}
          {...chipA11y(isAllActive)}
          sx={{
            height: 32,
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
            label={`Alterados (${abnormalCount})`}
            onClick={() => { setSfilter(isAlteredActive ? 'all' : 'altered'); setCat('all'); }}
            {...chipA11y(isAlteredActive)}
            sx={{
              height: 32,
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
              height: 32,
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
                height: 32,
                flexShrink: 0,
                fontWeight: 700,
                whiteSpace: 'nowrap',
                bgcolor: isCatActive ? c.color : (t) => alpha(c.color, t.palette.mode === 'dark' ? 0.22 : 0.10),
                color: isCatActive ? '#fff' : (t) => (t.palette.mode === 'dark' ? lighten(c.color, 0.35) : c.color),
                border: '1px solid',
                borderColor: isCatActive ? c.color : (t) => alpha(c.color, t.palette.mode === 'dark' ? 0.45 : 0.25),
                '& .MuiChip-icon': { color: isCatActive ? '#fff !important' : (t: ModeTheme) => `${t.palette.mode === 'dark' ? lighten(c.color, 0.35) : c.color} !important` },
              }}
            />
          );
        })}
      </Stack>
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
          if (!cancelled) setAbnByExam(m);
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
      ? <EmptyState emoji="🔍" title={translate('exams.empty_search_title')} desc={translate('exams.empty_search_desc')} />
      : failed.length > 0 || rejected.length > 0
        ? <EmptyState title="Nenhum exame pronto ainda" desc="Os envios desta página precisam de atenção — re-extrai ou confere acima. Envie um novo documento quando quiser." />
        : <EmptyState title={translate('exams.empty_title')} desc={translate('exams.empty_desc')} cta={translate('exams.send')} onCta={() => navigate('/exams/create')} bonus={firstBonus ?? undefined} />
  );

  const renderCard = (r: any) => {
    const sc = statusColor[r.status] ?? 'default';
    const cc = categorizeExam(r);
    const titleInfo = cleanExtractedLabel(r.title, `Exame ${kindLabel[r.kind] ?? ''}`.trim(), 58);
    const labInfo = cleanExtractedLabel(r.sourceLab, '', 46);
    const doctorInfo = cleanExtractedLabel((r as any).rawExtraction?.requestingDoctor, '', 46);
    const needsReview = !!r.reviewRequired || titleInfo.suspicious || labInfo.suspicious || doctorInfo.suspicious || !r.performedAt;
    const isNew = !!r.createdAt && Date.now() - new Date(r.createdAt).getTime() < 48 * 3600 * 1000;
    // Estado por dessaturação (padrão nativo): exame antigo (>12 meses, mesma régua
    // do staleMonths) perde a COR em vez de ganhar badge — a lista continua escaneável
    // e o olho pula direto nos recentes.
    const isOld = (() => { const d = r.performedAt ?? r.createdAt; return !!d && Date.now() - new Date(d).getTime() > 365 * 86400000; })();
    const altered = abnByExam[r.id] ?? 0;
    const itemCount: number = r._count?.items ?? 0;
    const Icon = r.kind === 'IMAGING' ? ImageIcon : r.kind === 'LAB_PANEL' ? ScienceIcon : DescriptionOutlinedIcon;
    return (
      <AppCard key={r.id} kind="interactive" onClick={() => isMd ? setSelected(r.id) : navigate(`/exams/${r.id}/show`)} sx={{
        overflow: 'hidden',
        ...(isOld ? { filter: 'grayscale(.85)', opacity: 0.72, transition: `filter ${DUR}ms ease, opacity ${DUR}ms ease` } : {}),
        ...(isMd && selected === r.id ? { boxShadow: '0 0 0 2px #20b2aa inset' } : {}),
      }}>
        <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.5, '&:last-child': { pb: 1.5 } }}>
          <Icon sx={{ color: altered > 0 ? 'warning.main' : 'text.secondary', flexShrink: 0 }} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
              <Typography title={titleInfo.original || r.title} sx={{ fontWeight: 700, wordBreak: 'break-word', overflowWrap: 'anywhere', lineHeight: 1.2 }}><PrivacyText>{titleInfo.text || 'Exame'}</PrivacyText></Typography>
              <Box onClick={(e) => e.stopPropagation()} sx={{ flexShrink: 0, mt: -0.5 }}><ExplainButton name={r.title} /></Box>
            </Box>
            <Box sx={{ mt: 0.25 }}><DateLabel date={r.performedAt} fallback="s/ data" /></Box>
            {r.sourceLab && <Box sx={{ display: 'block', mt: 0.25 }}><LabBadge raw={r.sourceLab} /></Box>}
            {!labInfo.text && labInfo.suspicious && <Typography variant="caption" sx={{ display: 'block', color: 'warning.main', fontWeight: 700, lineHeight: 1.3 }}>🏥 Laboratório em revisão</Typography>}
            {doctorInfo.text && <Typography variant="caption" title={`Dr. ${doctorInfo.original}`} sx={{ display: 'block', color: 'text.secondary', fontWeight: 600, lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>🩺 Dr. {doctorInfo.text}</Typography>}
            <Typography variant="caption" color="text.secondary">
              {cc.cat}{itemCount ? ` • ${itemCount} ${itemCount === 1 ? 'resultado' : 'resultados'}` : ''}{altered > 0 ? ` • ${altered} alterado${altered === 1 ? '' : 's'}` : ''}
            </Typography>
            <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" sx={{ mt: 0.5 }}>
              {isNew && <Chip size="small" icon={<FiberNewIcon sx={{ fontSize: '14px !important' }} />} label="Novo" sx={{ height: 20, fontWeight: 700, bgcolor: (t) => alpha(SEM.ok[t.palette.mode], 0.14), color: (t) => SEM.ok[t.palette.mode], '& .MuiChip-icon': { color: (t: ModeTheme) => `${SEM.ok[t.palette.mode]} !important` } }} />}
              <Chip size="small" label={statusLabel[r.status] ?? r.status} sx={{ height: 20, fontWeight: 700, bgcolor: (t) => alpha(toneMain(t, sc), 0.12), color: (t) => toneMain(t, sc) }} />
              {needsReview && <Chip size="small" label={translate('exams.review')} sx={{ bgcolor: (t) => alpha(SEM.warn[t.palette.mode], 0.14), color: (t) => SEM.warn[t.palette.mode], fontWeight: 800, height: 20 }} />}
            </Stack>
          </Box>
          <IconButton size="small" onClick={(e) => del(e, r.id, r.title)} title="Excluir" aria-label={`Excluir exame ${r.title}`} sx={{ flexShrink: 0, p: 1.25 }}><DeleteOutlineIcon fontSize="small" /></IconButton>
          <ChevronRightIcon sx={{ color: 'text.disabled', flexShrink: 0 }} />
        </CardContent>
        {(r.status === 'EXTRACTING' || r.status === 'UPLOADED') && <LinearProgress sx={{ height: 3 }} />}
        {r.status === 'FAILED' && (
          <Box onClick={(e) => e.stopPropagation()} sx={{ px: 1.5, pb: 1.25 }}>
            <Typography variant="caption" sx={{ color: 'error.main', display: 'block', lineHeight: 1.35 }}>
              ⚠️ {(r.extractionError || 'Falha na leitura do documento').slice(0, 140)}
            </Typography>
            <Button size="small" color="primary" onClick={(e) => reextract(e, r.id)} sx={{ mt: 0.5, textTransform: 'none', fontWeight: 700 }}>↻ Re-extrair</Button>
          </Box>
        )}
        {r.status === 'REJECTED' && (
          <Box onClick={(e) => e.stopPropagation()} sx={{ px: 1.5, pb: 1.25 }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', lineHeight: 1.35 }}>
              🚫 Não conseguimos adicionar este exame: o CPF identificado no documento é diferente do CPF da sua conta. Ele não entra nas suas análises.
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
    <AppCard key={key} kind="tinted" tone="primary" sx={{ p: 1.75, display: 'flex', alignItems: 'center', gap: 1.5 }}>
      <LockIcon sx={{ color: '#178f89' }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontWeight: 800 }}>{label}</Typography>
        <Typography variant="caption" color="text.secondary">{translate('exams.history_premium')}</Typography>
      </Box>
      <Button size="small" variant="contained" onClick={() => navigate('/planos')} sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 700, bgcolor: '#20b2aa', boxShadow: 'none', '&:hover': { bgcolor: '#178f89' }, flexShrink: 0 }}>{translate('common.view_plans')}</Button>
    </AppCard>
  );

  // DESKTOP (md+): master/detail — lista à esquerda, detalhe/contexto à direita.
  // Mobile (<md) cai no `return` abaixo (lista → navega pra /exams/:id/show).
  const heroMd = isDefaultView && lastExam ? (
    <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: '1fr', alignItems: 'stretch' }}>
      <ExamHero r={lastExam} abnCount={abnByExam[lastExam.id] ?? 0} onView={() => setSelected(lastExam.id)} onPdf={() => openPdf(lastExam.id)} />
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
              <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 0.75 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 800, color: (t) => SEM.info[t.palette.mode] }}>{translate('exams.processing')}</Typography>
                <Chip size="small" label={processing.length} sx={{ height: 18, bgcolor: (t) => alpha(SEM.info[t.palette.mode], 0.14), color: (t) => SEM.info[t.palette.mode], fontWeight: 700 }} />
              </Stack>
              <Stack spacing={1.5}>{processing.map((r: any) => <ProcessingCard key={r.id} r={r} onCancel={(e: any) => del(e, r.id, r.title || 'Exame em processamento')} />)}</Stack>
            </Box>
          )}
          {failed.length > 0 && (
            <Box>
              <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 0.75 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 800, color: 'error.main' }}>{translate('exams.failed_title')}</Typography>
                <Chip size="small" label={failed.length} sx={{ height: 18, bgcolor: (t) => alpha(SEM.bad[t.palette.mode], 0.14), color: (t) => SEM.bad[t.palette.mode], fontWeight: 700 }} />
              </Stack>
              <Alert severity="warning" icon={false} sx={{ mb: 1.25, borderRadius: RADIUS.sectionCard, py: 0.75, '& .MuiAlert-message': { fontSize: 13 } }}>
                {failed.length === 1 ? translate('exams.failed_msg_one') : translate('exams.failed_msg_many', { count: failed.length })} {translate('exams.failed_action')} <strong>{translate('exams.reextract')}</strong>.
              </Alert>
              <Stack spacing={1.5}>{failed.map((r: any) => renderCard(r))}</Stack>
            </Box>
          )}
          {rejected.length > 0 && (
            <Box>
              <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 0.75 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 800, color: 'text.secondary' }}>Não adicionados (CPF divergente)</Typography>
                <Chip size="small" label={rejected.length} sx={{ height: 18, bgcolor: 'action.hover', color: 'text.secondary', fontWeight: 700 }} />
              </Stack>
              <Alert severity="info" icon={false} sx={{ mb: 1.25, borderRadius: RADIUS.sectionCard, py: 0.75, '& .MuiAlert-message': { fontSize: 13 } }}>
                Exames cujo CPF do documento difere do CPF da conta ficam de fora das análises. Se o documento é seu, toque em "Acredito que houve um erro" e o suporte confere (OCR pode errar).
              </Alert>
              <Stack spacing={1.5}>{rejected.map((r: any) => renderCard(r))}</Stack>
            </Box>
          )}
          {view === 'category' && lockedCount > 0 && lockCard('cat-lock', `${lockedCount} exame(s) de anos anteriores fazem parte do histórico Premium.`, lockedCount)}
          {view === 'date' && (
            <>
              {dateGroups.length === 0 && processing.length === 0 && emptyBlock}
              {dateGroups.map((g) => {
                const locked = !premium && g.year !== latestYear && g.year != null;
                if (locked) return lockCard(String(g.year), `📅 ${g.label} • ${g.items.length} exame(s)`, g.items.length);
                const defaultExp = premium || g.year === latestYear || (g.year === null && g.items.some((r: any) => r.status === 'FAILED'));
                const expKey = `date-${g.year}`;
                return (
                  <Accordion key={String(g.year)} expanded={isAccordionExpanded(expKey, defaultExp)} onChange={() => toggleAccordion(expKey, defaultExp)} disableGutters elevation={0} sx={{ borderRadius: `${RADIUS.sectionCard} !important`, border: '1px solid', borderColor: 'divider', '&:before': { display: 'none' } }}>
                    <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ fontSize: 30, color: '#178f89', bgcolor: 'rgba(32,178,170,.12)', borderRadius: '50%', p: 0.6, boxShadow: '0 2px 6px rgba(32,178,170,.18)' }} />} sx={{ minHeight: '48px !important', '& .MuiAccordionSummary-content': { my: 0.75, alignItems: 'center' } }}>
                      <Typography sx={{ fontWeight: 800, flex: '1 1 auto', minWidth: 0 }}>📅 {g.label}</Typography>
                      <Chip size="small" label={`${g.items.length} ${g.items.length === 1 ? 'exame' : 'exames'}`} sx={{ ml: 1.5, bgcolor: 'action.hover', color: 'text.secondary', height: 22, fontSize: 12, flexShrink: 0 }} />
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
                  <Accordion key={c.key} expanded={isAccordionExpanded(expKey, defaultExp)} onChange={() => toggleAccordion(expKey, defaultExp)} disableGutters elevation={0} sx={{ borderRadius: `${RADIUS.sectionCard} !important`, border: '1px solid', borderColor: 'divider', '&:before': { display: 'none' } }}>
                    <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ fontSize: 30, color: c.color, bgcolor: c.color + '1f', borderRadius: '50%', p: 0.6 }} />} sx={{ minHeight: '48px !important', '& .MuiAccordionSummary-content': { my: 0.75, alignItems: 'center' } }}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, fontWeight: 800, flex: "1 1 auto", minWidth: 0 }}><Box component={c.icon} sx={{ fontSize: 18, color: c.color }} />{c.cat}</Box>
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
        <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: '1.6fr 1fr' }, alignItems: 'stretch' }}>
          <ExamHero r={lastExam} abnCount={abnByExam[lastExam.id] ?? 0} onView={() => navigate(`/exams/${lastExam.id}/show`)} onPdf={() => openPdf(lastExam.id)} />
          <ChangesSinceExam worsened={worsened} improved={improved} loaded={hsLoaded} onView={() => navigate('/tendencias')} />
        </Box>
      )}

      {/* FAB "＋ Enviar exame" está no AppLayout (ExamCreateFab) — sempre acima do rodapé. */}
      {processing.length > 0 && (
        <Box>
          <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 0.75 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 800, color: (t) => SEM.info[t.palette.mode] }}>{translate('exams.processing')}</Typography>
            <Chip size="small" label={processing.length} sx={{ height: 18, bgcolor: (t) => alpha(SEM.info[t.palette.mode], 0.14), color: (t) => SEM.info[t.palette.mode], fontWeight: 700 }} />
          </Stack>
          <Stack spacing={1.5}>
            {processing.map((r: any) => <ProcessingCard key={r.id} r={r} onCancel={(e: any) => del(e, r.id, r.title || 'Exame em processamento')} />)}
          </Stack>
        </Box>
      )}
      {failed.length > 0 && (
        <Box>
          <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 0.75 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 800, color: 'error.main' }}>{translate('exams.failed_title')}</Typography>
            <Chip size="small" label={failed.length} sx={{ height: 18, bgcolor: (t) => alpha(SEM.bad[t.palette.mode], 0.14), color: (t) => SEM.bad[t.palette.mode], fontWeight: 700 }} />
          </Stack>
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
          <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 0.75 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 800, color: 'text.secondary' }}>Não adicionados (CPF divergente)</Typography>
            <Chip size="small" label={rejected.length} sx={{ height: 18, bgcolor: 'action.hover', color: 'text.secondary', fontWeight: 700 }} />
          </Stack>
          <Alert severity="info" icon={false} sx={{ mb: 1.25, borderRadius: RADIUS.sectionCard, py: 0.75, '& .MuiAlert-message': { fontSize: 13 } }}>
            Exames cujo CPF do documento difere do CPF da conta ficam de fora das análises. Se o documento é seu, toque em "Acredito que houve um erro" e o suporte confere (OCR pode errar).
          </Alert>
          <Stack spacing={1.5}>
            {rejected.map((r: any) => renderCard(r))}
          </Stack>
        </Box>
      )}

      {/* Nudge Premium (apenas na visão por categoria — anos anteriores ocultos) */}
      {view === 'category' && lockedCount > 0 && lockCard('cat-lock', `${lockedCount} exame(s) de anos anteriores fazem parte do histórico Premium.`, lockedCount)}

      {/* Grupos (data OU categoria) */}
      {view === 'date' && (
        <>
          {dateGroups.length === 0 && processing.length === 0 && emptyBlock}
          {dateGroups.map((g) => {
            const locked = !premium && g.year !== latestYear && g.year != null;
            if (locked) return lockCard(String(g.year), `📅 ${g.label} • ${g.items.length} exame(s)`, g.items.length);
            const defaultExp = premium || g.year === latestYear || (g.year === null && g.items.some((r: any) => r.status === 'FAILED'));
            const expKey = `date-${g.year}`;
            return (
              <Accordion key={String(g.year)} expanded={isAccordionExpanded(expKey, defaultExp)} onChange={() => toggleAccordion(expKey, defaultExp)} disableGutters elevation={0}
                sx={{ borderRadius: `${RADIUS.sectionCard} !important`, border: '1px solid', borderColor: 'divider', '&:before': { display: 'none' } }}>
                <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ fontSize: 30, color: '#178f89', bgcolor: 'rgba(32,178,170,.12)', borderRadius: '50%', p: 0.6, boxShadow: '0 2px 6px rgba(32,178,170,.18)' }} />} sx={{ minHeight: '48px !important', '& .MuiAccordionSummary-content': { my: 0.75, alignItems: 'center' } }}>
                  <Typography sx={{ fontWeight: 800, flex: '1 1 auto', minWidth: 0 }}>📅 {g.label}</Typography>
                  <Chip size="small" label={`${g.items.length} ${g.items.length === 1 ? 'exame' : 'exames'}`} sx={{ ml: 1.5, bgcolor: 'action.hover', color: 'text.secondary', height: 22, fontSize: 12, flexShrink: 0 }} />
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
                sx={{ borderRadius: `${RADIUS.sectionCard} !important`, border: '1px solid', borderColor: 'divider', '&:before': { display: 'none' } }}>
                <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ fontSize: 30, color: c.color, bgcolor: c.color + '1f', borderRadius: '50%', p: 0.6 }} />} sx={{ minHeight: '48px !important', '& .MuiAccordionSummary-content': { my: 0.75, alignItems: 'center' } }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, fontWeight: 800, flex: "1 1 auto", minWidth: 0 }}><Box component={c.icon} sx={{ fontSize: 18, color: c.color }} />{c.cat}</Box>
                  <Chip size="small" label={`${items.length}`} sx={{ ml: 1.5, bgcolor: c.color + '1a', color: c.color, height: 20, flexShrink: 0 }} />
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
    <List key={pid} sort={{ field: 'performedAt', order: 'DESC' }} exporter={false} perPage={1000} pagination={false} filter={{ patientId: pid || 'none' }} actions={false} empty={false}>
      <ExamCards />
    </List>
  );
};
