import { useEffect, useState, useMemo, useRef } from 'react';
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
import { ListSkeleton } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';
import { TelemedicineButton } from '../components/TelemedicineButton';
import { fmtVal, unitSuffix, plural } from '../utils/format';
import { refLabel, categorize } from '../utils/medicalData';
import { priorityOf, maxPriority, isStaleExam, refScaleSuspect, PRIORITY_META, PRIORITY_RANK, priorityText } from '../utils/alertPriority';
import { CappedExamMarkers } from '../components/CappedExamMarkers';
import { celebrate } from '../hooks/useCelebrate';
import { useSnapCarousel } from '../hooks/useSnapCarousel';
import { RADIUS } from '../theme';
import { Frame, FramePanel, FrameFooter } from '@/components/reui/frame';
import { useReuiThemeSync } from '@/components/reui/use-reui-theme';

import type { AbnormalItem as AbnItem } from '@meus-exames/shared';

/** Valores fora da faixa, AGRUPADOS POR EXAME (dentro de cada exame, ordenados por PRIORIDADE). */
export const ValoresAlteradosPage = () => {
  useReuiThemeSync();
  const translate = useTranslate();
  const navigate = useNavigate();
  const [pid] = useSelectedPatient();
  const [items, setItems] = useState<AbnItem[]>([]);
  // Estado atual por analito (dono 09/11): TSH alterado há 3 meses que normalizou
  // NÃO pode continuar na lista como se estivesse alterado agora. `items` (flat,
  // todas as ocorrências) continua valendo pro histórico completo.
  const [current, setCurrent] = useState<any[] | null>(null);
  const [normalized, setNormalized] = useState<any[]>([]);
  const [examCount, setExamCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [sevFilter, setSevFilter] = useState<'all' | 'importante' | 'moderada' | 'leve'>('all');

  useEffect(() => {
    setLoading(true);
    // examCount distingue "sem NENHUM exame" (onboarding + CTA) de "exames todos normais"
    // (✅ all_good legítimo). Antes: os dois casos rendiam "Tudo dentro da faixa!" — usuário
    // novo via um atestado de saúde sem nunca ter enviado exame.
    const h = { Authorization: `Bearer ${token()}` };
    fetch(`${API_URL}/items/abnormal${pid ? `?patientId=${pid}` : ''}`, { headers: h })
      .then((r) => r.json())
      .then((d) => {
        setItems(d.items ?? []);
        setCurrent(d.current ?? null); // null = backend antigo → fallback pro flat
        setNormalized(d.normalized ?? []);
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
    fetch(`${API_URL}/exams?_start=0&_end=1${pid ? `&patientId=${pid}` : ''}`, { headers: h })
      .then((r) => Number(r.headers.get('X-Total-Count') ?? r.headers.get('content-range')?.split('/')?.[1] ?? '0'))
      .then((n) => setExamCount(Number.isFinite(n) ? n : 0))
      .catch(() => setExamCount(0));
  }, [pid]);

  // FOCO = estado atual (último valor por analito). Fallback pro flat se o backend
  // ainda não devolver `current` (deploy defasado).
  const focusItems: AbnItem[] = useMemo(() => (current ?? items) as AbnItem[], [current, items]);

  const groupBy = (list: AbnItem[]) => {
    const map = new Map<string, { examId: string; examTitle: string; performedAt: string | null; requestingDoctor: string | null; items: AbnItem[] }>();
    for (const it of list) {
      if (sevFilter !== 'all' && priorityOf(it) !== sevFilter) continue;
      if (!map.has(it.examId)) map.set(it.examId, { examId: it.examId, examTitle: it.examTitle, performedAt: it.performedAt, requestingDoctor: it.requestingDoctor, items: [] });
      map.get(it.examId)!.items.push(it);
    }
    for (const g of map.values()) g.items.sort((a, b) => PRIORITY_RANK[priorityOf(b)] - PRIORITY_RANK[priorityOf(a)] || categorize(a.nameCanonical).key.localeCompare(categorize(b.nameCanonical).key));
    return [...map.values()].sort((a, b) => PRIORITY_RANK[maxPriority(b.items)] - PRIORITY_RANK[maxPriority(a.items)] || (b.performedAt ?? '').localeCompare(a.performedAt ?? ''));
  };
  const groups = useMemo(() => groupBy(focusItems), [focusItems, sevFilter]); // eslint-disable-line react-hooks/exhaustive-deps
  // Histórico completo (todas as ocorrências alteradas, inclusive as que normalizaram).
  const histGroups = useMemo(() => groupBy(items), [items, sevFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // Resumo por prioridade do ESTADO ATUAL. Itens com faixa suspeita (escala errada) NÃO entram
  // na contagem de prioridade — são exibidos à parte como "conferir faixa" (nunca como 🔴).
  const { counts, suspectCount } = useMemo(() => {
    const c = { importante: 0, moderada: 0, leve: 0 };
    let sc = 0;
    for (const it of focusItems) { if (refScaleSuspect(it)) { sc++; continue; } c[priorityOf(it)]++; }
    return { counts: c, suspectCount: sc };
  }, [focusItems]);

  // Normalizações recentes (janela de 90 dias definida pelo server) — momento de celebrar.
  const normalizedRecent = useMemo(() => normalized.filter((n) => n.withinWindow !== false), [normalized]);

  // ✨ Celebração de normalização (dono 09/11: "parabéns com animação, igual conquista"):
  // dispara 1× por normalização nova (dedup por paciente+marcador+data do exame que
  // normalizou). O barramento useCelebrate já tem anti-spam global de 30s.
  useEffect(() => {
    if (loading || normalizedRecent.length === 0) return;
    const seenKey = (n: any) => `dx:normseen:${pid ?? 'me'}:${n.nameCanonical}:${n.normalizedPerformedAt ?? ''}`;
    const fresh = normalizedRecent.filter((n) => {
      try { return !localStorage.getItem(seenKey(n)); } catch { return false; }
    });
    if (!fresh.length) return;
    for (const n of fresh) { try { localStorage.setItem(seenKey(n), '1'); } catch { /* ignore */ } }
    celebrate('marker_normalized', { count: fresh.length, names: fresh[0]?.name });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, normalizedRecent]);

  const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString('pt-BR') : 's/d');
  const fmtDateShort = (d?: string | null) => {
    if (!d) return 's/d';
    try {
      const dt = new Date(d);
      return isNaN(dt.getTime()) ? 's/d' : dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
    } catch {
      return 's/d';
    }
  };
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

  const [showAll, setShowAll] = useState(false);
  // Carrossel de normalizados com vida própria (dono 10/11): avança a cada 3s,
  // pausa no hover/foco/aba oculta, reduced-motion desliga; drag com mouse na web.
  const normRef = useRef<HTMLDivElement>(null);
  const { dragHandlers, dragSx } = useSnapCarousel(normRef);

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
          borderRadius: `${RADIUS.card} !important`,
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
            <Chip size="small" label={plural(g.items.length, 'alterado')} sx={{ fontWeight: 700, height: 20, bgcolor: meta.color + '22', color: (t) => priorityText(t.palette.mode, mp) }} />
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
          {/* Nada fora da faixa AGORA — o momento positivo (antes era só silêncio) */}
          {focusItems.length === 0 && (
            <Card sx={{ mb: 2, borderRadius: RADIUS.card, border: '1px solid rgba(32,178,170,0.35)', background: (t) => (t.palette.mode === 'dark' ? 'linear-gradient(135deg, rgba(32,178,170,0.14), rgba(26,36,36,0.9))' : 'linear-gradient(135deg, rgba(32,178,170,0.10), rgba(255,255,255,0.9))') }}>
              <CardContent sx={{ textAlign: 'center', py: 3 }}>
                <Typography sx={{ fontWeight: 800, fontSize: 20, fontFamily: 'Poppins, sans-serif' }}>
                  Nada fora da faixa <Box component="span" sx={{ fontStyle: 'italic', fontFamily: "'Instrument Serif', Georgia, serif", color: 'primary.main' }}>agora</Box> ✨
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  O último valor de cada marcador está dentro da referência. Histórico completo logo abaixo.
                </Typography>
              </CardContent>
            </Card>
          )}

          {/* Painel de Triagem por Prioridade (ReUI Frame) com filtro interativo */}
          {focusItems.length > 0 && (
          <Frame variant="default" className="mb-3">
            <FramePanel className="p-3.5 sm:p-4 space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {([
                  { key: 'all', label: 'Fora da faixa agora', count: focusItems.length, dot: '#178f89' },
                  { key: 'importante', label: 'Importantes', count: counts.importante, dot: '#ef4444' },
                  { key: 'moderada', label: 'Moderadas', count: counts.moderada, dot: '#f59e0b' },
                  { key: 'leve', label: 'Leves', count: counts.leve, dot: '#eab308' },
                ] as const).map((tile) => {
                  const active = sevFilter === tile.key;
                  return (
                    <button
                      key={tile.key}
                      type="button"
                      onClick={() => setSevFilter(tile.key)}
                      className={`flex flex-col items-start justify-between rounded-xl border p-2.5 text-left transition-all cursor-pointer ${
                        active
                          ? 'border-teal-600 bg-teal-500/10 shadow-xs'
                          : 'border-border/70 bg-background hover:bg-muted/50'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: tile.dot }} />
                        <span className="text-[11px] font-bold text-muted-foreground">{tile.label}</span>
                      </div>
                      <span className="mt-1 font-heading text-xl font-extrabold tabular-nums text-foreground">
                        {tile.count}
                      </span>
                    </button>
                  );
                })}
              </div>
              {suspectCount > 0 && (
                <div className="text-[11.5px] text-muted-foreground">
                  ⚠️ {plural(suspectCount, 'valor')} com faixa de referência possivelmente em outra escala — exibidos como “conferir”.
                </div>
              )}
            </FramePanel>
            <FrameFooter className="px-4 py-2 text-[11.5px] text-muted-foreground">
              {counts.importante > 0
                ? 'Priorize conversar sobre os itens importantes com seu médico. Alterações moderadas e leves servem de acompanhamento.'
                : 'Nenhum marcador crítico — comente sobre os ajustes moderados ou leves na próxima consulta.'}
            </FrameFooter>
          </Frame>
          )}

          {/* ✨ VOLTARAM AO NORMAL — carrossel premium mobile-first (cada normalização
              é uma conquista: card próprio, swipe com snap; nada de mural vertical). */}
          {normalizedRecent.length > 0 && (
            <Box sx={{ mb: 2 }}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1, px: 0.5 }}>
                <AutoAwesomeIcon sx={{ fontSize: 18, color: '#38bd8b' }} />
                <Typography sx={{ fontWeight: 800, fontSize: 15.5 }}>
                  {normalizedRecent.length === 1 ? 'Voltou ao normal' : `${normalizedRecent.length} voltaram ao normal`}
                </Typography>
                <Box sx={{ flex: 1 }} />
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  arraste <KeyboardArrowDownIcon sx={{ transform: 'rotate(-90deg)', fontSize: 14 }} />
                </Typography>
              </Stack>
              <Box ref={normRef} {...dragHandlers} sx={{
                display: 'flex', gap: 1.25, overflowX: 'auto',
                scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch',
                pb: 0.5, mx: -2, px: 2,
                '&::-webkit-scrollbar': { display: 'none' },
                scrollbarWidth: 'none',
                ...dragSx,
              }}>
                {normalizedRecent.map((n) => (
                  <Card key={n.nameCanonical} sx={{
                    scrollSnapAlign: 'center',
                    flex: { xs: '0 0 80%', sm: '0 0 280px' },
                    minWidth: { xs: 260, sm: 275 },
                    maxWidth: 320,
                    borderRadius: RADIUS.card,
                    border: '1px solid rgba(56,189,139,0.35)',
                    background: (t) => (t.palette.mode === 'dark'
                      ? 'linear-gradient(150deg, rgba(56,189,139,0.14), rgba(26,36,36,0.95))'
                      : 'linear-gradient(150deg, rgba(56,189,139,0.12), rgba(255,255,255,0.96))'),
                    display: 'flex', flexDirection: 'column',
                  }}>
                    <CardContent sx={{ p: 2, '&:last-child': { pb: 2 }, display: 'flex', flexDirection: 'column', gap: 0.75, height: '100%' }}>
                      <Typography sx={{ fontWeight: 800, fontSize: 13.5, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={n.name}>
                        {n.name}
                      </Typography>
                      {/* valueText JÁ vem com unidade — nunca concatenar de novo */}
                      <Stack direction="row" spacing={0.75} alignItems="baseline" flexWrap="nowrap" sx={{ rowGap: 0.25 }}>
                        <Typography variant="caption" sx={{ color: 'text.secondary', textDecoration: 'line-through', textDecorationColor: 'rgba(239,68,68,0.55)', whiteSpace: 'nowrap' }}>
                          {n.from?.valueText ?? '—'}
                        </Typography>
                        <KeyboardArrowDownIcon sx={{ transform: 'rotate(-90deg)', fontSize: 14, color: '#2b9a6e', alignSelf: 'center', flexShrink: 0 }} />
                        <Typography sx={{ fontWeight: 800, fontSize: 16.5, color: '#2b9a6e', fontFamily: 'Poppins, sans-serif', whiteSpace: 'nowrap' }}>
                          {n.to?.valueText || [n.to?.valueNumeric, n.to?.unit].filter(Boolean).join(' ') || '—'}
                        </Typography>
                      </Stack>
                      <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" sx={{ mt: 'auto', pt: 0.5 }}>
                        <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap', fontSize: '0.75rem', flexShrink: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {fmtDateShort(n.from?.performedAt)} → <b style={{ color: 'text.primary' }}>{fmtDateShort(n.to?.performedAt)}</b>
                        </Typography>
                        <Chip
                          size="small"
                          icon={<AutoAwesomeIcon sx={{ fontSize: '12px !important', color: '#2b9a6e !important' }} />}
                          label="Na faixa"
                          sx={{
                            height: 22,
                            fontWeight: 800,
                            fontSize: '0.72rem',
                            borderRadius: RADIUS.pill,
                            bgcolor: 'rgba(56,189,139,0.16)',
                            color: '#2b9a6e',
                            flexShrink: 0,
                            whiteSpace: 'nowrap',
                            '& .MuiChip-label': {
                              px: 0.75,
                              whiteSpace: 'nowrap',
                            },
                            '& .MuiChip-icon': {
                              ml: 0.75,
                              mr: -0.25,
                            },
                          }}
                        />
                      </Stack>
                    </CardContent>
                  </Card>
                ))}
              </Box>
            </Box>
          )}

          {/* ESTADO ATUAL — todos os exames com algo fora da faixa AGORA (sem fantasmas) */}
          <Stack spacing={1}>
            {groups.map(renderExamAccordion)}
          </Stack>

          {/* Histórico completo — todas as ocorrências alteradas, inclusive as que
              normalizaram (nada se perde; só deixa de assustar). */}
          {histGroups.length > 0 && (
            <>
              <Collapse in={showAll} unmountOnExit timeout={300}>
                <Stack spacing={1} sx={{ pt: 1, opacity: 0.88 }}>
                  {histGroups.map(renderExamAccordion)}
                </Stack>
              </Collapse>

              {/* Botão de Expansão Premium */}
              <Card
                variant="outlined"
                onClick={() => setShowAll((v) => !v)}
                sx={{
                  mt: 1,
                  cursor: 'pointer',
                  borderRadius: RADIUS.card,
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
                          borderRadius: RADIUS.md,
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
                          {showAll ? 'Recolher histórico' : `Histórico de alterações (${histGroups.length} ${histGroups.length === 1 ? 'exame' : 'exames'})`}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontSize: 11.5 }}>
                          {showAll ? 'Exibindo todas as ocorrências, inclusive as que normalizaram' : 'Todas as ocorrências alteradas, inclusive as de antes de normalizar'}
                        </Typography>
                      </Box>
                    </Stack>
                    <Chip
                      size="small"
                      icon={showAll ? <KeyboardArrowUpIcon sx={{ '&&': { fontSize: 16 } }} /> : <KeyboardArrowDownIcon sx={{ '&&': { fontSize: 16 } }} />}
                      label={showAll ? 'Recolher' : 'Ver tudo'}
                      color="primary"
                      variant={showAll ? 'outlined' : 'filled'}
                      sx={{
                        fontWeight: 800,
                        borderRadius: RADIUS.pill,
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
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>*Educativo. Sempre confirme com seu médico.</Typography>
    </PageContainer>
  );
};
