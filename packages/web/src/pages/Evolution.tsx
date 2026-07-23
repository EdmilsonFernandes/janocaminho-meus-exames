import { useEffect, useState, useMemo } from 'react';
import { Box, Button, Card, CardContent, Typography, Chip, Stack, Grid, Accordion, AccordionSummary, AccordionDetails, InputBase, Paper } from '@mui/material';
import { Title, useTranslate } from 'react-admin';
import { ResponsiveContainer, LineChart, Line, ReferenceArea, YAxis, Tooltip } from 'recharts';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SearchIcon from '@mui/icons-material/Search';
import { API_URL, token } from '../config';
import { useSelectedPatient } from '../patient-context';
import { useNavigate } from 'react-router-dom';
import { ExplainButton } from '../components/ExplainItem';
import { UnitLabel } from '../components/UnitLabel';
import { CATS, categorize } from '../utils/medicalData';
import { displayStatus } from '../utils/examStatus';
import { summarizeTrends, trendHeadline, VERDICT_META } from '../utils/evolutionSummary';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { ListSkeleton } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';

import type { EvolutionItem as EvoItem } from '@meus-exames/shared';

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : 's/d';

// "painel de controle": cada exame ganha um status visual
type Status = 'out' | 'change' | 'stable';
// statusOf usa 'abnormal' (isAbnormal stored c/ reconcileScaleFlag) — alinhado com o Dashboard.
// Antes usava '!inRange' (recompute do valor vs faixa), que ignorava a reconciliação de escala
// e inflava o 'fora da faixa' com marcadores incertos (Dashboard=2 vs Evolução=10).
const statusOf = (it: EvoItem): Status => (it.abnormal ? 'out' : it.direction !== 'stable' ? 'change' : 'stable');
const STATUS_META: Record<Status, { emoji: string; label: string; color: string }> = {
  out: { emoji: '🔴', label: 'Fora da faixa', color: '#ef4444' },
  change: { emoji: '🟠', label: 'Em mudança', color: '#f59e0b' },
  stable: { emoji: '✅', label: 'Estável', color: '#059669' },
};

// Agrupamento por categoria médica (reaproveitado de utils/medicalData — fonte única + testável)
const CAT_ORDER = CATS.map((c) => c.key);

export const EvolutionPage = () => {
  const translate = useTranslate();
  const [pid] = useSelectedPatient();
  const navigate = useNavigate();
  const [items, setItems] = useState<EvoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Status | 'all'>('all');
  const [query, setQuery] = useState('');

  useEffect(() => {
    setLoading(true);
    fetch(`${API_URL}/items/evolution${pid ? `?patientId=${pid}` : ''}`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => r.json())
      .then((d) => setItems(d.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [pid]);

  const counts = useMemo(() => ({
    out: items.filter((i) => statusOf(i) === 'out').length,
    change: items.filter((i) => statusOf(i) === 'change').length,
    stable: items.filter((i) => statusOf(i) === 'stable').length,
  }), [items]);

  // Resumo "melhorou/piorou/estável" (por distância à faixa, não por direção).
  const summary = useMemo(() => summarizeTrends(items), [items]);

  const filtered = useMemo(() => {
    const order = { out: 0, change: 1, stable: 2 };
    const q = query.trim().toLowerCase();
    return items
      .filter((i) => filter === 'all' || statusOf(i) === filter)
      .filter((i) => !q || i.nameCanonical.toLowerCase().includes(q))
      .sort((a, b) => order[statusOf(a)] - order[statusOf(b)]);
  }, [items, filter, query]);

  // Agrupa os itens filtrados por categoria médica (ordem fixa do laudo)
  const groups = useMemo(() => {
    const order = { out: 0, change: 1, stable: 2 };
    const map = new Map<string, { cat: string; emoji: string; color: string; items: EvoItem[] }>();
    for (const it of filtered) {
      const c = categorize(it.nameCanonical);
      if (!map.has(c.key)) map.set(c.key, { cat: c.cat, emoji: c.emoji, color: c.color, items: [] });
      map.get(c.key)!.items.push(it);
    }
    for (const g of map.values()) g.items.sort((a, b) => order[statusOf(a)] - order[statusOf(b)]);
    return [...map.entries()].sort((a, b) => CAT_ORDER.indexOf(a[0]) - CAT_ORDER.indexOf(b[0])).map(([, g]) => g);
  }, [filtered]);

  const CHIPS: { key: Status | 'all'; emoji: string; label: string; color: string; count: number }[] = [
    { key: 'all', emoji: '📋', label: 'Todos', color: '#178f89', count: items.length },
    { key: 'out', emoji: STATUS_META.out.emoji, label: STATUS_META.out.label, color: STATUS_META.out.color, count: counts.out },
    { key: 'change', emoji: STATUS_META.change.emoji, label: STATUS_META.change.label, color: STATUS_META.change.color, count: counts.change },
    { key: 'stable', emoji: STATUS_META.stable.emoji, label: STATUS_META.stable.label, color: STATUS_META.stable.color, count: counts.stable },
  ];

  return (
    <PageContainer width="wide">
      <Title title={translate('page.evolution')} />
      <PageHeader
        icon={<TrendingUpIcon />}
        title={translate('evo.title')}
        subtitle={translate('evo.subtitle')}
      />

      {loading && <ListSkeleton count={4} />}

      {!loading && items.length > 0 && (
        <>
          {/* Resumo da evolução (melhorou/piorou/estável) — leitura amigável e não-alarmista */}
          <Card variant="outlined" sx={{ mb: 2, borderRadius: 3, borderColor: 'divider', bgcolor: 'rgba(15,61,58,0.03)' }}>
            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Stack direction="row" spacing={1.75} flexWrap="wrap" useFlexGap sx={{ mb: 0.5 }}>
                <Typography component="span" sx={{ fontWeight: 800, color: VERDICT_META.melhorou.color }}>{VERDICT_META.melhorou.emoji} {summary.counts.melhorou} {VERDICT_META.melhorou.label}</Typography>
                <Typography component="span" sx={{ fontWeight: 800, color: VERDICT_META.piorou.color }}>{VERDICT_META.piorou.emoji} {summary.counts.piorou} {VERDICT_META.piorou.label}</Typography>
                <Typography component="span" sx={{ fontWeight: 800, color: VERDICT_META.estavel.color }}>{VERDICT_META.estavel.emoji} {summary.counts.estavel} {VERDICT_META.estavel.label}</Typography>
              </Stack>
              <Typography variant="caption" color="text.secondary">{trendHeadline(summary)} <strong>·</strong> Conteúdo educativo — a decisão final é do médico.</Typography>
            </CardContent>
          </Card>

          {/* Resumo interativo (chips que filtram) */}
          {/* Resumo interativo — Grid 2x2 no mobile, 4 colunas no desktop (mobile-first, nunca estoura) */}
          <Grid container spacing={1} sx={{ mb: 2 }}>
            {CHIPS.map((c) => {
              const on = filter === c.key;
              return (
                <Grid key={c.key} size={{ xs: 6, sm: 3 }}>
                  <Chip onClick={() => setFilter(c.key)} label={`${c.emoji} ${c.label} (${c.count})`}
                    sx={{ width: '100%', height: 38, borderRadius: 2, bgcolor: on ? c.color : `${c.color}1a`, color: on ? '#fff' : c.color, fontWeight: 700, border: `1px solid ${c.color}55`, '&:hover': { bgcolor: on ? c.color : `${c.color}2e` } }} />
                </Grid>
              );
            })}
          </Grid>

          {/* Busca fixa (sticky) */}
          <Paper variant="outlined" sx={{ p: '2px 12px', mb: 2, display: 'flex', alignItems: 'center', gap: 1, borderRadius: 99, position: 'sticky', top: 60, zIndex: 5, bgcolor: 'background.paper', backdropFilter: 'blur(8px)' }}>
            <SearchIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
            <InputBase value={query} onChange={(e: any) => setQuery(e.target.value)} placeholder="Buscar exame (TSH, glicose, colesterol…)" sx={{ flex: 1, fontSize: 14 }} />
            {query && <Chip size="small" label="limpar" onClick={() => setQuery('')} sx={{ height: 22 }} />}
          </Paper>
        </>
      )}

      {!loading && items.length === 0 && (
        <EmptyState
          emoji="📈"
          title={translate('evo.empty_title')}
          desc="Envie ao menos 2 exames laboratoriais de datas diferentes pra acompanhar como cada exame evoluiu entre as coletas."
          cta="Enviar exame"
          onCta={() => navigate('/exams/create')}
        />
      )}

      {!loading && items.length > 0 && filtered.length === 0 && (
        <Typography color="text.secondary" sx={{ mt: 2 }}>Nenhum exame nesse filtro.</Typography>
      )}

      {!loading && filtered.length > 0 && (
        <Stack spacing={1.5}>
          {groups.map((g) => <CategoryGroup key={g.cat} group={g} expandOuts={filter === 'out'} />)}
        </Stack>
      )}
    </PageContainer>
  );
};

/** Grupo colapsável por categoria médica — header com emoji, nome, pior status e contagem; dentro ficam os cards de cada analito. */
const CategoryGroup = ({ group, expandOuts }: { group: { cat: string; emoji: string; color: string; items: EvoItem[] }; expandOuts?: boolean }) => {
  // Recolhido por padrão. Exceção: no filtro "Fora da faixa", abre só os grupos que têm alerta.
  const [open, setOpen] = useState(!!expandOuts && group.items.some((i) => statusOf(i) === 'out'));
  const worst: Status = group.items.some((i) => statusOf(i) === 'out') ? 'out' : group.items.some((i) => statusOf(i) === 'change') ? 'change' : 'stable';
  // Conta só os analitos FORA da faixa (não o total) — antes o chip mostrava o total da
  // categoria (ex.: "Hemograma 🔴15"), parecendo que havia 15 alertas quando eram 15 analitos.
  const outs = group.items.filter((i) => statusOf(i) === 'out').length;
  return (
    <Card sx={{ borderRadius: 3, border: `1px solid ${group.color}26`, overflow: 'hidden' }}>
      <Box onClick={() => setOpen((o) => !o)} sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1.25, cursor: 'pointer', bgcolor: `${group.color}0a`, '&:hover': { bgcolor: `${group.color}14` } }}>
        <Box sx={{ fontSize: 19 }}>{group.emoji}</Box>
        <Typography sx={{ fontWeight: 800, flex: 1, color: 'text.primary', fontSize: 15 }}>{group.cat}</Typography>
        <Box title={STATUS_META[worst].label} sx={{ fontSize: 14 }}>{STATUS_META[worst].emoji}</Box>
        {outs > 0 && <Chip size="small" label={`${outs} alterado${outs > 1 ? 's' : ''}`} sx={{ bgcolor: `${group.color}1a`, color: group.color, fontWeight: 700, height: 22 }} />}
        <ExpandMoreIcon sx={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform .2s', color: group.color, fontSize: 20 }} />
      </Box>
      {open && (
        <Stack spacing={0.75} sx={{ p: 1 }}>
          {group.items.map((it) => <EvoRow key={it.nameCanonical} it={it} defaultExpanded={!!expandOuts && statusOf(it) === 'out'} />)}
        </Stack>
      )}
    </Card>
  );
};

/** Card recolhido por padrão (nome + valor + tag); expande pro gráfico + detalhes. */
const EvoRow = ({ it, defaultExpanded }: { it: EvoItem; defaultExpanded?: boolean }) => {
  const navigate = useNavigate();
  const st = statusOf(it);
  const meta = STATUS_META[st];
  const up = it.direction === 'up';
  const lineColor = st === 'out' ? '#ef4444' : up ? '#e65100' : '#0b5cab';
  return (
    <Accordion defaultExpanded={defaultExpanded} disableGutters elevation={0}
      sx={{ '&:before': { display: 'none' }, border: `1px solid ${meta.color}33`, borderRadius: '12px !important' }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: '52px !important', '& .MuiAccordionSummary-content': { my: 0.75, flexWrap: 'wrap', gap: 0.5 } }}>
        <Stack direction="row" alignItems="center" spacing={1} useFlexGap sx={{ flex: 1, minWidth: 0, pr: 1, flexWrap: 'wrap', gap: 0.5 }}>
          <Box sx={{ fontSize: 15 }}>{meta.emoji}</Box>
          <Typography sx={{ fontWeight: 700, flex: '1 1 60%', minWidth: 120 }}>{it.nameCanonical}</Typography>
          <Typography sx={{ fontWeight: 800, color: meta.color }}>{it.lastValue} {it.unit ? <UnitLabel unit={it.unit} /> : null}</Typography>
          {st !== 'stable' && it.pctChange !== 0 && <Chip size="small" sx={{ bgcolor: `${lineColor}14`, color: lineColor, fontWeight: 700, height: 20 }} label={`${it.pctChange > 0 ? '+' : ''}${it.pctChange}%`} />}
        </Stack>
      </AccordionSummary>
      <AccordionDetails sx={{ p: 2 }}>
        <Typography variant="body2" sx={{ mb: 1 }}>
          {it.firstValue}{it.unit ? ` ${it.unit}` : ''} ({fmtDate(it.firstDate)}) <strong>→</strong> {it.lastValue}{it.unit ? ` ${it.unit}` : ''} ({fmtDate(it.lastDate)})
        </Typography>
        {it.points.length >= 2 && (
          <Box sx={{ height: 104, width: '100%', mb: 1 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={it.points.map((p) => ({ v: p.value, date: fmtDate(p.date), flag: p.flag }))} margin={{ top: 6, right: 8, bottom: 4, left: 8 }}>
                {it.refLow != null && it.refHigh != null && <ReferenceArea y1={it.refLow} y2={it.refHigh} fill="#059669" fillOpacity={0.14} />}
                <YAxis hide domain={['auto', 'auto']} />
                {/* Tooltip mostra valor + data ao TOCAR no ponto (mobile). Antes não havia Tooltip — clicar não fazia nada. */}
                <Tooltip
                  cursor={{ stroke: lineColor, strokeWidth: 1, strokeDasharray: '4 3' }}
                  content={({ active: a, payload }) => {
                    if (!a || !payload?.length) return null;
                    const d = payload[0].payload as { v: number; date: string; flag: string };
                    return (
                      <Box sx={{ bgcolor: 'background.paper', border: `1px solid ${lineColor}`, borderRadius: 1.5, px: 1.25, py: 0.75, boxShadow: 2 }}>
                        <Typography sx={{ fontWeight: 800, color: lineColor, lineHeight: 1.1 }}>{d.v} {it.unit ? <UnitLabel unit={it.unit} /> : null}</Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>{d.date}</Typography>
                        {(() => {
                          // Status TRADUZIDO (nunca 'UNKNOWN' cru — antes aparecia "unknown" no tooltip).
                          const s = displayStatus(d.flag, it.nameCanonical, it.refLow, it.refHigh);
                          if (s.tone === 'normal' || s.short === '—') return null;
                          return <Typography variant="caption" sx={{ display: 'block', color: '#ef4444', fontWeight: 700 }}>{s.label}</Typography>;
                        })()}
                      </Box>
                    );
                  }}
                />
                <Line type="monotone" dataKey="v" stroke={lineColor} strokeWidth={2.5} dot={{ r: 4, fill: lineColor }} activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </Box>
        )}
        <Typography variant="body2" color="text.secondary">
          {st === 'stable' ? 'Estável' : up ? 'Subindo' : 'Caindo'} em {it.count} {it.count === 1 ? 'medição' : 'medições'}.
          {(it.refLow != null || it.refHigh != null) && ` Faixa: ${it.refLow ?? '—'} a ${it.refHigh ?? '—'}${it.unit ? ` ${it.unit}` : ''}.`}
        </Typography>
        {it.predictMonths != null && (
          <Box sx={{ mt: 1, p: 1, borderRadius: 1.5, bgcolor: `${lineColor}0d`, border: `1px solid ${lineColor}33` }}>
            <Typography variant="body2" sx={{ color: lineColor, fontWeight: 600 }}>⏱️ Neste ritmo, {it.nameCanonical} {up ? 'ultrapassa' : 'fica abaixo de'} a faixa em ~{it.predictMonths} {it.predictMonths === 1 ? 'mês' : 'meses'}.</Typography>
          </Box>
        )}
        <Stack direction="row" spacing={1} sx={{ mt: 1 }} useFlexGap flexWrap="wrap" alignItems="center">
          <ExplainButton name={it.nameCanonical} nameCanonical={it.nameCanonical} />
          {(() => { const lp = it.points[it.points.length - 1]; if (!lp?.examId) return null; return <Button size="small" onClick={() => navigate(`/exams/${lp.examId}/show`)}>↗ Exame de origem</Button>; })()}
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
};
