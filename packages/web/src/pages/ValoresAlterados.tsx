import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Card, CardContent, Typography, Stack, Chip, Accordion, AccordionSummary, AccordionDetails, Collapse } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { Title, useTranslate } from 'react-admin';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import HistoryIcon from '@mui/icons-material/History';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { API_URL, token } from '../config';
import { useSelectedPatient } from '../patient-context';
import { ExplainButton } from '../components/ExplainItem';
import { UnitLabel } from '../components/UnitLabel';
import { ValueBar } from '../components/ValueBar';
import { ListSkeleton } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';
import { TelemedicineButton } from '../components/TelemedicineButton';
import { fmtVal, unitSuffix } from '../utils/format';
import { refLabel, categorize } from '../utils/medicalData';
import { priorityOf, maxPriority, isStaleExam, refScaleSuspect, PRIORITY_META, PRIORITY_RANK, priorityText } from '../utils/alertPriority';
import { CappedExamMarkers } from '../components/CappedExamMarkers';

import type { AbnormalItem as AbnItem } from '@meus-exames/shared';

/** Valores fora da faixa, AGRUPADOS POR EXAME (dentro de cada exame, ordenados por PRIORIDADE). */
export const ValoresAlteradosPage = () => {
  const translate = useTranslate();
  const navigate = useNavigate();
  const [pid] = useSelectedPatient();
  const [items, setItems] = useState<AbnItem[]>([]);
  const [examCount, setExamCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    // examCount distingue "sem NENHUM exame" (onboarding + CTA) de "exames todos normais"
    // (✅ all_good legítimo). Antes: os dois casos rendiam "Tudo dentro da faixa!" — usuário
    // novo via um atestado de saúde sem nunca ter enviado exame.
    const h = { Authorization: `Bearer ${token()}` };
    fetch(`${API_URL}/items/abnormal${pid ? `?patientId=${pid}` : ''}`, { headers: h })
      .then((r) => r.json())
      .then((d) => setItems(d.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
    fetch(`${API_URL}/exams?_start=0&_end=1${pid ? `&patientId=${pid}` : ''}`, { headers: h })
      .then((r) => Number(r.headers.get('X-Total-Count') ?? r.headers.get('content-range')?.split('/')?.[1] ?? '0'))
      .then((n) => setExamCount(Number.isFinite(n) ? n : 0))
      .catch(() => setExamCount(0));
  }, [pid]);

  const groups = useMemo(() => {
    const map = new Map<string, { examId: string; examTitle: string; performedAt: string | null; requestingDoctor: string | null; items: AbnItem[] }>();
    for (const it of items) {
      if (!map.has(it.examId)) map.set(it.examId, { examId: it.examId, examTitle: it.examTitle, performedAt: it.performedAt, requestingDoctor: it.requestingDoctor, items: [] });
      map.get(it.examId)!.items.push(it);
    }
    // Dentro de cada exame: prioridade (mais grave primeiro) e depois categoria (clusteriza).
    for (const g of map.values()) g.items.sort((a, b) => PRIORITY_RANK[priorityOf(b)] - PRIORITY_RANK[priorityOf(a)] || categorize(a.nameCanonical).key.localeCompare(categorize(b.nameCanonical).key));
    // Exames: SEVERIDADE máxima primeiro (o subtítulo promete "ordenados por prioridade 🔴→🟡" —
    // ordenar por data colocava um 🟡 recente acima de um 🔴 antigo), desempate pelo mais recente.
    // (O portal médico já ordenava assim; o lado paciente divergia.)
    return [...map.values()].sort((a, b) => PRIORITY_RANK[maxPriority(b.items)] - PRIORITY_RANK[maxPriority(a.items)] || (b.performedAt ?? '').localeCompare(a.performedAt ?? ''));
  }, [items]);

  // Resumo por prioridade (contagem total). Itens com faixa suspeita (escala errada) NÃO entram
  // na contagem de prioridade — são exibidos à parte como "conferir faixa" (nunca como 🔴).
  const { counts, suspectCount } = useMemo(() => {
    const c = { importante: 0, moderada: 0, leve: 0 };
    let sc = 0;
    for (const it of items) { if (refScaleSuspect(it)) { sc++; continue; } c[priorityOf(it)]++; }
    return { counts: c, suspectCount: sc };
  }, [items]);

  const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString('pt-BR') : 's/d');
  // "há 2 meses", "há 6 dias", "hoje" — referência relativa pra saber quando foi pedido
  const timeAgo = (d?: string | null) => {
    if (!d) return '';
    const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
    if (days < 1) return 'hoje';
    if (days < 30) return `há ${days} ${days === 1 ? 'dia' : 'dias'}`;
    const months = Math.floor(days / 30);
    if (months < 12) return `há ${months} ${months === 1 ? 'mês' : 'meses'}`;
    const years = Math.floor(months / 12);
    return `há ${years} ${years === 1 ? 'ano' : 'anos'}`;
  };

  const INITIAL_LIMIT = 3;
  const [showAll, setShowAll] = useState(false);

  const initialGroups = useMemo(() => groups.slice(0, INITIAL_LIMIT), [groups]);
  const hiddenGroups = useMemo(() => groups.slice(INITIAL_LIMIT), [groups]);

  const renderExamAccordion = (g: (typeof groups)[number]) => {
    const mp = maxPriority(g.items);
    const meta = PRIORITY_META[mp];
    const stale = isStaleExam(g.performedAt);
    return (
      <Accordion
        key={g.examId}
        disableGutters
        elevation={0}
        sx={{
          border: `1px solid ${meta.color}55`,
          borderLeft: `4px solid ${meta.color}`,
          borderRadius: '16px !important',
          overflow: 'hidden',
          '&:before': { display: 'none' },
          boxShadow: (t) => (t.palette.mode === 'dark' ? '0 4px 14px rgba(0,0,0,0.2)' : '0 2px 8px rgba(0,0,0,0.03)'),
        }}
      >
        <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ bgcolor: meta.color + '14' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', gap: 1 }}>
            <Box component="span" sx={{ fontSize: 18 }}>{meta.emoji}</Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontWeight: 800, color: (t) => priorityText(t.palette.mode, mp), lineHeight: 1.2 }}>{g.examTitle}</Typography>
              <Typography variant="caption" sx={{ color: (t) => priorityText(t.palette.mode, mp), opacity: 0.85 }}>📅 {fmtDate(g.performedAt)}{g.performedAt ? ` · ${timeAgo(g.performedAt)}` : ''}</Typography>
              {stale && <Typography variant="caption" sx={{ display: 'block', color: (t) => (t.palette.mode === 'dark' ? '#fbbf24' : '#92400e') }}>⏳ Exame antigo — considere renovar com seu médico</Typography>}
              {g.requestingDoctor && <Typography variant="caption" sx={{ display: 'block', color: (t) => priorityText(t.palette.mode, mp), opacity: 0.85 }}>🩺 Dr. {g.requestingDoctor}</Typography>}
            </Box>
            <Chip size="small" label={`${g.items.length} alterado(s)`} sx={{ fontWeight: 700, height: 20, bgcolor: meta.color + '22', color: (t) => priorityText(t.palette.mode, mp) }} />
          </Box>
        </AccordionSummary>
        <AccordionDetails sx={{ p: 1.25 }}>
          {/* 1 botão de agendar POR EXAME (não por item) — usa o marcador do item mais grave */}
          <Box sx={{ mb: 1, display: 'flex', justifyContent: { xs: 'stretch', sm: 'flex-start' } }}>
            <TelemedicineButton marker={g.items[0]?.nameCanonical} compact />
          </Box>
          <CappedExamMarkers items={g.items} />
        </AccordionDetails>
      </Accordion>
    );
  };

  return (
    <PageContainer width="wide">
      <Title title={translate('page.alterados')} />
      <PageHeader
        icon={<WarningAmberIcon />}
        title={translate('altered.title')}
        subtitle={<>Ordenados por <strong>prioridade de atenção</strong> (🔴→🟡). Toque num exame pra expandir e ver os valores.</>}
        accent="error.main"
      />

      {loading ? (
        <ListSkeleton count={3} />
      ) : items.length === 0 && examCount === 0 ? (
        <EmptyState
          title="Sem exames ainda"
          desc="Envie seu primeiro exame — o Dr. Exame lê os valores e avisa o que estiver fora da referência."
          cta="Enviar primeiro exame"
          onCta={() => navigate('/exams/create')}
        />
      ) : items.length === 0 ? (
        <EmptyState
          emoji="✅"
          title={translate('altered.all_good')}
          desc="Não encontramos valores fora da referência nos seus exames. Continue acompanhando e leve seus exames às consultas médicas."
        />
      ) : (
        <>
          {/* Resumo não-alarmista por prioridade */}
          <Card variant="outlined" sx={{ mb: 1, borderRadius: '16px', borderColor: 'divider', bgcolor: 'rgba(15,61,58,0.03)' }}>
            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap sx={{ mb: 0.5 }}>
                <Typography component="span" sx={{ fontWeight: 800, color: (t) => priorityText(t.palette.mode, 'importante') }}>{PRIORITY_META.importante.emoji} {counts.importante} {PRIORITY_META.importante.label}{counts.importante !== 1 ? 's' : ''}</Typography>
                <Typography component="span" sx={{ fontWeight: 800, color: (t) => priorityText(t.palette.mode, 'moderada') }}>{PRIORITY_META.moderada.emoji} {counts.moderada} {PRIORITY_META.moderada.label}{counts.moderada !== 1 ? 's' : ''}</Typography>
                <Typography component="span" sx={{ fontWeight: 800, color: (t) => priorityText(t.palette.mode, 'leve') }}>{PRIORITY_META.leve.emoji} {counts.leve} {PRIORITY_META.leve.label}{counts.leve !== 1 ? 's' : ''}</Typography>
              </Stack>
              <Typography variant="caption" color="text.secondary">
                {counts.importante > 0
                  ? <>Os <strong>{PRIORITY_META.importante.emoji} importantes</strong> merecem prioridade — leve ao médico. {PRIORITY_META.moderada.emoji} moderadas: comente na consulta. {PRIORITY_META.leve.emoji} leves: só acompanhe.</>
                  : <>Nada crítico — os ajustes são <strong>{PRIORITY_META.moderada.emoji} moderados</strong> ou <strong>{PRIORITY_META.leve.emoji} leves</strong>. Comente com seu médico na próxima consulta.</>}
              </Typography>
              {suspectCount > 0 && (
                <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 0.5 }}>⚠️ {suspectCount} valor(es) com faixa de referência possivelmente incorreta (escala) — mostrados como “conferir”, não como alerta.</Typography>
              )}
            </CardContent>
          </Card>

          {/* Cabeçalho de Contexto & Foco */}
          {groups.length > INITIAL_LIMIT && (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 0.5, py: 0.75 }}>
              <Stack direction="row" spacing={0.75} alignItems="center">
                <AutoAwesomeIcon sx={{ fontSize: 16, color: 'primary.main' }} />
                <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  {showAll ? `Histórico Completo (${groups.length} exames)` : `Foco: 3 mais relevantes`}
                </Typography>
              </Stack>
              <Chip
                size="small"
                label={showAll ? `Exibindo todos (${groups.length})` : `3 de ${groups.length} exames`}
                sx={{ height: 22, fontSize: '0.72rem', fontWeight: 700, bgcolor: (t) => alpha(t.palette.primary.main, 0.1), color: 'primary.main' }}
              />
            </Box>
          )}

          {/* Lista com os 3 principais */}
          <Stack spacing={1}>
            {initialGroups.map(renderExamAccordion)}
          </Stack>

          {/* Exames ocultos com animação de expansão suave */}
          {hiddenGroups.length > 0 && (
            <>
              <Collapse in={showAll} unmountOnExit timeout={300}>
                <Stack spacing={1} sx={{ pt: 1 }}>
                  {hiddenGroups.map(renderExamAccordion)}
                </Stack>
              </Collapse>

              {/* Botão de Expansão Premium */}
              <Card
                variant="outlined"
                onClick={() => setShowAll((v) => !v)}
                sx={{
                  mt: 1,
                  cursor: 'pointer',
                  borderRadius: '16px',
                  border: (t) => `1px dashed ${alpha(t.palette.primary.main, showAll ? 0.3 : 0.45)}`,
                  background: (t) =>
                    t.palette.mode === 'dark'
                      ? 'linear-gradient(135deg, rgba(32,178,170,0.10) 0%, rgba(32,178,170,0.02) 100%), #141f20'
                      : 'linear-gradient(135deg, rgba(32,178,170,0.08) 0%, rgba(32,178,170,0.02) 100%), #f8fcfa',
                  transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                  '&:hover': {
                    borderColor: 'primary.main',
                    transform: 'translateY(-2px)',
                    boxShadow: (t) => `0 6px 20px ${alpha(t.palette.primary.main, 0.15)}`,
                  },
                }}
              >
                <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
                  <Stack direction="row" alignItems="center" justifyContent="space-between">
                    <Stack direction="row" spacing={1.5} alignItems="center">
                      <Box
                        sx={{
                          width: 38,
                          height: 38,
                          borderRadius: '12px',
                          bgcolor: (t) => alpha(t.palette.primary.main, 0.14),
                          color: 'primary.main',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {showAll ? <KeyboardArrowUpIcon /> : <HistoryIcon />}
                      </Box>
                      <Box>
                        <Typography variant="subtitle2" sx={{ fontWeight: 800, color: 'text.primary', lineHeight: 1.2 }}>
                          {showAll ? 'Recolher para os 3 mais relevantes' : `Ver histórico completo de alterações (+${hiddenGroups.length} exames)`}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          {showAll ? 'Exibindo todos os exames alterados' : `Toque para conferir todo o histórico anterior`}
                        </Typography>
                      </Box>
                    </Stack>
                    <Chip
                      size="small"
                      icon={showAll ? <KeyboardArrowUpIcon sx={{ '&&': { fontSize: 16 } }} /> : <KeyboardArrowDownIcon sx={{ '&&': { fontSize: 16 } }} />}
                      label={showAll ? 'Recolher' : `+${hiddenGroups.length}`}
                      color="primary"
                      variant={showAll ? 'outlined' : 'filled'}
                      sx={{ fontWeight: 800, borderRadius: '999px', height: 26 }}
                    />
                  </Stack>
                </CardContent>
              </Card>
            </>
          )}
        </>
      )}
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>*Educativo. Sempre confirme com seu médico.</Typography>
    </PageContainer>
  );
};
