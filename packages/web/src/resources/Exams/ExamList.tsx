import { useEffect, useState, useRef } from 'react';
import { List, useListContext, useRefresh, useNotify, useTranslate } from 'react-admin';
import { Chip, Box, CardContent, Typography, IconButton, Stack, LinearProgress, Button, Accordion, AccordionSummary, AccordionDetails, Alert, CircularProgress, TextField, InputAdornment, ToggleButton, ToggleButtonGroup, useTheme, useMediaQuery } from '@mui/material';
import { alpha } from '@mui/material/styles';
import ScienceIcon from '@mui/icons-material/Science';
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
import { DateLabel } from '../../components/DateLabel';
import { ChangesSinceExam, type Marker } from '../../components/dashboard/ChangesSinceExam';
import { ExamShow } from './ExamShow';
import { cleanExtractedLabel } from '../../utils/examDisplay';
import { openExamFile } from '../../utils/examFile';
import { RADIUS } from '../../theme';

// Status de PROCESSAMENTO (não clínico) → chave de paleta (token, sem hex literal).
const statusColor: Record<string, 'success' | 'error' | 'warning' | 'info' | 'default'> = { EXTRACTED: 'success', FAILED: 'error', UPLOADED: 'warning', EXTRACTING: 'info' };
const statusLabel: Record<string, string> = { EXTRACTED: 'Pronto', FAILED: 'Falhou', UPLOADED: 'Enviado', EXTRACTING: 'Extraindo' };
const kindLabel: Record<string, string> = { LAB_PANEL: 'Laboratorial', IMAGING: 'Imagem', OTHER: 'Outro' };

/** Cor de paleta resolved (pra alpha em bgcolor) — default cai em text.secondary. */
const toneMain = (t: any, sc: string) => (sc === 'default' ? t.palette.text.secondary : (t.palette as any)[sc]?.main ?? t.palette.text.secondary);

const RECENT_DAYS = 90; // filtro "Recentes": últimos ~3 meses.

/** Ano (int) de um exame — performedAt (data do exame) com fallback no envio (createdAt). */
const yearOf = (r: any): number | null => {
  const d = r?.performedAt ?? r?.createdAt;
  if (!d) return null;
  const y = new Date(d).getFullYear();
  return Number.isNaN(y) ? null : y;
};

/** Cartão de exame EM PROCESSAMENTO (UPLOADED/EXTRACTING) — sempre no TOPO da lista.
 *  Barra indeterminada (não há % real no servidor). Toca pra acompanhar a extração. */
const ProcessingCard = ({ r, onCancel }: { r: any; onCancel?: (e: any) => void }) => {
  const navigate = useNavigate();
  return (
    <AppCard kind="interactive" onClick={() => navigate(`/exams/${r.id}/show`)} sx={{ overflow: 'hidden' }}>
      <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.5, '&:last-child': { pb: 1.5 } }}>
        <CircularProgress size={32} thickness={5} sx={{ color: 'info.main', flexShrink: 0 }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700, wordBreak: 'break-word', overflowWrap: 'anywhere', lineHeight: 1.2 }}>{r.title || 'Novo exame enviado'}</Typography>
          <Typography variant="caption" color="text.secondary">Dr. Exame está extraindo… toque para acompanhar</Typography>
        </Box>
        {onCancel && <IconButton size="small" onClick={(e) => { e.stopPropagation(); onCancel(e); }} title="Cancelar e excluir" aria-label="Cancelar e excluir exame" sx={{ flexShrink: 0, color: 'text.secondary', p: 1.25 }}><CloseIcon fontSize="small" /></IconButton>}
        <ChevronRightIcon sx={{ color: 'text.disabled', flexShrink: 0 }} />
      </CardContent>
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
        <Typography sx={{ fontSize: 13.5, color: 'text.secondary' }}>{itemCount} resultado{itemCount !== 1 ? 's' : ''}</Typography>
        {abnCount > 0 ? (
          <Chip size="small" label={`${abnCount} alterado${abnCount === 1 ? '' : 's'}`} sx={{ height: 22, fontWeight: 700, borderRadius: RADIUS.pill, bgcolor: alpha('#c2410c', 0.14), color: '#b45309' }} />
        ) : (
          <Chip size="small" label="Nada alterado" sx={{ height: 22, fontWeight: 700, borderRadius: RADIUS.pill, bgcolor: alpha('#047857', 0.14), color: '#047857' }} />
        )}
      </Stack>
      <Stack direction="row" spacing={1} sx={{ mt: 2.25 }}>
        <GradientButton onClick={onView} endIcon={<ArrowForwardIcon />} sx={{ flex: 1 }}>Ver análise</GradientButton>
        <Button variant="outlined" onClick={onPdf} startIcon={<PictureAsPdfOutlinedIcon />} sx={{ borderRadius: RADIUS.button, textTransform: 'none', fontWeight: 700, borderColor: 'divider', color: 'text.secondary' }}>Abrir laudo</Button>
      </Stack>
    </AppCard>
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
    }
    prevProcessingRef.current = processingCount;
  }, [processingCount]);
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
  const presentCats = CATS.filter((c) => catCounts[c.key]).sort((a, b) => catCounts[b.key] - catCounts[a.key]);

  const renderCard = (r: any) => {
    const sc = statusColor[r.status] ?? 'default';
    const cc = categorizeExam(r);
    const titleInfo = cleanExtractedLabel(r.title, `Exame ${kindLabel[r.kind] ?? ''}`.trim(), 58);
    const labInfo = cleanExtractedLabel(r.sourceLab, '', 46);
    const doctorInfo = cleanExtractedLabel((r as any).rawExtraction?.requestingDoctor, '', 46);
    const needsReview = !!r.reviewRequired || titleInfo.suspicious || labInfo.suspicious || doctorInfo.suspicious || !r.performedAt;
    const isNew = !!r.createdAt && Date.now() - new Date(r.createdAt).getTime() < 48 * 3600 * 1000;
    const altered = abnByExam[r.id] ?? 0;
    const itemCount: number = r._count?.items ?? 0;
    const Icon = r.kind === 'IMAGING' ? ImageIcon : r.kind === 'LAB_PANEL' ? ScienceIcon : DescriptionOutlinedIcon;
    return (
      <AppCard key={r.id} kind="interactive" onClick={() => isMd ? setSelected(r.id) : navigate(`/exams/${r.id}/show`)} sx={{ overflow: 'hidden', ...(isMd && selected === r.id ? { boxShadow: '0 0 0 2px #20b2aa inset' } : {}) }}>
        <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.5, '&:last-child': { pb: 1.5 } }}>
          <Icon sx={{ color: altered > 0 ? 'warning.main' : 'text.secondary', flexShrink: 0 }} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
              <Typography title={titleInfo.original || r.title} sx={{ fontWeight: 700, wordBreak: 'break-word', overflowWrap: 'anywhere', lineHeight: 1.2 }}>{titleInfo.text || 'Exame'}</Typography>
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
              {isNew && <Chip size="small" label="🆕 Novo" sx={{ bgcolor: '#dcfce7', color: '#15803d', fontWeight: 700, height: 20 }} />}
              <Chip size="small" label={statusLabel[r.status] ?? r.status} sx={{ height: 20, fontWeight: 700, bgcolor: (t) => alpha(toneMain(t, sc), 0.12), color: (t) => toneMain(t, sc) }} />
              {needsReview && <Chip size="small" label={translate('exams.review')} sx={{ bgcolor: '#f59e0b18', color: '#b45309', fontWeight: 800, height: 20 }} />}
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
      <ChangesSinceExam worsened={worsened} improved={improved} loaded={hsLoaded} onView={() => navigate('/evolucao')} />
    </Box>
  ) : null;
  if (isMd) {
    return (
      <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0,440px) 1fr', gap: 2, alignItems: 'start', maxWidth: 1500, mx: 'auto' }}>
        {/* LISTA (esquerda) — sticky, scroll próprio */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, position: 'sticky', top: 8, maxHeight: 'calc(100dvh - 16px)', overflowY: 'auto', pr: 0.5 }}>
          <PageHeader icon={<DescriptionOutlinedIcon />} title={translate('exams.title')} subtitle={translate('exams.subtitle', { count: total ?? 0 })} />
          <ConfirmDialog open={!!delTarget} onClose={() => setDelTarget(null)} onConfirm={confirmDel} title={translate('exams.delete_title')} message={delTarget ? translate('exams.delete_msg', { title: delTarget.title }) : ''} confirmLabel={translate('ra.action.delete')} />
          <Stack spacing={1.25}>
            <TextField size="small" fullWidth value={q} onChange={(e) => setQ(e.target.value)} placeholder={translate('exams.search_ph')} InputProps={{ startAdornment: (<InputAdornment position="start"><SearchIcon fontSize="small" sx={{ color: 'text.secondary' }} /></InputAdornment>) }} sx={{ '& .MuiOutlinedInput-root': { borderRadius: RADIUS.button, bgcolor: 'background.paper' } }} />
            <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
              <ToggleButtonGroup exclusive size="small" value={sfilter} onChange={(_, v) => { if (v) setSfilter(v); }}>
                <ToggleButton value="all" sx={{ px: 1.25, py: { xs: 0.75, sm: 0.35 }, minHeight: { xs: 40, sm: 0 }, textTransform: 'none', fontWeight: 700 }}>Todos</ToggleButton>
                <ToggleButton value="altered" sx={{ px: 1.25, py: { xs: 0.75, sm: 0.35 }, minHeight: { xs: 40, sm: 0 }, textTransform: 'none', fontWeight: 700 }}>Alterados</ToggleButton>
                <ToggleButton value="recent" sx={{ px: 1.25, py: { xs: 0.75, sm: 0.35 }, minHeight: { xs: 40, sm: 0 }, textTransform: 'none', fontWeight: 700 }}>Recentes</ToggleButton>
              </ToggleButtonGroup>
              <ToggleButtonGroup exclusive size="small" value={view} onChange={(_, v) => { if (v) setView(v); }}>
                <ToggleButton value="date" sx={{ px: 1.25, py: { xs: 0.75, sm: 0.35 }, minHeight: { xs: 40, sm: 0 }, textTransform: 'none', fontWeight: 700 }}>{translate('exams.by_date')}</ToggleButton>
                <ToggleButton value="category" sx={{ px: 1.25, py: { xs: 0.75, sm: 0.35 }, minHeight: { xs: 40, sm: 0 }, textTransform: 'none', fontWeight: 700 }}>{translate('exams.by_category')}</ToggleButton>
              </ToggleButtonGroup>
            </Stack>
            {presentCats.length > 1 && (
              <Stack direction="row" spacing={0.75} sx={{ overflowX: 'auto', flexWrap: 'nowrap', pb: 0.25, mx: -0.25, px: 0.25, '&::-webkit-scrollbar': { display: 'none' } }}>
                <Chip size="small" label={translate('exams.all', { count: extracted.length })} onClick={() => setCat('all')} sx={{ height: 32, flexShrink: 0, fontWeight: 700, whiteSpace: 'nowrap', bgcolor: cat === 'all' ? '#0f5f5a' : '#0f5f5a14', color: cat === 'all' ? '#fff' : '#0f5f5a' }} />
                {presentCats.map((c) => (<Chip key={c.key} size="small" icon={<Box component={c.icon} sx={{ fontSize: 15, color: `${cat === c.key ? '#fff' : c.color} !important`, ml: 0.5, mr: -0.5 }} />} label={`${c.cat} (${catCounts[c.key]})`} onClick={() => setCat(cat === c.key ? 'all' : c.key)} sx={{ height: 32, flexShrink: 0, fontWeight: 700, whiteSpace: 'nowrap', bgcolor: cat === c.key ? c.color : c.color + '1a', color: cat === c.key ? '#fff' : c.color, border: `1px solid ${cat === c.key ? c.color : c.color + '40'}` }} />))}
              </Stack>
            )}
          </Stack>
          {processing.length > 0 && (
            <Box>
              <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 0.75 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#0369a1' }}>{translate('exams.processing')}</Typography>
                <Chip size="small" label={processing.length} sx={{ height: 18, bgcolor: '#e0f2fe', color: '#0369a1', fontWeight: 700 }} />
              </Stack>
              <Stack spacing={1.5}>{processing.map((r: any) => <ProcessingCard key={r.id} r={r} onCancel={(e: any) => del(e, r.id, r.title || 'Exame em processamento')} />)}</Stack>
            </Box>
          )}
          {failed.length > 0 && (
            <Box>
              <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 0.75 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 800, color: 'error.main' }}>{translate('exams.failed_title')}</Typography>
                <Chip size="small" label={failed.length} sx={{ height: 18, bgcolor: '#fee2e2', color: '#ef4444', fontWeight: 700 }} />
              </Stack>
              <Alert severity="warning" icon={false} sx={{ mb: 1.25, borderRadius: RADIUS.sectionCard, py: 0.75, '& .MuiAlert-message': { fontSize: 13 } }}>
                {failed.length === 1 ? translate('exams.failed_msg_one') : translate('exams.failed_msg_many', { count: failed.length })} {translate('exams.failed_action')} <strong>{translate('exams.reextract')}</strong>.
              </Alert>
              <Stack spacing={1.5}>{failed.map((r: any) => renderCard(r))}</Stack>
            </Box>
          )}
          {view === 'category' && lockedCount > 0 && lockCard('cat-lock', `${lockedCount} exame(s) de anos anteriores fazem parte do histórico Premium.`, lockedCount)}
          {view === 'date' && (
            <>
              {dateGroups.length === 0 && processing.length === 0 && (filtering ? <EmptyState emoji="🔍" title={translate('exams.empty_search_title')} desc={translate('exams.empty_search_desc')} /> : <EmptyState title={translate('exams.empty_title')} desc={translate('exams.empty_desc')} cta={translate('exams.send')} onCta={() => navigate('/exams/create')} bonus={firstBonus ?? undefined} />)}
              {dateGroups.map((g) => {
                const locked = !premium && g.year !== latestYear && g.year != null;
                if (locked) return lockCard(String(g.year), `📅 ${g.label} • ${g.items.length} exame(s)`, g.items.length);
                return (
                  <Accordion key={String(g.year)} defaultExpanded={g.year === latestYear || (g.year === null && g.items.some((r: any) => r.status === 'FAILED'))} disableGutters elevation={0} sx={{ borderRadius: `${RADIUS.sectionCard} !important`, overflow: 'hidden', border: '1px solid', borderColor: 'divider', '&:before': { display: 'none' } }}>
                    <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ fontSize: 30, color: '#178f89', bgcolor: 'rgba(32,178,170,.12)', borderRadius: '50%', p: 0.6, boxShadow: '0 2px 6px rgba(32,178,170,.18)' }} />} sx={{ minHeight: '48px !important', '& .MuiAccordionSummary-content': { my: 0.75, alignItems: 'center' } }}>
                      <Typography sx={{ fontWeight: 800, flex: '1 1 auto', minWidth: 0 }}>📅 {g.label}</Typography>
                      <Chip size="small" label={`${g.items.length} ${g.items.length === 1 ? 'exame' : 'exames'}`} sx={{ ml: 1.5, bgcolor: 'rgba(0,0,0,.05)', color: 'text.secondary', height: 22, fontSize: 12, flexShrink: 0 }} />
                    </AccordionSummary>
                    <AccordionDetails sx={{ p: 1, display: 'flex', flexDirection: 'column', gap: 1.5 }}>{g.items.map(renderCard)}</AccordionDetails>
                  </Accordion>
                );
              })}
            </>
          )}
          {view === 'category' && (
            <>
              {catGroups.length === 0 && processing.length === 0 && (filtering ? <EmptyState emoji="🔍" title={translate('exams.empty_search_title')} desc={translate('exams.empty_search_desc')} /> : <EmptyState title={translate('exams.empty_title')} desc={translate('exams.empty_desc')} cta={translate('exams.send')} onCta={() => navigate('/exams/create')} bonus={firstBonus ?? undefined} />)}
              {catGroups.map(({ cat: c, items }) => (
                <Accordion key={c.key} defaultExpanded={catGroups.length <= 3} disableGutters elevation={0} sx={{ borderRadius: `${RADIUS.sectionCard} !important`, overflow: 'hidden', border: '1px solid', borderColor: 'divider', '&:before': { display: 'none' } }}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ fontSize: 30, color: c.color, bgcolor: c.color + '1f', borderRadius: '50%', p: 0.6 }} />} sx={{ minHeight: '48px !important', '& .MuiAccordionSummary-content': { my: 0.75, alignItems: 'center' } }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, fontWeight: 800, flex: "1 1 auto", minWidth: 0 }}><Box component={c.icon} sx={{ fontSize: 18, color: c.color }} />{c.cat}</Box>
                    <Chip size="small" label={`${items.length}`} sx={{ ml: 1.5, bgcolor: c.color + '1a', color: c.color, height: 20, flexShrink: 0 }} />
                  </AccordionSummary>
                  <AccordionDetails sx={{ p: 1, display: 'flex', flexDirection: 'column', gap: 1.5 }}>{items.map(renderCard)}</AccordionDetails>
                </Accordion>
              ))}
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
    <PageContainer width="content" sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <PageHeader icon={<DescriptionOutlinedIcon />} title={translate('exams.title')} subtitle={translate('exams.subtitle', { count: total ?? 0 })} />

      <ConfirmDialog
        open={!!delTarget}
        onClose={() => setDelTarget(null)}
        onConfirm={confirmDel}
        title={translate('exams.delete_title')}
        message={delTarget ? translate('exams.delete_msg', { title: delTarget.title }) : ''}
        confirmLabel={translate('ra.action.delete')}
      />

      {/* Toolbar: busca + filtros (Todos/Alterados/Recentes) + agrupamento (data/categoria). */}
      <Stack spacing={1.25}>
        <TextField
          size="small" fullWidth value={q} onChange={(e) => setQ(e.target.value)}
          placeholder={translate('exams.search_ph')}
          InputProps={{ startAdornment: (<InputAdornment position="start"><SearchIcon fontSize="small" sx={{ color: 'text.secondary' }} /></InputAdornment>) }}
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: RADIUS.button, bgcolor: 'background.paper' } }}
        />
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
          <ToggleButtonGroup exclusive size="small" value={sfilter} onChange={(_, v) => { if (v) setSfilter(v); }}>
            <ToggleButton value="all" sx={{ px: 1.5, py: { xs: 0.85, sm: 0.6 }, minHeight: { xs: 40, sm: 0 }, textTransform: 'none', fontWeight: 700 }}>Todos</ToggleButton>
            <ToggleButton value="altered" sx={{ px: 1.5, py: { xs: 0.85, sm: 0.6 }, minHeight: { xs: 40, sm: 0 }, textTransform: 'none', fontWeight: 700 }}>Alterados</ToggleButton>
            <ToggleButton value="recent" sx={{ px: 1.5, py: { xs: 0.85, sm: 0.6 }, minHeight: { xs: 40, sm: 0 }, textTransform: 'none', fontWeight: 700 }}>Recentes</ToggleButton>
          </ToggleButtonGroup>
          <ToggleButtonGroup exclusive size="small" value={view} onChange={(_, v) => { if (v) setView(v); }}>
            <ToggleButton value="date" sx={{ px: 1.5, py: { xs: 0.85, sm: 0.6 }, minHeight: { xs: 40, sm: 0 }, textTransform: 'none', fontWeight: 700 }}>{translate('exams.by_date')}</ToggleButton>
            <ToggleButton value="category" sx={{ px: 1.5, py: { xs: 0.85, sm: 0.6 }, minHeight: { xs: 40, sm: 0 }, textTransform: 'none', fontWeight: 700 }}>{translate('exams.by_category')}</ToggleButton>
          </ToggleButtonGroup>
        </Stack>
        {/* Chips de categoria — só aparecem se houver +1 categoria nos exames prontos */}
        {presentCats.length > 1 && (
          <Stack direction="row" spacing={0.75} sx={{ overflowX: 'auto', flexWrap: 'nowrap', pb: 0.25, mx: -0.25, px: 0.25, '&::-webkit-scrollbar': { display: 'none' } }}>
            <Chip size="small" label={translate('exams.all', { count: extracted.length })} onClick={() => setCat('all')} sx={{ height: 32, flexShrink: 0, fontWeight: 700, whiteSpace: 'nowrap', bgcolor: cat === 'all' ? '#0f5f5a' : '#0f5f5a14', color: cat === 'all' ? '#fff' : '#0f5f5a' }} />
            {presentCats.map((c) => (
              <Chip key={c.key} size="small" icon={<Box component={c.icon} sx={{ fontSize: 15, color: `${cat === c.key ? '#fff' : c.color} !important`, ml: 0.5, mr: -0.5 }} />} label={`${c.cat} (${catCounts[c.key]})`} onClick={() => setCat(cat === c.key ? 'all' : c.key)} sx={{ height: 32, flexShrink: 0, fontWeight: 700, whiteSpace: 'nowrap', bgcolor: cat === c.key ? c.color : c.color + '1a', color: cat === c.key ? '#fff' : c.color, border: `1px solid ${cat === c.key ? c.color : c.color + '40'}` }} />
            ))}
          </Stack>
        )}
      </Stack>

      {/* HERO + "O que mudou" — só no modo padrão (sem busca/filtro), resumo de entrada. */}
      {isDefaultView && lastExam && (
        <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: '1.6fr 1fr' }, alignItems: 'stretch' }}>
          <ExamHero r={lastExam} abnCount={abnByExam[lastExam.id] ?? 0} onView={() => navigate(`/exams/${lastExam.id}/show`)} onPdf={() => openPdf(lastExam.id)} />
          <ChangesSinceExam worsened={worsened} improved={improved} loaded={hsLoaded} onView={() => navigate('/evolucao')} />
        </Box>
      )}

      {/* FAB "＋ Enviar exame" está no AppLayout (ExamCreateFab) — sempre acima do rodapé. */}
      {processing.length > 0 && (
        <Box>
          <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 0.75 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#0369a1' }}>{translate('exams.processing')}</Typography>
            <Chip size="small" label={processing.length} sx={{ height: 18, bgcolor: '#e0f2fe', color: '#0369a1', fontWeight: 700 }} />
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
            <Chip size="small" label={failed.length} sx={{ height: 18, bgcolor: '#fee2e2', color: '#ef4444', fontWeight: 700 }} />
          </Stack>
          <Alert severity="warning" icon={false} sx={{ mb: 1.25, borderRadius: RADIUS.sectionCard, py: 0.75, '& .MuiAlert-message': { fontSize: 13 } }}>
            {failed.length === 1 ? translate('exams.failed_msg_one') : translate('exams.failed_msg_many', { count: failed.length })} {translate('exams.failed_action')} <strong>{translate('exams.reextract')}</strong>.
          </Alert>
          <Stack spacing={1.5}>
            {failed.map((r: any) => renderCard(r))}
          </Stack>
        </Box>
      )}

      {/* Nudge Premium (apenas na visão por categoria — anos anteriores ocultos) */}
      {view === 'category' && lockedCount > 0 && lockCard('cat-lock', `${lockedCount} exame(s) de anos anteriores fazem parte do histórico Premium.`, lockedCount)}

      {/* Grupos (data OU categoria) */}
      {view === 'date' && (
        <>
          {dateGroups.length === 0 && processing.length === 0 && (
            filtering
              ? <EmptyState emoji="🔍" title={translate('exams.empty_search_title')} desc={translate('exams.empty_search_desc')} />
              : <EmptyState title={translate('exams.empty_title')} desc={translate('exams.empty_desc')} cta={translate('exams.send')} onCta={() => navigate('/exams/create')} bonus={firstBonus ?? undefined} />
          )}
          {dateGroups.map((g) => {
            const locked = !premium && g.year !== latestYear && g.year != null;
            if (locked) return lockCard(String(g.year), `📅 ${g.label} • ${g.items.length} exame(s)`, g.items.length);
            return (
              <Accordion key={String(g.year)} defaultExpanded={g.year === latestYear || (g.year === null && g.items.some((r: any) => r.status === 'FAILED'))} disableGutters elevation={0}
                sx={{ borderRadius: `${RADIUS.sectionCard} !important`, overflow: 'hidden', border: '1px solid', borderColor: 'divider', '&:before': { display: 'none' } }}>
                <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ fontSize: 30, color: '#178f89', bgcolor: 'rgba(32,178,170,.12)', borderRadius: '50%', p: 0.6, boxShadow: '0 2px 6px rgba(32,178,170,.18)' }} />} sx={{ minHeight: '48px !important', '& .MuiAccordionSummary-content': { my: 0.75, alignItems: 'center' } }}>
                  <Typography sx={{ fontWeight: 800, flex: '1 1 auto', minWidth: 0 }}>📅 {g.label}</Typography>
                  <Chip size="small" label={`${g.items.length} ${g.items.length === 1 ? 'exame' : 'exames'}`} sx={{ ml: 1.5, bgcolor: 'rgba(0,0,0,.05)', color: 'text.secondary', height: 22, fontSize: 12, flexShrink: 0 }} />
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
          {catGroups.length === 0 && processing.length === 0 && (
            filtering
              ? <EmptyState emoji="🔍" title={translate('exams.empty_search_title')} desc={translate('exams.empty_search_desc')} />
              : <EmptyState title={translate('exams.empty_title')} desc={translate('exams.empty_desc')} cta={translate('exams.send')} onCta={() => navigate('/exams/create')} bonus={firstBonus ?? undefined} />
          )}
          {catGroups.map(({ cat: c, items }) => (
            <Accordion key={c.key} defaultExpanded={catGroups.length <= 3} disableGutters elevation={0}
              sx={{ borderRadius: `${RADIUS.sectionCard} !important`, overflow: 'hidden', border: '1px solid', borderColor: 'divider', '&:before': { display: 'none' } }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ fontSize: 30, color: c.color, bgcolor: c.color + '1f', borderRadius: '50%', p: 0.6 }} />} sx={{ minHeight: '48px !important', '& .MuiAccordionSummary-content': { my: 0.75, alignItems: 'center' } }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, fontWeight: 800, flex: "1 1 auto", minWidth: 0 }}><Box component={c.icon} sx={{ fontSize: 18, color: c.color }} />{c.cat}</Box>
                <Chip size="small" label={`${items.length}`} sx={{ ml: 1.5, bgcolor: c.color + '1a', color: c.color, height: 20, flexShrink: 0 }} />
              </AccordionSummary>
              <AccordionDetails sx={{ p: 1, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {items.map(renderCard)}
              </AccordionDetails>
            </Accordion>
          ))}
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
