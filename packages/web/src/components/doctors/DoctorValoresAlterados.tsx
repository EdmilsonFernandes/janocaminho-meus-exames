import { useEffect, useMemo, useState } from 'react';
import { Box, Card, CardContent, Typography, Stack, Chip, Accordion, AccordionSummary, AccordionDetails } from '@mui/material';
import { alpha } from '@mui/material/styles';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { API_URL } from '../../config';
import { ListSkeleton } from '../Skeleton';
import { EmptyState } from '../EmptyState';
import { ExplainButton } from '../ExplainItem';
import { CappedExamMarkers } from '../CappedExamMarkers';
import { UnitLabel } from '../UnitLabel';
import { ValueBar } from '../ValueBar';
import { fmtVal, unitSuffix } from '../../utils/format';
import { refLabel, categorize } from '../../utils/medicalData';
import { priorityOf, maxPriority, isStaleExam, refScaleSuspect, PRIORITY_META, PRIORITY_RANK } from '../../utils/alertPriority';
import { RADIUS } from '../../theme';

/**
 * DoctorValoresAlterados — valores alterados do paciente (viewer médico READ-ONLY).
 * Espelha o ValoresAlteradosPage (resumo por prioridade + Accordion por exame + card por item
 * com ValueBar + chips de prioridade), SEM TelemedicineButton/Title/PageContainer/PageHeader.
 * Busca /api/doctor/patients/:pid/items/abnormal (Bearer doctorToken).
 */
export const DoctorValoresAlterados = ({ patientId, token }: { patientId: string; token: string }) => {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const h: Record<string, string> = { Authorization: `Bearer ${token}` };
    fetch(`${API_URL}/doctor/patients/${patientId}/items/abnormal`, { headers: h })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => setItems(d.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [patientId, token]);

  const groups = useMemo(() => {
    const map = new Map<string, { examId: string; examTitle: string; performedAt: string | null; requestingDoctor: string | null; items: any[] }>();
    for (const it of items) {
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
  }, [items]);

  const { counts, suspectCount } = useMemo(() => {
    const c = { importante: 0, moderada: 0, leve: 0 };
    let sc = 0;
    for (const it of items) { if (refScaleSuspect(it)) { sc++; continue; } c[priorityOf(it)]++; }
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

  if (loading) return <ListSkeleton count={3} />;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {items.length === 0 ? (
        <EmptyState emoji="✅" title="Nenhum valor alterado" desc="Não encontramos valores fora da faixa de referência nos exames compartilhados deste paciente." />
      ) : (
        <>
          {/* Resumo não-alarmista por prioridade */}
          <Card variant="outlined" sx={(t) => ({ borderRadius: RADIUS.card, borderColor: 'divider', bgcolor: alpha(t.palette.primary.main, 0.03) })}>
            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap sx={{ mb: 0.5 }}>
                <Typography component="span" sx={{ fontWeight: 800, color: PRIORITY_META.importante.color }}>{PRIORITY_META.importante.emoji} {counts.importante} {PRIORITY_META.importante.label}{counts.importante !== 1 ? 's' : ''}</Typography>
                <Typography component="span" sx={{ fontWeight: 800, color: PRIORITY_META.moderada.color }}>{PRIORITY_META.moderada.emoji} {counts.moderada} {PRIORITY_META.moderada.label}{counts.moderada !== 1 ? 's' : ''}</Typography>
                <Typography component="span" sx={{ fontWeight: 800, color: PRIORITY_META.leve.color }}>{PRIORITY_META.leve.emoji} {counts.leve} {PRIORITY_META.leve.label}{counts.leve !== 1 ? 's' : ''}</Typography>
              </Stack>
              <Typography variant="caption" color="text.secondary">
                {counts.importante > 0
                  ? <>Os <strong>{PRIORITY_META.importante.emoji} importantes</strong> merecem prioridade — leve ao médico. {PRIORITY_META.moderada.emoji} moderadas: comente na consulta. {PRIORITY_META.leve.emoji} leves: só acompanhe.</>
                  : <>Nada crítico — os ajustes são <strong>{PRIORITY_META.moderada.emoji} moderados</strong> ou <strong>{PRIORITY_META.leve.emoji} leves</strong>. Comente com seu paciente na próxima consulta.</>}
              </Typography>
              {suspectCount > 0 && (
                <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 0.5 }}>⚠️ {suspectCount} valor(es) com faixa de referência possivelmente incorreta (escala) — mostrados como “conferir”, não como alerta.</Typography>
              )}
            </CardContent>
          </Card>

          <Stack spacing={1}>
            {groups.map((g) => {
              const mp = maxPriority(g.items);
              const meta = PRIORITY_META[mp];
              const stale = isStaleExam(g.performedAt);
              return (
                <Accordion key={g.examId} disableGutters elevation={0} sx={{ border: `1px solid ${alpha(meta.color, 0.3)}`, borderLeft: `4px solid ${meta.color}`, borderRadius: RADIUS.sectionCard, '&:before': { display: 'none' }, '& .MuiAccordionSummary-root': { borderTopLeftRadius: RADIUS.sectionCard, borderTopRightRadius: RADIUS.sectionCard }, '& .MuiAccordionDetails-root': { borderBottomLeftRadius: RADIUS.sectionCard, borderBottomRightRadius: RADIUS.sectionCard } }}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ bgcolor: alpha(meta.color, 0.04) }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', gap: 1 }}>
                      <Box component="span" sx={{ fontSize: 18, lineHeight: 1 }}>{meta.emoji}</Box>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        {/* COR = SINAL: título neutro, data/doctor neutros — cor só no borderLeft + chip. */}
                        <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'text.primary', lineHeight: 1.2, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{g.examTitle}</Typography>
                        <Typography variant="caption" color="text.secondary">📅 {fmtDate(g.performedAt)}{g.performedAt ? ` · ${timeAgo(g.performedAt)}` : ''}</Typography>
                        {stale && <Typography variant="caption" sx={{ display: 'block', color: 'warning.dark' }}>⏳ Exame antigo — considere renovar</Typography>}
                        {g.requestingDoctor && <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>🩺 Dr. {g.requestingDoctor}</Typography>}
                      </Box>
                      <Chip size="small" label={`${g.items.length} alterado(s)`} sx={{ fontWeight: 700, height: 22, bgcolor: alpha(meta.color, 0.15), color: meta.color }} />
                    </Box>
                  </AccordionSummary>
                  <AccordionDetails sx={{ p: 1.25 }}>
                    <CappedExamMarkers items={g.items} />
                  </AccordionDetails>
                </Accordion>
              );
            })}
          </Stack>
        </>
      )}
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>*Educativo. A interpretação final é sua.</Typography>
    </Box>
  );
};
