import { useEffect, useMemo, useState } from 'react';
import { Box, Card, CardContent, Typography, Stack, Chip, Accordion, AccordionSummary, AccordionDetails, Button, Collapse } from '@mui/material';
import { alpha } from '@mui/material/styles';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import HistoryIcon from '@mui/icons-material/History';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { API_URL } from '../../config';
import { ListSkeleton } from '../Skeleton';
import { EmptyState } from '../EmptyState';
import { ExplainButton } from '../ExplainItem';
import { CappedExamMarkers } from '../CappedExamMarkers';
import { UnitLabel } from '../UnitLabel';
import { ValueBar } from '../ValueBar';
import { fmtVal, unitSuffix, plural } from '../../utils/format';
import { refLabel, categorize } from '../../utils/medicalData';
import { priorityOf, maxPriority, isStaleExam, refScaleSuspect, PRIORITY_META, PRIORITY_RANK } from '../../utils/alertPriority';
import { RADIUS } from '../../theme';
import { ReviewControl, type ReviewLike } from './portal/ReviewControl';

/**
 * DoctorValoresAlterados — valores alterados do paciente (viewer médico READ-ONLY nos dados,
 * mas com revisão própria E5.3: badge + seletor de estado por achado e filtro "pendentes").
 * Espelha o ValoresAlteradosPage (resumo por prioridade + Accordion por exame + card por item
 * com ValueBar + chips de prioridade), SEM TelemedicineButton/Title/PageContainer/PageHeader.
 * Busca /api/doctor/patients/:pid/items/abnormal (Bearer doctorToken).
 */
export const DoctorValoresAlterados = ({ patientId, token, doctorId }: { patientId: string; token: string; doctorId?: string }) => {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // E5.3 — reviews do médico por examItemId (estado de achado; upsert nunca apaga).
  const [reviews, setReviews] = useState<Record<string, ReviewLike>>({});
  const [pendingOnly, setPendingOnly] = useState(false);
  // Foco clínico por padrão (dono 09/11): alterado antigo que JÁ normalizou não
  // entra na visão inicial — histórico completo continua a 1 clique de distância.
  const [hideNormalized, setHideNormalized] = useState(true);

  useEffect(() => {
    setLoading(true);
    setReviews({});
    const h: Record<string, string> = { Authorization: `Bearer ${token}` };
    fetch(`${API_URL}/doctor/patients/${patientId}/items/abnormal`, { headers: h })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => setItems(d.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
    if (doctorId) {
      fetch(`${API_URL}/doctor/${doctorId}/reviews?patientId=${patientId}`, { headers: h })
        .then((r) => (r.ok ? r.json() : { reviews: [] }))
        .then((d) => {
          const map: Record<string, ReviewLike> = {};
          for (const rv of d.reviews ?? []) if (rv.examItemId) map[rv.examItemId] = rv;
          setReviews(map);
        })
        .catch(() => {});
    }
  }, [patientId, token, doctorId]);

  // Filtro "pendentes de revisão": itens ALTERADOS sem review deste médico.
  const pendingCount = useMemo(() => items.filter((it) => !reviews[it.id]).length, [items, reviews]);
  const normalizedCount = useMemo(() => items.filter((it) => it.isNormalizedInNewerExam).length, [items]);
  const visibleItems = useMemo(
    () => items.filter((it) => {
      if (pendingOnly && reviews[it.id]) return false;
      if (hideNormalized && it.isNormalizedInNewerExam) return false;
      return true;
    }),
    [items, reviews, pendingOnly, hideNormalized],
  );

  const groups = useMemo(() => {
    const map = new Map<string, { examId: string; examTitle: string; performedAt: string | null; requestingDoctor: string | null; items: any[] }>();
    for (const it of visibleItems) {
      if (!map.has(it.examId)) map.set(it.examId, { examId: it.examId, examTitle: it.examTitle, performedAt: it.performedAt, requestingDoctor: it.requestingDoctor, items: [] });
      map.get(it.examId)!.items.push(it);
    }
    for (const g of map.values()) g.items.sort((a, b) => PRIORITY_RANK[priorityOf(b)] - PRIORITY_RANK[priorityOf(a)] || categorize(a.nameCanonical).key.localeCompare(categorize(b.nameCanonical).key));
    // Sort groups: maxPriority desc (🔴 first) then performedAt desc (mais recente primeiro).
    return [...map.values()].sort((a, b) => {
      const pa = PRIORITY_RANK[maxPriority(a.items)];
      const pb = PRIORITY_RANK[maxPriority(b.items)];
      if (pb !== pa) return pb - pa;
      return (b.performedAt ?? '').localeCompare(a.performedAt ?? '');
    });
  }, [visibleItems]);

  // Contagem pelo ESTADO ATUAL (sem os já normalizados) — resumo nunca conta fantasma.
  const { counts, suspectCount } = useMemo(() => {
    const c = { importante: 0, moderada: 0, leve: 0 };
    let sc = 0;
    for (const it of items) {
      if (it.isNormalizedInNewerExam) continue;
      if (refScaleSuspect(it)) { sc++; continue; }
      c[priorityOf(it)]++;
    }
    return { counts: c, suspectCount: sc };
  }, [items]);

  const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString('pt-BR') : 's/d');
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
          border: '1px solid',
          borderColor: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
          borderLeft: `4px solid ${meta.color}`,
          borderRadius: '16px !important',
          overflow: 'hidden',
          bgcolor: (t) => t.palette.mode === 'dark' ? '#0f172a' : '#ffffff',
          boxShadow: (t) => (t.palette.mode === 'dark' ? '0 4px 14px rgba(0,0,0,0.25)' : '0 2px 8px rgba(0,0,0,0.02)'),
          transition: 'all 0.2s ease',
          '&:before': { display: 'none' },
          '& .MuiAccordionSummary-root': {
            borderTopLeftRadius: '16px',
            borderTopRightRadius: '16px',
            px: 2,
            py: 1,
            bgcolor: (t) => t.palette.mode === 'dark' ? alpha(meta.color, 0.08) : alpha(meta.color, 0.04),
          },
          '& .MuiAccordionDetails-root': {
            borderBottomLeftRadius: '16px',
            borderBottomRightRadius: '16px',
            p: 1.5,
          },
        }}
      >
        <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: 'text.secondary' }} />}>
          <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', gap: 1.25, pr: 0.5 }}>
            <Box component="span" sx={{ fontSize: 18, lineHeight: 1 }}>{meta.emoji}</Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 800, fontSize: { xs: 14.5, sm: 15.5 }, color: 'text.primary', lineHeight: 1.25, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                {g.examTitle}
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
                📅 {fmtDate(g.performedAt)}{g.performedAt ? ` · ${timeAgo(g.performedAt)}` : ''}
              </Typography>
              {stale && <Typography variant="caption" sx={{ display: 'block', color: 'warning.main', fontWeight: 700 }}>⏳ Exame antigo — considere renovar</Typography>}
              {g.requestingDoctor && <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>🩺 Dr. {g.requestingDoctor}</Typography>}
            </Box>
            <Chip
              size="small"
              label={plural(g.items.length, 'alterado')}
              sx={{
                fontWeight: 800,
                fontSize: 11,
                height: 24,
                bgcolor: alpha(meta.color, 0.15),
                color: meta.color,
                border: `1px solid ${alpha(meta.color, 0.3)}`,
                flexShrink: 0,
              }}
            />
          </Box>
        </AccordionSummary>
        <AccordionDetails sx={{ p: 1.5 }}>
          <CappedExamMarkers
            items={g.items}
            extra={(it: any) => (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 0.75, mt: -0.25, mb: 0.5 }}>
                {it.isNormalizedInNewerExam ? (
                  <Chip
                    size="small"
                    label={`✓ Normalizado em exame mais recente${it.latestValueText ? ` (${it.latestValueText})` : ''}`}
                    sx={{ height: 22, fontSize: 11, fontWeight: 800, bgcolor: 'rgba(16,185,129,0.12)', color: '#059669', border: '1px solid rgba(16,185,129,0.3)' }}
                  />
                ) : <span />}
                {doctorId && (
                  <ReviewControl
                    review={reviews[it.id] ?? null}
                    patientId={patientId}
                    itemId={it.id}
                    token={token}
                    doctorId={doctorId}
                    onSaved={(rv) => setReviews((prev) => ({ ...prev, [it.id]: rv }))}
                  />
                )}
              </Box>
            )}
          />
        </AccordionDetails>
      </Accordion>
    );
  };

  if (loading) return <ListSkeleton count={3} />;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {items.length === 0 ? (
        <EmptyState emoji="✅" title="Nenhum valor alterado" desc="Não encontramos valores fora da faixa de referência nos exames compartilhados deste paciente." />
      ) : (
        <>
          {/* Resumo não-alarmista por prioridade ReUI */}
          <Card
            variant="outlined"
            sx={{
              borderRadius: '18px',
              borderColor: (t) => (t.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'),
              background: (t) =>
                t.palette.mode === 'dark'
                  ? 'radial-gradient(ellipse 90% 70% at 10% 0%, rgba(32,178,170,0.08), transparent 70%), #0f172a'
                  : 'radial-gradient(ellipse 90% 70% at 10% 0%, rgba(32,178,170,0.06), transparent 70%), #ffffff',
              boxShadow: (t) =>
                t.palette.mode === 'dark' ? '0 4px 14px rgba(0,0,0,0.25)' : '0 2px 8px rgba(0,0,0,0.02)',
            }}
          >
            <CardContent sx={{ py: 2, px: 2.25, '&:last-child': { pb: 2 } }}>
              <Stack direction="row" spacing={1.25} flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
                <Box
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.6,
                    px: 1.25,
                    py: 0.4,
                    borderRadius: '999px',
                    bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(239,68,68,0.18)' : 'rgba(239,68,68,0.10)',
                    border: '1px solid',
                    borderColor: (t) => t.palette.mode === 'dark' ? 'rgba(239,68,68,0.35)' : 'rgba(239,68,68,0.25)',
                  }}
                >
                  <Box component="span" sx={{ fontSize: 13 }}>{PRIORITY_META.importante.emoji}</Box>
                  <Typography component="span" sx={{ fontWeight: 800, fontSize: '0.85rem', color: (t) => t.palette.mode === 'dark' ? '#fca5a5' : '#dc2626' }}>
                    {counts.importante} {PRIORITY_META.importante.label}{counts.importante !== 1 ? 's' : ''}
                  </Typography>
                </Box>

                <Box
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.6,
                    px: 1.25,
                    py: 0.4,
                    borderRadius: '999px',
                    bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(245,158,11,0.18)' : 'rgba(245,158,11,0.10)',
                    border: '1px solid',
                    borderColor: (t) => t.palette.mode === 'dark' ? 'rgba(245,158,11,0.35)' : 'rgba(245,158,11,0.25)',
                  }}
                >
                  <Box component="span" sx={{ fontSize: 13 }}>{PRIORITY_META.moderada.emoji}</Box>
                  <Typography component="span" sx={{ fontWeight: 800, fontSize: '0.85rem', color: (t) => t.palette.mode === 'dark' ? '#fde68a' : '#b45309' }}>
                    {counts.moderada} {PRIORITY_META.moderada.label}{counts.moderada !== 1 ? 's' : ''}
                  </Typography>
                </Box>

                <Box
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.6,
                    px: 1.25,
                    py: 0.4,
                    borderRadius: '999px',
                    bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(59,130,246,0.18)' : 'rgba(59,130,246,0.10)',
                    border: '1px solid',
                    borderColor: (t) => t.palette.mode === 'dark' ? 'rgba(59,130,246,0.35)' : 'rgba(59,130,246,0.25)',
                  }}
                >
                  <Box component="span" sx={{ fontSize: 13 }}>{PRIORITY_META.leve.emoji}</Box>
                  <Typography component="span" sx={{ fontWeight: 800, fontSize: '0.85rem', color: (t) => t.palette.mode === 'dark' ? '#93c5fd' : '#2563eb' }}>
                    {counts.leve} {PRIORITY_META.leve.label}{counts.leve !== 1 ? 's' : ''}
                  </Typography>
                </Box>
              </Stack>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.82rem', lineHeight: 1.5, display: 'block' }}>
                {counts.importante > 0
                  ? <>Os <strong>{counts.importante} importantes</strong> merecem atenção prioritária. As moderadas devem ser contextualizadas na consulta.</>
                  : <>Quadro estável — os ajustes são pontuais (moderados ou leves). Acompanhe na próxima avaliação clínica.</>}
              </Typography>
              {suspectCount > 0 && (
                <Typography variant="caption" sx={{ display: 'block', color: 'warning.main', fontWeight: 600, mt: 0.5 }}>⚠️ {plural(suspectCount, 'valor')} com faixa de referência possivelmente incorreta (escala) — conferir no laudo original.</Typography>
              )}
            </CardContent>
          </Card>

          {/* E5.3 — filtros de triagem: pendentes de revisão + ocultar históricos já normalizados */}
          {(doctorId && (pendingCount > 0 || pendingOnly)) || normalizedCount > 0 ? (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, justifyContent: 'flex-start' }}>
              {doctorId && (pendingCount > 0 || pendingOnly) && (
                <Chip
                  size="small"
                  onClick={() => setPendingOnly((v) => !v)}
                  color={pendingOnly ? 'primary' : 'default'}
                  variant={pendingOnly ? 'filled' : 'outlined'}
                  label={pendingOnly ? `Pendentes de revisão (${visibleItems.length})` : `Pendentes de revisão (${pendingCount})`}
                  title="Mostrar apenas achados ainda sem estado de revisão definido por você"
                  sx={{ fontWeight: 700, borderRadius: '999px' }}
                />
              )}
              {normalizedCount > 0 && (
                <Chip
                  size="small"
                  onClick={() => setHideNormalized((v) => !v)}
                  color={hideNormalized ? 'success' : 'default'}
                  variant={hideNormalized ? 'filled' : 'outlined'}
                  label={hideNormalized ? `Ocultando ${normalizedCount} já normalizados ✓` : `Ocultar já normalizados (${normalizedCount})`}
                  title="Ocultar resultados antigos de marcadores que já voltaram à faixa normal em exame mais recente"
                  sx={{ fontWeight: 700, borderRadius: '999px' }}
                />
              )}
            </Box>
          ) : null}

          {/* Cabeçalho de Contexto & Foco Clínico */}
          {groups.length > INITIAL_LIMIT && (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 0.5, pt: 0.5 }}>
              <Stack direction="row" spacing={0.75} alignItems="center">
                <AutoAwesomeIcon sx={{ fontSize: 16, color: 'primary.main' }} />
                <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  {showAll ? `Histórico Completo (${groups.length} exames)` : `Foco Clínico: 3 mais recentes`}
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
          <Stack spacing={1.25}>
            {initialGroups.map(renderExamAccordion)}
          </Stack>

          {/* Exames ocultos com animação suave de expansão */}
          {hiddenGroups.length > 0 && (
            <>
              <Collapse in={showAll} unmountOnExit timeout={300}>
                <Stack spacing={1.25} sx={{ pt: 1.25 }}>
                  {hiddenGroups.map(renderExamAccordion)}
                </Stack>
              </Collapse>

              {/* Botão de Expansão Smart & Premium */}
              <Card
                variant="outlined"
                onClick={() => setShowAll((v) => !v)}
                sx={{
                  cursor: 'pointer',
                  borderRadius: '18px',
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
                  <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1.5}>
                    <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flex: 1, minWidth: 0 }}>
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
                          flexShrink: 0,
                        }}
                      >
                        {showAll ? <KeyboardArrowUpIcon /> : <HistoryIcon />}
                      </Box>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 800, color: 'text.primary', lineHeight: 1.25 }}>
                          {showAll ? 'Recolher para os 3 mais recentes' : `Histórico de alterações (+${hiddenGroups.length})`}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontSize: 11.5 }}>
                          {showAll ? 'Exibindo todo o histórico' : `Exames anteriores com parâmetros fora da faixa`}
                        </Typography>
                      </Box>
                    </Stack>
                    <Chip
                      size="small"
                      icon={showAll ? <KeyboardArrowUpIcon sx={{ '&&': { fontSize: 16 } }} /> : <KeyboardArrowDownIcon sx={{ '&&': { fontSize: 16 } }} />}
                      label={showAll ? 'Recolher' : `+${hiddenGroups.length}`}
                      color="primary"
                      variant={showAll ? 'outlined' : 'filled'}
                      sx={{
                        fontWeight: 800,
                        borderRadius: '999px',
                        height: 28,
                        flexShrink: 0,
                        whiteSpace: 'nowrap',
                        '& .MuiChip-label': { px: 1, whiteSpace: 'nowrap' },
                      }}
                    />
                  </Stack>
                </CardContent>
              </Card>
            </>
          )}
        </>
      )}
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>*Educativo. A interpretação final é sua.</Typography>
    </Box>
  );
};
