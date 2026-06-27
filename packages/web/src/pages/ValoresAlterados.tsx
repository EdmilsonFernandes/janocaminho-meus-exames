import { useEffect, useState, useMemo } from 'react';
import { Box, Card, CardContent, Typography, CircularProgress, Stack, Chip, Accordion, AccordionSummary, AccordionDetails } from '@mui/material';
import { Title } from 'react-admin';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { API_URL, token } from '../config';
import { useSelectedPatient } from '../patient-context';
import { ExplainButton } from '../components/ExplainItem';
import { TelemedicineButton } from '../components/TelemedicineButton';
import { fmtVal, unitSuffix } from '../utils/format';
import { refLabel, categorize } from '../utils/medicalData';
import { priorityOf, maxPriority, isStaleExam, refScaleSuspect, PRIORITY_META, PRIORITY_RANK } from '../utils/alertPriority';

interface AbnItem { id: string; examId: string; examTitle: string; performedAt: string | null; requestingDoctor: string | null; name: string; nameCanonical: string; valueText: string; valueNumeric: number | null; unit: string | null; flag: string | null; refText: string | null; refLow: number | null; refHigh: number | null; }

/** Valores fora da faixa, AGRUPADOS POR EXAME (dentro de cada exame, ordenados por PRIORIDADE). */
export const ValoresAlteradosPage = () => {
  const [pid] = useSelectedPatient();
  const [items, setItems] = useState<AbnItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${API_URL}/items/abnormal${pid ? `?patientId=${pid}` : ''}`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => r.json())
      .then((d) => setItems(d.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [pid]);

  const groups = useMemo(() => {
    const map = new Map<string, { examId: string; examTitle: string; performedAt: string | null; requestingDoctor: string | null; items: AbnItem[] }>();
    for (const it of items) {
      if (!map.has(it.examId)) map.set(it.examId, { examId: it.examId, examTitle: it.examTitle, performedAt: it.performedAt, requestingDoctor: it.requestingDoctor, items: [] });
      map.get(it.examId)!.items.push(it);
    }
    // Dentro de cada exame: prioridade (mais grave primeiro) e depois categoria (clusteriza).
    for (const g of map.values()) g.items.sort((a, b) => PRIORITY_RANK[priorityOf(b)] - PRIORITY_RANK[priorityOf(a)] || categorize(a.nameCanonical).key.localeCompare(categorize(b.nameCanonical).key));
    // Exames ordenados do mais recente.
    return [...map.values()].sort((a, b) => (b.performedAt ?? '').localeCompare(a.performedAt ?? ''));
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

  return (
    <PageContainer width="wide">
      <Title title="Valores alterados" />
      <PageHeader
        icon={<WarningAmberIcon />}
        title="Valores fora da faixa"
        subtitle={<>Ordenados por <strong>prioridade de atenção</strong> (🔴→🟡). Toque num exame pra expandir e em <strong>Agendar</strong> pro especialista.</>}
        accent="error.main"
      />

      {loading ? (
        <Box sx={{ textAlign: 'center', py: 4 }}><CircularProgress /></Box>
      ) : items.length === 0 ? (
        <Card><CardContent><Typography color="text.secondary" sx={{ textAlign: 'center', py: 1 }}>Nenhum valor alterado — tudo dentro da faixa. ✅</Typography></CardContent></Card>
      ) : (
        <>
          {/* Resumo não-alarmista por prioridade */}
          <Card variant="outlined" sx={{ mb: 1, borderRadius: 3, borderColor: 'divider', bgcolor: 'rgba(15,61,58,0.03)' }}>
            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap sx={{ mb: 0.5 }}>
                <Typography component="span" sx={{ fontWeight: 800, color: PRIORITY_META.importante.color }}>{PRIORITY_META.importante.emoji} {counts.importante} {PRIORITY_META.importante.label}{counts.importante !== 1 ? 's' : ''}</Typography>
                <Typography component="span" sx={{ fontWeight: 800, color: PRIORITY_META.moderada.color }}>{PRIORITY_META.moderada.emoji} {counts.moderada} {PRIORITY_META.moderada.label}{counts.moderada !== 1 ? 's' : ''}</Typography>
                <Typography component="span" sx={{ fontWeight: 800, color: PRIORITY_META.leve.color }}>{PRIORITY_META.leve.emoji} {counts.leve} {PRIORITY_META.leve.label}{counts.leve !== 1 ? 's' : ''}</Typography>
              </Stack>
              <Typography variant="caption" color="text.secondary">
                {counts.importante > 0
                  ? <>Os <strong>{PRIORITY_META.importante.emoji} importantes</strong> merecem prioridade — leve ao médico. {PRIORITY_META.moderada.emoji} moderadas: comente na consulta. {PRIORITY_META.leve.emoji} leves: só acompanhe.</>
                  : <>Nada crítico — os ajustes são <strong>{PRIORITY_META.moderada.emoji} moderados</strong> ou <strong>{PRIORITY_META.leve.emoji} leves</strong>. Comente com seu médico na próxima consulta.</>}
              </Typography>
              {suspectCount > 0 && (
                <Typography variant="caption" sx={{ display: 'block', color: '#64748b', mt: 0.5 }}>⚠️ {suspectCount} valor(es) com faixa de referência possivelmente incorreta (escala) — mostrados como “conferir”, não como alerta.</Typography>
              )}
            </CardContent>
          </Card>

          <Stack spacing={1}>
            {groups.map((g) => {
              const mp = maxPriority(g.items);
              const meta = PRIORITY_META[mp];
              const stale = isStaleExam(g.performedAt);
              return (
                <Accordion key={g.examId} disableGutters elevation={0} sx={{ border: `1px solid ${meta.color}55`, borderRadius: '12px', overflow: 'hidden', '&:before': { display: 'none' } }}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ bgcolor: meta.color + '14' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', gap: 1 }}>
                      <Box component="span" sx={{ fontSize: 18 }}>{meta.emoji}</Box>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 800, color: meta.color, lineHeight: 1.2 }}>{g.examTitle}</Typography>
                        <Typography variant="caption" sx={{ color: meta.color, opacity: 0.85 }}>📅 {fmtDate(g.performedAt)}{g.performedAt ? ` · ${timeAgo(g.performedAt)}` : ''}</Typography>
                        {stale && <Typography variant="caption" sx={{ display: 'block', color: '#9a6b00' }}>⏳ Exame antigo — considere renovar com seu médico</Typography>}
                        {g.requestingDoctor && <Typography variant="caption" sx={{ display: 'block', color: meta.color, opacity: 0.85 }}>🩺 Dr. {g.requestingDoctor}</Typography>}
                      </Box>
                      <Chip size="small" label={`${g.items.length} alterado(s)`} sx={{ fontWeight: 700, height: 20, bgcolor: meta.color + '22', color: meta.color }} />
                    </Box>
                  </AccordionSummary>
                  <AccordionDetails sx={{ p: 1.25 }}>
                    {/* 1 botão de agendar POR EXAME (não por item) — usa o marcador do item mais grave */}
                    <Box sx={{ mb: 1, display: 'flex', justifyContent: { xs: 'stretch', sm: 'flex-start' } }}>
                      <TelemedicineButton marker={g.items[0]?.nameCanonical} compact />
                    </Box>
                    <Stack spacing={0.75}>
                      {g.items.map((it) => {
                        const suspect = refScaleSuspect(it);
                        const p = priorityOf(it);
                        const pm = PRIORITY_META[p];
                        const col = suspect ? '#64748b' : pm.color; // suspeito: neutro (nunca vermelho 🔴)
                        return (
                          <Card key={it.id} variant="outlined" sx={{ borderLeft: `4px solid ${col}`, borderRadius: 2, bgcolor: col + '0a' }}>
                            <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', py: 1.25, '&:last-child': { pb: 1.25 } }}>
                              <Box sx={{ flex: '1 1 55%', minWidth: 0 }}>
                                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5, flexWrap: 'wrap' }}>
                                  <Typography sx={{ fontWeight: 700, wordBreak: 'break-word', overflowWrap: 'anywhere', lineHeight: 1.2 }}>{it.name}</Typography>
                                  <Chip size="small" label={suspect ? '⚠️ Faixa a conferir' : `${pm.emoji} ${pm.label}`} title={suspect ? 'A faixa de referência pode estar com escala errada — confira no documento original.' : pm.hint} sx={{ height: 20, fontWeight: 700, bgcolor: col + '22', color: col }} />
                                  <ExplainButton name={it.name} nameCanonical={it.nameCanonical} />
                                </Box>
                                <Typography variant="caption" sx={{ color: 'text.secondary' }}>{suspect ? '⚠️ Faixa possivelmente incorreta — confirme no documento. ' : ''}{refLabel(it)}</Typography>
                              </Box>
                              <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                                <Typography component="span" sx={{ fontSize: '1.35rem', fontWeight: 800, color: col }}>{fmtVal(it)}</Typography>
                                {unitSuffix(it) ? <Typography component="span" sx={{ color: 'text.secondary', ml: 0.5, fontSize: '0.8rem' }}>{unitSuffix(it)}</Typography> : null}
                              </Box>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </Stack>
                  </AccordionDetails>
                </Accordion>
              );
            })}
          </Stack>
        </>
      )}
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>*Educativo. Sempre confirme com seu médico.</Typography>
    </PageContainer>
  );
};
