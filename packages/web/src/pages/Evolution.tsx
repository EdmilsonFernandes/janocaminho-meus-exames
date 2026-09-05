import { useEffect, useState, useMemo } from 'react';
import { Box, Button, Card, CardContent, Typography, Chip, Stack, Grid, Accordion, AccordionSummary, AccordionDetails, InputBase, Paper, Collapse } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { Title, useTranslate } from 'react-admin';
import { ResponsiveContainer, LineChart, Line, ReferenceArea, YAxis, Tooltip } from 'recharts';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SearchIcon from '@mui/icons-material/Search';
import DirectionsWalkIcon from '@mui/icons-material/DirectionsWalk';
import { API_URL, token } from '../config';
import { fetchActivitySummary, syncStamp } from '../services/activitySummary';
import { fetchActivityDays, hasHealthPermissions, syncActivityToServer } from '../services/healthConnect';
import type { ActivityDay } from '../utils/activityStats';
import { useSelectedPatient } from '../patient-context';
import { useNavigate } from 'react-router-dom';
import { ExplainButton } from '../components/ExplainItem';
import { UnitLabel } from '../components/UnitLabel';
import { CATS, categorize } from '../utils/medicalData';
import { displayStatus } from '../utils/examStatus';
import { summarizeTrends, trendHeadline } from '../utils/evolutionSummary';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { ListSkeleton } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';
import { ScrollReveal } from '../components/dashboard/ScrollReveal';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import QueryStatsIcon from '@mui/icons-material/QueryStats';
import type { SvgIconComponent } from '@mui/icons-material';

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

  // ATIVIDADE (Health Connect → medições): série 30d de passos (+kcal/km pro detalhe do
  // gráfico interativo) p/ comparar visualmente com glicose/lipídios/PA na MESMA tela.
  const [steps, setSteps] = useState<{ date: string; steps: number; kcal: number; km: number }[]>([]);
  const [stepsDelta, setStepsDelta] = useState<number | null>(null);
  const [actSel, setActSel] = useState<string | null>(null);
  const [actInfo, setActInfo] = useState(false);
  // Carimbo da fonte cloud ("Sincronizado há X"): sem isto, dado velho do server parece
  // um bug congelado — o usuário não sabe que só abre o app no celular pra atualizar.
  const [syncedNote, setSyncedNote] = useState<string | null>(null);
  // Consolida o que o APK já sincronizou (mesmo endpoint do ActivityCard na web) —
  // 1 request no lugar de 3, com deltaPct30 vs período anterior já calculado.
  const loadFromServer = () => {
    fetchActivitySummary(30, pid)
      .then((s) => {
        if (!s) { setSteps([]); setStepsDelta(null); return; }
        const st = s.lastSyncAt ? syncStamp(s.lastSyncAt) : null;
        setSyncedNote(st ? `Sincronizado ${st.label}${st.stale ? ' · abra o app no celular' : ''}` : null);
        const byDay = new Map<string, { steps: number; kcal: number; km: number }>();
        for (const p of s.metrics.STEPS.series30) byDay.set(p.date, { steps: p.value, kcal: 0, km: 0 });
        for (const p of s.metrics.CALORIES.series30) { const d = byDay.get(p.date); if (d) d.kcal = p.value; }
        for (const p of s.metrics.DISTANCE.series30) { const d = byDay.get(p.date); if (d) d.km = p.value; }
        setSteps([...byDay.entries()].filter(([, v]) => v.steps > 0).map(([date, v]) => ({ date, ...v })).sort((a, b) => (a.date < b.date ? -1 : 1)));
        setStepsDelta(s.metrics.STEPS.deltaPct30);
      })
      .catch(() => setSteps([]));
  };
  // DUAS FONTES (mesmo padrão do ActivityCard): no APK com Health Connect conectado e
  // perfil TITULAR selecionado, lê o aparelho DIRETO — a série acaba em HOJE, não no
  // último sync do server (bug de campo: "travou na quinta e o dia não muda mais").
  // 'patientId' do login = firstPatientId() do server (mesma noção de titular do sync).
  // Web/dependente: consolidado do server.
  const loadActivity = () => {
    setSyncedNote(null);
    if (!pid) { setSteps([]); setStepsDelta(null); return; }
    let ownPid: string | null = null;
    try { ownPid = localStorage.getItem('patientId'); } catch { /* localStorage indisponível */ }
    if (pid === ownPid && hasHealthPermissions()) {
      fetchActivityDays(60)
        .then((days) => {
          if (!days?.length) { loadFromServer(); return; } // bridge vazio → cloud
          setSteps(days
            .filter((d) => d.steps > 0)
            .sort((a, b) => (a.date < b.date ? -1 : 1))
            .slice(-30)
            .map(({ date, steps: st, kcal, km }) => ({ date, steps: st, kcal, km })));
          // deltaPct30 LOCAL: média dos 30d mais recentes vs 30 anteriores (days vem DESC).
          const avg = (arr: ActivityDay[]) => (arr.length ? arr.reduce((t, d) => t + d.steps, 0) / arr.length : null);
          const cur = avg(days.slice(0, 30));
          const prev = avg(days.slice(30, 60));
          setStepsDelta(cur != null && prev && prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null);
          // Repassa o sync (silencioso): web, portal do médico e Linha do Tempo passam a
          // enxergar a atividade de hoje MESMO se o Dashboard não for visitado nesta sessão.
          syncActivityToServer(days.slice(0, 31)).catch(() => { /* best-effort */ });
        })
        .catch(() => loadFromServer());
      return;
    }
    loadFromServer();
  };
  useEffect(() => { loadActivity(); /* eslint-disable-line */ }, [pid]);
  // RACE sync×fetch: o ActivityCard sincroniza HC→server DEPOIS de esta página já ter
  // buscado (mostrava quinta enquanto o painel mostrava sexta). Ouço o evento pós-sync
  // e REFAÇO o GET — cobre mount, foreground e botão ↻.
  useEffect(() => {
    window.addEventListener('dx:activity-synced', loadActivity);
    return () => window.removeEventListener('dx:activity-synced', loadActivity);
  }, [pid]);

  useEffect(() => {
    if (!pid) { setItems([]); setLoading(false); return; }
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
    const map = new Map<string, { cat: string; icon: SvgIconComponent; color: string; items: EvoItem[] }>();
    for (const it of filtered) {
      const c = categorize(it.nameCanonical);
      if (!map.has(c.key)) map.set(c.key, { cat: c.cat, icon: c.icon, color: c.color, items: [] });
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
    <PageContainer width="wide" sx={{ pb: { xs: 10, sm: 5 } }}>
      <Title title={translate('page.evolution')} />
      <PageHeader
        icon={<TrendingUpIcon />}
        title={translate('evo.title')}
        subtitle={translate('evo.subtitle')}
      />

      {loading && <ListSkeleton count={4} />}

      {!loading && items.length > 0 && (
        <>
          {/* RESUMO — banner sutil com accent bar */}
          <ScrollReveal>
            <Box sx={{
              mb: 2, p: 1.5, borderRadius: '16px',
              display: 'flex', gap: 1.25, alignItems: 'flex-start',
              bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(245,158,11,.06)' : 'rgba(245,158,11,.05)',
              border: '1px solid rgba(245,158,11,.12)',
            }}>
              <Box sx={{ width: 3, minHeight: 32, borderRadius: '999px', bgcolor: '#f59e0b', flexShrink: 0, mt: 0.25 }} />
              <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.5 }}>
                {trendHeadline(summary)} <strong>·</strong> Conteúdo educativo — a decisão final é do médico.
              </Typography>
            </Box>
          </ScrollReveal>

          {/* FILTROS — cards premium com glow no selecionado */}
          <ScrollReveal delay={60}>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' }, gap: 1, mb: 2 }}>
              {CHIPS.map((c, i) => {
                const on = filter === c.key;
                return (
                  <Box
                    key={c.key}
                    component="button"
                    onClick={() => setFilter(c.key)}
                    aria-pressed={on}
                    sx={{
                      textAlign: 'center', py: 1.1, borderRadius: '20px', cursor: 'pointer',
                      bgcolor: on ? `${c.color}14` : `${c.color}08`,
                      border: on ? `2px solid ${c.color}` : `1px solid ${c.color}20`,
                      boxShadow: on ? `0 4px 16px ${c.color}22` : 'none',
                      transition: 'border-color .2s ease, background-color .2s ease, box-shadow .25s ease, transform .15s ease',
                      '&:hover': { bgcolor: `${c.color}1E`, transform: 'translateY(-1px)' },
                      '&:active': { transform: 'scale(.97)' },
                      animation: `dxFilterIn .35s cubic-bezier(.16,1,.3,1) ${i * 0.06}s both`,
                      '@keyframes dxFilterIn': { from: { opacity: 0, transform: 'translateY(8px)' }, to: { opacity: 1, transform: 'none' } },
                    }}
                  >
                    <Typography sx={{ fontWeight: 800, fontFamily: '"Poppins",sans-serif', fontSize: { xs: 22, sm: 24 }, lineHeight: 1, color: c.color, fontVariantNumeric: 'tabular-nums' }}>{c.count}</Typography>
                    <Stack direction="row" alignItems="center" justifyContent="center" spacing={0.5} sx={{ mt: 0.35 }}>
                      <Box aria-hidden="true" sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: c.color, display: 'inline-block' }} />
                      <Typography sx={{ fontSize: { xs: 11, sm: 12 }, color: c.color, fontWeight: 700 }}>{c.label}</Typography>
                    </Stack>
                  </Box>
                );
              })}
            </Box>
          </ScrollReveal>

          {/* Busca premium — pill com hover glow */}
          <ScrollReveal delay={120}>
            <Paper variant="outlined" sx={{
              p: '4px 14px', mb: 2, display: 'flex', alignItems: 'center', gap: 1,
              borderRadius: '999px', bgcolor: 'background.paper',
              transition: 'box-shadow .2s ease, border-color .2s ease',
              '&:focus-within': { borderColor: '#20b2aa', boxShadow: '0 0 0 3px rgba(32,178,170,.12)' },
            }}>
              <SearchIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
              <InputBase value={query} onChange={(e: any) => setQuery(e.target.value)} placeholder="Buscar exame (TSH, glicose, colesterol…)" sx={{ flex: 1, fontSize: 14 }} />
              {query && <Chip size="small" label="limpar" onClick={() => setQuery('')} sx={{ height: 22 }} />}
            </Paper>
          </ScrollReveal>
        </>
      )}

      {/* ATIVIDADE — card premium com mesh gradient e barras gradiente */}
      {steps.length >= 5 && (
        <ScrollReveal delay={180}>
          <Card variant="outlined" sx={{
            mb: 2, borderRadius: '20px', borderColor: 'divider', overflow: 'hidden',
            background: (t) => t.palette.mode === 'dark'
              ? `radial-gradient(ellipse at 20% 30%, rgba(32,178,170,.10), transparent 55%), ${t.palette.background.paper}`
              : `radial-gradient(ellipse at 20% 30%, rgba(32,178,170,.06), transparent 55%), #ffffff`,
          }}>
            <CardContent sx={{ py: 1.75, '&:last-child': { pb: 1.75 } }}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                <DirectionsWalkIcon sx={{ fontSize: 18, color: '#178f89' }} />
                <Typography sx={{ fontWeight: 800, fontSize: 14, fontFamily: '"Poppins",sans-serif' }}>Sua atividade no período</Typography>
                <Typography sx={{ fontSize: 11, color: 'text.secondary', ml: 'auto', textAlign: 'right' }}>
                  {Math.round(steps.reduce((t, d) => t + d.steps, 0) / steps.length).toLocaleString('pt-BR')} passos/dia{stepsDelta != null ? ` · ${stepsDelta > 0 ? '+' : ''}${stepsDelta}% vs período anterior` : ` · ${steps.length} dias`}
                  {syncedNote && <Box component="span" sx={{ display: 'block', fontSize: 10, color: 'text.disabled' }}>{syncedNote}</Box>}
                </Typography>
              </Stack>
              {/* Sparkline com barras gradiente premium */}
              <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: 36 }}>
                {steps.slice(-30).map((d) => {
                  const max = Math.max(...steps.map((x) => x.steps), 1);
                  const on = (actSel ?? steps[steps.length - 1]?.date) === d.date;
                  return (
                    <Box
                      key={d.date}
                      component="button"
                      onClick={() => setActSel(d.date)}
                      aria-label={`${new Date(`${d.date}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}: ${d.steps.toLocaleString('pt-BR')} passos`}
                      sx={{
                        flex: 1, minWidth: 2, p: 0, border: 'none', cursor: 'pointer',
                        height: `${Math.max(12, (d.steps / max) * 100)}%`,
                        borderRadius: on ? '4px 4px 0 0' : '3px 3px 0 0',
                        background: on
                          ? 'linear-gradient(to bottom, #20b2aa, rgba(32,178,170,0.45))'
                          : d.steps >= 8000
                            ? 'linear-gradient(to bottom, rgba(32,178,170,0.7), rgba(32,178,170,0.2))'
                            : 'linear-gradient(to bottom, rgba(32,178,170,0.35), rgba(32,178,170,0.08))',
                        outline: on ? '2px solid #20b2aa' : 'none',
                        outlineOffset: on ? 1 : 0,
                        boxShadow: on ? '0 0 8px rgba(32,178,170,.3)' : 'none',
                        transform: on ? 'scaleY(1.06)' : 'none',
                        transition: 'height .4s cubic-bezier(.2,.8,.2,1), transform .15s ease, box-shadow .2s ease',
                      }}
                    />
                  );
                })}
              </Box>
              {(() => {
                const sel = steps.find((d) => d.date === (actSel ?? steps[steps.length - 1]?.date));
                if (!sel) return null;
                const dt = new Date(`${sel.date}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }).replace('.', '');
                return (
                  <Stack direction="row" spacing={1.5} alignItems="center" useFlexGap flexWrap="wrap" sx={{
                    mt: 0.75, px: 1.25, py: 0.75, borderRadius: '12px',
                    bgcolor: 'rgba(32,178,170,0.07)', border: '1px solid rgba(32,178,170,0.15)',
                    animation: 'dxActTip .2s ease both',
                    '@keyframes dxActTip': { from: { opacity: 0, transform: 'scale(.96)' }, to: { opacity: 1, transform: 'scale(1)' } },
                  }}>
                    <Typography sx={{ fontSize: 12, fontWeight: 800, color: '#178f89', textTransform: 'capitalize' }}>{dt}</Typography>
                    <Typography sx={{ fontSize: 13, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{sel.steps.toLocaleString('pt-BR')} <span style={{ fontSize: 11, color: 'text.secondary', fontWeight: 600 }}>passos</span></Typography>
                    {sel.kcal > 0 && <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>🔥 {Math.round(sel.kcal).toLocaleString('pt-BR')} kcal</Typography>}
                    {sel.km > 0 && <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>📍 {sel.km.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km</Typography>}
                  </Stack>
                );
              })()}
              <Button size="small" onClick={() => setActInfo((v) => !v)} endIcon={<ExpandMoreIcon sx={{ transform: actInfo ? 'rotate(180deg)' : 'none', transition: 'transform .2s', fontSize: 16 }} />} sx={{ mt: 0.75, textTransform: 'none', fontWeight: 700, color: 'primary.dark', borderRadius: '999px', px: 1, minHeight: 28, alignSelf: 'flex-start' }}>
                {actInfo ? 'Menos' : 'Saiba mais'}
              </Button>
              <Collapse in={actInfo} unmountOnExit>
                <Typography sx={{ fontSize: 11, color: 'text.secondary', mt: 0.5 }}>
                  Compare com a glicose, os lipídios e a pressão abaixo — atividade e exames contam a história juntos (educativo; confirme com seu médico).
                </Typography>
              </Collapse>
            </CardContent>
          </Card>
        </ScrollReveal>
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
        <ScrollReveal delay={240}>
          <Stack spacing={1.5}>
            {groups.map((g, i) => <CategoryGroup key={g.cat} group={g} expandOuts={filter === 'out'} idx={i} />)}
          </Stack>
        </ScrollReveal>
      )}
    </PageContainer>
  );
};

/** Grupo colapsável — premium: accent bar lateral, radius 20, hover suave, slide dos markers. */
const CategoryGroup = ({ group, expandOuts, idx = 0 }: { group: { cat: string; icon: SvgIconComponent; color: string; items: EvoItem[] }; expandOuts?: boolean; idx?: number }) => {
  const [open, setOpen] = useState(!!expandOuts && group.items.some((i) => statusOf(i) === 'out'));
  const outs = group.items.filter((i) => statusOf(i) === 'out').length;
  const changes = group.items.filter((i) => statusOf(i) === 'change').length;
  return (
    <Card sx={{
      borderRadius: '20px', border: 'none', overflow: 'hidden', position: 'relative',
      boxShadow: (t) => t.palette.mode === 'dark'
        ? '0 2px 8px rgba(0,0,0,.3)'
        : '0 1px 3px rgba(0,0,0,.03), 0 4px 12px rgba(0,0,0,.04)',
      animation: `dxCatIn .35s cubic-bezier(.16,1,.3,1) ${idx * 0.06}s both`,
      '@keyframes dxCatIn': { from: { opacity: 0, transform: 'translateY(10px)' }, to: { opacity: 1, transform: 'none' } },
    }}>
      {/* Left accent bar */}
      <Box sx={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: open ? 4 : 3,
        bgcolor: group.color, borderRadius: '0 4px 4px 0',
        transition: 'width .2s ease',
        boxShadow: open ? `0 0 8px ${group.color}40` : 'none',
      }} />
      <Box onClick={() => setOpen((o) => !o)} sx={{
        display: 'flex', alignItems: 'center', gap: 1, pl: 2.5, pr: 1.5, py: 1.5,
        cursor: 'pointer',
        bgcolor: open ? `${group.color}08` : 'transparent',
        transition: 'background-color .2s ease',
        '&:hover': { bgcolor: `${group.color}10` },
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center' }}><group.icon sx={{ fontSize: 20, color: group.color }} /></Box>
        <Typography sx={{ fontWeight: 800, flex: 1, color: 'text.primary', fontSize: 15 }}>{group.cat}</Typography>
        {outs > 0 ? (
          <Chip size="small" label={`${outs} alterado${outs > 1 ? 's' : ''}`} sx={{ bgcolor: 'rgba(239,68,68,0.12)', color: '#b91c1c', fontWeight: 700, height: 24, borderRadius: '999px' }} />
        ) : changes > 0 ? (
          <Chip size="small" label={`${changes} em mudança`} sx={{ bgcolor: 'rgba(245,158,11,0.12)', color: '#b45309', fontWeight: 700, height: 24, borderRadius: '999px' }} />
        ) : (
          <Chip size="small" label="estável" sx={{ bgcolor: 'rgba(5,150,105,0.12)', color: '#047857', fontWeight: 700, height: 24, borderRadius: '999px' }} />
        )}
        <ExpandMoreIcon sx={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform .25s cubic-bezier(.16,1,.3,1)', color: group.color, fontSize: 20 }} />
      </Box>
      {open && (
        <Stack spacing={0.75} sx={{ p: 1.25, pt: 0.5 }}>
          {group.items.map((it, i) => <EvoRow key={it.nameCanonical} it={it} defaultExpanded={!!expandOuts && statusOf(it) === 'out'} idx={i} />)}
        </Stack>
      )}
    </Card>
  );
};

/** Mini curva de tendência Sparkline para exibição instantânea nos cards da Evolução */
const EvoSparkline = ({ points, color }: { points: { value: number }[]; color: string }) => {
  if (!points || points.length < 2) return null;
  const vals = points.map((p) => p.value).filter((v) => typeof v === 'number' && !Number.isNaN(v));
  if (vals.length < 2) return null;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const width = 44;
  const height = 16;
  const padding = 2;

  const coords = vals.map((v, i) => {
    const x = padding + (i / (vals.length - 1)) * (width - 2 * padding);
    const y = height - padding - ((v - min) / range) * (height - 2 * padding);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', mx: 0.5, flexShrink: 0 }} title="Curva de tendência recente">
      <svg width={width} height={height} style={{ overflow: 'visible' }}>
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={coords.join(' ')}
        />
        <circle
          cx={coords[coords.length - 1].split(',')[0]}
          cy={coords[coords.length - 1].split(',')[1]}
          r="2.5"
          fill={color}
        />
      </svg>
    </Box>
  );
};

/** Card marcador — premium: borda lateral colorida, sombra layered, slide-in. */
const EvoRow = ({ it, defaultExpanded, idx = 0 }: { it: EvoItem; defaultExpanded?: boolean; idx?: number }) => {
  const navigate = useNavigate();
  const st = statusOf(it);
  const meta = STATUS_META[st];
  const up = it.direction === 'up';
  const lineColor = st === 'out' ? '#ef4444' : up ? '#c2410c' : '#0369a1';
  return (
    <Accordion defaultExpanded={defaultExpanded} disableGutters elevation={0}
      sx={{
        '&:before': { display: 'none' },
        border: 'none',
        borderRadius: '16px !important',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0,0,0,.03), 0 2px 8px rgba(0,0,0,.03)',
        transition: 'box-shadow .2s ease',
        '&:hover': { boxShadow: '0 2px 6px rgba(0,0,0,.05), 0 4px 16px rgba(0,0,0,.05)' },
        animation: `dxRowIn .3s ease ${idx * 0.04}s both`,
        '@keyframes dxRowIn': { from: { opacity: 0, transform: 'translateX(-6px)' }, to: { opacity: 1, transform: 'none' } },
        // Left accent bar
        '&::before': {
          content: '""', position: 'absolute', left: 0, top: 0, bottom: 0,
          width: 3, bgcolor: meta.color, borderRadius: '0 3px 3px 0',
          display: 'block !important', opacity: '1 !important',
        },
      }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: '52px !important', '& .MuiAccordionSummary-content': { my: 0.75 }, pl: 2 }}>
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            pr: 1,
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'minmax(0,1fr) auto' },
            gap: 0.75,
            alignItems: 'center',
          }}
        >
          <Stack direction="row" alignItems="center" spacing={1} sx={{ minWidth: 0 }}>
            <Box sx={{ fontSize: 15, flexShrink: 0 }}>{meta.emoji}</Box>
            <Typography sx={{ fontWeight: 700, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.nameCanonical}</Typography>
          </Stack>
          <Stack
            direction="row"
            alignItems="center"
            spacing={0.75}
            useFlexGap
            sx={{
              minWidth: 0,
              justifyContent: { xs: 'flex-start', sm: 'flex-end' },
              flexWrap: { xs: 'wrap', sm: 'nowrap' },
            }}
          >
            <Typography sx={{ fontWeight: 800, color: meta.color, whiteSpace: 'nowrap' }}>{it.lastValue} {it.unit ? <UnitLabel unit={it.unit} /> : null}</Typography>
            <EvoSparkline points={it.points} color={lineColor} />
            {st !== 'stable' && it.pctChange !== 0 && <Chip size="small" sx={{ bgcolor: `${lineColor}14`, color: lineColor, fontWeight: 700, height: 22, borderRadius: '999px', flexShrink: 0 }} label={`${it.pctChange > 0 ? '+' : ''}${it.pctChange}%`} />}
          </Stack>
        </Box>
      </AccordionSummary>
      <AccordionDetails sx={{ p: 2 }}>
        <Typography variant="body2" sx={{ mb: 1 }}>
          {it.firstValue}{it.unit ? ` ${it.unit}` : ''} ({fmtDate(it.firstDate)}) <strong>→</strong> {it.lastValue}{it.unit ? ` ${it.unit}` : ''} ({fmtDate(it.lastDate)})
        </Typography>
        {it.points.length >= 2 && (
          <Box sx={{ height: 104, width: '100%', mb: 1 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={it.points.map((p) => ({ v: p.value, date: fmtDate(p.date), flag: p.flag, refLow: (p as any).refLow ?? null, refHigh: (p as any).refHigh ?? null }))} margin={{ top: 6, right: 8, bottom: 4, left: 8 }}>
                {/* Domínio inclui a faixa (mesma correção do TrendsChart): sem isto o recharts 3.x
                    descarta o ReferenceArea que ultrapasse os dados — a banda sumia. */}
                {it.refLow != null && it.refHigh != null && <ReferenceArea y1={it.refLow} y2={it.refHigh} fill="#059669" fillOpacity={0.14} ifOverflow="extendDomain" />}
                <YAxis hide domain={it.refLow != null && it.refHigh != null
                  ? [(dataMin: number) => Math.min(dataMin, it.refLow as number), (dataMax: number) => Math.max(dataMax, it.refHigh as number)]
                  : ['auto', 'auto']} />
                {/* Tooltip mostra valor + data ao TOCAR no ponto (mobile). Antes não havia Tooltip — clicar não fazia nada. */}
                <Tooltip
                  cursor={{ stroke: lineColor, strokeWidth: 1, strokeDasharray: '4 3' }}
                  content={({ active: a, payload }) => {
                    if (!a || !payload?.length) return null;
                    const d = payload[0].payload as { v: number; date: string; flag: string; refLow?: number | null; refHigh?: number | null };
                    return (
                      <Box sx={{ bgcolor: 'background.paper', border: `1px solid ${lineColor}`, borderRadius: '8px', px: 1.25, py: 0.75, boxShadow: 2 }}>
                        <Typography sx={{ fontWeight: 800, color: lineColor, lineHeight: 1.1 }}>{d.v} {it.unit ? <UnitLabel unit={it.unit} /> : null}</Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>{d.date}</Typography>
                        {(() => {
                          // Status NUMÉRICO-PRIMEIRO contra a faixa UNIFICADA da série (mediana
                          // enviada pelo server) — mandato 2026-08-18: UMA faixa classifica tudo.
                          const s = displayStatus(d.flag, it.nameCanonical, it.refLow, it.refHigh, d.v);
                          if (s.tone === 'normal' || s.short === '—') return null;
                          return <Typography variant="caption" sx={{ display: 'block', color: s.tone === 'critico' ? '#ef4444' : '#b45309', fontWeight: 700 }}>{s.label}</Typography>;
                        })()}
                      </Box>
                    );
                  }}
                />
                <defs>
                  <linearGradient id="evolutionGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#20b2aa" />
                    <stop offset="100%" stopColor={lineColor} />
                  </linearGradient>
                </defs>
                <Line type="monotone" dataKey="v" stroke="url(#evolutionGrad)" strokeWidth={2.5} dot={{ r: 4, fill: lineColor }} activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </Box>
        )}
        <Typography variant="body2" color="text.secondary">
          {st === 'stable' ? 'Estável' : up ? 'Subindo' : 'Caindo'} em {it.count} {it.count === 1 ? 'medição' : 'medições'}.
          {(it.refLow != null || it.refHigh != null) && ` Faixa: ${it.refLow ?? '—'} a ${it.refHigh ?? '—'}${it.unit ? ` ${it.unit}` : ''}.`}
        </Typography>
        {it.predictMonths != null && (
          <Box sx={{ mt: 1, p: 1, borderRadius: '8px', bgcolor: `${lineColor}0d`, border: `1px solid ${lineColor}33` }}>
            <Typography variant="body2" sx={{ color: lineColor, fontWeight: 600 }}>⏱️ Neste ritmo, {it.nameCanonical} {up ? 'ultrapassa' : 'fica abaixo de'} a faixa em ~{it.predictMonths} {it.predictMonths === 1 ? 'mês' : 'meses'}.</Typography>
          </Box>
        )}
        <Stack direction="row" spacing={1} sx={{ mt: 1 }} useFlexGap flexWrap="wrap" alignItems="center">
          <ExplainButton name={it.nameCanonical} nameCanonical={it.nameCanonical} />
          <Button size="small" variant="outlined" onClick={() => navigate(`/tendencias?select=${encodeURIComponent(it.nameCanonical)}`)} sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 700, borderColor: 'rgba(32,178,170,0.4)', color: '#178f89' }}>
            📊 Gráfico completo em Tendências →
          </Button>
          {(() => { const lp = it.points[it.points.length - 1]; if (!lp?.examId) return null; return <Button size="small" onClick={() => navigate(`/exams/${lp.examId}/show`)}>↗ Exame de origem</Button>; })()}
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
};
