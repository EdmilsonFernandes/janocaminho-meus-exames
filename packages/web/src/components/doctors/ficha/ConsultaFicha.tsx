import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Avatar, Box, Button, ButtonBase, Chip, Dialog, DialogContent, IconButton, ListItemText, Menu, MenuItem, Skeleton, Stack, Tooltip, Typography, useMediaQuery } from '@mui/material';
import { alpha, useTheme, type Theme } from '@mui/material/styles';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import WarningRoundedIcon from '@mui/icons-material/WarningRounded';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import VideocamRoundedIcon from '@mui/icons-material/VideocamRounded';
import MoreHorizRoundedIcon from '@mui/icons-material/MoreHorizRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import FormatQuoteRoundedIcon from '@mui/icons-material/FormatQuoteRounded';
import { API_URL, photoUrlFor } from '../../../config';
import { COPPER, SEM, copperText, tealText } from '../../../theme';
import { copyText } from '../../../utils/clipboard';
import { DoctorPatientSwitcher } from '../DoctorPatientSwitcher';
import {
  ago, axisOf, bmi, bpSummary, buildCopySummary, egfrCkdEpi2021, fmtDate, fmtNum, isStale,
  linkInteractions, niceName, parseAllergy, parseConditions, type BpReading, type MarkerNow,
} from './fichaModel';

/**
 * FICHA DA CONSULTA (28/11/26) — a tela que o médico abre quando o paciente senta.
 *
 * Desenhada com o painel de médicos (MFC, endócrino, cardio, "30 consultas por dia") e a
 * pesquisa de mercado (Epic Storyboard, athenaOne briefing, Elation, AGP de uma página):
 *  1. Barra fixa do paciente: quem é + ALERGIA em vermelho + condições + "Copiar resumo".
 *  2. Segurança sem toque: vermelho SÓ para interação confirmada por exame; âmbar no resto.
 *  3. "Desde a sua última anotação": o que mudou (antes → agora, com data) + a SUA nota.
 *  4. Fora da faixa agora: tabela por eixo clínico, valor + anterior + mini-gráfico + idade.
 *  5. Remédios, perguntas abertas, corpo e hábitos (PA domiciliar, peso/IMC, FC, passos).
 * Sem escore inventado, sem contagem repetida, sem conduta escrita pelo app.
 */

type Props = {
  token: string;
  patient: any; // linha de /doctor/patients
  patients: any[];
  canSeeHealth: boolean; // scope 'exams'
  abnormalItems: any[];
  medsInfo: { medications: any[]; critical: any[] } | null;
  notes: any[];
  questions: any[];
  teleconsultas: any[];
  loading: boolean;
  /** false nas outras abas: fica só a barra do paciente + segurança + abas. */
  showBody: boolean;
  /** Barra de abas do portal — entra logo abaixo da faixa de segurança. */
  tabs?: ReactNode;
  onBack: () => void;
  onSwitchPatient: (pid: string) => void;
  onOpenTab: (tab: string) => void;
  onEnterTele: (tele: any) => void;
  onTeleMenu: (action: 'request' | 'summary' | 'copy' | 'agenda' | 'cancel' | 'new', tele?: any) => void;
  onNotify: (msg: string, severity?: 'success' | 'info' | 'error') => void;
};

type Series = { name: string; unit: string | null; refLow: number | null; refHigh: number | null; points: { at: string; v: number }[] };

const sem = (k: keyof typeof SEM) => (t: Theme) => SEM[k][t.palette.mode];
const H = { fontFamily: 'Poppins, sans-serif' } as const;

/* ── peças visuais ─────────────────────────────────────────────────────────────── */

const Section = ({ title, aside, children, id }: { title: string; aside?: ReactNode; children: ReactNode; id?: string }) => (
  <Box component="section" id={id} aria-label={title} sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: '16px', overflow: 'hidden' }}>
    <Stack direction="row" alignItems="baseline" justifyContent="space-between" columnGap={1} flexWrap="wrap" sx={{ px: 2, pt: 1.75, pb: 1 }}>
      <Typography component="h3" sx={{ ...H, fontWeight: 700, fontSize: 15, letterSpacing: '-0.01em' }}>{title}</Typography>
      {aside && <Typography component="span" sx={{ fontSize: 12.5, color: 'text.secondary', fontWeight: 600, whiteSpace: 'nowrap', ml: 'auto' }}>{aside}</Typography>}
    </Stack>
    {children}
  </Box>
);

/** Linhas com divisória interna (lista dentro de card = divisória, nunca borda própria). */
const Rows = ({ children }: { children: ReactNode }) => (
  <Box sx={{ '& > * + *': { borderTop: '1px solid', borderColor: 'divider' } }}>{children}</Box>
);

const Spark = ({ s, w = 76, h = 26 }: { s: Series; w?: number; h?: number }) => {
  const t = useTheme();
  const pts = s.points.slice(-6);
  if (pts.length < 3) return null; // regra do painel: gráfico só com 3+ pontos
  const vals = pts.map((p) => p.v);
  let lo = Math.min(...vals, s.refLow ?? Infinity);
  let hi = Math.max(...vals, s.refHigh ?? -Infinity);
  if (!Number.isFinite(lo)) lo = Math.min(...vals);
  if (!Number.isFinite(hi)) hi = Math.max(...vals);
  const pad = (hi - lo) * 0.12 || 1;
  lo -= pad; hi += pad;
  const y = (v: number) => h - 2 - ((v - lo) / (hi - lo)) * (h - 4);
  const x = (i: number) => 3 + (i / (pts.length - 1)) * (w - 6);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  const out = (v: number) => (s.refHigh != null && v > s.refHigh) || (s.refLow != null && s.refLow > 0 && v < s.refLow);
  const bandTop = s.refHigh != null ? y(Math.min(s.refHigh, hi)) : 0;
  const bandBot = s.refLow != null && s.refLow > 0 ? y(Math.max(s.refLow, lo)) : h;
  return (
    <Box component="svg" viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden sx={{ display: 'block', flexShrink: 0 }}>
      <rect x={0} y={bandTop} width={w} height={Math.max(0, bandBot - bandTop)} rx={3} fill={alpha(SEM.ok[t.palette.mode], t.palette.mode === 'dark' ? 0.16 : 0.1)} />
      <path d={d} fill="none" stroke={t.palette.text.secondary} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(pts.length - 1)} cy={y(last.v)} r={2.8} fill={out(last.v) ? SEM.warn[t.palette.mode] : SEM.ok[t.palette.mode]} />
    </Box>
  );
};

const Delta = ({ prev, last }: { prev: number | null | undefined; last: number | null | undefined }) => {
  if (prev == null || last == null || prev === last) return null;
  const up = last > prev;
  return (
    <Typography component="span" sx={{ fontSize: 12.5, fontWeight: 700, color: 'text.secondary', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
      {up ? '↑' : '↓'} {up ? '+' : '−'}{fmtNum(Math.abs(last - prev))}
    </Typography>
  );
};

/* ── componente ────────────────────────────────────────────────────────────────── */

export const ConsultaFicha = (p: Props) => {
  const t = useTheme();
  const dark = t.palette.mode === 'dark';
  const desktop = useMediaQuery(t.breakpoints.up('md'));
  const pid: string = p.patient?.patient?.id ?? '';
  const name: string = p.patient?.patient?.fullName ?? 'Paciente';
  const age: number | null = p.patient?.age ?? null;
  const sex = p.patient?.sex ?? p.patient?.patient?.gender ?? null;

  const [pre, setPre] = useState<any>(null);
  const [ctx, setCtx] = useState<any>(null);
  const [vit, setVit] = useState<any>(null);
  const [series, setSeries] = useState<Record<string, Series>>({});
  const [loadingExtra, setLoadingExtra] = useState(true);
  const [switcher, setSwitcher] = useState(false);
  const [teleMenu, setTeleMenu] = useState<HTMLElement | null>(null);
  const [condOpen, setCondOpen] = useState(false);
  const [added, setAdded] = useState<Record<string, boolean>>({});

  // marcadores FORA da faixa no resultado mais recente de cada um (régua "agora")
  const current = useMemo(() => {
    const by = new Map<string, any>();
    for (const it of p.abnormalItems) {
      if (it.isCurrent === false || it.isNormalizedInNewerExam) continue;
      const k = String(it.nameCanonical || it.name || '').toUpperCase();
      const prev = by.get(k);
      if (!prev || new Date(it.performedAt || 0) > new Date(prev.performedAt || 0)) by.set(k, it);
    }
    return [...by.values()];
  }, [p.abnormalItems]);

  const h = useMemo(() => ({ Authorization: `Bearer ${p.token}` }), [p.token]);
  useEffect(() => {
    if (!pid) return;
    let alive = true;
    setPre(null); setCtx(null); setVit(null); setSeries({}); setLoadingExtra(true); setAdded({});
    const get = (path: string) => fetch(`${API_URL}/doctor/patients/${pid}${path}`, { headers: h }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const jobs: Promise<unknown>[] = [get('/context').then((d) => alive && setCtx(d))];
    if (p.canSeeHealth) {
      jobs.push(get('/pre-visit').then((d) => alive && setPre(d)), get('/vitals').then((d) => alive && setVit(d)));
    }
    void Promise.allSettled(jobs).then(() => alive && setLoadingExtra(false));
    return () => { alive = false; };
  }, [pid, h, p.canSeeHealth]);

  // séries só dos marcadores fora da faixa agora (+ creatinina p/ a TFGe) — no máx. 8 GETs
  const seriesKey = current.map((c) => c.nameCanonical || c.name).join('|');
  useEffect(() => {
    if (!pid || !p.canSeeHealth || !current.length) return;
    let alive = true;
    const names = [...new Set(current.map((c) => String(c.nameCanonical || c.name)))].slice(0, 8);
    void Promise.all(names.map((n) =>
      fetch(`${API_URL}/doctor/patients/${pid}/items/timeseries?nameCanonical=${encodeURIComponent(n)}`, { headers: h })
        .then((r) => (r.ok ? r.json() : null)).catch(() => null)
        .then((d) => [n, d] as const),
    )).then((rows) => {
      if (!alive) return;
      const out: Record<string, Series> = {};
      for (const [n, d] of rows) {
        if (!d?.points) continue;
        out[n.toUpperCase()] = {
          name: n, unit: d.unit ?? null, refLow: d.refLow ?? null, refHigh: d.refHigh ?? null,
          points: (d.points as any[]).filter((x) => typeof x.valueNumeric === 'number').map((x) => ({ at: x.performedAt, v: x.valueNumeric })),
        };
      }
      setSeries(out);
    });
    return () => { alive = false; };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [pid, seriesKey, p.canSeeHealth, h]);

  /* ── derivados ── */
  const allergy = parseAllergy(ctx?.allergies);
  const conditions = parseConditions(ctx?.clinicalProfile);
  const activeMeds = (p.medsInfo?.medications ?? []).filter((m: any) => m.active);
  const prevOf = (canon: string) => {
    const s = series[canon.toUpperCase()];
    return s && s.points.length >= 2 ? s.points[s.points.length - 2].v : null;
  };
  const markersNow: MarkerNow[] = current.map((c) => ({ name: c.nameCanonical || c.name, value: c.valueNumeric ?? null, valueText: c.valueText, unit: c.unit, at: c.performedAt, abnormal: true, prev: prevOf(String(c.nameCanonical || c.name)) }));
  const safety = linkInteractions(p.medsInfo?.critical ?? [], markersNow);

  const creat = p.abnormalItems.find((i) => /CREATININ/i.test(String(i.nameCanonical || i.name)) && i.isCurrent !== false)
    ?? (pre?.topIssues ?? []).find((i: any) => /creatinin/i.test(i.name));
  const creatValue: number | null = creat ? (creat.valueNumeric ?? creat.last ?? null) : null;
  const egfr = egfrCkdEpi2021(creatValue, age, sex);

  const bp = bpSummary(vit?.bloodPressure as BpReading[] | undefined);
  const weight: number | null = vit?.summary?.lastWeightKg ?? p.patient?.latestWeight?.value ?? null;
  const bc = vit?.bodyComposition;
  const weightDelta = bc?.latest?.weightKg && bc?.previous?.weightKg ? bc.latest.weightKg - bc.previous.weightKg : null;
  const imc = bmi(weight, vit?.heightCm);

  const lastNote = [...p.notes].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))[0];
  const since = pre?.lastVisit ?? lastNote?.createdAt ?? null;
  const changes: any[] = (pre?.topIssues ?? []).filter((i: any) => i.last != null || i.lastText);
  const pendingTests: { name: string; why: string }[] = [
    ...(pre?.investigate ?? []).map((x: any) => ({ name: x.name, why: x.ageMonths ? `último há ${x.ageMonths} meses` : 'nunca feito' })),
    ...(pre?.followUpTests ?? []).filter((n: string) => !(pre?.investigate ?? []).some((x: any) => niceName(x.name) === niceName(n))).map((n: string) => ({ name: n, why: 'rastreio de rotina' })),
  ].slice(0, 6);
  const openQs = p.questions.filter((q) => q?.status !== 'answered');

  const nowMs = Date.now();
  const tele = p.teleconsultas.find((x) => !x.endedAt && new Date(x.dueDate).getTime() >= nowMs - 3600000) ?? null;
  const teleSoon = tele && new Date(tele.dueDate).getTime() - nowMs < 36 * 3600000;

  const copy = () => {
    const txt = buildCopySummary({
      name, age, sex, convenio: p.patient?.convenio, allergy: allergy.has ? allergy.text : null, conditions,
      meds: activeMeds.map((m: any) => ({ name: m.name, dosage: m.dosage, frequency: m.frequency })),
      safety, changes: changes.map((c) => ({ name: c.name, prev: c.prev, last: c.last, unit: c.unit })), changesSince: since,
      abnormalNow: markersNow, egfr, bp, weightKg: weight, bmi: imc, weightDelta,
      pending: pendingTests.map((x) => niceName(x.name)),
    });
    copyText(txt);
    p.onNotify('Resumo copiado — cole no prontuário da clínica.', 'success');
  };

  const addToPlan = async (testName: string) => {
    if (added[testName]) return;
    setAdded((a) => ({ ...a, [testName]: true }));
    try {
      const r = await fetch(`${API_URL}/doctor/patients/${pid}/checklist`, { method: 'POST', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify({ analyteName: niceName(testName), dueInDays: 30 }) });
      if (!r.ok) throw new Error();
      p.onNotify(`${niceName(testName)} no plano de coleta (30 dias). O paciente recebe o lembrete.`, 'success');
    } catch {
      setAdded((a) => ({ ...a, [testName]: false }));
      p.onNotify('Não foi possível adicionar agora. Tente de novo.', 'error');
    }
  };

  const busy = p.loading || loadingExtra;

  /* ── blocos ── */
  const header = (
    <Box sx={{
      position: 'sticky', top: 0, zIndex: 12, mx: { xs: -2, md: 0 }, px: { xs: 1, md: 2 }, pt: { xs: 'calc(env(safe-area-inset-top) + 6px)', md: 1.5 }, pb: 1.25,
      bgcolor: alpha(t.palette.background.paper, 0.92), backdropFilter: 'saturate(1.4) blur(14px)',
      border: { xs: 0, md: '1px solid' }, borderBottom: '1px solid', borderColor: 'divider', borderRadius: { md: '16px' },
    }}>
      <Stack direction="row" alignItems="center" spacing={0.5}>
        <IconButton onClick={p.onBack} aria-label="Voltar aos pacientes" sx={{ width: 44, height: 44, flexShrink: 0 }}><ArrowBackRoundedIcon /></IconButton>
        <ButtonBase onClick={() => setSwitcher(true)} aria-label={`${name}. Trocar de paciente`} sx={{ flex: 1, minWidth: 0, justifyContent: 'flex-start', borderRadius: '12px', py: 0.5, pr: 1, gap: 1.25, textAlign: 'left' }}>
          <Avatar src={pid ? photoUrlFor(pid, 0) : undefined} sx={{ width: 40, height: 40, fontWeight: 700, fontSize: 16, bgcolor: alpha('#20b2aa', 0.12), color: tealText(t.palette.mode) }}>{name.charAt(0)}</Avatar>
          <Box sx={{ minWidth: 0 }}>
            <Stack direction="row" alignItems="center" spacing={0.25}>
              <Typography noWrap sx={{ ...H, fontWeight: 700, fontSize: 16.5, lineHeight: 1.2 }}>{name}</Typography>
              <ExpandMoreRoundedIcon sx={{ fontSize: 18, color: 'text.secondary', flexShrink: 0 }} />
            </Stack>
            <Typography noWrap sx={{ fontSize: 12.5, color: 'text.secondary', fontWeight: 500 }}>
              {[age != null ? `${age} anos` : null, sex === 'male' ? 'masculino' : sex === 'female' ? 'feminino' : null, p.patient?.convenio || 'particular'].filter(Boolean).join(' · ')}
            </Typography>
          </Box>
        </ButtonBase>
        <Tooltip title="Copiar resumo para o prontuário">
          <span>
            <Button onClick={copy} disabled={busy} startIcon={<ContentCopyRoundedIcon sx={{ fontSize: 18 }} />} aria-label="Copiar resumo para o prontuário"
              sx={{ minHeight: 44, minWidth: 44, px: { xs: 0, sm: 1.75 }, borderRadius: '12px', textTransform: 'none', fontWeight: 700, fontSize: 13.5, color: copperText(t.palette.mode), bgcolor: COPPER.wash, flexShrink: 0, '& .MuiButton-startIcon': { mr: { xs: 0, sm: 0.75 }, ml: { xs: 0, sm: -0.5 } }, '@media (hover:hover)': { '&:hover': { bgcolor: alpha(COPPER.main, 0.26) } } }}>
              <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Copiar resumo</Box>
            </Button>
          </span>
        </Tooltip>
      </Stack>
      {/* Alergia + condições: segurança na primeira dobra, sempre */}
      <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mt: 1, px: 0.75 }}>
        {ctx == null && loadingExtra ? (
          <Skeleton variant="rounded" width={170} height={28} sx={{ borderRadius: '8px' }} />
        ) : allergy.has ? (
          <Chip icon={<WarningRoundedIcon />} label={`Alergia: ${allergy.text}`}
            sx={{ height: 28, maxWidth: '100%', fontWeight: 700, fontSize: 13, borderRadius: '8px', color: '#fff', bgcolor: SEM.bad.light, '& .MuiChip-icon': { color: '#fff', fontSize: 17 } }} />
        ) : (
          <Chip label="Sem alergia informada" variant="outlined" sx={{ height: 28, fontSize: 12.5, fontWeight: 600, borderRadius: '8px', color: 'text.secondary' }} />
        )}
        {(condOpen ? conditions : conditions.slice(0, 3)).map((c) => (
          <Chip key={c} label={c} sx={{ height: 28, maxWidth: '100%', fontSize: 12.5, fontWeight: 600, borderRadius: '8px', bgcolor: dark ? 'rgba(255,255,255,.07)' : '#eef2f2' }} />
        ))}
        {!condOpen && conditions.length > 3 && (
          <Chip label={`+${conditions.length - 3}`} onClick={() => setCondOpen(true)} aria-label={`Ver mais ${conditions.length - 3} condições`} sx={{ height: 28, fontSize: 12.5, fontWeight: 700, borderRadius: '8px' }} />
        )}
      </Stack>
    </Box>
  );

  const safetyBlock = safety.length > 0 && (
    <Stack spacing={0.75} role="alert" aria-label="Segurança">
      {safety.slice(0, 3).map((s) => (
        <Stack key={s.title} direction="row" spacing={1.25} alignItems="flex-start" sx={{
          p: 1.5, borderRadius: '14px',
          bgcolor: alpha(s.level === 'red' ? SEM.bad[t.palette.mode] : SEM.warn[t.palette.mode], dark ? 0.14 : 0.07),
          border: '1px solid', borderColor: alpha(s.level === 'red' ? SEM.bad[t.palette.mode] : SEM.warn[t.palette.mode], 0.35),
        }}>
          <WarningRoundedIcon sx={{ fontSize: 20, mt: 0.1, color: s.level === 'red' ? sem('bad') : sem('warn') }} />
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontWeight: 700, fontSize: 14, lineHeight: 1.35, color: s.level === 'red' ? sem('bad') : 'text.primary' }}>{s.title}</Typography>
            {s.detail && <Typography sx={{ fontSize: 12.5, color: 'text.secondary', mt: 0.25, lineHeight: 1.4 }}>{s.detail}</Typography>}
          </Box>
        </Stack>
      ))}
    </Stack>
  );

  const teleBlock = tele && teleSoon && (
    <Stack direction="row" alignItems="center" spacing={1.25} sx={{ p: 1.25, pl: 1.5, borderRadius: '14px', bgcolor: 'background.paper', border: '1px solid', borderColor: alpha('#20b2aa', 0.4) }}>
      <Box sx={{ width: 36, height: 36, borderRadius: '10px', display: 'grid', placeItems: 'center', bgcolor: alpha('#20b2aa', 0.12), color: tealText(t.palette.mode), flexShrink: 0 }}><VideocamRoundedIcon sx={{ fontSize: 20 }} /></Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography noWrap sx={{ fontWeight: 700, fontSize: 14 }}>
          {new Date(tele.dueDate).toDateString() === new Date().toDateString() ? 'Hoje' : new Date(tele.dueDate).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}, {new Date(tele.dueDate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </Typography>
        <Typography noWrap sx={{ fontSize: 12.5, color: 'text.secondary', fontWeight: 500 }}>
          {tele.consentAt ? 'consentiu ✓' : <Box component="span" sx={{ color: sem('warn') }}>sem consentimento</Box>}
          {' · '}{tele.title && tele.title !== 'Teleconsulta médica' ? tele.title : 'Teleconsulta'}
        </Typography>
      </Box>
      <Button variant="contained" onClick={() => p.onEnterTele(tele)} sx={{ minHeight: 44, borderRadius: '12px', textTransform: 'none', fontWeight: 700, px: 2, flexShrink: 0 }}>Entrar</Button>
      <IconButton aria-label="Mais ações da teleconsulta" aria-haspopup="menu" onClick={(e) => setTeleMenu(e.currentTarget)} sx={{ width: 44, height: 44, flexShrink: 0 }}><MoreHorizRoundedIcon /></IconButton>
      <Menu anchorEl={teleMenu} open={!!teleMenu} onClose={() => setTeleMenu(null)} slotProps={{ paper: { sx: { borderRadius: '14px', minWidth: 220 } } }}>
        {([['request', 'Pedir exame (PDF)'], ['summary', 'Resumo da consulta'], ...(tele.linkUrl ? [['copy', 'Copiar link da sala']] : []), ['agenda', 'Ver agenda deste paciente'], ['new', 'Agendar outra'], ['cancel', 'Cancelar consulta']] as [Parameters<Props['onTeleMenu']>[0], string][]).map(([k, l]) => (
          <MenuItem key={k} onClick={() => { setTeleMenu(null); p.onTeleMenu(k, tele); }} sx={{ minHeight: 44, ...(k === 'cancel' ? { color: 'error.main' } : {}) }}><ListItemText>{l}</ListItemText></MenuItem>
        ))}
      </Menu>
    </Stack>
  );

  const changesBlock = p.canSeeHealth && (
    <Section title={since ? 'Desde a sua última anotação' : 'O que mudou nos últimos exames'} aside={since ? `${fmtDate(since)} · ${ago(since)}` : undefined}>
      {busy && !pre ? (
        <Box sx={{ px: 2, pb: 2 }}><Skeleton height={28} /><Skeleton height={28} /><Skeleton height={28} width="70%" /></Box>
      ) : (
        <>
          {changes.length > 0 ? (
            <Rows>
              {changes.map((c) => (
                <Stack key={c.name} direction="row" alignItems="center" spacing={1.5} sx={{ px: 2, py: 1.25, minHeight: 52 }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography noWrap sx={{ fontWeight: 600, fontSize: 14.5 }}>{niceName(c.name)}</Typography>
                    <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: c.direction === 'piorou' ? sem('warn') : c.direction === 'melhorou' ? sem('ok') : 'text.secondary' }}>{c.direction === 'melhorou' ? 'melhorou' : c.direction === 'piorou' ? 'piorou' : 'mudou'}</Typography>
                  </Box>
                  <Typography sx={{ fontVariantNumeric: 'tabular-nums', fontSize: 15, whiteSpace: 'nowrap' }}>
                    <Box component="span" sx={{ color: 'text.secondary' }}>{c.prev != null ? fmtNum(c.prev) : c.prevText ?? '—'}</Box>
                    <Box component="span" sx={{ color: 'text.disabled', mx: 0.75 }}>→</Box>
                    <Box component="b" sx={{ fontWeight: 800, color: c.direction === 'piorou' ? sem('warn') : c.direction === 'melhorou' ? sem('ok') : 'text.primary' }}>{c.last != null ? fmtNum(c.last) : c.lastText}</Box>
                    {c.unit && <Box component="span" sx={{ fontSize: 12, color: 'text.secondary', ml: 0.5 }}>{c.unit}</Box>}
                  </Typography>
                </Stack>
              ))}
            </Rows>
          ) : (
            <Typography sx={{ px: 2, pb: 1.5, fontSize: 13.5, color: 'text.secondary' }}>Nenhuma mudança relevante entre os dois últimos exames.</Typography>
          )}
          {lastNote && (
            <ButtonBase onClick={() => p.onOpenTab('notes')} sx={{ display: 'flex', width: '100%', textAlign: 'left', alignItems: 'flex-start', gap: 1, px: 2, py: 1.5, borderTop: '1px solid', borderColor: 'divider', bgcolor: alpha(COPPER.main, dark ? 0.08 : 0.06) }}>
              <FormatQuoteRoundedIcon sx={{ fontSize: 20, color: copperText(t.palette.mode), mt: 0.1 }} />
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontSize: 12, fontWeight: 700, color: copperText(t.palette.mode), letterSpacing: '0.02em' }}>SUA NOTA · {fmtDate(lastNote.createdAt)}</Typography>
                <Typography sx={{ fontSize: 13.5, lineHeight: 1.45, mt: 0.25, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{lastNote.content}</Typography>
              </Box>
            </ButtonBase>
          )}
          {pendingTests.length > 0 && (
            <Box sx={{ px: 2, py: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
              <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: 'text.secondary', mb: 1 }}>A pedir · toque para pôr no plano de coleta</Typography>
              <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                {pendingTests.map((x) => (
                  <Chip key={x.name} onClick={() => void addToPlan(x.name)} icon={added[x.name] ? <CheckRoundedIcon /> : <AddRoundedIcon />}
                    label={<><b>{niceName(x.name)}</b> <Box component="span" sx={{ color: 'text.secondary', fontWeight: 500 }}>· {x.why}</Box></>}
                    aria-label={`Adicionar ${niceName(x.name)} ao plano de coleta (${x.why})`}
                    sx={{ minHeight: 36, borderRadius: '10px', fontSize: 13, bgcolor: added[x.name] ? alpha(SEM.ok[t.palette.mode], 0.12) : alpha('#20b2aa', 0.08), border: '1px solid', borderColor: added[x.name] ? alpha(SEM.ok[t.palette.mode], 0.4) : alpha('#20b2aa', 0.3), '& .MuiChip-icon': { fontSize: 18, color: added[x.name] ? sem('ok') : tealText(t.palette.mode) } }} />
                ))}
              </Stack>
              <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 1 }}>Sugestão pelo tempo desde o último resultado. A decisão é sua.</Typography>
            </Box>
          )}
        </>
      )}
    </Section>
  );

  // fora da faixa agora, agrupado por eixo clínico
  const groups = useMemo(() => {
    const g = new Map<string, { label: string; items: any[] }>();
    for (const c of current) {
      const a = axisOf(String(c.nameCanonical || c.name));
      if (!g.has(a.key)) g.set(a.key, { label: a.label, items: [] });
      g.get(a.key)!.items.push(c);
    }
    const order = ['glic', 'renal', 'lip', 'tir', 'hemo', 'hep', 'horm', 'vit', 'outros'];
    return [...g.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0])).map(([k, v]) => ({ key: k, ...v }));
  }, [current]);

  const abnormalBlock = p.canSeeHealth && (
    <Section title="Fora da faixa agora" aside={current.length ? `${current.length} ${current.length === 1 ? 'marcador' : 'marcadores'}` : undefined}>
      {p.loading ? (
        <Box sx={{ px: 2, pb: 2 }}><Skeleton height={40} /><Skeleton height={40} /></Box>
      ) : current.length === 0 ? (
        <Typography sx={{ px: 2, pb: 1.75, fontSize: 13.5, color: 'text.secondary' }}>Todos os marcadores do último resultado estão na faixa de referência.</Typography>
      ) : (
        <>
          {groups.map((g) => (
            <Box key={g.key}>
              <Typography sx={{ px: 2, pt: 1, pb: 0.5, fontSize: 11.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'text.secondary', bgcolor: dark ? 'rgba(255,255,255,.03)' : '#f7f9f9', borderTop: '1px solid', borderColor: 'divider' }}>{g.label}</Typography>
              <Rows>
                {g.items.map((c) => {
                  const canon = String(c.nameCanonical || c.name);
                  const s = series[canon.toUpperCase()];
                  const prior = s ? s.points.slice(-3, -1).map((x) => fmtNum(x.v)) : [];
                  const stale = isStale(c.performedAt);
                  const isCreat = /CREATININ/i.test(canon);
                  return (
                    <Stack key={c.id} direction="row" alignItems="center" spacing={1.25} sx={{ px: 2, py: 1.1, minHeight: 56 }}>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Stack direction="row" alignItems="baseline" spacing={0.75} sx={{ minWidth: 0 }}>
                          <Typography noWrap sx={{ fontWeight: 600, fontSize: 14.5 }}>{niceName(canon)}</Typography>
                          {stale && <Chip label="desatualizado" size="small" sx={{ height: 20, fontSize: 11, fontWeight: 700, borderRadius: '6px', color: sem('warn'), bgcolor: alpha(SEM.warn[t.palette.mode], 0.1) }} />}
                        </Stack>
                        <Typography noWrap sx={{ fontSize: 12, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
                          {prior.length ? `antes ${prior.join(' · ')}` : c.refText ? `ref. ${c.refText}` : ''}{prior.length || c.refText ? ' · ' : ''}{ago(c.performedAt)}
                        </Typography>
                        {isCreat && egfr != null && (
                          <Typography sx={{ fontSize: 12, fontWeight: 700, color: egfr < 60 ? sem('warn') : 'text.secondary' }}>TFGe {egfr} mL/min/1,73m² · CKD-EPI 2021</Typography>
                        )}
                      </Box>
                      {s && <Spark s={s} />}
                      <Box sx={{ textAlign: 'right', minWidth: 74 }}>
                        <Typography sx={{ fontWeight: 800, fontSize: 16, color: sem('warn'), fontVariantNumeric: 'tabular-nums', lineHeight: 1.2, whiteSpace: 'nowrap' }}>
                          {c.valueNumeric != null ? fmtNum(c.valueNumeric) : c.valueText}
                          <Box component="span" sx={{ fontSize: 11.5, fontWeight: 600, color: 'text.secondary', ml: 0.4 }}>{c.unit}</Box>
                        </Typography>
                        <Delta prev={s && s.points.length >= 2 ? s.points[s.points.length - 2].v : null} last={c.valueNumeric} />
                      </Box>
                    </Stack>
                  );
                })}
              </Rows>
            </Box>
          ))}
          <ButtonBase onClick={() => p.onOpenTab('alterados')} sx={{ width: '100%', minHeight: 48, justifyContent: 'center', gap: 0.5, borderTop: '1px solid', borderColor: 'divider', fontWeight: 700, fontSize: 13.5, color: tealText(t.palette.mode) }}>
            Histórico e revisão <ChevronRightRoundedIcon sx={{ fontSize: 18 }} />
          </ButtonBase>
        </>
      )}
    </Section>
  );

  const medsBlock = (
    <Section title="Remédios em uso" aside={activeMeds.length ? String(activeMeds.length) : undefined}>
      {p.loading && !p.medsInfo ? (
        <Box sx={{ px: 2, pb: 2 }}><Skeleton height={28} /><Skeleton height={28} /></Box>
      ) : activeMeds.length === 0 ? (
        <Typography sx={{ px: 2, pb: 1.75, fontSize: 13.5, color: 'text.secondary' }}>O paciente não cadastrou remédios em uso.</Typography>
      ) : (
        <Rows>
          {activeMeds.map((m: any) => {
            const flagged = (p.medsInfo?.critical ?? []).some((c: any) => [c.drugA, c.drugB].some((d: string) => d && String(m.name).toUpperCase().includes(String(d).toUpperCase())));
            return (
              <Stack key={m.id ?? m.name} direction="row" alignItems="center" spacing={1} sx={{ px: 2, py: 1.1, minHeight: 52 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 600, fontSize: 14.5 }}>{m.name}</Typography>
                  {(m.dosage || m.frequency) && <Typography sx={{ fontSize: 12.5, color: 'text.secondary' }}>{[m.dosage, m.frequency].filter(Boolean).join(' · ')}</Typography>}
                </Box>
                {flagged && <Chip label="interação" size="small" sx={{ height: 22, fontSize: 11.5, fontWeight: 700, borderRadius: '6px', color: sem('warn'), bgcolor: alpha(SEM.warn[t.palette.mode], 0.1) }} />}
              </Stack>
            );
          })}
        </Rows>
      )}
    </Section>
  );

  const questionsBlock = openQs.length > 0 && (
    <Section title="O paciente quer saber" aside={`${openQs.length} ${openQs.length === 1 ? 'pergunta' : 'perguntas'}`}>
      <Rows>
        {openQs.slice(0, 3).map((q) => (
          <ButtonBase key={q.id} onClick={() => p.onOpenTab('questions')} sx={{ display: 'flex', width: '100%', textAlign: 'left', px: 2, py: 1.25, gap: 1, minHeight: 52 }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontSize: 14, fontWeight: 600, lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{q.subject}</Typography>
              <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{ago(q.createdAt)}</Typography>
            </Box>
            <Typography sx={{ fontSize: 13, fontWeight: 700, color: tealText(t.palette.mode), alignSelf: 'center' }}>Responder</Typography>
          </ButtonBase>
        ))}
      </Rows>
    </Section>
  );

  const stats: { label: string; value: string; sub?: string; warn?: boolean }[] = [];
  if (bp) stats.push({ label: 'PA em casa', value: `${bp.systolic}/${bp.diastolic}`, sub: `média de ${bp.n} · ${bp.above ? `${bp.above} ≥135/85` : 'todas <135/85'}`, warn: bp.elevated });
  if (weight) stats.push({ label: 'Peso', value: `${fmtNum(weight)} kg`, sub: [imc ? `IMC ${fmtNum(imc)}` : null, weightDelta ? `${weightDelta > 0 ? '+' : '−'}${fmtNum(Math.abs(weightDelta))} kg` : null].filter(Boolean).join(' · ') || undefined });
  if (bc?.latest?.bodyFatPct) stats.push({ label: 'Gordura', value: `${fmtNum(bc.latest.bodyFatPct)}%`, sub: bc.previous?.bodyFatPct ? `era ${fmtNum(bc.previous.bodyFatPct)}% · ${ago(bc.previous.measuredAt)}` : ago(bc.latest.measuredAt) });
  if (vit?.summary?.restingHrAvg30d) stats.push({ label: 'FC repouso', value: `${vit.summary.restingHrAvg30d} bpm`, sub: 'média 30 dias' });
  if (vit?.summary?.stepsAvg30d) stats.push({ label: 'Passos', value: Number(vit.summary.stepsAvg30d).toLocaleString('pt-BR'), sub: 'por dia · 30 dias' });
  if (vit?.summary?.sleepAvg30dMin) stats.push({ label: 'Sono', value: `${Math.floor(vit.summary.sleepAvg30dMin / 60)}h${String(vit.summary.sleepAvg30dMin % 60).padStart(2, '0')}`, sub: 'média 30 dias' });

  const bodyBlock = p.canSeeHealth && (stats.length > 0 || !loadingExtra) && (
    <Section title="Corpo e hábitos" aside={vit?.lastSyncAt ? `sincronizado ${ago(vit.lastSyncAt)}` : undefined}>
      {stats.length === 0 ? (
        <Typography sx={{ px: 2, pb: 1.75, fontSize: 13.5, color: 'text.secondary' }}>Sem medidas de pressão, peso ou atividade compartilhadas.</Typography>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', borderTop: '1px solid', borderColor: 'divider', '& > *': { borderRight: '1px solid', borderBottom: '1px solid', borderColor: 'divider' } }}>
          {stats.map((s) => (
            <Box key={s.label} sx={{ px: 2, py: 1.25, mr: '-1px', mb: '-1px' }}>
              <Typography sx={{ fontSize: 12, color: 'text.secondary', fontWeight: 600 }}>{s.label}</Typography>
              <Typography sx={{ ...H, fontWeight: 700, fontSize: 18, lineHeight: 1.3, color: s.warn ? sem('warn') : 'text.primary', fontVariantNumeric: 'tabular-nums' }}>{s.value}</Typography>
              {s.sub && <Typography sx={{ fontSize: 11.5, color: 'text.secondary', lineHeight: 1.3 }}>{s.sub}</Typography>}
            </Box>
          ))}
        </Box>
      )}
    </Section>
  );

  const footer = (
    <Stack direction="row" spacing={0.75} alignItems="flex-start" sx={{ px: 0.5, color: 'text.secondary' }}>
      <InfoOutlinedIcon sx={{ fontSize: 15, mt: 0.2 }} />
      <Typography sx={{ fontSize: 12, lineHeight: 1.45 }}>
        Dados compartilhados pelo paciente. Valores extraídos dos laudos — confira o original em Exames. O app organiza; a conduta é sua.
      </Typography>
    </Stack>
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, width: '100%', maxWidth: { md: 1180 }, mx: 'auto' }}>
      {header}
      {safetyBlock}
      {teleBlock}
      {p.tabs}
      {p.showBody && (desktop ? (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.35fr) minmax(0, 1fr)', gap: 1.5, alignItems: 'start' }}>
          <Stack spacing={1.5}>{changesBlock}{abnormalBlock}</Stack>
          <Stack spacing={1.5}>{medsBlock}{questionsBlock}{bodyBlock}</Stack>
        </Box>
      ) : (
        <>
          {changesBlock}
          {medsBlock}
          {abnormalBlock}
          {questionsBlock}
          {bodyBlock}
        </>
      ))}
      {p.showBody && footer}

      <Dialog open={switcher} onClose={() => setSwitcher(false)} fullWidth maxWidth="sm" PaperProps={{ sx: { borderRadius: '20px', p: 1 } }}>
        <DialogContent sx={{ pt: 2 }}>
          <Stack spacing={1.5}>
            <Typography sx={{ ...H, fontWeight: 700, fontSize: 18 }}>Trocar de paciente</Typography>
            <DoctorPatientSwitcher patients={p.patients} value={pid} onSelect={(id) => { setSwitcher(false); p.onSwitchPatient(id); }} />
            <Button onClick={() => setSwitcher(false)} sx={{ alignSelf: 'flex-end', textTransform: 'none', borderRadius: '999px', fontWeight: 700, minHeight: 44 }}>Fechar</Button>
          </Stack>
        </DialogContent>
      </Dialog>
    </Box>
  );
};

