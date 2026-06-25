import { useEffect, useState } from 'react';
import { List, useListContext, useRefresh, useNotify, CreateButton, TopToolbar } from 'react-admin';
import { Chip, Box, Card, CardContent, Typography, IconButton, Stack, LinearProgress, Button, Accordion, AccordionSummary, AccordionDetails, Alert, CircularProgress } from '@mui/material';
import ScienceIcon from '@mui/icons-material/Science';
import ImageIcon from '@mui/icons-material/Image';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import LockIcon from '@mui/icons-material/Lock';
import { useNavigate } from 'react-router-dom';
import { useSelectedPatient } from '../../patient-context';
import { API_URL, token } from '../../config';
import { ExplainButton } from '../../components/ExplainItem';
import { usePremium } from '../../components/PremiumGate';
import { groupByYear } from '../../utils/groupByYear';

const ExamListActions = () => (
  <TopToolbar>
    <CreateButton label="Enviar exame" variant="contained" />
  </TopToolbar>
);

const statusColor: Record<string, 'success' | 'error' | 'warning' | 'info' | 'default'> = { EXTRACTED: 'success', FAILED: 'error', UPLOADED: 'warning', EXTRACTING: 'info' };
const statusLabel: Record<string, string> = { EXTRACTED: 'Pronto', FAILED: 'Falhou', UPLOADED: 'Enviado', EXTRACTING: 'Extraindo' };
const kindLabel: Record<string, string> = { LAB_PANEL: 'Laboratorial', IMAGING: 'Imagem', OTHER: 'Outro' };
const hexFor = (s: string) => { const sc = statusColor[s] ?? 'default'; return sc === 'success' ? '#10b981' : sc === 'error' ? '#ef4444' : sc === 'warning' ? '#f59e0b' : sc === 'info' ? '#0ea5e9' : '#94a3b8'; };

/** Cartão de exame EM PROCESSAMENTO (UPLOADED/EXTRACTING) — fica sempre no TOPO da lista,
 *  com % animada. Não há progresso real no servidor (a extração é um state machine), então a
 *  % é simulada — igualzinha à barra do Dr. Exame na tela de detalhe — só pra o usuário sentir
 *  que "tá indo". Toca no cartão pra abrir o exame e ver o robô com a barra de progresso. */
const ProcessingCard = ({ r }: { r: any }) => {
  const navigate = useNavigate();
  const [pct, setPct] = useState(12);
  useEffect(() => {
    const t = setInterval(() => setPct((p) => (p < 82 ? p + 3 : Math.min(p + 0.6, 94))), 800);
    return () => clearInterval(t);
  }, []);
  return (
    <Card onClick={() => navigate(`/exams/${r.id}/show`)} sx={{ cursor: 'pointer', borderRadius: 3, borderLeft: '4px solid #0ea5e9', overflow: 'hidden', maxWidth: '100%' }}>
      <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.5, '&:last-child': { pb: 1.5 } }}>
        <CircularProgress variant="determinate" value={pct} size={34} thickness={5} sx={{ color: '#0ea5e9', flexShrink: 0 }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700, wordBreak: 'break-word', overflowWrap: 'anywhere', lineHeight: 1.2 }}>{r.title || 'Novo exame enviado'}</Typography>
          <Typography variant="caption" color="text.secondary">Dr. Exame está extraindo… <strong>{Math.round(pct)}%</strong></Typography>
        </Box>
        <ChevronRightIcon sx={{ color: 'text.disabled', flexShrink: 0 }} />
      </CardContent>
      <LinearProgress variant="determinate" value={pct} sx={{ height: 4, '& .MuiLinearProgress-bar': { background: 'linear-gradient(90deg,#0ea5e9,#20b2aa)' } }} />
    </Card>
  );
};

/** Cards agrupados por ano (colapsáveis). Mesmo layout em mobile e desktop. */
const ExamCards = () => {
  const { data, isLoading, total } = useListContext<any>();
  const navigate = useNavigate();
  const refresh = useRefresh();
  const notify = useNotify();
  const premium = usePremium();

  // Re-busca a lista a cada 5s enquanto há exames sendo extraídos. Quando termina (vira EXTRACTED),
  // o exame sai do topo e cai no grupo do ANO certo (performedAt é preenchido pela extração).
  const processingCount = (data ?? []).filter((r: any) => r.status === 'UPLOADED' || r.status === 'EXTRACTING').length;
  useEffect(() => {
    if (!processingCount) return;
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [processingCount, refresh]);

  if (isLoading) return null;
  const del = async (e: any, id: string, title: string) => {
    e.stopPropagation();
    if (!window.confirm(`Excluir "${title}"? Esta ação não desfaz.`)) return;
    try {
      const r = await fetch(`${API_URL}/exams/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } });
      if (r.ok) {
        notify('Exame excluído', { type: 'success' });
        // refresh() atualiza a lista via dataProvider (mesmo do reextract).
        // NÃO usar navigate(0)/reload — recarrega o WebView inteiro e crasha o app nativo.
        refresh();
      } else notify('Falha ao excluir', { type: 'error' });
    } catch {
      notify('Falha de conexão ao excluir.', { type: 'error' });
    }
  };
  const reextract = async (e: any, id: string) => {
    e.stopPropagation();
    const r = await fetch(`${API_URL}/exams/${id}/reextract`, { method: 'POST', headers: { Authorization: `Bearer ${token()}` } });
    if (r.ok) { notify('Re-extraindo…', { type: 'success' }); refresh(); } else notify('Falha ao re-extrair', { type: 'error' });
  };

  const all = data ?? [];
  const processing = all.filter((r: any) => r.status === 'UPLOADED' || r.status === 'EXTRACTING');
  const failed = all.filter((r: any) => r.status === 'FAILED');
  // Grupos por ano = só os EXTRACTED (com performedAt). Em-processamento e FALHAS ficam em
  // seções próprias no TOPO — corrige o bug do exame novo/com erro caír em "Sem data" no fim.
  const groups = groupByYear(all.filter((r: any) => r.status === 'EXTRACTED'), (r) => r.performedAt);
  const latestYear = groups[0]?.year ?? null;

  const renderCard = (r: any) => {
    const c = hexFor(r.status);
    // "🆕 Novo" nos exames adicionados nas últimas 48h — ajuda o usuário a achar no grupo do ano qual doc acabou de entrar.
    const isNew = !!r.createdAt && Date.now() - new Date(r.createdAt).getTime() < 48 * 3600 * 1000;
    const Icon = r.kind === 'IMAGING' ? ImageIcon : r.kind === 'LAB_PANEL' ? ScienceIcon : DescriptionOutlinedIcon;
    return (
      <Card key={r.id} variant="outlined" onClick={() => navigate(`/exams/${r.id}/show`)} sx={{ cursor: 'pointer', borderRadius: 3, borderLeft: `4px solid ${c}`, overflow: 'hidden', maxWidth: '100%' }}>
        <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.5, '&:last-child': { pb: 1.5 } }}>
          <Icon sx={{ color: c, flexShrink: 0 }} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
              <Typography sx={{ fontWeight: 700, wordBreak: 'break-word', overflowWrap: 'anywhere', lineHeight: 1.2 }}>{r.title}</Typography>
              <Box onClick={(e) => e.stopPropagation()} sx={{ flexShrink: 0, mt: -0.5 }}><ExplainButton name={r.title} /></Box>
            </Box>
            {r.sourceLab && <Typography variant="caption" sx={{ display: 'block', color: '#5a6b72', fontWeight: 600, lineHeight: 1.3 }}>🏥 {r.sourceLab}</Typography>}
            {(r as any).rawExtraction?.requestingDoctor && <Typography variant="caption" sx={{ display: 'block', color: '#5a6b72', fontWeight: 600, lineHeight: 1.3 }}>🩺 Dr. {(r as any).rawExtraction.requestingDoctor}</Typography>}
            <Typography variant="caption" color="text.secondary">{kindLabel[r.kind] ?? r.kind} • {r.performedAt ? new Date(r.performedAt).toLocaleDateString('pt-BR') : 's/d'}{r._count?.items ? ` • ${r._count.items} itens` : ''}{r.createdAt ? ` • Enviado ${new Date(r.createdAt).toLocaleDateString('pt-BR')}` : ''}</Typography>
            <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" sx={{ mt: 0.5 }}>
              {isNew && <Chip size="small" label="🆕 Novo" sx={{ bgcolor: '#dcfce7', color: '#15803d', fontWeight: 700, height: 20 }} />}
              <Chip size="small" label={statusLabel[r.status] ?? r.status} sx={{ bgcolor: c + '18', color: c, fontWeight: 700, height: 20 }} />
            </Stack>
          </Box>
          <IconButton size="small" onClick={(e) => del(e, r.id, r.title)} title="Excluir" sx={{ flexShrink: 0 }}><DeleteOutlineIcon fontSize="small" /></IconButton>
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

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, p: { xs: 1.5, sm: 2 }, pb: { xs: 'calc(84px + env(safe-area-inset-bottom))', sm: 4 }, maxWidth: 760, mx: 'auto' }}>
      {/* Cabeçalho da lista — preenche o espaço do topo (sem área branca) + botão enviar */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" useFlexGap flexWrap="wrap" gap={1} sx={{ mb: 0.5 }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>📋 Seus exames</Typography>
          <Typography variant="caption" color="text.secondary">{total ?? 0} exame{(total ?? 0) !== 1 ? 's' : ''} no total • toque pra ver detalhes</Typography>
        </Box>
        <CreateButton label="＋ Enviar exame" variant="contained" size="small" sx={{ borderRadius: 99, textTransform: 'none', fontWeight: 700, boxShadow: 'none' }} />
      </Stack>
      {processing.length > 0 && (
        <Box>
          <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 0.75 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#0369a1' }}>⏳ Em processamento</Typography>
            <Chip size="small" label={processing.length} sx={{ height: 18, bgcolor: '#e0f2fe', color: '#0369a1', fontWeight: 700 }} />
          </Stack>
          <Stack spacing={1.5}>
            {processing.map((r: any) => <ProcessingCard key={r.id} r={r} />)}
          </Stack>
        </Box>
      )}
      {failed.length > 0 && (
        <Box>
          <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 0.75 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#b91c1c' }}>⚠️ Não foi possível ler</Typography>
            <Chip size="small" label={failed.length} sx={{ height: 18, bgcolor: '#fee2e2', color: '#b91c1c', fontWeight: 700 }} />
          </Stack>
          <Alert severity="warning" icon={false} sx={{ mb: 1.25, borderRadius: 2, py: 0.75, '& .MuiAlert-message': { fontSize: 12.5 } }}>
            {failed.length === 1 ? 'Este documento não parece ser um exame (receita, nota ou ilegível).' : `${failed.length} documentos não parecem ser exames (receita, nota ou ilegíveis).`} Revise ou exclua abaixo — se for um exame de verdade, toque em <strong>Re-extrair</strong>.
          </Alert>
          <Stack spacing={1.5}>
            {failed.map((r: any) => renderCard(r))}
          </Stack>
        </Box>
      )}
      {groups.map((g) => {
        const locked = !premium && g.year !== latestYear && g.year != null;
        if (locked) {
          return (
            <Card key={String(g.year)} variant="outlined" sx={{ borderRadius: 3, p: 1.75, display: 'flex', alignItems: 'center', gap: 1.5, borderColor: 'divider', background: 'linear-gradient(135deg, rgba(32,178,170,.06), transparent)' }}>
              <LockIcon sx={{ color: '#178f89' }} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontWeight: 800 }}>📅 {g.label} • {g.items.length} exame(s)</Typography>
                <Typography variant="caption" color="text.secondary">Histórico de anos anteriores é Premium.</Typography>
              </Box>
              <Button size="small" variant="contained" onClick={() => navigate('/planos')} sx={{ borderRadius: 99, textTransform: 'none', fontWeight: 700, bgcolor: '#20b2aa', boxShadow: 'none', '&:hover': { bgcolor: '#178f89' } }}>Ver planos</Button>
            </Card>
          );
        }
        return (
          <Accordion key={String(g.year)} defaultExpanded={g.year === latestYear || (g.year === null && g.items.some((r: any) => r.status === 'FAILED'))} disableGutters elevation={0}
            sx={{ borderRadius: '12px !important', overflow: 'hidden', border: '1px solid #eef2f7', '&:before': { display: 'none' } }}>
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
    </Box>
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
