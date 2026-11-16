import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslate, useNotify } from 'react-admin';
import { Card, CardContent, Typography, Button, TextField, Select, MenuItem, FormControl, InputLabel, Box, Chip, IconButton, Stack, Collapse } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import { confirmDialog } from '../components/ConfirmDialog';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import MonitorWeightIcon from '@mui/icons-material/MonitorWeight';
import HeightIcon from '@mui/icons-material/Height';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import WaterDropIcon from '@mui/icons-material/WaterDrop';
import FavoriteIcon from '@mui/icons-material/Favorite';
import DirectionsWalkIcon from '@mui/icons-material/DirectionsWalk';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import RouteIcon from '@mui/icons-material/Route';
import PushPinIcon from '@mui/icons-material/PushPin';
import TimerIcon from '@mui/icons-material/Timer';
import BedtimeIcon from '@mui/icons-material/Bedtime';
import PsychologyIcon from '@mui/icons-material/Psychology';
import { useNavigate } from 'react-router-dom';
import AccessibilityNewIcon from '@mui/icons-material/AccessibilityNew';
import { API_URL, token } from '../config';
import { useSelectedPatient } from '../patient-context';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { AppCard } from '../components/AppCard';
import { Sparkline } from '../components/Sparkline';
import { STEPS_GOAL } from '../utils/activityStats';
import { tealText } from '../theme';
import { Badge as ReuiBadge } from '@/components/reui/badge';
import { Frame, FramePanel } from '@/components/reui/frame';
import { PulseIcon } from '@/components/reui/icons';
import { useReuiThemeSync } from '@/components/reui/use-reui-theme';
import { RingGauge } from '../components/motion/RingGauge';
import { CountUp } from '../components/motion/CountUp';
import { GlassGlow } from '../components/motion/GlassGlow';

/** Ícones (sem emoji — leitor de tela lia "coração vermelho" e a linguagem do app é ícone). */
export const TYPES = [
  { v: 'BLOOD_PRESSURE', l: 'Pressão arterial', u: 'mmHg', dual: true, color: '#dc2626', icon: <MonitorHeartIcon sx={{ fontSize: 16 }} /> },
  { v: 'WEIGHT', l: 'Peso', u: 'kg', color: '#20b2aa', icon: <MonitorWeightIcon sx={{ fontSize: 16 }} /> },
  // Altura infantil (curvas de crescimento OMS na Evolução) — medição comum, unidade cm.
  { v: 'HEIGHT', l: 'Altura', u: 'cm', color: '#0f766e', icon: <HeightIcon sx={{ fontSize: 16 }} /> },
  { v: 'GLUCOSE', l: 'Glicose', u: 'mg/dL', color: '#c2410c', icon: <WaterDropIcon sx={{ fontSize: 16 }} /> },
  { v: 'HEART_RATE', l: 'Freq. cardíaca', u: 'bpm', color: '#ef4444', icon: <FavoriteIcon sx={{ fontSize: 16 }} /> },
  // Atividade (Health Connect): sincronizada do celular — leitura, não entra pelo form manual.
  { v: 'STEPS', l: 'Passos', u: 'passos', color: '#0369a1', icon: <DirectionsWalkIcon sx={{ fontSize: 16 }} />, synced: true },
  { v: 'CALORIES', l: 'Calorias', u: 'kcal', color: '#9a3412', icon: <LocalFireDepartmentIcon sx={{ fontSize: 16 }} />, synced: true },
  { v: 'DISTANCE', l: 'Distância', u: 'km', color: '#047857', icon: <RouteIcon sx={{ fontSize: 16 }} />, synced: true },
  { v: 'EXERCISE_MINUTES', l: 'Exercício', u: 'min', color: '#6d28d9', icon: <TimerIcon sx={{ fontSize: 16 }} />, synced: true },
  { v: 'SLEEP_MINUTES', l: 'Sono', u: 'min', color: '#1e3a8a', icon: <BedtimeIcon sx={{ fontSize: 16 }} />, synced: true },
  { v: 'OTHER', l: 'Outro', u: '', color: '#64748b', icon: <PushPinIcon sx={{ fontSize: 16 }} /> },
];
/** Tiles da central de sinais (peso tem card próprio; OTHER segue só no form/histórico). */
const TILE_TYPES = TYPES.filter((t) => t.v !== 'WEIGHT' && t.v !== 'OTHER');

export const MeasurementsPage = () => {
  useReuiThemeSync();
  const translate = useTranslate();
  const notify = useNotify();
  const navigate = useNavigate();
  const [pid] = useSelectedPatient();
  const [items, setItems] = useState<any[]>([]);
  const [type, setType] = useState('WEIGHT');
  const [value, setValue] = useState('');
  const [value2, setValue2] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [open, setOpen] = useState(false); // formulário colapsável (usuário não quer preencher nada por padrão)
  const formRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    if (!pid) return;
    // take=200: o HC grava 3-4 rows/dia — o default curto truncava o histórico das médias.
    const r = await fetch(`${API_URL}/measurements?patientId=${pid}&take=200`, { headers: { Authorization: `Bearer ${token()}` } });
    if (r.ok) setItems(await r.json());
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [pid]);

  // Atalho "registrar X" = 1 clique: pré-seleciona o tipo, abre o form E rola até ele
  // (antes o form abria lá embaixo sem sinal — parecia que o botão não tinha feito nada).
  const openForm = (typeKey: string) => {
    setType(typeKey);
    setValue(''); setValue2('');
    setOpen(true);
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  };

  const add = async () => {
    if (!value || !date) return;
    const t = TYPES.find((x) => x.v === type)!;
    const r = await fetch(`${API_URL}/measurements`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ patientId: pid, type, value: Number(value), valueSecondary: t.dual && value2 ? Number(value2) : null, unit: t.u, measuredAt: date }),
    });
    if (r.ok) { notify(`${t.l} registrada ✓`, { type: 'success' }); setValue(''); setValue2(''); load(); }
    else { const e = await r.json().catch(() => ({})); notify(e.error || 'Erro ao registrar', { type: 'error' }); }
  };
  // Dado de saúde (LGPD): exclusão SEMPRE confirmada — 1 toque acidental não apaga histórico.
  const del = async (id: string) => {
    if (!(await confirmDialog({ title: 'Excluir medição', message: 'Apagar esta medição do histórico?', confirmLabel: 'Excluir' }))) return;
    await fetch(`${API_URL}/measurements/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } });
    load();
  };

  const fmtDate = (d: string) => new Date(d).toLocaleDateString('pt-BR');
  const fmtVal = (m: any) => m.valueSecondary != null ? `${m.value}/${m.valueSecondary}` : `${m.value}`;

  // Separa PESO (com tendência) das demais medições — antes tudo numa lista linear misturado.
  const sorted = [...items].sort((a, b) => new Date(b.measuredAt).getTime() - new Date(a.measuredAt).getTime());
  const weights = sorted.filter((m) => m.type === 'WEIGHT');
  const latestWeight = weights[0];
  const prevWeight = weights[1];

  // ── CENTRAL DE SINAIS: consolidação por métrica (dedup por DIA — o Health Connect grava
  // 3-4 rows/dia e a lista crua repetia "Passos/Calorias/Distância" como log de banco de
  // dados). Cada tile mostra último valor + média 7d + sparkline; o histórico completo
  // (gráfico, stats, lista diária e exclusões) mora em /medicoes/historico/:type.
  const byType = useMemo(() => {
    const perType = new Map<string, Map<string, any>>(); // type → dia(YYYY-MM-DD) → row mais recente
    for (const m of sorted) {
      const key = String(m.measuredAt).slice(0, 10);
      const per = perType.get(m.type) ?? new Map<string, any>();
      if (!per.has(key)) per.set(key, m); // sorted desc → 1º visto = mais recente do dia
      perType.set(m.type, per);
    }
    const out = new Map<string, { latest: any; avg7: number | null; series7: { value: number; date: string }[] }>();
    for (const [t, per] of perType) {
      const series = [...per.entries()]
        .map(([date, m]) => ({ date, value: Number(m.value), row: m }))
        .sort((a, b) => (a.date < b.date ? -1 : 1));
      const last7 = series.slice(-7);
      out.set(t, {
        latest: last7.length ? last7[last7.length - 1].row : null,
        avg7: last7.length ? last7.reduce((s, e) => s + e.value, 0) / last7.length : null,
        series7: last7.map((e) => ({ value: e.value, date: e.date })),
      });
    }
    return out;
  }, [items]);

  const fmtAvg = (n: number, unit: string) => unit === 'km' ? n.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : Math.round(n).toLocaleString('pt-BR');
  const tileSub = (t: (typeof TYPES)[number], d?: { latest: any; avg7: number | null }) => {
    if (!d?.latest) return 'Nenhum registro';
    if (t.v === 'STEPS') {
      const pct = Math.min(100, Math.round((Number(d.latest.value) / STEPS_GOAL) * 100));
      return `${pct}% da meta · média 7d ${fmtAvg(d.avg7 ?? 0, t.u)}`;
    }
    return d.avg7 != null ? `média 7d ${fmtAvg(d.avg7, t.u)}` : '';
  };

  // Minutos viram horas quando passam de 1 h (372 min de sono não diz nada; 6 h 12 min diz).
  const fmtTile = (t: (typeof TYPES)[number], m: any): { value: string; unit: string } => {
    const n = Number(m.value);
    if ((t.v === 'SLEEP_MINUTES' || t.v === 'EXERCISE_MINUTES') && Number.isFinite(n) && n >= 60) {
      const h = Math.floor(n / 60); const min = Math.round(n % 60);
      return { value: min ? `${h} h ${min}` : `${h}`, unit: min ? 'min' : 'h' };
    }
    if (t.v === 'STEPS' || t.v === 'CALORIES') return { value: Math.round(n).toLocaleString('pt-BR'), unit: t.u };
    if (t.v === 'DISTANCE') return { value: n.toLocaleString('pt-BR', { maximumFractionDigits: 2 }), unit: t.u };
    return { value: fmtVal(m), unit: t.u };
  };
  // De quando é o número: nada de "ao vivo" em dado de ontem.
  const todayKey = new Date().toLocaleDateString('sv-SE');
  const dayLabel = (m: any): string => {
    const d = new Date(m.measuredAt);
    const key = d.toLocaleDateString('sv-SE');
    if (key === todayKey) return 'hoje';
    const y = new Date(); y.setDate(y.getDate() - 1);
    if (key === y.toLocaleDateString('sv-SE')) return 'ontem';
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
  };

  // Resumo do dia (anel de passos + calorias, distância e exercício): os quatro saem da grade.
  const stepsData = byType.get('STEPS');
  const stepsRow = stepsData?.latest ?? null;
  const HERO_TYPES = ['STEPS', 'CALORIES', 'DISTANCE', 'EXERCISE_MINUTES'];
  const heroSide = TYPES.filter((t) => ['CALORIES', 'DISTANCE', 'EXERCISE_MINUTES'].includes(t.v) && !!byType.get(t.v)?.latest);
  const stepsPct = stepsRow ? Math.min(100, Math.round((Number(stepsRow.value) / STEPS_GOAL) * 100)) : 0;

  // Classificação Inteligente de UX: Métricas com dados vivos ficam no topo;
  // Métricas sem nenhum registro vão para a grade compacta de adição rápida.
  const activeTypes = TILE_TYPES.filter((t) => !!byType.get(t.v)?.latest && !(stepsRow && HERO_TYPES.includes(t.v)));
  const emptyTypes = TILE_TYPES.filter((t) => !byType.get(t.v)?.latest);
  const hasWeight = weights.length > 0;

  return (
    <PageContainer width="content" sx={{ pb: { xs: 10, sm: 5 } }}>
      <PageHeader icon={<PulseIcon className="size-6" />} title={translate('page.measurements')} />

      {/* SEÇÃO 1: PESO (se tiver dados, aparece em destaque) */}
      {hasWeight && (
        <div className="dx-island mb-5">
          <Frame>
            <FramePanel className="p-4 sm:p-5">
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                <Stack direction="row" alignItems="center" spacing={0.75}>
                  <MonitorWeightIcon sx={{ fontSize: 18, color: (t) => tealText(t.palette.mode) }} />
                  <Typography variant="h6" sx={{ fontWeight: 700, fontSize: 16 }}>Peso Corporal</Typography>
                </Stack>
                <ReuiBadge variant="primary-light" size="xs">Tendência</ReuiBadge>
              </Stack>
              <Stack direction="row" alignItems="center" spacing={1.5} useFlexGap flexWrap="wrap" sx={{ mb: 0.5 }}>
                <Stack direction="row" alignItems="baseline" spacing={0.5}>
                  <Typography sx={{ fontWeight: 800, fontSize: 32, color: (t) => tealText(t.palette.mode), lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{latestWeight.value}</Typography>
                  <Typography component="span" sx={{ fontSize: 14, color: 'text.secondary', fontWeight: 600 }}>kg</Typography>
                </Stack>
                {prevWeight && Number(latestWeight.value) !== Number(prevWeight.value) && (() => {
                  const up = Number(latestWeight.value) > Number(prevWeight.value);
                  const diff = Math.abs(Number(latestWeight.value) - Number(prevWeight.value)).toLocaleString('pt-BR');
                  return (
                    <ReuiBadge variant={up ? 'warning-light' : 'success-light'} size="sm">
                      {up ? '↑' : '↓'} {diff} kg
                    </ReuiBadge>
                  );
                })()}
                <Sparkline points={[...weights].reverse().slice(-10).map((m) => ({ value: Number(m.value), date: m.measuredAt }))} width={110} height={34} color="#20b2aa" />
              </Stack>
              <Typography variant="caption" color="text.secondary">Última medição em {fmtDate(latestWeight.measuredAt)}</Typography>
              {weights.length > 1 && (
                <Stack spacing={0.5} sx={{ mt: 1.5, pt: 1.5, borderTop: '1px dashed', borderColor: 'divider' }}>
                  {weights.slice(1, 4).map((m) => (
                    <Stack key={m.id} direction="row" justifyContent="space-between" alignItems="center">
                      <Typography variant="body2" color="text.secondary">{fmtDate(m.measuredAt)}</Typography>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Typography sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{m.value} kg</Typography>
                        <IconButton size="small" onClick={() => del(m.id)} sx={{ p: 0.5 }}><DeleteIcon fontSize="small" /></IconButton>
                      </Stack>
                    </Stack>
                  ))}
                </Stack>
              )}
            </FramePanel>
          </Frame>
        </div>
      )}

      {/* RESUMO DO DIA: anel de passos até a meta + o que mais o relógio mandou */}
      {stepsRow && (
        <div className="dx-island mb-5 [&_button]:font-[inherit]">
          <Frame>
            <FramePanel className="dx-glass flex flex-wrap items-center justify-center gap-x-6 gap-y-4 p-4 sm:p-5">
              <GlassGlow />
              <button
                type="button"
                onClick={() => navigate('/medicoes/historico/STEPS')}
                aria-label={`Passos de ${dayLabel(stepsRow)}: ${Math.round(Number(stepsRow.value)).toLocaleString('pt-BR')} de ${STEPS_GOAL.toLocaleString('pt-BR')}. Abrir histórico.`}
                className="cursor-pointer appearance-none rounded-full border-0 bg-transparent p-0 transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.98] motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
              >
                <RingGauge size={156} thickness={14} segments={[{ fraction: stepsPct / 100, className: 'stroke-primary' }]}>
                  <DirectionsWalkIcon aria-hidden="true" sx={{ fontSize: 18, color: (t) => tealText(t.palette.mode), mb: 0.25 }} />
                  <CountUp value={Number(stepsRow.value)} format={(v) => Math.round(v).toLocaleString('pt-BR')} className="text-3xl leading-none font-semibold tracking-tight text-foreground tabular-nums" />
                  <span className="mt-1 text-xs text-muted-foreground">de {STEPS_GOAL.toLocaleString('pt-BR')} passos</span>
                </RingGauge>
              </button>
              <div className="flex min-w-0 flex-1 basis-44 flex-col gap-3">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-muted-foreground">Passos de {dayLabel(stepsRow)}</span>
                  <span className="text-lg leading-snug font-semibold text-foreground">
                    {stepsPct >= 100 ? 'Meta do dia batida' : `${stepsPct}% da meta do dia`}
                  </span>
                  {stepsData?.avg7 != null ? <span className="text-xs text-muted-foreground tabular-nums">média de 7 dias: {fmtAvg(stepsData.avg7, 'passos')}</span> : null}
                </div>
                {heroSide.length > 0 ? (
                  <ul className="m-0 grid list-none grid-cols-3 gap-2 p-0">
                    {heroSide.map((t) => {
                      const row = byType.get(t.v)!.latest;
                      const f = fmtTile(t, row);
                      return (
                        <li key={t.v} className="min-w-0">
                          <button
                            type="button"
                            onClick={() => navigate(`/medicoes/historico/${t.v}`)}
                            aria-label={`${t.l} de ${dayLabel(row)}: ${f.value} ${f.unit}. Abrir histórico.`}
                            className="flex min-h-16 w-full min-w-0 cursor-pointer appearance-none flex-col items-start gap-1 rounded-lg border border-border bg-muted/40 px-2.5 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                          >
                            <span aria-hidden="true" className="inline-flex" style={{ color: t.color }}>{t.icon}</span>
                            <span className="flex min-w-0 max-w-full flex-wrap items-baseline gap-x-1 gap-y-0.5">
                              <span className="text-sm leading-none font-semibold whitespace-nowrap text-foreground tabular-nums">{f.value}</span>
                              <span className="shrink-0 text-xs text-muted-foreground">{f.unit}</span>
                            </span>
                            <span className="max-w-full truncate text-xs text-muted-foreground">{t.l}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </div>
            </FramePanel>
          </Frame>
        </div>
      )}

      {/* SEÇÃO 2: MÉTRICAS ATIVAS COM DADOS (HEALTH CONNECT & SENSORES — ReUI card-29 + chart-15) */}
      {activeTypes.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography
            sx={{
              fontSize: 12.5,
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: 'text.secondary',
              display: 'flex',
              alignItems: 'center',
              gap: 0.75,
              mb: 1.5,
            }}
          >
            <Box component="span" sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#10b981' }} />
            Seus sinais
          </Typography>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' }, gap: 1.5 }}>
            {activeTypes.map((t) => {
              const d = byType.get(t.v);
              return (
                <AppCard
                  key={t.v}
                  kind="interactive"
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/medicoes/historico/${t.v}`)}
                  sx={{
                    p: 2,
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 0.75,
                    borderRadius: '16px',
                    boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
                    transition: `transform 160ms cubic-bezier(0.22,1,0.36,1), border-color 160ms cubic-bezier(0.22,1,0.36,1)`,
                    '&:active': { transform: 'scale(0.98)' },
                    // elevação só onde existe ponteiro de verdade (no toque o hover fica preso)
                    '@media (hover: hover) and (pointer: fine)': { '&:hover': { transform: 'translateY(-2px)', borderColor: '#0d9488' } },
                    '@media (prefers-reduced-motion: reduce)': { transition: 'border-color 160ms', '&:active': { transform: 'none' }, '&:hover': { transform: 'none' } },
                  }}
                >
                  <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ minWidth: 0 }}>
                    <Stack direction="row" alignItems="center" spacing={0.75} sx={{ minWidth: 0 }}>
                      <Box aria-hidden="true" sx={{ display: 'inline-flex', color: t.color, flexShrink: 0 }}>{t.icon}</Box>
                      <Typography sx={{ fontSize: 13, fontWeight: 700, color: 'text.primary', lineHeight: 1.25 }}>{t.l}</Typography>
                    </Stack>
                  </Stack>

                  <Typography noWrap sx={{ fontFamily: '"Poppins",sans-serif', fontWeight: 800, fontSize: { xs: 22, sm: 26 }, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums', my: 0.5 }}>
                    {fmtTile(t, d!.latest).value}<Typography component="span" sx={{ fontSize: 13, color: 'text.secondary', fontWeight: 600 }}> {fmtTile(t, d!.latest).unit}</Typography>
                  </Typography>

                  <Typography sx={{ fontSize: 12, color: 'text.secondary', minHeight: 14 }}>{[dayLabel(d!.latest), tileSub(t, d)].filter(Boolean).join(' · ')}</Typography>

                  <Box sx={{ mt: 'auto', minHeight: 32, display: 'flex', alignItems: 'flex-end', pt: 0.5 }}>
                    {d && d.series7.length >= 2 && <Sparkline points={d.series7} width={118} height={30} color={t.color} />}
                  </Box>
                </AppCard>
              );
            })}
          </Box>
        </Box>
      )}

      {/* SEÇÃO 3: OUTRAS MEDIÇÕES (SEM DADOS ATUAIS - GRADE COMPACTA DE ADIÇÃO) */}
      <Box sx={{ mb: 3 }}>
        <Typography
          sx={{
            fontSize: 12.5,
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'text.secondary',
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
            mb: 1.5,
          }}
        >
          <span>➕</span> Adicionar outras medições
        </Typography>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' }, gap: 1.25 }}>
          {/* Se Peso estiver sem dados, entra aqui como tile compacto */}
          {!hasWeight && (
            <Card
              variant="outlined"
              onClick={() => openForm('WEIGHT')}
              sx={{
                p: 1.5,
                borderRadius: '12px',
                borderStyle: 'dashed',
                borderColor: 'divider',
                bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : '#f8fafc',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                minHeight: 85,
                transition: `background-color 160ms cubic-bezier(0.22,1,0.36,1), border-color 160ms cubic-bezier(0.22,1,0.36,1)`,
                '&:hover': { bgcolor: 'action.hover', borderColor: '#0d9488' },
              }}
            >
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                <Stack direction="row" spacing={0.5} alignItems="center">
                  <MonitorWeightIcon sx={{ fontSize: 16, color: (t) => tealText(t.palette.mode) }} />
                  <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: 'text.primary' }}>Peso</Typography>
                </Stack>
                <Chip size="small" label="+ Adicionar" sx={{ height: 24, flexShrink: 0, fontSize: 12, fontWeight: 700, bgcolor: 'background.paper', color: '#0f766e', border: '1px solid rgba(15,118,110,0.3)' }} />
              </Stack>
              <Typography variant="caption" sx={{ color: 'text.disabled' }}>Último: não informado</Typography>
            </Card>
          )}

          {emptyTypes.map((t) => (
            <Card
              key={t.v}
              variant="outlined"
              onClick={() => openForm(t.v)}
              sx={{
                p: 1.5,
                borderRadius: '12px',
                borderStyle: 'dashed',
                borderColor: 'divider',
                bgcolor: (tTheme) => tTheme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : '#f8fafc',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                minHeight: 85,
                transition: `background-color 160ms cubic-bezier(0.22,1,0.36,1), border-color 160ms cubic-bezier(0.22,1,0.36,1)`,
                '&:hover': { bgcolor: 'action.hover', borderColor: '#0d9488' },
              }}
            >
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                <Stack direction="row" spacing={0.5} alignItems="center">
                  <Box sx={{ color: t.color, display: 'inline-flex' }}>{t.icon}</Box>
                  <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: 'text.primary' }}>{t.l}</Typography>
                </Stack>
                <Chip size="small" label={t.synced ? '+ Conectar' : '+ Adicionar'} sx={{ height: 24, flexShrink: 0, fontSize: 12, fontWeight: 700, bgcolor: 'background.paper', color: '#0f766e', border: '1px solid rgba(15,118,110,0.3)' }} />
              </Stack>
              <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                {t.synced ? 'Via Health Connect' : 'Último: não informado'}
              </Typography>
            </Card>
          ))}
        </Box>
      </Box>

      {/* COMPOSIÇÃO CORPORAL — entrada da bioimpedância (tela própria em /composicao). */}
      <AppCard
        kind="interactive"
        role="button"
        tabIndex={0}
        onClick={() => navigate('/composicao')}
        onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('/composicao'); } }}
        aria-label="Abrir composição corporal (bioimpedância)"
        sx={{ mb: 2, p: 2, display: 'flex', alignItems: 'center', gap: 1.5, '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 } }}
      >
        <Box aria-hidden="true" sx={{ width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'rgba(32,178,170,.12)', color: (t) => tealText(t.palette.mode), flexShrink: 0 }}>
          <AccessibilityNewIcon />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700 }}>Composição corporal</Typography>
          <Typography variant="caption" color="text.secondary">Gordura, músculo e água da sua bioimpedância</Typography>
        </Box>
      </AppCard>

      {/* SAÚDE MENTAL — entrada do PHQ-9/GAD-7 (recurso gratuito, 2 min). Card aqui na
          Medições (SEM item de menu/tile novo — decisão de produto). */}
      <AppCard
        kind="interactive"
        role="button"
        tabIndex={0}
        onClick={() => navigate('/saude-mental')}
        onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('/saude-mental'); } }}
        aria-label="Abrir rastreamento de saúde mental (PHQ-9 e GAD-7)"
        sx={{ mb: 2, p: 2, display: 'flex', alignItems: 'center', gap: 1.5, '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 } }}
      >
        <Box aria-hidden="true" sx={{ width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'rgba(32,178,170,.12)', color: (t) => tealText(t.palette.mode), flexShrink: 0 }}>
          <PsychologyIcon />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700 }}>Saúde mental</Typography>
          <Typography variant="caption" color="text.secondary">Questionários validados de depressão e ansiedade · 2 min</Typography>
        </Box>
        <Chip size="small" label="Grátis" sx={{ height: 22, fontWeight: 700, bgcolor: 'rgba(32,178,170,.12)', color: (t) => tealText(t.palette.mode) }} />
      </AppCard>

      {/* REGISTRAR — por último (dado em cima, ferramenta embaixo; colapsado por padrão).
          Enter salva (mobile: tecladoDone = salvar, sem caçar o botão). */}
      <Card sx={{ mt: 2 }} ref={formRef}>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="h6">Nova medição</Typography>
            <Button size="small" onClick={() => setOpen((o) => !o)} endIcon={<ExpandMoreIcon sx={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />}>{open ? 'Fechar' : 'Registrar'}</Button>
          </Stack>
          <Collapse in={open}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 2 }} alignItems={{ xs: 'stretch', sm: 'center' }} onKeyDown={(e) => { if (e.key === 'Enter' && value) add(); }}>
              <FormControl size="small" sx={{ minWidth: 180 }}>
                <InputLabel>Tipo</InputLabel>
                <Select label="Tipo" value={type} onChange={(e) => setType(e.target.value)}>
                  {TYPES.map((t) => <MenuItem key={t.v} value={t.v}>{t.l}</MenuItem>)}
                </Select>
              </FormControl>
              {TYPES.find((t) => t.v === type)?.dual ? (
                <>
                  <TextField size="small" label="Sistólica" type="number" value={value} onChange={(e) => setValue(e.target.value)} sx={{ width: { xs: '100%', sm: 110 } }} />
                  <TextField size="small" label="Diastólica" type="number" value={value2} onChange={(e) => setValue2(e.target.value)} sx={{ width: { xs: '100%', sm: 110 } }} />
                </>
              ) : (
                <TextField size="small" label="Valor" type="number" value={value} onChange={(e) => setValue(e.target.value)} sx={{ width: { xs: '100%', sm: 130 } }} />
              )}
              <TextField size="small" type="date" label="Data" value={date} onChange={(e) => setDate(e.target.value)} InputLabelProps={{ shrink: true }} sx={{ width: { xs: '100%', sm: 160 } }} />
              <Button variant="contained" onClick={add} disabled={!value} sx={{ alignSelf: { xs: 'stretch', sm: 'center' } }}>Adicionar</Button>
            </Stack>
          </Collapse>
        </CardContent>
      </Card>
    </PageContainer>
  );
};
