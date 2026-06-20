import { List, useListContext, useRefresh, useNotify, CreateButton, TopToolbar } from 'react-admin';
import { Chip, Box, Card, CardContent, Typography, IconButton, Stack, LinearProgress, Button, Accordion, AccordionSummary, AccordionDetails, Alert } from '@mui/material';
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

/** Cards agrupados por ano (colapsáveis). Mesmo layout em mobile e desktop. */
const ExamCards = () => {
  const { data, isLoading, total } = useListContext<any>();
  const navigate = useNavigate();
  const refresh = useRefresh();
  const notify = useNotify();
  const premium = usePremium();
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

  const failed = (data ?? []).filter((r: any) => r.status === 'FAILED');
  const groups = groupByYear(data ?? [], (r) => r.performedAt);
  const latestYear = groups[0]?.year ?? null;
  // Falhas de leitura aparecem primeiro no grupo — não escondidas no fim da lista.
  groups.forEach((g) => g.items.sort((a: any, b: any) => (a.status === 'FAILED' ? 0 : 1) - (b.status === 'FAILED' ? 0 : 1)));

  const renderCard = (r: any) => {
    const c = hexFor(r.status);
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
            <Typography variant="caption" color="text.secondary">{kindLabel[r.kind] ?? r.kind} • {r.performedAt ? new Date(r.performedAt).toLocaleDateString('pt-BR') : 's/d'}{r._count?.items ? ` • ${r._count.items} itens` : ''}{r.createdAt ? ` • Enviado ${new Date(r.createdAt).toLocaleDateString('pt-BR')}` : ''}</Typography>
            <Box sx={{ mt: 0.5 }}><Chip size="small" label={statusLabel[r.status] ?? r.status} sx={{ bgcolor: c + '18', color: c, fontWeight: 700, height: 20 }} /></Box>
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
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, p: { xs: 1.5, sm: 2 }, pb: 4, maxWidth: 760, mx: 'auto' }}>
      {failed.length > 0 && (
        <Alert severity="warning" icon={false} sx={{ borderRadius: 3, alignItems: 'flex-start', '& .MuiAlert-message': { width: '100%' } }}>
          <Typography sx={{ fontWeight: 800, color: '#b45309' }}>⚠️ {failed.length} documento{failed.length !== 1 ? 's' : ''} não consegui{failed.length !== 1 ? 'ram' : 'u'} ser lido{failed.length !== 1 ? 's' : ''} como exame</Typography>
          <Typography variant="caption" sx={{ display: 'block', color: '#92400e', mt: 0.25 }}>Pode não ser um exame (receita, nota, documento) ou estar ilegível. Revise os itens marcados "Falhou" abaixo ou exclua.</Typography>
        </Alert>
      )}
      {total != null && total > 0 && (
        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, mb: 0.5 }}>
          📋 {total} exame{total !== 1 ? 's' : ''} no total
        </Typography>
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
    <List key={pid} sort={{ field: 'performedAt', order: 'DESC' }} exporter={false} perPage={25} filter={{ patientId: pid || 'none' }} actions={<ExamListActions />}>
      <ExamCards />
    </List>
  );
};
