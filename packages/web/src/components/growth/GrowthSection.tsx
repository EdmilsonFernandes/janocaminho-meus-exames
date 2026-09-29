/**
 * Crescimento infantil (percentis OMS) — seção da página Evolução.
 *
 * Visível SOMENTE para perfis criança (< 19 anos) com data de nascimento e
 * gênero no perfil. Registra peso/altura como medições comuns (endpoint
 * /measurements — tipos WEIGHT/HEIGHT), lê as curvas percentílicas OMS via
 * `utils/growth.ts` e desenha faixas 3/15/50/85/97 com o ponto da criança em teal.
 *
 * AVISO EDUCATIVO obrigatório: a curva serve para acompanhamento — quem
 * interpreta é o pediatra (alinhado ao limite LGPD/ANVISA do app: educa, não diagnostica).
 */
import { useEffect, useMemo, useState } from 'react';
import { useNotify } from 'react-admin';
import {
  Box, Button, Card, CardContent, Chip, Stack, TextField, Typography,
} from '@mui/material';
import ChildCareIcon from '@mui/icons-material/ChildCare';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import AddIcon from '@mui/icons-material/Add';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from 'recharts';
import { API_URL, token } from '../../config';
import { useSelectedPatient } from '../../patient-context';
import {
  PERCENTILE_ZS, ageInDays, buildChartGrid, formatAgePt, zForValue, growthDelta,
  type GrowthIndicator,
} from '../../utils/growth';
import { WhatIsThis } from '../WhatIsThis';
import type { Sex } from '../../utils/growthData';
import { tealText } from '../../theme';

type MRow = { id: string; value: number; measuredAt: string };
type ChartRow = {
  m: number;
  p3?: number; p15?: number; p50?: number; p85?: number; p97?: number;
  v?: number; pct?: number; date?: string;
};

const INDICATORS: { key: GrowthIndicator; label: string; unit: string }[] = [
  { key: 'wfa', label: 'Peso', unit: 'kg' },
  { key: 'lhfa', label: 'Altura', unit: 'cm' },
  { key: 'bfa', label: 'IMC', unit: '' },
];
const DAYS_PER_MONTH = 30.4375;
/** Floor visual 12px (audit D2) — nada abaixo disso nesta seção. */
const fmt = (n: number, d = 1) => n.toLocaleString('pt-BR', { maximumFractionDigits: d, minimumFractionDigits: d });
const parseDecimal = (s: string) => Number(String(s).trim().replace(',', '.'));
const dayKey = (iso: string) => iso.slice(0, 10);

export const GrowthSection = () => {
  const notify = useNotify();
  const [pid] = useSelectedPatient();
  const [dob, setDob] = useState<string | null>(null);
  const [sex, setSex] = useState<Sex | null>(null);
  const [loadErr, setLoadErr] = useState(false);
  const [weights, setWeights] = useState<MRow[]>([]);
  const [heights, setHeights] = useState<MRow[]>([]);
  const [indicator, setIndicator] = useState<GrowthIndicator>('wfa');
  const [chart, setChart] = useState<ChartRow[] | null>(null);
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), kg: '', cm: '' });
  const [saving, setSaving] = useState(false);

  const ageDaysNow = useMemo(() => (dob ? ageInDays(dob) : NaN), [dob]);
  const isChild = Number.isFinite(ageDaysNow) && ageDaysNow >= 0 && ageDaysNow < 19 * 365.25;

  const load = async () => {
    if (!pid) return;
    setLoadErr(false);
    const h = { Authorization: `Bearer ${token()}` };
    try {
      const pr = await fetch(`${API_URL}/patients/${pid}`, { headers: h });
      // fetch-cache devolve 200-VAZIO com X-Offline-Empty quando offline sem cache.
      if (pr.headers.get('X-Offline-Empty') === 'true') throw new Error('offline');
      if (!pr.ok) throw new Error(String(pr.status));
      const p = await pr.json();
      setDob(p.dateOfBirth ? String(p.dateOfBirth).slice(0, 10) : null);
      setSex(p.gender === 'male' || p.gender === 'female' ? p.gender : null);
      const [wr, hr] = await Promise.all([
        fetch(`${API_URL}/measurements?patientId=${pid}&type=WEIGHT&take=200`, { headers: h }),
        fetch(`${API_URL}/measurements?patientId=${pid}&type=HEIGHT&take=200`, { headers: h }),
      ]);
      if (wr.headers.get('X-Offline-Empty') === 'true' || hr.headers.get('X-Offline-Empty') === 'true') throw new Error('offline');
      const w = wr.ok ? await wr.json() : [];
      const ht = hr.ok ? await hr.json() : [];
      setWeights(Array.isArray(w) ? w : []);
      setHeights(Array.isArray(ht) ? ht : []);
    } catch {
      setLoadErr(true);
    }
  };
  useEffect(() => { setDob(null); setSex(null); setChart(null); load(); /* eslint-disable-line */ }, [pid]);

  // Pontos da criança por indicador (idade em meses + z-score/percentil calculados).
  const points = useMemo(() => {
    if (!dob || !sex) return null;
    const mk = (rows: MRow[]) => rows
      .filter((r) => r.value > 0)
      .map((r) => ({ date: dayKey(r.measuredAt), ageDays: ageInDays(dob, dayKey(r.measuredAt)), value: r.value }))
      .filter((p) => p.ageDays >= 0);
    const byDayHeight = new Map(mk(heights).map((p) => [p.date, p]));
    const wpts = mk(weights);
    const hpts = mk(heights);
    const bpts = wpts
      .filter((w) => byDayHeight.has(w.date))
      .map((w) => {
        const h = byDayHeight.get(w.date)!;
        return { date: w.date, ageDays: w.ageDays, value: w.value / Math.pow(h.value / 100, 2) };
      });
    return { wfa: wpts, lhfa: hpts, bfa: bpts };
  }, [dob, sex, weights, heights]);

  const activeUnit = INDICATORS.find((i) => i.key === indicator)!.unit;

  // Grade do gráfico: faixas OMS ∪ meses das medições (janela em volta dos dados).
  useEffect(() => {
    let alive = true;
    (async () => {
      setChart(null);
      if (!sex || !points) return;
      const pts = points[indicator];
      const nowM = Number.isFinite(ageDaysNow) ? ageDaysNow / DAYS_PER_MONTH : 12;
      const minM = Math.max(0, Math.floor(Math.min(nowM, ...pts.map((p) => p.ageDays / DAYS_PER_MONTH), nowM) - 3));
      const maxM = Math.ceil(Math.max(nowM, ...pts.map((p) => p.ageDays / DAYS_PER_MONTH), 12) + 4);
      const grid = await buildChartGrid(indicator, sex, minM * DAYS_PER_MONTH, maxM * DAYS_PER_MONTH, pts.map((p) => p.ageDays / DAYS_PER_MONTH));
      // Peso-para-idade termina aos 10a (OMS): deixa de existir → cai p/ Altura.
      if (grid.length === 0 && indicator === 'wfa') { if (alive) setIndicator('lhfa'); return; }
      // z-score + percentil por ponto (fora da grade vira null — ok).
      const withZ = await Promise.all(pts.map(async (p) => {
        const z = await zForValue(indicator, sex, p.ageDays, p.value);
        return { m: Number((p.ageDays / DAYS_PER_MONTH).toFixed(2)), v: p.value, pct: z?.percentile ?? undefined, date: p.date };
      }));
      if (!alive) return;
      const byM = new Map(withZ.map((r) => [r.m, r]));
      setChart(grid.map((g) => (byM.has(g.m) ? { ...g, ...byM.get(g.m)! } : g)));
    })();
    return () => { alive = false; };
    /* eslint-disable-line */
  }, [indicator, sex, points, ageDaysNow]);

  const submit = async () => {
    if (!pid) return;
    const kg = form.kg ? parseDecimal(form.kg) : NaN;
    const cm = form.cm ? parseDecimal(form.cm) : NaN;
    if (!form.date || (!Number.isFinite(kg) && !Number.isFinite(cm))) { notify('Informe peso e/ou altura.', { type: 'error' }); return; }
    if (Number.isFinite(kg) && (kg < 0.5 || kg > 150)) { notify('Peso inválido (0,5 a 150 kg).', { type: 'error' }); return; }
    if (Number.isFinite(cm) && (cm < 30 || cm > 220)) { notify('Altura inválida (30 a 220 cm).', { type: 'error' }); return; }
    if (dob && ageInDays(dob, form.date) < 0) { notify('Data anterior ao nascimento.', { type: 'error' }); return; }
    setSaving(true);
    try {
      const posts: Promise<Response>[] = [];
      if (Number.isFinite(kg)) posts.push(fetch(`${API_URL}/measurements`, { method: 'POST', headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ patientId: pid, type: 'WEIGHT', value: kg, unit: 'kg', measuredAt: form.date }) }));
      if (Number.isFinite(cm)) posts.push(fetch(`${API_URL}/measurements`, { method: 'POST', headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ patientId: pid, type: 'HEIGHT', value: cm, unit: 'cm', measuredAt: form.date }) }));
      const rs = await Promise.all(posts);
      if (rs.some((r) => !r.ok)) throw new Error('fail');
      notify('Medição registrada!', { type: 'success' });
      setForm({ date: new Date().toISOString().slice(0, 10), kg: '', cm: '' });
      await load();
    } catch {
      notify('Não foi possível registrar. Tente novamente.', { type: 'error' });
    } finally { setSaving(false); }
  };

  // Últimos registros (mescla peso+altura por dia, desc).
  const latest = useMemo(() => {
    if (!points) return [];
    const days = new Map<string, { date: string; kg?: number; cm?: number }>();
    for (const p of points.wfa) days.set(p.date, { ...days.get(p.date), date: p.date, kg: p.value });
    for (const p of points.lhfa) days.set(p.date, { ...days.get(p.date), date: p.date, cm: p.value });
    return [...days.values()].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 5);
  }, [points]);

  // Bônus G4 — delta "cresceu X cm e Y kg desde <mês/ano>" (1º vs último registro).
  const delta = useMemo(
    () => growthDelta(points?.wfa ?? [], points?.lhfa ?? []),
    [points],
  );

  // Sem perfil criança (ou perfil não carregável — offline sem cache) → não renderiza
  // NADA: seção exclusiva de crianças. Erro silencioso: o banner global de offline
  // já avisa, e um card "indisponível" na Evolução de um adulto seria ruído.
  if (loadErr || !dob || !isChild) return null;

  return (
    <Card variant="outlined" sx={{
      mb: 2, borderRadius: '20px', borderColor: 'divider', overflow: 'hidden',
      background: (t) => t.palette.mode === 'dark'
        ? `radial-gradient(ellipse at 20% 30%, rgba(32,178,170,.10), transparent 55%), ${t.palette.background.paper}`
        : `radial-gradient(ellipse at 20% 30%, rgba(32,178,170,.06), transparent 55%), #ffffff`,
    }}>
      <CardContent sx={{ py: 1.75, '&:last-child': { pb: 1.75 } }}>
        {!sex ? (
          <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap' }}>
            <ChildCareIcon sx={{ fontSize: 18, color: (t) => tealText(t.palette.mode) }} />
            <Typography sx={{ fontSize: 13 }}>
              Curvas de crescimento (OMS) disponíveis para crianças — complete o <strong>gênero</strong> e a <strong>data de nascimento</strong> no Perfil.
            </Typography>
          </Stack>
        ) : (
          <>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
              <ChildCareIcon sx={{ fontSize: 18, color: (t) => tealText(t.palette.mode) }} />
              <Typography component="h2" sx={{ fontWeight: 800, fontSize: 14, fontFamily: '"Poppins",sans-serif' }}>
                Crescimento · {formatAgePt(ageDaysNow)}
              </Typography>
              <Stack direction="row" spacing={0.25} alignItems="center" sx={{ ml: 'auto' }}>
                <Typography sx={{ fontSize: 12, color: 'text.secondary', textAlign: 'right' }}>
                  Percentis OMS (0-19 anos)
                </Typography>
                {/* G4 — explainer "O que é isso?" (o que significam os percentis) */}
                <WhatIsThis topic="percentis" />
              </Stack>
            </Stack>

            {/* Seletor de indicador */}
            <Stack direction="row" spacing={0.75} sx={{ mb: 1 }} useFlexGap flexWrap="wrap">
              {INDICATORS.map((ind) => {
                const disabled = ind.key === 'bfa' && (points?.bfa.length ?? 0) === 0;
                const on = indicator === ind.key;
                return (
                  <Chip
                    key={ind.key}
                    label={ind.label}
                    disabled={disabled}
                    onClick={() => setIndicator(ind.key)}
                    aria-pressed={on}
                    title={disabled ? 'Registre peso e altura no mesmo dia para calcular o IMC' : undefined}
                    sx={{
                      borderRadius: '999px', fontWeight: 700, minHeight: 32,
                      fontSize: 12,
                      bgcolor: on ? 'rgba(32,178,170,0.14)' : 'transparent',
                      color: on ? '#0f766e' : 'text.secondary',
                      border: `1px solid ${on ? 'rgba(32,178,170,0.5)' : 'rgba(148,163,184,0.35)'}`,
                      '&.Mui-disabled': { opacity: 0.45 },
                    }}
                  />
                );
              })}
            </Stack>

            {/* Gráfico: faixas percentílicas OMS + pontos da criança (teal) */}
            <Box sx={{ height: 230, width: '100%' }} role="img"
              aria-label={`Curva de ${INDICATORS.find((i) => i.key === indicator)!.label}-para-idade com percentis da OMS e medições da criança`}>
              {chart == null ? (
                <Typography sx={{ fontSize: 12, color: 'text.secondary', pt: 8, textAlign: 'center' }}>Carregando curvas…</Typography>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chart} margin={{ top: 8, right: 10, bottom: 4, left: -8 }}>
                    <XAxis dataKey="m" type="number" domain={['dataMin', 'dataMax']} tick={{ fontSize: 12 }}
                      tickFormatter={(m: number) => (m < 24 ? (m % 6 === 0 ? `${m}m` : '') : (m % 12 === 0 ? `${Math.round(m / 12)}a` : ''))}
                      stroke="rgba(148,163,184,.6)" />
                    <YAxis tick={{ fontSize: 12 }} stroke="rgba(148,163,184,.6)" width={40}
                      domain={[(dataMin: number) => Math.floor(dataMin * 0.97), (dataMax: number) => Math.ceil(dataMax * 1.03)]} />
                    <Tooltip
                      cursor={{ stroke: '#20b2aa', strokeWidth: 1, strokeDasharray: '4 3' }}
                      isAnimationActive={false}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload as ChartRow;
                        return (
                          <Box sx={{ bgcolor: 'background.paper', border: '1px solid rgba(32,178,170,.5)', borderRadius: '10px', px: 1.25, py: 0.75, boxShadow: 2 }}>
                            <Typography sx={{ fontWeight: 800, fontSize: 12 }}>{formatAgePt(d.m * DAYS_PER_MONTH)}</Typography>
                            {d.v != null && (
                              <Typography sx={{ fontWeight: 800, fontSize: 13, color: '#0f766e' }}>
                                {fmt(d.v, indicator === 'wfa' ? 1 : indicator === 'lhfa' ? 1 : 1)}{activeUnit && ` ${activeUnit}`}
                                {d.pct != null && ` · P${Math.round(d.pct)}`}
                              </Typography>
                            )}
                            <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
                              Faixa: P3 {fmt(d.p3 ?? NaN)} · P50 {fmt(d.p50 ?? NaN)} · P97 {fmt(d.p97 ?? NaN)}{activeUnit && ` ${activeUnit}`}
                            </Typography>
                          </Box>
                        );
                      }}
                    />
                    {PERCENTILE_ZS.map((p) => (
                      <Line
                        key={p.key}
                        type="monotone"
                        dataKey={p.key}
                        stroke={p.key === 'p50' ? '#64748b' : '#94a3b8'}
                        strokeWidth={p.key === 'p50' ? 1.6 : 1}
                        strokeDasharray={p.key === 'p50' ? '6 3' : '2 4'}
                        dot={false}
                        activeDot={false}
                        isAnimationActive={false}
                        connectNulls
                      />
                    ))}
                    <Line
                      type="monotone" dataKey="v"
                      stroke="#20b2aa" strokeWidth={2.6}
                      dot={{ r: 3.5, fill: '#20b2aa', strokeWidth: 0 }}
                      activeDot={{ r: 5.5, stroke: '#fff', strokeWidth: 2 }}
                      isAnimationActive={false}
                      connectNulls={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </Box>
            <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mt: 0.5 }} useFlexGap flexWrap="wrap">
              {PERCENTILE_ZS.map((p) => (
                <Stack key={p.key} direction="row" spacing={0.5} alignItems="center">
                  <Box aria-hidden="true" sx={{ width: 12, height: 2, bgcolor: p.key === 'p50' ? '#64748b' : '#94a3b8', borderRadius: 1 }} />
                  <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>P{p.label}</Typography>
                </Stack>
              ))}
              <Stack direction="row" spacing={0.5} alignItems="center" sx={{ ml: 'auto' }}>
                <Box aria-hidden="true" sx={{ width: 12, height: 3, bgcolor: '#20b2aa', borderRadius: 2 }} />
                <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>sua criança</Typography>
              </Stack>
            </Stack>

            {/* Bônus G4 — delta discreto desde o primeiro registro (só com 2+ medidas e ganho > 0) */}
            {delta && (
              <Typography sx={{ fontSize: 12, color: 'text.secondary', textAlign: 'center', mt: 0.25 }}>
                Cresceu <strong>{delta.parts}</strong> desde {delta.sinceLabel}.
              </Typography>
            )}

            {/* Mini-formulário: data + peso + altura */}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 1.5 }} useFlexGap>
              <TextField
                label="Data" type="date" size="small" value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                slotProps={{ inputLabel: { shrink: true } }}
                sx={{ minWidth: { sm: 150 }, '& input': { fontSize: 14 } }}
              />
              <TextField
                label="Peso (kg)" size="small" value={form.kg} inputMode="decimal" placeholder="12,3"
                onChange={(e) => setForm((f) => ({ ...f, kg: e.target.value }))}
                sx={{ flex: 1, '& input': { fontSize: 14 } }}
              />
              <TextField
                label="Altura (cm)" size="small" value={form.cm} inputMode="decimal" placeholder="87,5"
                onChange={(e) => setForm((f) => ({ ...f, cm: e.target.value }))}
                sx={{ flex: 1, '& input': { fontSize: 14 } }}
              />
              <Button
                variant="contained" disabled={saving} onClick={submit}
                startIcon={<AddIcon />} sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 700, minHeight: 40, px: 2.5 }}
              >
                {saving ? 'Salvando…' : 'Registrar'}
              </Button>
            </Stack>

            {/* Últimos registros */}
            {latest.length > 0 && (
              <Stack spacing={0.5} sx={{ mt: 1.25 }}>
                {latest.map((r) => {
                  const bmi = r.kg != null && r.cm != null ? r.kg / Math.pow(r.cm / 100, 2) : null;
                  return (
                    <Stack key={r.date} direction="row" spacing={1.5} alignItems="center" useFlexGap flexWrap="wrap"
                      sx={{ px: 1.25, py: 0.6, borderRadius: '12px', bgcolor: 'rgba(32,178,170,0.05)' }}>
                      <Typography sx={{ fontSize: 12, fontWeight: 700 }}>{new Date(`${r.date}T12:00:00`).toLocaleDateString('pt-BR')}</Typography>
                      {r.kg != null && <Typography sx={{ fontSize: 12 }}>{fmt(r.kg)} kg</Typography>}
                      {r.cm != null && <Typography sx={{ fontSize: 12 }}>{fmt(r.cm)} cm</Typography>}
                      {bmi != null && <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>IMC {fmt(bmi)}</Typography>}
                    </Stack>
                  );
                })}
              </Stack>
            )}

            {/* Aviso educativo (obrigatório) */}
            <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ mt: 1.25, px: 1, py: 0.75, borderRadius: '10px', bgcolor: 'rgba(245,158,11,.06)', border: '1px solid rgba(245,158,11,.15)' }}>
              <InfoOutlinedIcon sx={{ fontSize: 16, color: '#f59e0b', mt: 0.25 }} />
              <Typography sx={{ fontSize: 12, color: 'text.secondary', lineHeight: 1.5 }}>
                Curva para <strong>acompanhamento</strong> — compara com os percentis da OMS, mas quem interpreta o
                crescimento do seu filho(a) é o <strong>pediatra</strong>. Peso-para-idade é exibido até os 10 anos (limite das tabelas da OMS).
              </Typography>
            </Stack>
          </>
        )}
      </CardContent>
    </Card>
  );
};
