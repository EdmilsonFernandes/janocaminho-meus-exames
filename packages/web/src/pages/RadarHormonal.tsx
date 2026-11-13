/**
 * Radar Hormonal — /radar-hormonal (2ª versão, 13/11/26).
 *
 * Plano ReUI: superfície operacional · arquétipo "Frame stack" · família Frame · regiões:
 * resumo em português claro → curva → protocolo → seus exames × protocolo → como calculamos.
 * Sem animação de entrada.
 *
 * Olhar de paciente: cada número vem com o que ele significa; o gráfico diz de onde saem
 * pico e vale; os exames são os DELE (GET /items/evolution), com a faixa do próprio laudo.
 * Educativo: mostra tendência e o que costuma mexer em quais exames. Não sugere dose,
 * não diagnostica — quem ajusta protocolo é o médico.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotify } from 'react-admin';
import {
  Activity, BellPlus, CalendarDays, ChevronDown, CircleHelp, ClipboardList, Copy, FlaskConical, Gauge, Info, Plus, Printer, Sparkles, TrendingDown, TrendingUp, TriangleAlert, Trash2, Waves,
} from 'lucide-react';
import { cn } from 'cn';
import { API_URL, token } from '../config';
import { useSelectedPatient } from '../patient-context';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { CREDIT_COSTS } from '../components/CreditBadge';
import { printDocument } from '../utils/nativeDoc';
import { HormoneRadarIcon } from '@/components/reui/icons';
import { Frame, FrameDescription, FrameFooter, FrameHeader, FramePanel, FrameTitle } from '@/components/reui/frame';
import { Badge } from '@/components/reui/badge';
import { IconTile } from '@/components/reui/icon-tile';
import { Alert, AlertDescription, AlertTitle } from '@/components/reui/alert';
import { useReuiThemeSync } from '@/components/reui/use-reui-theme';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { CompoundExplainDialog } from '@/components/radar/compound-explain';
import { CompoundIcon, CompoundPicker } from '@/components/radar/compound-picker';
import { MarkerSpark } from '@/components/radar/marker-spark';
import { ProtocolItem } from '@/components/radar/protocol-item';
import { RadarChart, radarDash } from '@/components/radar/radar-chart';
import {
  RADAR_FAMILIES, RADAR_FREQUENCIES, compoundById, computeRadarSeries, computeRadarStats, doctorQuestions, familyTotal, findMarker, getDoseMg,
  markersForProtocol, nextComparableDraws, positionInSwing, staleMarkers, type EvolutionRow, type RadarProtocolItem,
} from '@/utils/hormoneRadar';

const WEEK_OPTIONS = [8, 12, 16, 24];
const DAY_MS = 86_400_000;
const n1 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const n0 = (v: number) => Math.round(v).toLocaleString('pt-BR');
/** Faixa do laudo em palavras; com um lado só não vira "40 a —". */
const rangeText = (low: number | null, high: number | null) => {
  const f = (v: number) => v.toLocaleString('pt-BR');
  if (low != null && high != null) return `${f(low)} a ${f(high)}`;
  if (low != null) return `a partir de ${f(low)}`;
  return high != null ? `até ${f(high)}` : '';
};
const shortDate = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '').replace(' de ', ' ');
const monthsAgo = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / (30.44 * DAY_MS));
const weekdayDate = (d: Date) => d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }).replace(/\./g, '').replace(' de ', ' ');
const fullDate = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/\./g, '').replace(/ de /g, ' ');

interface Saved {
  protocol: RadarProtocolItem[];
  weeks: number;
  startDate: string;
  variationPct: number;
}

const DEFAULT_PROTOCOL: RadarProtocolItem[] = [
  { uid: '1', compoundId: 'test_cyp', unit: 'ml', amount: 1, conc: 200, freqDays: 7, startWeek: 1, endWeek: 12 },
];
const storageKey = (pid: string | null | undefined) => `dx-radar-v2:${pid || 'anon'}`;

function loadSaved(pid: string | null | undefined): Saved | null {
  try {
    const raw = localStorage.getItem(storageKey(pid));
    const parsed = raw ? (JSON.parse(raw) as Saved) : null;
    return parsed && Array.isArray(parsed.protocol) && parsed.protocol.length ? parsed : null;
  } catch {
    return null;
  }
}

/** Rótulo curto acima de um campo (a ilha não tem preflight: label precisa de display). */
function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

const STABILITY = {
  estavel: { label: 'Estável', variant: 'success-light', phrase: 'fica bem estável entre uma aplicação e outra' },
  moderado: { label: 'Oscila um pouco', variant: 'warning-light', phrase: 'oscila de forma moderada entre uma aplicação e outra' },
  alto: { label: 'Oscila bastante', variant: 'warning-light', phrase: 'sobe e desce bastante entre uma aplicação e outra' },
} as const;

export default function RadarHormonal() {
  useReuiThemeSync();
  const navigate = useNavigate();
  const notify = useNotify();
  const [pid] = useSelectedPatient();

  const [protocol, setProtocol] = useState<RadarProtocolItem[]>(DEFAULT_PROTOCOL);
  const [weeks, setWeeks] = useState(12);
  const [startDate, setStartDate] = useState('');
  const [variationPct, setVariationPct] = useState(0);
  const [compare2x, setCompare2x] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [manualLabDay, setManualLabDay] = useState(28);
  const [rows, setRows] = useState<EvolutionRow[] | null>(null);
  const [rowsFailed, setRowsFailed] = useState(false);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [explainId, setExplainId] = useState<string | null>(null);
  const [reminding, setReminding] = useState(false);

  // Protocolo fica salvo no aparelho, por paciente (a 1ª versão perdia tudo ao sair da tela).
  useEffect(() => {
    const saved = loadSaved(pid);
    setProtocol(saved?.protocol ?? DEFAULT_PROTOCOL);
    setWeeks(saved?.weeks && WEEK_OPTIONS.includes(saved.weeks) ? saved.weeks : 12);
    setStartDate(saved?.startDate ?? '');
    setVariationPct(saved?.variationPct ?? 0);
    setHidden(new Set());
    setLoadedKey(storageKey(pid));
  }, [pid]);
  useEffect(() => {
    if (loadedKey !== storageKey(pid)) return;
    try { localStorage.setItem(loadedKey, JSON.stringify({ protocol, weeks, startDate, variationPct } satisfies Saved)); } catch { /* cota cheia: segue sem salvar */ }
  }, [protocol, weeks, startDate, variationPct, pid, loadedKey]);

  // Exames reais do paciente (último valor de cada analito, com a faixa do próprio laudo).
  useEffect(() => {
    if (!pid) return;
    let cancelled = false;
    setRows(null);
    setRowsFailed(false);
    fetch(`${API_URL}/items/evolution?patientId=${encodeURIComponent(pid)}`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      // A API devolve { patientId, items: [...] } (aceita lista pura por compatibilidade).
      .then((data) => { if (!cancelled) setRows(Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : []); })
      .catch(() => { if (!cancelled) { setRows([]); setRowsFailed(true); } });
    return () => { cancelled = true; };
  }, [pid]);

  const totalDays = weeks * 7;
  const series = useMemo(() => computeRadarSeries(protocol, totalDays, variationPct), [protocol, totalDays, variationPct]);
  const stats = useMemo(() => computeRadarStats(series), [series]);
  const canSplit = protocol.some((p) => p.freqDays >= 7);
  const compare = useMemo(
    () => (compare2x && canSplit ? computeRadarSeries(protocol, totalDays, variationPct, true) : null),
    [compare2x, canSplit, protocol, totalDays, variationPct],
  );
  const compareStats = useMemo(() => (compare ? computeRadarStats(compare) : null), [compare]);
  const mixedFamilies = new Set(series.seriesPerItem.map((s) => s.comp.family)).size > 1;

  // Só a testosterona se compara com o exame de testosterona.
  const testoValues = useMemo(() => familyTotal(series, 'testosterona'), [series]);
  const testoStats = useMemo(
    () => (testoValues ? computeRadarStats(series, testoValues, series.seriesPerItem.filter((s) => s.comp.family === 'testosterona')) : null),
    [series, testoValues],
  );

  const markers = useMemo(() => markersForProtocol(protocol), [protocol]);
  const found = useMemo(() => markers.map((marker) => ({ marker, row: rows ? findMarker(rows, marker) : null })), [markers, rows]);
  const testoRow = found.find((f) => f.marker.key === 'testosterona')?.row ?? null;
  const testoInProtocolEarly = !!testoValues;

  // Dia do exame: automático quando há data de início e o exame cai dentro do período.
  const start = startDate ? new Date(`${startDate}T12:00:00`) : null;
  const autoDay = start && testoRow?.lastDate ? Math.round((new Date(testoRow.lastDate).getTime() - start.getTime()) / DAY_MS) : null;
  const autoInRange = autoDay != null && autoDay >= 0 && autoDay <= totalDays;
  const examDay = autoInRange ? autoDay : Math.min(totalDays, Math.max(0, manualLabDay));
  const examStep = Math.round(examDay * series.stepsPerDay);
  const testoAtExam = testoValues ? testoValues[examStep] ?? 0 : 0;
  const swingPos = testoStats ? positionInSwing(testoAtExam, testoStats) : 0.5;
  const afterSettle = testoStats ? examDay >= testoStats.settleDay - 0.5 : false;
  const factor = testoRow && testoAtExam > 0.5 ? testoRow.lastValue / testoAtExam : null;
  // Há quantos dias foi a última aplicação de testosterona antes da coleta (para repetir no mesmo ponto).
  const lastShot = Math.max(-1, ...series.seriesPerItem.filter((s) => s.comp.family === 'testosterona').flatMap((s) => s.injectionDays.filter((d) => d <= examDay + 1e-6)));
  const daysAfterShot = lastShot >= 0 ? Math.round(examDay - lastShot) : null;

  const dayLabel = (day: number) => {
    const week = Math.floor(day / 7) + 1;
    if (!start) return `Dia ${Math.floor(day) + 1} · semana ${week}`;
    return `${shortDate(new Date(start.getTime() + day * DAY_MS))} · semana ${week}`;
  };

  const update = (uid: string, patch: Partial<RadarProtocolItem>) => setProtocol((prev) => prev.map((p) => (p.uid === uid ? { ...p, ...patch } : p)));
  const changeCompound = (uid: string, compoundId: string) => {
    const comp = compoundById(compoundId);
    const current = protocol.find((p) => p.uid === uid);
    update(uid, comp.isOral
      ? { compoundId, conc: comp.defaultConc, unit: 'mg', amount: 20, freqDays: 1 }
      : { compoundId, conc: comp.defaultConc, unit: current?.unit === 'mg' && !compoundById(current.compoundId).isOral ? 'mg' : 'ml', amount: current && !compoundById(current.compoundId).isOral ? current.amount : 1, freqDays: current && current.freqDays > 1 ? current.freqDays : 7 });
  };
  const changeUnit = (item: RadarProtocolItem, unit: 'ml' | 'mg') => {
    if (unit === item.unit) return;
    update(item.uid, { unit, amount: unit === 'mg' ? Math.round(item.amount * item.conc) : Number((item.amount / Math.max(1, item.conc)).toFixed(2)) });
  };
  const add = () => setProtocol((prev) => [
    ...prev,
    { uid: String(Date.now()), compoundId: 'test_enan', unit: 'ml', amount: 1, conc: 250, freqDays: 7, startWeek: 1, endWeek: weeks },
  ]);
  const preset = (kind: 'trt1' | 'trt2' | 'dura') => {
    const uid = String(Date.now());
    setCompare2x(kind === 'trt1');
    setHidden(new Set());
    if (kind === 'trt1') setProtocol([{ uid, compoundId: 'test_cyp', unit: 'ml', amount: 1, conc: 200, freqDays: 7, startWeek: 1, endWeek: weeks }]);
    else if (kind === 'trt2') setProtocol([{ uid, compoundId: 'test_cyp', unit: 'ml', amount: 0.5, conc: 200, freqDays: 3.5, startWeek: 1, endWeek: weeks }]);
    else setProtocol([
      { uid, compoundId: 'sustanon', unit: 'ml', amount: 1, conc: 250, freqDays: 7, startWeek: 1, endWeek: weeks },
      { uid: `${uid}b`, compoundId: 'mast_prop', unit: 'ml', amount: 1, conc: 100, freqDays: 3.5, startWeek: 1, endWeek: weeks },
    ]);
  };

  /** Leva protocolo + exames para o chat do Dr. Exame; o usuário revisa e envia (custa créditos do chat). */
  const askDrExame = () => {
    const lines = protocol.map((p) => {
      const comp = compoundById(p.compoundId);
      const freq = RADAR_FREQUENCIES.find((f) => f.days === p.freqDays)?.label.toLowerCase() ?? `a cada ${p.freqDays} dias`;
      return `- ${comp.name}: ${n0(getDoseMg(p))} mg, ${freq}, da semana ${p.startWeek} à ${p.endWeek}`;
    });
    const exams = found.filter((f) => f.row).map((f) => `- ${f.marker.label}: ${f.row!.lastValue.toLocaleString('pt-BR')}${f.row!.unit ? ` ${f.row!.unit}` : ''}${f.row!.lastDate ? ` (${fullDate(f.row!.lastDate)})` : ''}${f.row!.inRange ? '' : ' — fora da faixa do laudo'}`);
    const text = [
      'Estou usando este protocolo hormonal:',
      ...lines,
      '',
      exams.length ? 'Meus exames mais recentes ligados a ele:' : 'Ainda não tenho exames ligados a ele no app.',
      ...exams,
      '',
      'Com base nisso, me explique de forma simples: o que cada um desses exames está mostrando, quais devo acompanhar com mais atenção, quando faz sentido repetir a coleta em relação à aplicação, e que perguntas devo levar ao meu médico.',
    ].join('\n');
    try { sessionStorage.setItem('dx-chat-prefill', text); } catch { /* sem sessionStorage: abre o chat vazio */ }
    navigate('/chat');
  };

  // Próximas coletas no MESMO ponto da curva (só com a data de início: precisa saber que dia é hoje).
  const testoShots = series.seriesPerItem.filter((s) => s.comp.family === 'testosterona').flatMap((s) => s.injectionDays);
  const todayDay = start ? Math.floor((Date.now() - start.getTime()) / DAY_MS) : null;
  const nextDraws = start && todayDay != null && daysAfterShot != null && testoRow
    ? nextComparableDraws(testoShots, daysAfterShot, todayDay, 2).map((d) => new Date(start.getTime() + d * DAY_MS))
    : [];
  const stale = rows ? staleMarkers(found) : [];
  const questions = rows ? doctorQuestions({ found, swingPct: stats.swingPct, drawPosition: testoInProtocolEarly && testoRow ? swingPos : null, settled: stats.settled }) : [];

  const remindNextDraw = async () => {
    if (!nextDraws.length) return;
    setReminding(true);
    try {
      const due = new Date(nextDraws[0]); due.setHours(8, 0, 0, 0);
      const r = await fetch(`${API_URL}/reminders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ patientId: pid, title: 'Colher testosterona (mesmo ponto da curva)', dueDate: due.toISOString(), type: 'exame', note: `Para comparar com o exame anterior: colher ${daysAfterShot === 0 ? 'no dia da aplicação' : `${daysAfterShot} dia(s) depois da aplicação`}.` }),
      });
      if (!r.ok) throw new Error(String(r.status));
      notify(`Lembrete criado para ${weekdayDate(nextDraws[0])}.`, { type: 'success' });
    } catch {
      notify('Não foi possível criar o lembrete. Tente de novo.', { type: 'error' });
    } finally {
      setReminding(false);
    }
  };

  const copyQuestions = async () => {
    try { await navigator.clipboard.writeText(questions.map((q, i) => `${i + 1}. ${q}`).join('\n')); notify('Perguntas copiadas.', { type: 'success' }); }
    catch { notify('Não foi possível copiar. Selecione o texto e copie manualmente.', { type: 'info' }); }
  };

  /** Resumo de 1 página para a consulta: o que uso, o que os exames mostram e minhas dúvidas. */
  const printSummary = () => {
    const esc = (v: unknown) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
    const protoRows = protocol.map((p) => {
      const comp = compoundById(p.compoundId);
      const freq = RADAR_FREQUENCIES.find((f) => f.days === p.freqDays)?.label ?? `A cada ${p.freqDays} dias`;
      return `<tr><td>${esc(comp.name)}</td><td>${n0(getDoseMg(p))} mg</td><td>${esc(freq)}</td><td>semana ${p.startWeek} a ${p.endWeek}</td></tr>`;
    }).join('');
    const examRows = found.map(({ marker, row }) => row
      ? `<tr><td>${esc(marker.label)}</td><td>${esc(row.lastValue.toLocaleString('pt-BR'))} ${esc(row.unit ?? '')}</td><td>${row.lastDate ? esc(fullDate(row.lastDate)) : '—'}</td><td>${row.refLow == null && row.refHigh == null ? 'sem faixa no laudo' : esc(rangeText(row.refLow, row.refHigh))}</td><td>${row.refLow == null && row.refHigh == null ? '' : row.inRange ? 'na faixa' : '<strong>fora da faixa</strong>'}</td></tr>`
      : `<tr><td>${esc(marker.label)}</td><td colspan="4" style="color:#667">sem resultado no app</td></tr>`).join('');
    const draw = testoInProtocolEarly && testoRow && testoRow.lastDate
      ? `<p>Testosterona colhida em ${esc(fullDate(testoRow.lastDate))}${autoInRange && daysAfterShot != null ? `, ${daysAfterShot} dia(s) depois da aplicação, ${swingPos > 0.72 ? 'perto do pico' : swingPos < 0.28 ? 'perto do vale' : 'no meio da oscilação'}` : ''}.</p>`
      : '';
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Resumo para a consulta</title><style>
      body{font-family:'Segoe UI',Arial,sans-serif;padding:28px;line-height:1.5;color:#15233b;max-width:760px;margin:auto}
      h1{font-size:20px;margin:0 0 2px}h2{font-size:14px;margin:22px 0 6px;text-transform:uppercase;letter-spacing:.04em;color:#0f766e}
      table{border-collapse:collapse;width:100%;font-size:13px}td,th{border:1px solid #d5dde0;padding:6px 8px;text-align:left}th{background:#f1f5f5}
      p{margin:6px 0;font-size:13px}ol{font-size:13px;padding-left:18px}li{margin:6px 0}.muted{color:#5b6b7a;font-size:11.5px}</style></head><body>
      <h1>Resumo para a consulta</h1><p class="muted">Gerado no Dr. Exame em ${esc(new Date().toLocaleDateString('pt-BR'))}${start ? ` · protocolo iniciado em ${esc(start.toLocaleDateString('pt-BR'))}` : ''}. Informado pelo próprio paciente.</p>
      <h2>O que estou usando</h2><table><tr><th>Composto</th><th>Dose por aplicação</th><th>Frequência</th><th>Período</th></tr>${protoRows}</table>
      <h2>Meus exames ligados a isso</h2>${draw}<table><tr><th>Exame</th><th>Resultado</th><th>Data</th><th>Faixa do laudo</th><th></th></tr>${examRows}</table>
      <h2>Minhas dúvidas</h2><ol>${questions.map((q) => `<li>${esc(q)}</li>`).join('')}</ol>
      <p class="muted">Documento educativo, montado a partir do que o paciente informou e dos exames enviados ao app. Não é laudo, não sugere dose e não substitui a avaliação médica.</p>
      </body></html>`;
    void printDocument('Resumo para a consulta', html);
  };

  const stab = STABILITY[stats.stability];
  const settleWeek = Math.ceil(stats.settleDay / 7);
  const testoInProtocol = !!testoValues;
  const withExam = found.filter((f) => f.row).length;

  return (
    <PageContainer width={1140} sx={{ pb: { xs: 14, sm: 6 } }}>
      <PageHeader
        title="Radar Hormonal"
        subtitle="Veja como o hormônio se comporta no seu corpo entre as aplicações e o que isso tem a ver com os seus exames."
        icon={<HormoneRadarIcon size={24} />}
      />

      <div className="dx-island flex flex-col gap-4 [&_button]:font-[inherit]">
        {/* ───────── Resumo em português claro ───────── */}
        <Frame>
          <FramePanel className="flex flex-col gap-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <p className="m-0 max-w-2xl text-base leading-relaxed text-foreground sm:text-lg">
                Com este protocolo, o hormônio no seu corpo <strong className="font-semibold">{stab.phrase}</strong>.
                {compareStats ? (
                  <> Dividindo a mesma dose em 2 aplicações por semana, a oscilação cairia de <strong className="font-semibold tabular-nums">{n0(stats.swingPct)}%</strong> para <strong className="font-semibold tabular-nums">{n0(compareStats.swingPct)}%</strong>.</>
                ) : null}
              </p>
              <Badge variant={stab.variant} size="lg">{stab.label}</Badge>
            </div>

            <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3">
              <div className="flex flex-col gap-1 bg-card p-4">
                <span className="text-xs text-muted-foreground">Entra por dia, em média</span>
                <span className="flex items-baseline gap-1">
                  <span className="text-2xl leading-none font-semibold tracking-tight tabular-nums">{n1(stats.avgDailyMg)}</span>
                  <span className="text-sm text-muted-foreground">mg</span>
                </span>
                <span className="text-xs text-muted-foreground">Hormônio de verdade, já sem o peso do éster.</span>
              </div>
              <div className="flex flex-col gap-1 bg-card p-4">
                <span className="text-xs text-muted-foreground">Do ponto mais baixo ao mais alto</span>
                <span className="flex items-baseline gap-1.5">
                  <span className="text-2xl leading-none font-semibold tracking-tight tabular-nums">{n1(stats.troughMg)}</span>
                  <span className="text-sm text-muted-foreground">a</span>
                  <span className="text-2xl leading-none font-semibold tracking-tight tabular-nums">{n1(stats.peakMg)}</span>
                  <span className="text-sm text-muted-foreground">mg/dia</span>
                </span>
                <span className="text-xs text-muted-foreground">Vale (antes de aplicar) e pico (depois de aplicar).</span>
              </div>
              <div className="flex flex-col gap-1 bg-card p-4">
                <span className="text-xs text-muted-foreground">Sobe e desce</span>
                <span className="flex items-baseline gap-1">
                  <span className="text-2xl leading-none font-semibold tracking-tight tabular-nums">{n0(stats.swingPct)}</span>
                  <span className="text-sm text-muted-foreground">%</span>
                </span>
                <span className="text-xs text-muted-foreground">Quanto o nível varia em volta da média. Menor = mais uniforme.</span>
              </div>
            </div>

            {!stats.settled ? (
              <Alert variant="info">
                <Info aria-hidden="true" />
                <AlertTitle>O nível ainda está subindo neste período</AlertTitle>
                <AlertDescription>
                  <p className="m-0">Cada aplicação soma com o que sobrou da anterior. Com estes compostos, isso só estabiliza por volta da semana {settleWeek}; os números acima são do último trecho mostrado.</p>
                </AlertDescription>
              </Alert>
            ) : null}
          </FramePanel>
        </Frame>

        {/* ───────── Curva ───────── */}
        <Frame>
          <FrameHeader className="flex-row flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <div className="flex min-w-0 flex-1 basis-56 items-center gap-3">
              <IconTile variant="frame" size="sm" aria-hidden="true"><Waves aria-hidden="true" /></IconTile>
              <div className="flex min-w-0 flex-col gap-px">
                <FrameTitle role="heading" aria-level={2}>Como a liberação estimada varia entre as aplicações</FrameTitle>
                <FrameDescription>Simulação de quanto hormônio o depósito da injeção libera por dia (mg/dia). Não é o nível no sangue.</FrameDescription>
              </div>
            </div>
            <ToggleGroup value={[String(weeks)]} onValueChange={(next) => { if (next[0]) setWeeks(Number(next[0])); }} variant="outline" size="sm" spacing={0} aria-label="Período mostrado">
              {WEEK_OPTIONS.map((w) => <ToggleGroupItem key={w} value={String(w)}>{w} sem</ToggleGroupItem>)}
            </ToggleGroup>
          </FrameHeader>
          <FramePanel className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {series.seriesPerItem.map((s, index) => {
                const off = hidden.has(s.item.uid);
                const dashed = series.seriesPerItem.length > 1 ? radarDash(index) : '';
                return (
                  <button
                    key={s.item.uid}
                    type="button"
                    aria-pressed={!off}
                    title={off ? 'Mostrar no gráfico' : 'Esconder do gráfico'}
                    onClick={() => setHidden((prev) => { const next = new Set(prev); if (off) next.delete(s.item.uid); else next.add(s.item.uid); return next; })}
                    className={cn('flex min-h-8 cursor-pointer items-center gap-1.5 rounded-full border border-border bg-transparent px-2.5 text-xs text-foreground transition-colors hover:bg-muted', off && 'text-muted-foreground line-through')}
                  >
                    <svg aria-hidden="true" width="20" height="6" viewBox="0 0 20 6" className={cn('shrink-0', off && 'opacity-30')}>
                      <line x1="1" x2="19" y1="3" y2="3" stroke={s.comp.color} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={dashed ? dashed.split(' ').map((n) => Number(n) / 2.2).join(' ') : undefined} />
                    </svg>
                    {s.comp.short}
                  </button>
                );
              })}
              {series.seriesPerItem.length > 1 ? (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><span aria-hidden="true" className="h-0.5 w-4 rounded-full bg-foreground" />Soma dos compostos</span>
              ) : null}
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><span aria-hidden="true" className="h-0 w-4 border-t border-dotted border-foreground/60" />Média diária</span>
              {canSplit ? (
                <button
                  type="button"
                  aria-pressed={compare2x}
                  onClick={() => setCompare2x((v) => !v)}
                  className={cn('ms-auto flex min-h-8 cursor-pointer items-center gap-1.5 rounded-full border border-border bg-transparent px-2.5 text-xs text-foreground transition-colors hover:bg-muted', compare2x && 'border-warning/50 bg-warning/10')}
                >
                  <span aria-hidden="true" className="h-0 w-4 border-t-2 border-dashed border-warning" />
                  E se dividir em 2x por semana?
                </button>
              ) : null}
            </div>
            <RadarChart series={series} compare={compare} stats={stats} weeks={weeks} examDay={testoInProtocol && testoRow ? examDay : null} hidden={hidden} dayLabel={dayLabel} />
            <p className="m-0 flex items-start gap-1.5 rounded-lg bg-muted/60 px-3 py-2 text-xs text-foreground">
              <Info aria-hidden="true" className="mt-px size-3.5 shrink-0 text-muted-foreground" />
              <span><strong className="font-semibold">Este gráfico é uma simulação.</strong> Depois de cada aplicação a estimativa sobe e depois diminui. Ela vem de médias de estudos, e o seu organismo pode responder de forma diferente. O resultado do exame de sangue é medido separadamente e tem outra unidade.</span>
            </p>
            {compareStats ? (
              <div className="flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning/5 px-3 py-2.5 text-xs">
                <strong className="text-sm font-semibold text-foreground">Mesma dose na semana, dividida em 2 aplicações</strong>
                <div className="grid grid-cols-[auto_1fr_1fr] items-baseline gap-x-4 gap-y-1 tabular-nums">
                  <span />
                  <span className="text-muted-foreground">Como está</span>
                  <span className="text-muted-foreground">Dividido em 2x</span>
                  <span className="text-muted-foreground">Pico</span><span>{n1(stats.peakMg)} mg/dia</span><span>{n1(compareStats.peakMg)} mg/dia</span>
                  <span className="text-muted-foreground">Vale</span><span>{n1(stats.troughMg)} mg/dia</span><span>{n1(compareStats.troughMg)} mg/dia</span>
                  <span className="text-muted-foreground">Sobe e desce</span><span>{n0(stats.swingPct)}%</span><span className="font-semibold text-foreground">{n0(compareStats.swingPct)}%</span>
                  <span className="text-muted-foreground">Média</span><span>{n1(stats.avgDailyMg)} mg/dia</span><span>{n1(compareStats.avgDailyMg)} mg/dia</span>
                </div>
                <span className="text-muted-foreground">A quantidade total não muda, só a divisão. É uma simulação: converse com o seu médico antes de mudar a forma de aplicar.</span>
              </div>
            ) : null}
            <ul className="m-0 grid list-none gap-x-5 gap-y-1.5 p-0 text-xs text-muted-foreground sm:grid-cols-2">
              <li className="flex items-start gap-2"><span aria-hidden="true" className="mt-0.5 h-3 w-0.5 shrink-0 rounded-full bg-foreground" /><span><strong className="font-medium text-foreground">Dia da aplicação:</strong> cada risquinho embaixo do gráfico, na cor do composto.</span></li>
              <li className="flex items-start gap-2"><span aria-hidden="true" className="mt-0.5 size-3 shrink-0 rounded-full border-2 border-foreground" /><span><strong className="font-medium text-foreground">Pico:</strong> ponto mais alto estimado depois da aplicação. <strong className="font-medium text-foreground">Vale:</strong> ponto mais baixo estimado antes da próxima.</span></li>
              <li className="flex items-start gap-2"><span aria-hidden="true" className="mt-0.5 size-3 shrink-0 rounded-sm bg-muted-foreground/25" /><span><strong className="font-medium text-foreground">Período usado no cálculo:</strong> a faixa cinza, de onde saem o pico, o vale e a média mostrados acima.</span></li>
              {testoInProtocol && testoRow ? (
                <li className="flex items-start gap-2"><span aria-hidden="true" className="mt-0.5 size-2.5 shrink-0 rotate-45 bg-destructive" /><span><strong className="font-medium text-foreground">Dia do exame:</strong> a linha vermelha marca só a data da coleta de testosterona, não o resultado.</span></li>
              ) : null}
              {series.seriesPerItem.length > 1 ? (
                <li className="flex items-start gap-2 sm:col-span-2"><span aria-hidden="true" className="mt-1.5 h-0.5 w-3 shrink-0 rounded-full bg-foreground" /><span><strong className="font-medium text-foreground">Soma dos compostos:</strong> {mixedFamilies ? 'soma de substâncias diferentes, em mg por dia. Serve para ver o volume total, mas não corresponde a nenhum exame.' : 'soma, em mg por dia, do que cada aplicação ainda está liberando.'}</span></li>
              ) : null}
              <li className="flex items-start gap-2 sm:col-span-2"><span aria-hidden="true" className="mt-0.5 size-3 shrink-0" /><span><strong className="font-medium text-foreground">Primeiras semanas:</strong> a curva sobe porque cada aplicação se soma ao que sobrou da anterior. Quando o que entra e o que sai se equilibram, o desenho passa a se repetir.</span></li>
            </ul>
          </FramePanel>
        </Frame>

        {/* ───────── Protocolo ───────── */}
        <Frame>
          <FrameHeader className="flex-row flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <div className="flex min-w-0 flex-1 basis-56 items-center gap-3">
              <IconTile variant="frame" size="sm" aria-hidden="true"><FlaskConical aria-hidden="true" /></IconTile>
              <div className="flex min-w-0 flex-col gap-px">
                <FrameTitle role="heading" aria-level={2}>O que você usa</FrameTitle>
                <FrameDescription>Informe como está prescrito. Fica salvo só neste aparelho.</FrameDescription>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Exemplos:</span>
              <Button variant="outline" size="sm" onClick={() => preset('trt1')}>Reposição 1x/sem</Button>
              <Button variant="outline" size="sm" onClick={() => preset('trt2')}>Reposição 2x/sem</Button>
              <Button variant="outline" size="sm" onClick={() => preset('dura')}>Durateston + Masteron</Button>
            </div>
          </FrameHeader>

          {protocol.map((item, index) => (
            <FramePanel key={item.uid}>
              <ProtocolItem
                item={item} index={index} weeks={weeks}
                dash={protocol.length > 1 ? radarDash(index) : ''}
                canRemove={protocol.length > 1}
                onUpdate={(patch) => update(item.uid, patch)}
                onChangeCompound={(id) => changeCompound(item.uid, id)}
                onChangeUnit={(unit) => changeUnit(item, unit)}
                onExplain={() => setExplainId(item.compoundId)}
                onRemove={() => setProtocol((prev) => (prev.length <= 1 ? prev : prev.filter((x) => x.uid !== item.uid)))}
              />
            </FramePanel>
          ))}

          <FramePanel className="flex flex-col gap-4">
            <button
              type="button" onClick={add}
              className="flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-transparent px-4 text-sm font-medium text-foreground transition-colors hover:border-primary/60 hover:bg-primary/5"
            >
              <Plus aria-hidden="true" className="size-4" />
              Adicionar outro composto
            </button>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex min-w-0 flex-col gap-2 rounded-lg border border-border px-3 py-3">
                <span className="flex items-center gap-2 text-sm font-medium text-foreground"><CalendarDays aria-hidden="true" className="size-4 text-muted-foreground" />Quando começou? <span className="text-xs font-normal text-muted-foreground">(opcional)</span></span>
                <Input type="date" className="h-10" value={startDate} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setStartDate(e.target.value)} />
                <span className="text-xs text-muted-foreground">Com a data, o gráfico mostra dias de verdade e o seu exame cai no dia certo, sozinho.</span>
              </label>
              <div className="flex min-w-0 flex-col gap-2 rounded-lg border border-border px-3 py-3">
                <span className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-sm font-medium text-foreground">
                  <span className="flex items-center gap-2"><Gauge aria-hidden="true" className="size-4 text-muted-foreground" />Ritmo do seu corpo</span>
                  <Badge variant={variationPct === 0 ? 'outline' : 'info-light'}>{variationPct === 0 ? 'Na média' : variationPct > 0 ? `${variationPct}% mais rápido` : `${-variationPct}% mais devagar`}</Badge>
                </span>
                <Slider min={-30} max={30} step={5} value={[variationPct]} onValueChange={(v) => setVariationPct(Array.isArray(v) ? v[0] : v)} aria-label="Velocidade com que o corpo elimina, em relação à média" className="py-2" />
                <span aria-hidden="true" className="flex justify-between text-xs text-muted-foreground"><span>Elimina devagar</span><span>Média</span><span>Elimina rápido</span></span>
                <span className="text-xs text-muted-foreground">Cada pessoa elimina num ritmo. Deixe no meio se não souber.</span>
              </div>
            </div>
          </FramePanel>
        </Frame>

        {/* ───────── Seus exames × este protocolo ───────── */}
        <Frame>
          <FrameHeader className="flex-row flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <div className="flex min-w-0 flex-1 basis-56 items-center gap-3">
              <IconTile variant="frame" size="sm" aria-hidden="true"><Activity aria-hidden="true" /></IconTile>
              <div className="flex min-w-0 flex-col gap-px">
                <FrameTitle role="heading" aria-level={2}>Seus exames e este protocolo</FrameTitle>
                <FrameDescription>
                  {rows == null ? 'Buscando seus exames…' : `${markers.length} exames que estes compostos costumam mexer · ${withExam} já no app`}
                </FrameDescription>
              </div>
            </div>
          </FrameHeader>

          {/* Em que momento da curva o exame de testosterona foi colhido */}
          {testoInProtocol && testoStats ? (
            <FramePanel className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="m-0 flex items-center gap-2 text-sm font-semibold"><CalendarDays aria-hidden="true" className="size-4 text-muted-foreground" />Em que momento você colheu a testosterona?</h3>
                {testoRow ? <Badge variant="outline" className="tabular-nums">{testoRow.lastValue.toLocaleString('pt-BR')} {testoRow.unit ?? ''}{testoRow.lastDate ? ` · ${fullDate(testoRow.lastDate)}` : ''}</Badge> : null}
              </div>
              {!testoRow ? (
                <p className="m-0 text-sm text-muted-foreground">Ainda não há exame de testosterona total no app. Quando você enviar um, mostramos aqui se ele foi colhido perto do pico ou do vale — isso muda muito a leitura do número.</p>
              ) : (
                <>
                  {!autoInRange ? (
                    <Field label={autoDay != null ? 'O exame é de fora deste período. Arraste para simular outro dia:' : `Informe a data de início acima, ou arraste até o dia da coleta: ${dayLabel(examDay)}`}>
                      <input type="range" min={0} max={totalDays} step={1} value={examDay} onChange={(e) => setManualLabDay(Number(e.target.value))} className="h-10 w-full accent-[var(--primary)]" aria-label="Dia da coleta do exame" />
                    </Field>
                  ) : null}
                  {/* Régua vale → pico com o marcador da coleta */}
                  <div className="flex flex-col gap-1.5" role="img" aria-label={`Coleta ${swingPos > 0.72 ? 'perto do pico' : swingPos < 0.28 ? 'perto do vale' : 'no meio da oscilação'}.`}>
                    <div className="relative h-2.5 rounded-full bg-muted">
                      <span aria-hidden="true" className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-destructive ring-2 ring-card" style={{ left: `${swingPos * 100}%` }} />
                    </div>
                    <div aria-hidden="true" className="flex justify-between text-xs text-muted-foreground"><span>Vale (antes de aplicar)</span><span>Pico (depois de aplicar)</span></div>
                  </div>
                  <p className="m-0 text-sm text-foreground">
                    {autoInRange ? <>Seu exame de {fullDate(testoRow.lastDate!)} caiu em <strong className="font-semibold">{dayLabel(examDay)}</strong>, </> : <>Nesse dia você estaria </>}
                    <strong className="font-semibold">{swingPos > 0.72 ? 'perto do pico' : swingPos < 0.28 ? 'perto do vale' : 'no meio da oscilação'}</strong>
                    {swingPos > 0.72 ? ': o número do laudo é dos mais altos do seu ciclo, não a sua média.' : swingPos < 0.28 ? ': o número do laudo é dos mais baixos do seu ciclo, não a sua média.' : ': o número do laudo fica próximo da sua média.'}
                  </p>
                  {daysAfterShot != null ? (
                    <p className="m-0 rounded-lg bg-muted/60 px-3 py-2 text-xs text-foreground">
                      <strong className="font-semibold">Para comparar exames, colha sempre no mesmo ponto da curva.</strong>{' '}
                      Esta coleta foi {daysAfterShot === 0 ? 'no dia da aplicação' : `${daysAfterShot} ${daysAfterShot === 1 ? 'dia' : 'dias'} depois da aplicação`}; repetir nesse mesmo intervalo deixa o próximo resultado comparável com este.
                    </p>
                  ) : null}
                  {nextDraws.length ? (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
                      <p className="m-0 text-sm text-foreground">
                        Próximas datas equivalentes: <strong className="font-semibold">{nextDraws.map(weekdayDate).join(' ou ')}</strong>
                        <span className="block text-xs text-muted-foreground">Servem para comparar com o exame anterior; quem define quando repetir é o seu médico.</span>
                      </p>
                      <Button variant="outline" size="lg" className="h-10" disabled={reminding} onClick={() => void remindNextDraw()}>
                        <BellPlus aria-hidden="true" />
                        Lembrar-me
                      </Button>
                    </div>
                  ) : daysAfterShot != null && !start ? (
                    <p className="m-0 text-xs text-muted-foreground">Informe a data de início do protocolo para ver as próximas datas equivalentes e criar um lembrete.</p>
                  ) : null}
                  {factor && afterSettle && testoStats.peakMg > testoStats.troughMg ? (
                    <p className="m-0 text-xs text-muted-foreground tabular-nums">
                      Estimativa grosseira, só para dar ideia: ao longo do ciclo sua testosterona ficaria entre ~{n0(testoStats.troughMg * factor)} e ~{n0(testoStats.peakMg * factor)} {testoRow.unit ?? ''}. Só outro exame, colhido em outro momento, confirma.
                    </p>
                  ) : !afterSettle ? (
                    <p className="m-0 text-xs text-muted-foreground">Nesse dia o nível ainda estava subindo (antes da semana {Math.ceil(testoStats.settleDay / 7)}); por isso não estimamos pico e vale a partir deste exame.</p>
                  ) : null}
                </>
              )}
            </FramePanel>
          ) : (
            <FramePanel>
              <p className="m-0 text-sm text-muted-foreground">Este protocolo não tem testosterona. Nesse caso o exame de testosterona mede a sua produção natural, que costuma cair enquanto se usa outros andrógenos.</p>
            </FramePanel>
          )}

          <FramePanel className="p-0!">
            {rowsFailed ? (
              <Alert variant="destructive" className="m-3">
                <TriangleAlert aria-hidden="true" />
                <AlertTitle>Não consegui buscar seus exames agora</AlertTitle>
                <AlertDescription><p className="m-0">A lista abaixo mostra o que acompanhar; os seus valores aparecem quando a conexão voltar.</p></AlertDescription>
              </Alert>
            ) : null}
            {stale.length ? (
              <p className="m-0 border-b border-border px-4 py-3 text-xs text-muted-foreground">
                <strong className="font-semibold text-foreground">Sem resultado recente:</strong>{' '}
                {stale.map((m) => `${m.label} (${m.monthsAgo == null ? 'nunca enviado' : `há ${m.monthsAgo} meses`})`).join(', ')}. Converse com o seu médico sobre quais acompanhar.
              </p>
            ) : null}
            <ul className="m-0 flex list-none flex-col divide-y divide-border p-0">
              {found.map(({ marker, row }) => {
                const Dir = marker.direction === 'sobe' ? TrendingUp : marker.direction === 'cai' ? TrendingDown : Activity;
                return (
                  <li key={marker.key} className="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                    <div className="flex min-w-0 items-start gap-3">
                      <IconTile variant="soft" size="sm" className="mt-0.5 text-muted-foreground" aria-hidden="true"><Dir aria-hidden="true" /></IconTile>
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm font-medium">
                          {marker.label}
                          <span className="text-xs font-normal text-muted-foreground">costuma {marker.direction === 'sobe' ? 'subir' : marker.direction === 'cai' ? 'cair' : 'variar'}</span>
                        </span>
                        <span className="text-xs text-muted-foreground">{marker.why}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2 ps-10 sm:ps-0">
                      {rows == null ? (
                        <span className="text-xs text-muted-foreground">…</span>
                      ) : row ? (
                        <>
                          {row.points && row.points.length >= 2 ? (
                            <MarkerSpark points={row.points} protocolStart={start ? start.getTime() : null} protocolEnd={start ? start.getTime() + totalDays * DAY_MS : null} />
                          ) : null}
                          <span className="flex flex-col items-start sm:items-end">
                            <span className="text-sm font-semibold tabular-nums">
                              {row.points && row.points.length >= 2 && row.points[0].value != null && row.points[0].value !== row.lastValue ? <span className="font-normal text-muted-foreground">{row.points[0].value.toLocaleString('pt-BR')} → </span> : null}
                              {row.lastValue.toLocaleString('pt-BR')} {row.unit ?? ''}
                            </span>
                            {row.lastDate ? <span className="text-xs text-muted-foreground tabular-nums">{fullDate(row.lastDate)}{monthsAgo(row.lastDate) >= 6 ? ` · há ${monthsAgo(row.lastDate)} meses` : ''}</span> : null}
                          </span>
                          {row.refLow == null && row.refHigh == null
                            ? <Badge variant="outline">Sem faixa no laudo</Badge>
                            : <Badge variant={row.inRange ? 'success-light' : 'warning-light'}>{row.inRange ? 'Na faixa do laudo' : row.refHigh != null && row.lastValue > row.refHigh ? 'Acima da faixa do laudo' : 'Abaixo da faixa do laudo'}</Badge>}
                        </>
                      ) : (
                        <Badge variant="outline">Sem exame no app</Badge>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </FramePanel>

          <FrameFooter className="flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="m-0 text-xs text-muted-foreground">
              A faixa é a do seu laudo, que vale para quem não usa hormônio. Em reposição ou ciclo, o que conta é a avaliação do seu médico.
            </p>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button variant="outline" size="lg" className="h-10" onClick={() => navigate('/exams/create')}>Enviar exame</Button>
              <Button size="lg" className="h-10" onClick={askDrExame}>
                <Sparkles aria-hidden="true" />
                Perguntar ao Dr. Exame
                <span className="text-xs font-normal opacity-80 tabular-nums">💎 {CREDIT_COSTS.chat}</span>
              </Button>
            </div>
          </FrameFooter>
        </Frame>

        {/* ───────── Para levar à consulta ───────── */}
        {questions.length ? (
          <Frame>
            <FrameHeader className="flex-row flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <div className="flex min-w-0 flex-1 basis-56 items-center gap-3">
                <IconTile variant="frame" size="sm" aria-hidden="true"><ClipboardList aria-hidden="true" /></IconTile>
                <div className="flex min-w-0 flex-col gap-px">
                  <FrameTitle role="heading" aria-level={2}>Para levar à consulta</FrameTitle>
                  <FrameDescription>Perguntas montadas a partir dos seus dados</FrameDescription>
                </div>
              </div>
            </FrameHeader>
            <FramePanel className="p-0!">
              <ol className="m-0 flex list-none flex-col divide-y divide-border p-0">
                {questions.map((q, i) => (
                  <li key={q} className="flex gap-3 px-4 py-3 text-sm leading-relaxed">
                    <span aria-hidden="true" className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums">{i + 1}</span>
                    {q}
                  </li>
                ))}
              </ol>
            </FramePanel>
            <FrameFooter className="flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="m-0 text-xs text-muted-foreground">O resumo junta o que você usa, seus exames e estas perguntas numa página. Quem decide é o médico.</p>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button variant="outline" size="lg" className="h-10" onClick={() => void copyQuestions()}><Copy aria-hidden="true" />Copiar perguntas</Button>
                <Button size="lg" className="h-10" onClick={printSummary}><Printer aria-hidden="true" />Resumo para a consulta</Button>
              </div>
            </FrameFooter>
          </Frame>
        ) : null}

        {/* ───────── Como calculamos ───────── */}
        <Frame>
          <FramePanel className="p-0!">
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
                Como o Radar chega nesses números
                <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
              </summary>
              <ol className="m-0 grid list-none gap-4 border-t border-border p-4 sm:grid-cols-2">
                <li className="flex flex-col gap-1"><strong className="text-sm font-medium">1. Tira o peso do éster</strong><span className="text-xs text-muted-foreground">O frasco traz o hormônio preso a um éster, que é o que faz durar. Ex.: 250 mg de enantato têm 180 mg de testosterona de verdade.</span></li>
                <li className="flex flex-col gap-1"><strong className="text-sm font-medium">2. Desenha a curva de cada aplicação</strong><span className="text-xs text-muted-foreground">Sobe até o pico e depois cai pela metade a cada meia-vida. Durateston é calculado como os 4 ésteres que ele realmente tem.</span></li>
                <li className="flex flex-col gap-1"><strong className="text-sm font-medium">3. Soma as aplicações</strong><span className="text-xs text-muted-foreground">Antes de uma dose acabar, vem a próxima; o que sobrou soma com a nova até estabilizar (cerca de 5 meias-vidas).</span></li>
                <li className="flex flex-col gap-1"><strong className="text-sm font-medium">4. Mede o trecho estável</strong><span className="text-xs text-muted-foreground">Pico, vale e "sobe e desce" (pico − vale, dividido pela média) saem do último ciclo completo de aplicações, a faixa cinza do gráfico.</span></li>
              </ol>
            </details>
          </FramePanel>
          <FrameFooter>
            <p className="m-0 text-xs text-muted-foreground">
              O Radar é educativo. Usa médias de estudos (meia-vida, tempo até o pico) que variam de pessoa para pessoa, e mostra o que entra no corpo, não o nível no sangue — isso só o exame mede. Não substitui prescrição nem acompanhamento médico, e não sugere doses. {Object.values(RADAR_FAMILIES).length} hormônios cobertos.
            </p>
          </FrameFooter>
        </Frame>
      </div>

      <CompoundExplainDialog compoundId={explainId} onClose={() => setExplainId(null)} />
    </PageContainer>
  );
}
