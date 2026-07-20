import { useEffect, useState } from 'react';
import { List, useListContext, useRefresh, useNotify, useTranslate, CreateButton, TopToolbar } from 'react-admin';
import { Chip, Box, Card, CardContent, Typography, IconButton, Stack, LinearProgress, Button, Accordion, AccordionSummary, AccordionDetails, Alert, CircularProgress, TextField, InputAdornment, ToggleButton, ToggleButtonGroup } from '@mui/material';
import ScienceIcon from '@mui/icons-material/Science';
import ImageIcon from '@mui/icons-material/Image';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CloseIcon from '@mui/icons-material/Close';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import LockIcon from '@mui/icons-material/Lock';
import SearchIcon from '@mui/icons-material/Search';
import { useNavigate } from 'react-router-dom';
import { useSelectedPatient } from '../../patient-context';
import { API_URL, token } from '../../config';
import { ExplainButton } from '../../components/ExplainItem';
import { usePremium } from '../../components/PremiumGate';
import { groupByYear } from '../../utils/groupByYear';
import { categorizeExam, CATS } from '../../utils/medicalData';
import { PageContainer } from '../../components/layout/PageContainer';
import { PageHeader } from '../../components/layout/PageHeader';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { ListSkeleton } from '../../components/Skeleton';
import { EmptyState } from '../../components/EmptyState';
import { cleanExtractedLabel } from '../../utils/examDisplay';

const ExamListActions = () => (
  <TopToolbar>
    <CreateButton label="Enviar exame" variant="contained" />
  </TopToolbar>
);

const statusColor: Record<string, 'success' | 'error' | 'warning' | 'info' | 'default'> = { EXTRACTED: 'success', FAILED: 'error', UPLOADED: 'warning', EXTRACTING: 'info' };
const statusLabel: Record<string, string> = { EXTRACTED: 'Pronto', FAILED: 'Falhou', UPLOADED: 'Enviado', EXTRACTING: 'Extraindo' };
const kindLabel: Record<string, string> = { LAB_PANEL: 'Laboratorial', IMAGING: 'Imagem', OTHER: 'Outro' };
const hexFor = (s: string) => { const sc = statusColor[s] ?? 'default'; return sc === 'success' ? '#059669' : sc === 'error' ? '#ef4444' : sc === 'warning' ? '#f59e0b' : sc === 'info' ? '#0ea5e9' : '#94a3b8'; };

/** Ano (int) de um exame — performedAt (data do exame) com fallback no envio (createdAt). */
const yearOf = (r: any): number | null => {
  const d = r?.performedAt ?? r?.createdAt;
  if (!d) return null;
  const y = new Date(d).getFullYear();
  return Number.isNaN(y) ? null : y;
};

/** Cartão de exame EM PROCESSAMENTO (UPLOADED/EXTRACTING) — fica sempre no TOPO da lista,
 *  com spinner/barra INDETERMINADOS. Não há progresso real no servidor (a extração é um
 *  state machine), então antes a % era simulada e travava em ~94% (sensação de pendurado) e
 *  reiniciava a cada visita. Indeterminado é honesto. Toca no cartão pra ver o robô. */
const ProcessingCard = ({ r, onCancel }: { r: any; onCancel?: (e: any) => void }) => {
  const navigate = useNavigate();
  return (
    <Card onClick={() => navigate(`/exams/${r.id}/show`)} sx={{ cursor: 'pointer', borderRadius: 3, borderLeft: '4px solid #0ea5e9', overflow: 'hidden', maxWidth: '100%' }}>
      <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.5, '&:last-child': { pb: 1.5 } }}>
        <CircularProgress size={34} thickness={5} sx={{ color: '#0ea5e9', flexShrink: 0 }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700, wordBreak: 'break-word', overflowWrap: 'anywhere', lineHeight: 1.2 }}>{r.title || 'Novo exame enviado'}</Typography>
          <Typography variant="caption" color="text.secondary">Dr. Exame está extraindo… toque para acompanhar</Typography>
        </Box>
        {onCancel && <IconButton size="small" onClick={onCancel} title="Cancelar e excluir" aria-label="Cancelar e excluir exame" sx={{ flexShrink: 0, color: 'text.secondary' }}><CloseIcon fontSize="small" /></IconButton>}
        <ChevronRightIcon sx={{ color: 'text.disabled', flexShrink: 0 }} />
      </CardContent>
      <LinearProgress sx={{ height: 4, '& .MuiLinearProgress-bar': { background: 'linear-gradient(90deg,#0ea5e9,#20b2aa)' } }} />
    </Card>
  );
};

/** Cards agrupados por ano OU por categoria (alternáveis). Busca + filtro por categoria no topo. */
const ExamCards = () => {
  const { data, isLoading, total } = useListContext<any>();
  const navigate = useNavigate();
  const translate = useTranslate();
  const refresh = useRefresh();
  const notify = useNotify();
  const premium = usePremium();

  // Modo de agrupamento + filtros locais (a lista carrega tudo com perPage=1000).
  const [view, setView] = useState<'date' | 'category'>('date');
  const [cat, setCat] = useState<string>('all'); // 'all' | category key
  const [q, setQ] = useState('');
  const [delTarget, setDelTarget] = useState<{ id: string; title: string } | null>(null);

  // Re-busca a lista a cada 5s enquanto há exames sendo extraídos. Quando termina (vira EXTRACTED),
  // o exame sai do topo e cai no grupo do ANO certo (performedAt é preenchido pela extração).
  const processingCount = (data ?? []).filter((r: any) => r.status === 'UPLOADED' || r.status === 'EXTRACTING').length;
  useEffect(() => {
    if (!processingCount) return;
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [processingCount, refresh]);

  if (isLoading) return <ListSkeleton count={4} />;
  const del = (e: any, id: string, title: string) => {
    e.stopPropagation();
    setDelTarget({ id, title });   // abre o Dialog premium (não window.confirm nativo)
  };
  const confirmDel = async () => {
    const t = delTarget; if (!t) return;
    try {
      const r = await fetch(`${API_URL}/exams/${t.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } });
      // refresh() atualiza a lista via dataProvider. NÃO usar navigate(0)/reload — crasha o app nativo.
      if (r.ok) { notify('Exame excluído', { type: 'success' }); refresh(); }
      else notify('Falha ao excluir', { type: 'error' });
    } catch { notify('Falha de conexão ao excluir.', { type: 'error' }); }
    finally { setDelTarget(null); }
  };
  const reextract = async (e: any, id: string) => {
    e.stopPropagation();
    const r = await fetch(`${API_URL}/exams/${id}/reextract`, { method: 'POST', headers: { Authorization: `Bearer ${token()}` } });
    if (r.ok) { notify('Re-extraindo…', { type: 'success' }); refresh(); } else notify('Falha ao re-extrair', { type: 'error' });
  };

  const all = data ?? [];
  const processing = all.filter((r: any) => r.status === 'UPLOADED' || r.status === 'EXTRACTING');
  const failed = all.filter((r: any) => r.status === 'FAILED');
  const extracted = all.filter((r: any) => r.status === 'EXTRACTED');

  // latestYear p/ gate Premium (do conjunto COMPLETO, não do filtrado — estável).
  const years = extracted.map(yearOf).filter((y): y is number => y != null);
  const latestYear = years.length ? Math.max(...years) : null;
  const isLocked = (r: any) => !premium && latestYear != null && yearOf(r) != null && (yearOf(r) as number) < latestYear;

  // Filtros: busca (título/lab) + categoria.
  const norm = (s: any) => (s == null ? '' : String(s)).toLowerCase().trim();
  const query = norm(q);
  const matchesSearch = (r: any) => !query || norm(r.title).includes(query) || norm(r.sourceLab).includes(query);
  const matchesCat = (r: any) => cat === 'all' || categorizeExam(r).key === cat;
  const visible = extracted.filter((r: any) => matchesSearch(r) && matchesCat(r));
  const filtering = query !== '' || cat !== 'all';

  // Contagem por categoria (do conjunto COMPLETO de extraídos — não muda com o filtro).
  const catCounts: Record<string, number> = {};
  for (const r of extracted) { const k = categorizeExam(r).key; catCounts[k] = (catCounts[k] ?? 0) + 1; }
  const presentCats = CATS.filter((c) => catCounts[c.key]).sort((a, b) => catCounts[b.key] - catCounts[a.key]);

  const renderCard = (r: any) => {
    const c = hexFor(r.status);
    const cc = categorizeExam(r); // categoria do exame (emoji + cor)
    const titleInfo = cleanExtractedLabel(r.title, `Exame ${kindLabel[r.kind] ?? ''}`.trim(), 58);
    const labInfo = cleanExtractedLabel(r.sourceLab, '', 46);
    const doctorInfo = cleanExtractedLabel((r as any).rawExtraction?.requestingDoctor, '', 46);
    const needsReview = !!r.reviewRequired || titleInfo.suspicious || labInfo.suspicious || doctorInfo.suspicious || !r.performedAt;
    // "🆕 Novo" nos exames adicionados nas últimas 48h — ajuda o usuário a achar no grupo do ano qual doc acabou de entrar.
    const isNew = !!r.createdAt && Date.now() - new Date(r.createdAt).getTime() < 48 * 3600 * 1000;
    const Icon = r.kind === 'IMAGING' ? ImageIcon : r.kind === 'LAB_PANEL' ? ScienceIcon : DescriptionOutlinedIcon;
    return (
      <Card key={r.id} variant="outlined" onClick={() => navigate(`/exams/${r.id}/show`)} sx={{ cursor: 'pointer', borderRadius: 3, borderLeft: `4px solid ${c}`, overflow: 'hidden', maxWidth: '100%' }}>
        <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.5, '&:last-child': { pb: 1.5 } }}>
          <Icon sx={{ color: c, flexShrink: 0 }} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
              <Typography title={titleInfo.original || r.title} sx={{ fontWeight: 700, wordBreak: 'break-word', overflowWrap: 'anywhere', lineHeight: 1.2 }}>{titleInfo.text || 'Exame'}</Typography>
              <Box onClick={(e) => e.stopPropagation()} sx={{ flexShrink: 0, mt: -0.5 }}><ExplainButton name={r.title} /></Box>
            </Box>
            {labInfo.text && <Typography variant="caption" title={labInfo.original} sx={{ display: 'block', color: 'text.secondary', fontWeight: 600, lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>🏥 {labInfo.text}</Typography>}
            {!labInfo.text && labInfo.suspicious && <Typography variant="caption" sx={{ display: 'block', color: 'warning.main', fontWeight: 700, lineHeight: 1.3 }}>🏥 Laboratório em revisão</Typography>}
            {doctorInfo.text && <Typography variant="caption" title={`Dr. ${doctorInfo.original}`} sx={{ display: 'block', color: 'text.secondary', fontWeight: 600, lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>🩺 Dr. {doctorInfo.text}</Typography>}
            <Typography variant="caption" color="text.secondary">{cc.cat} • {r.performedAt ? new Date(r.performedAt).toLocaleDateString('pt-BR') : 's/d'}{r._count?.items ? ` • ${r._count.items} itens` : ''}{r.createdAt ? ` • Enviado ${new Date(r.createdAt).toLocaleDateString('pt-BR')}` : ''}</Typography>
            <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" sx={{ mt: 0.5 }}>
              {isNew && <Chip size="small" label="🆕 Novo" sx={{ bgcolor: '#dcfce7', color: '#15803d', fontWeight: 700, height: 20 }} />}
              <Chip size="small" label={statusLabel[r.status] ?? r.status} sx={{ bgcolor: c + '18', color: c, fontWeight: 700, height: 20 }} />
              {needsReview && <Chip size="small" label={translate('exams.review')} sx={{ bgcolor: '#f59e0b18', color: '#b45309', fontWeight: 800, height: 20 }} />}
            </Stack>
          </Box>
          <IconButton size="small" onClick={(e) => del(e, r.id, r.title)} title="Excluir" aria-label={`Excluir exame ${r.title}`} sx={{ flexShrink: 0 }}><DeleteOutlineIcon fontSize="small" /></IconButton>
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
      </Card>
    );
  };

  // --- VISÃO POR DATA (padrão) — acordeões por ano, igual ao antes, só que filtrando pela busca/categoria.
  const dateGroups = groupByYear(visible, (r) => r.performedAt ?? r.createdAt);

  // --- VISÃO POR CATEGORIA — acordeões por categoria. Exames de anos Premium ficam ocultos (nudge no topo).
  const visibleUnlocked = visible.filter((r: any) => !isLocked(r));
  const lockedCount = visible.length - visibleUnlocked.length;
  const catGroups = presentCats
    .map((c) => ({ cat: c, items: visibleUnlocked.filter((r: any) => categorizeExam(r).key === c.key) }))
    .filter((g) => g.items.length);

  return (
    <PageContainer width="content" sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <PageHeader icon={<DescriptionOutlinedIcon />} title={translate('exams.title')} subtitle={translate('exams.subtitle', { count: total ?? 0 })} />

      {/* Dialog premium de excluir exame (substitui o window.confirm nativo) */}
      <ConfirmDialog
        open={!!delTarget}
        onClose={() => setDelTarget(null)}
        onConfirm={confirmDel}
        title={translate('exams.delete_title')}
        message={delTarget ? translate('exams.delete_msg', { title: delTarget.title }) : ''}
        confirmLabel={translate('ra.action.delete')}
      />

      {/* Toolbar: busca + alternador de visão + filtro por categoria */}
      <Stack spacing={1.25}>
        <TextField
          size="small" fullWidth value={q} onChange={(e) => setQ(e.target.value)}
          placeholder={translate('exams.search_ph')}
          InputProps={{ startAdornment: (<InputAdornment position="start"><SearchIcon fontSize="small" sx={{ color: 'text.secondary' }} /></InputAdornment>) }}
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: 3, bgcolor: 'background.paper' } }}
        />
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
          <ToggleButtonGroup exclusive size="small" value={view} onChange={(_, v) => { if (v) setView(v); }}>
            <ToggleButton value="date" sx={{ px: 1.25, py: 0.25, textTransform: 'none', fontWeight: 700 }}>{translate('exams.by_date')}</ToggleButton>
            <ToggleButton value="category" sx={{ px: 1.25, py: 0.25, textTransform: 'none', fontWeight: 700 }}>{translate('exams.by_category')}</ToggleButton>
          </ToggleButtonGroup>
        </Stack>
        {/* Chips de categoria — só aparecem se houver +1 categoria nos exames prontos */}
        {presentCats.length > 1 && (
          <Stack direction="row" spacing={0.75} sx={{ overflowX: 'auto', flexWrap: 'nowrap', pb: 0.25, mx: -0.25, px: 0.25, '&::-webkit-scrollbar': { display: 'none' } }}>
            <Chip size="small" label={translate('exams.all', { count: extracted.length })} onClick={() => setCat('all')} sx={{ height: 26, flexShrink: 0, fontWeight: 700, whiteSpace: 'nowrap', bgcolor: cat === 'all' ? '#0f3d3a' : '#0f3d3a14', color: cat === 'all' ? '#fff' : '#0f3d3a' }} />
            {presentCats.map((c) => (
              <Chip key={c.key} size="small" label={`${c.emoji} ${c.cat} (${catCounts[c.key]})`} onClick={() => setCat(cat === c.key ? 'all' : c.key)} sx={{ height: 26, flexShrink: 0, fontWeight: 700, whiteSpace: 'nowrap', bgcolor: cat === c.key ? c.color : c.color + '1a', color: cat === c.key ? '#fff' : c.color, border: `1px solid ${cat === c.key ? c.color : c.color + '40'}` }} />
            ))}
          </Stack>
        )}
      </Stack>

      {/* FAB "＋ Enviar exame" foi pra o AppLayout (ExamCreateFab) — sempre acima do rodapé. */}
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
            <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#b91c1c' }}>{translate('exams.failed_title')}</Typography>
            <Chip size="small" label={failed.length} sx={{ height: 18, bgcolor: '#fee2e2', color: '#b91c1c', fontWeight: 700 }} />
          </Stack>
          <Alert severity="warning" icon={false} sx={{ mb: 1.25, borderRadius: 2, py: 0.75, '& .MuiAlert-message': { fontSize: 12.5 } }}>
            {failed.length === 1 ? translate('exams.failed_msg_one') : translate('exams.failed_msg_many', { count: failed.length })} {translate('exams.failed_action')} <strong>{translate('exams.reextract')}</strong>.
          </Alert>
          <Stack spacing={1.5}>
            {failed.map((r: any) => renderCard(r))}
          </Stack>
        </Box>
      )}

      {/* Nudge Premium (apenas na visão por categoria — anos anteriores ocultos) */}
      {view === 'category' && lockedCount > 0 && (
        <Card variant="outlined" sx={{ borderRadius: 3, p: 1.5, display: 'flex', alignItems: 'center', gap: 1.5, borderColor: 'divider', background: 'linear-gradient(135deg, rgba(32,178,170,.06), transparent)' }}>
          <LockIcon sx={{ color: '#178f89' }} />
          <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>{lockedCount} exame(s) de anos anteriores fazem parte do histórico Premium.</Typography>
          <Button size="small" variant="contained" onClick={() => navigate('/planos')} sx={{ borderRadius: 99, textTransform: 'none', fontWeight: 700, bgcolor: '#20b2aa', boxShadow: 'none', '&:hover': { bgcolor: '#178f89' }, flexShrink: 0 }}>{translate('common.view_plans')}</Button>
        </Card>
      )}

      {/* Grupos (data OU categoria) */}
      {view === 'date' && (
        <>
          {dateGroups.length === 0 && (
            filtering
              ? <EmptyState emoji="🔍" title={translate('exams.empty_search_title')} desc={translate('exams.empty_search_desc')} />
              : <EmptyState title={translate('exams.empty_title')} desc={translate('exams.empty_desc')} cta={translate('exams.send')} onCta={() => navigate('/exams/create')} />
          )}
          {dateGroups.map((g) => {
            const locked = !premium && g.year !== latestYear && g.year != null;
            if (locked) {
              return (
                <Card key={String(g.year)} variant="outlined" sx={{ borderRadius: 3, p: 1.75, display: 'flex', alignItems: 'center', gap: 1.5, borderColor: 'divider', background: 'linear-gradient(135deg, rgba(32,178,170,.06), transparent)' }}>
                  <LockIcon sx={{ color: '#178f89' }} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 800 }}>📅 {g.label} • {g.items.length} exame(s)</Typography>
                    <Typography variant="caption" color="text.secondary">{translate('exams.history_premium')}</Typography>
                  </Box>
                  <Button size="small" variant="contained" onClick={() => navigate('/planos')} sx={{ borderRadius: 99, textTransform: 'none', fontWeight: 700, bgcolor: '#20b2aa', boxShadow: 'none', '&:hover': { bgcolor: '#178f89' } }}>{translate('common.view_plans')}</Button>
                </Card>
              );
            }
            return (
              <Accordion key={String(g.year)} defaultExpanded={g.year === latestYear || (g.year === null && g.items.some((r: any) => r.status === 'FAILED'))} disableGutters elevation={0}
                sx={{ borderRadius: '12px !important', overflow: 'hidden', border: '1px solid', borderColor: 'divider', '&:before': { display: 'none' } }}>
                <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ fontSize: 30, color: '#178f89', bgcolor: 'rgba(32,178,170,.12)', borderRadius: '50%', p: 0.6, boxShadow: '0 2px 6px rgba(32,178,170,.18)' }} />} sx={{ minHeight: '48px !important', '& .MuiAccordionSummary-content': { my: 0.75, alignItems: 'center' } }}>
                  <Typography sx={{ fontWeight: 800, flex: '1 1 auto', minWidth: 0 }}>📅 {g.label}</Typography>
                  <Chip size="small" label={`${g.items.length}`} sx={{ ml: 1.5, bgcolor: 'rgba(0,0,0,.05)', color: 'text.secondary', height: 20, flexShrink: 0 }} />
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
          {catGroups.length === 0 && (
            filtering
              ? <EmptyState emoji="🔍" title={translate('exams.empty_search_title')} desc={translate('exams.empty_search_desc')} />
              : <EmptyState title={translate('exams.empty_title')} desc={translate('exams.empty_desc')} cta={translate('exams.send')} onCta={() => navigate('/exams/create')} />
          )}
          {catGroups.map(({ cat: c, items }) => (
            <Accordion key={c.key} defaultExpanded={catGroups.length <= 3} disableGutters elevation={0}
              sx={{ borderRadius: '12px !important', overflow: 'hidden', border: '1px solid', borderColor: 'divider', '&:before': { display: 'none' } }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ fontSize: 30, color: c.color, bgcolor: c.color + '1f', borderRadius: '50%', p: 0.6 }} />} sx={{ minHeight: '48px !important', '& .MuiAccordionSummary-content': { my: 0.75, alignItems: 'center' } }}>
                <Typography sx={{ fontWeight: 800, flex: '1 1 auto', minWidth: 0 }}>{c.emoji} {c.cat}</Typography>
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
    <List key={pid} sort={{ field: 'performedAt', order: 'DESC' }} exporter={false} perPage={1000} pagination={false} filter={{ patientId: pid || 'none' }} actions={false}>
      <ExamCards />
    </List>
  );
};
