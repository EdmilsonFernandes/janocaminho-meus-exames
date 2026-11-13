import { useEffect, useMemo, useState } from 'react';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { HormoneRadarIcon } from '../components/reui/icons';
import { Badge } from '../components/reui/badge';
import { API_URL, token } from '../config';
import {
  RADAR_COMPOUNDS,
  RADAR_FREQUENCIES,
  RadarProtocolItem,
  computeRadarSeries,
  computeRadarStats,
  getDoseMg,
} from '../utils/hormoneRadar';

interface LabSnapshot {
  testosterone?: number;
  estradiol?: number;
  hematocrit?: number;
  examDate?: string;
}

function activePatientId(): string {
  try {
    return localStorage.getItem('selPatientId') || localStorage.getItem('patientId') || '';
  } catch {
    return '';
  }
}

export default function RadarHormonal() {
  const [weeks, setWeeks] = useState(12);
  const [variationPct, setVariationPct] = useState(0);
  const [compare2x, setCompare2x] = useState(false);
  const [labDay, setLabDay] = useState(28);
  const [labTesto, setLabTesto] = useState(1180);
  const [realLab, setRealLab] = useState<LabSnapshot | null>(null);
  const [hoverStep, setHoverStep] = useState<number | null>(null);
  const [nextUid, setNextUid] = useState(3);

  const [protocol, setProtocol] = useState<RadarProtocolItem[]>([
    { uid: '1', compoundId: 'sustanon',  unit: 'ml', amount: 1.0, conc: 250, freqDays: 7,   startWeek: 1, endWeek: 12 },
    { uid: '2', compoundId: 'mast_prop', unit: 'ml', amount: 1.0, conc: 100, freqDays: 3.5, startWeek: 1, endWeek: 12 },
  ]);

  // Carrega últimos exames reais de Testosterona, Estradiol e Hematócrito do paciente ativo
  useEffect(() => {
    const pid = activePatientId();
    if (!pid) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/items/evolution?patientId=${encodeURIComponent(pid)}`, {
          headers: { Authorization: `Bearer ${token()}` },
        });
        if (!res.ok) return;
        const rows = await res.json();
        if (!Array.isArray(rows) || cancelled) return;

        const pickLatest = (pattern: RegExp) => {
          const matches = rows.filter((r: any) => pattern.test(String(r.nameCanonical ?? r.name ?? '').toUpperCase()) && Number.isFinite(Number(r.valueNum)));
          if (!matches.length) return null;
          matches.sort((a: any, b: any) => new Date(b.examDate ?? b.createdAt ?? 0).getTime() - new Date(a.examDate ?? a.createdAt ?? 0).getTime());
          return matches[0];
        };

        const tRow = pickLatest(/TESTOSTERONA TOTAL/);
        const eRow = pickLatest(/ESTRADIOL/);
        const hRow = pickLatest(/HEMATOCRITO|HEMATÓCRITO/);

        if (tRow || eRow || hRow) {
          const snap: LabSnapshot = {
            testosterone: tRow ? Number(tRow.valueNum) : undefined,
            estradiol: eRow ? Number(eRow.valueNum) : undefined,
            hematocrit: hRow ? Number(hRow.valueNum) : undefined,
            examDate: (tRow?.examDate || eRow?.examDate || hRow?.examDate)
              ? new Date(tRow?.examDate || eRow?.examDate || hRow?.examDate).toLocaleDateString('pt-BR')
              : undefined,
          };
          setRealLab(snap);
          if (snap.testosterone && snap.testosterone > 0) {
            setLabTesto(Math.round(snap.testosterone));
          }
        }
      } catch {
        /* fallback mantém valores editáveis manualmente */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const totalDays = weeks * 7;
  const mainSeries = useMemo(
    () => computeRadarSeries(protocol, totalDays, variationPct, false),
    [protocol, totalDays, variationPct],
  );
  const compareSeries = useMemo(
    () => (compare2x ? computeRadarSeries(protocol, totalDays, variationPct, true) : null),
    [protocol, totalDays, variationPct, compare2x],
  );
  const stats = useMemo(() => computeRadarStats(mainSeries), [mainSeries]);

  const safeLabDay = Math.min(totalDays, Math.max(1, labDay));
  const labStep = Math.min(mainSeries.totalSteps, safeLabDay * mainSeries.stepsPerDay);
  const labMgDay = mainSeries.total[labStep] ?? 0;
  const calibrationFactor = labMgDay > 0 ? labTesto / labMgDay : 0;
  const relPos = stats.peakMg > stats.troughMg
    ? (labMgDay - stats.troughMg) / (stats.peakMg - stats.troughMg)
    : 0.5;

  const loadPreset = (type: 'dura_mast' | 'trt_1x' | 'trt_2x') => {
    const id1 = String(nextUid);
    const id2 = String(nextUid + 1);
    setNextUid((n) => n + 2);
    if (type === 'dura_mast') {
      setProtocol([
        { uid: id1, compoundId: 'sustanon',  unit: 'ml', amount: 1.0, conc: 250, freqDays: 7,   startWeek: 1, endWeek: weeks },
        { uid: id2, compoundId: 'mast_prop', unit: 'ml', amount: 1.0, conc: 100, freqDays: 3.5, startWeek: 1, endWeek: weeks },
      ]);
      setCompare2x(false);
    } else if (type === 'trt_1x') {
      setProtocol([{ uid: id1, compoundId: 'test_cyp', unit: 'ml', amount: 1.0, conc: 200, freqDays: 7, startWeek: 1, endWeek: weeks }]);
      setCompare2x(true);
    } else {
      setProtocol([{ uid: id1, compoundId: 'test_cyp', unit: 'ml', amount: 0.5, conc: 200, freqDays: 3.5, startWeek: 1, endWeek: weeks }]);
      setCompare2x(false);
    }
  };

  const addCompound = () => {
    const uid = String(nextUid);
    setNextUid((n) => n + 1);
    setProtocol((prev) => [
      ...prev,
      { uid, compoundId: 'nand_npp', unit: 'ml', amount: 1.0, conc: 100, freqDays: 3.5, startWeek: 1, endWeek: weeks },
    ]);
  };

  const removeCompound = (uid: string) => {
    setProtocol((prev) => (prev.length <= 1 ? prev : prev.filter((p) => p.uid !== uid)));
  };

  const updateItem = (uid: string, field: keyof RadarProtocolItem, raw: string | number) => {
    setProtocol((prev) =>
      prev.map((item) => {
        if (item.uid !== uid) return item;
        if (field === 'compoundId') {
          const cid = String(raw);
          const comp = RADAR_COMPOUNDS.find((c) => c.id === cid);
          return {
            ...item,
            compoundId: cid,
            conc: comp?.defaultConc ?? item.conc,
            unit: comp?.isOral ? 'mg' : item.unit,
            amount: comp?.isOral ? 20 : item.amount,
          };
        }
        if (field === 'unit') {
          const nextUnit = raw as 'ml' | 'mg';
          if (nextUnit === item.unit) return item;
          const converted =
            nextUnit === 'mg'
              ? Math.round(item.amount * item.conc)
              : Number((item.amount / Math.max(1, item.conc)).toFixed(2));
          return { ...item, unit: nextUnit, amount: converted };
        }
        return { ...item, [field]: Number(raw) };
      }),
    );
  };

  // Geometria do gráfico SVG
  const svgW = 820;
  const svgH = 300;
  const pad = { top: 20, right: 20, bottom: 32, left: 44 };
  const cw = svgW - pad.left - pad.right;
  const ch = svgH - pad.top - pad.bottom;

  let maxY = 10;
  for (let s = 0; s <= mainSeries.totalSteps; s++) {
    if (mainSeries.total[s] > maxY) maxY = mainSeries.total[s];
    if (compareSeries && compareSeries.total[s] > maxY) maxY = compareSeries.total[s];
  }
  maxY = Math.ceil(maxY * 1.15);

  const xOf = (step: number) => pad.left + (step / Math.max(1, mainSeries.totalSteps)) * cw;
  const yOf = (val: number) => pad.top + ch - (val / Math.max(1, maxY)) * ch;
  const buildPath = (vals: number[]) =>
    vals.map((v, idx) => `${idx === 0 ? 'M' : 'L'}${xOf(idx).toFixed(1)},${yOf(v).toFixed(1)}`).join(' ');

  return (
    <PageContainer width={1140} sx={{ pb: { xs: 14, sm: 6 } }}>
      <PageHeader
        title="Radar Hormonal"
        subtitle="Veja quanto seu corpo absorve por dia, compare picos e vales e cruze com a data do seu exame de sangue."
        icon={<HormoneRadarIcon size={24} />}
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => loadPreset('dura_mast')}
              className="rounded-xl border border-teal-300 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-800 hover:bg-teal-100 transition cursor-pointer"
            >
              Durateston 1ml + Masteron 1ml
            </button>
            <button
              type="button"
              onClick={() => loadPreset('trt_1x')}
              className="rounded-xl border border-slate-200 dark:border-white/15 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 transition cursor-pointer"
            >
              Reposição 1x/sem
            </button>
            <button
              type="button"
              onClick={() => loadPreset('trt_2x')}
              className="rounded-xl border border-slate-200 dark:border-white/15 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 transition cursor-pointer"
            >
              Reposição 2x/sem
            </button>
          </div>
        }
      />

      <div className="space-y-5 mt-4">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="rounded-2xl border border-slate-200/80 dark:border-white/10 bg-white dark:bg-slate-900 p-4 shadow-sm">
            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Quanto entra por dia
            </p>
            <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
              {stats.avgDailyMg.toFixed(1)} mg/d
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500">Hormônio real (sem óleo/éster)</p>
          </div>

          <div className="rounded-2xl border border-slate-200/80 dark:border-white/10 bg-white dark:bg-slate-900 p-4 shadow-sm">
            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Ponto Mais Alto (Pico)
            </p>
            <p className="mt-1 text-2xl font-bold text-teal-600 dark:text-teal-400 tabular-nums">
              {stats.peakMg.toFixed(1)} mg/d
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500">Quando bate mais forte</p>
          </div>

          <div className="rounded-2xl border border-slate-200/80 dark:border-white/10 bg-white dark:bg-slate-900 p-4 shadow-sm">
            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Ponto Mais Baixo (Vale)
            </p>
            <p className="mt-1 text-2xl font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">
              {stats.troughMg.toFixed(1)} mg/d
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500">Antes da próxima dose</p>
          </div>

          <div className="rounded-2xl border border-slate-200/80 dark:border-white/10 bg-white dark:bg-slate-900 p-4 shadow-sm">
            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Efeito Montanha-Russa
            </p>
            <div className="mt-1 flex items-baseline gap-2">
              <p
                className={`text-2xl font-bold tabular-nums ${
                  stats.stability === 'estavel'
                    ? 'text-emerald-600'
                    : stats.stability === 'moderado'
                    ? 'text-amber-600'
                    : 'text-rose-600'
                }`}
              >
                {Math.round(stats.swingPct)}%
              </p>
              <Badge
                variant={stats.stability === 'estavel' ? 'success-light' : stats.stability === 'moderado' ? 'warning-light' : 'destructive-light'}
                size="xs"
              >
                {stats.stability === 'estavel' ? 'Estável' : stats.stability === 'moderado' ? 'Moderado' : 'Oscilação Alta'}
              </Badge>
            </div>
            <p className="mt-0.5 text-[11px] text-slate-500">Quanto menor, mais estável</p>
          </div>
        </div>

        {/* Explicação direta em linguagem humana */}
        <details className="rounded-xl border border-slate-200/80 dark:border-white/10 bg-white dark:bg-slate-900 px-4 py-3 text-xs text-slate-600 dark:text-slate-300 shadow-sm">
          <summary className="cursor-pointer font-semibold text-slate-800 dark:text-slate-100 select-none">
            💡 Como o Dr. Exame calcula esses 4 números?
          </summary>
          <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2.5 border-t border-slate-100 dark:border-white/10 text-[11px] leading-relaxed">
            <div>
              <strong className="text-slate-900 dark:text-white">1. Desconto do éster:</strong><br />
              Cada ml traz o hormônio + o éster (óleo). Ex.: 1 ml de Durateston (250 mg) entrega ~177,5 mg reais de testosterona.
            </div>
            <div>
              <strong className="text-slate-900 dark:text-white">2. Acúmulo das doses:</strong><br />
              Antes de uma dose zerar, você aplica a próxima — o que sobrou soma com a nova até estabilizar (~4ª semana).
            </div>
            <div>
              <strong className="text-slate-900 dark:text-white">3. Pico e Vale:</strong><br />
              <strong>Pico</strong> é o mais alto após aplicar; <strong>Vale</strong> é o mais baixo antes da próxima aplicação.
            </div>
            <div>
              <strong className="text-slate-900 dark:text-white">4. Montanha-Russa (%):</strong><br />
              (Pico − Vale) ÷ Média. Abaixo de 35% indica nível mais uniforme para humor, estradiol e hematócrito.
            </div>
          </div>
        </details>

        {/* Gráfico Principal */}
        <section className="rounded-2xl border border-slate-200/80 dark:border-white/10 bg-white dark:bg-slate-900 p-4 sm:p-6 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-white/10 pb-3">
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className="font-semibold text-slate-800 dark:text-white">Curva de Liberação (mg/dia)</span>
              {mainSeries.seriesPerItem.map((s) => (
                <span key={s.item.uid} className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.comp.color }} />
                  {s.comp.name.split('(')[0].trim()}
                </span>
              ))}
              {protocol.length > 1 && (
                <span className="inline-flex items-center gap-1.5 font-semibold text-slate-900 dark:text-white">
                  <span className="h-0.5 w-4 bg-slate-900 dark:bg-white inline-block" /> Total
                </span>
              )}
              {compare2x && (
                <span className="inline-flex items-center gap-1.5 font-semibold text-amber-600">
                  <span className="h-0.5 w-4 border-b-2 border-dashed border-amber-500 inline-block" /> Comparação 2x/sem
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-white/15 bg-slate-50 dark:bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={compare2x}
                  onChange={(e) => setCompare2x(e.target.checked)}
                  className="rounded text-teal-600"
                />
                <span>Comparar dividindo em 2x/sem</span>
              </label>

              <select
                value={weeks}
                onChange={(e) => setWeeks(Number(e.target.value))}
                className="rounded-lg border border-slate-200 dark:border-white/15 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200"
              >
                <option value={8}>8 semanas</option>
                <option value={12}>12 semanas</option>
                <option value={16}>16 semanas</option>
                <option value={24}>24 semanas</option>
              </select>
            </div>
          </div>

          <div className="relative w-full">
            <svg
              viewBox={`0 0 ${svgW} ${svgH}`}
              className="w-full h-auto max-h-[340px] select-none overflow-visible"
              onMouseLeave={() => setHoverStep(null)}
              onMouseMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const relX = (e.clientX - rect.left) / rect.width;
                const svgX = relX * svgW;
                const clamped = Math.max(0, Math.min(1, (svgX - pad.left) / cw));
                setHoverStep(Math.round(clamped * mainSeries.totalSteps));
              }}
            >
              {/* Grid Y */}
              {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
                const val = maxY * frac;
                const y = yOf(val);
                return (
                  <g key={frac}>
                    <line x1={pad.left} y1={y} x2={svgW - pad.right} y2={y} stroke="currentColor" className="text-slate-100 dark:text-white/10" />
                    <text x={pad.left - 8} y={y + 4} textAnchor="end" className="fill-slate-400 text-[10px]">
                      {Math.round(val)}
                    </text>
                  </g>
                );
              })}

              {/* Eixo X Semanas */}
              {Array.from({ length: weeks + 1 }, (_, wk) => wk)
                .filter((wk) => weeks <= 16 || wk % 2 === 0)
                .map((wk) => {
                  const x = xOf(wk * 7 * mainSeries.stepsPerDay);
                  return (
                    <text key={wk} x={x} y={svgH - 8} textAnchor="middle" className="fill-slate-400 text-[10px]">
                      S{wk}
                    </text>
                  );
                })}

              {/* Séries individuais */}
              {mainSeries.seriesPerItem.map((ser) => (
                <path
                  key={ser.item.uid}
                  d={buildPath(ser.values)}
                  fill="none"
                  stroke={ser.comp.color}
                  strokeWidth={protocol.length === 1 ? 2.6 : 1.8}
                  strokeLinejoin="round"
                />
              ))}

              {/* Total combinado */}
              {protocol.length > 1 && (
                <path
                  d={buildPath(mainSeries.total)}
                  fill="none"
                  stroke="#0f172a"
                  className="dark:stroke-white"
                  strokeWidth={2.6}
                  strokeLinejoin="round"
                />
              )}

              {/* Linha de comparação 2x/semana */}
              {compareSeries && (
                <path
                  d={buildPath(compareSeries.total)}
                  fill="none"
                  stroke="#d97706"
                  strokeWidth={2.2}
                  strokeDasharray="6 4"
                />
              )}

              {/* Pino do Exame Real */}
              <line
                x1={xOf(labStep)}
                y1={pad.top}
                x2={xOf(labStep)}
                y2={pad.top + ch}
                stroke="#e11d48"
                strokeWidth={1.6}
                strokeDasharray="3 3"
              />
              <circle cx={xOf(labStep)} cy={yOf(labMgDay)} r={5.5} fill="#e11d48" stroke="#ffffff" strokeWidth={2} />

              {/* Hover crosshair */}
              {hoverStep !== null && (
                <line
                  x1={xOf(hoverStep)}
                  y1={pad.top}
                  x2={xOf(hoverStep)}
                  y2={pad.top + ch}
                  stroke="#94a3b8"
                  strokeWidth={1}
                />
              )}
            </svg>

            {hoverStep !== null && (
              <div className="mt-2 flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 dark:bg-white/5 px-3 py-2 text-xs">
                <span className="font-semibold text-slate-900 dark:text-white">
                  Dia {(hoverStep / mainSeries.stepsPerDay).toFixed(1)} · Total: {(mainSeries.total[hoverStep] ?? 0).toFixed(1)} mg/d
                </span>
                {mainSeries.seriesPerItem.map((s) => (
                  <span key={s.item.uid} className="text-slate-600 dark:text-slate-300">
                    <span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: s.comp.color }} />
                    {s.comp.name.split(' ')[0]}: <strong>{(s.values[hoverStep] ?? 0).toFixed(1)} mg/d</strong>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Cruzamento com Exame + Variação Individual */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-slate-100 dark:border-white/10">
            <div className="rounded-xl bg-slate-50 dark:bg-white/5 p-3.5 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  Variação Metabólica Individual
                </span>
                <span className="font-bold text-teal-700 dark:text-teal-400 tabular-nums">
                  {variationPct === 0 ? '0% (Padrão)' : variationPct > 0 ? `+${variationPct}% (Rápido)` : `${variationPct}% (Lento)`}
                </span>
              </div>
              <input
                type="range"
                min={-30}
                max={30}
                step={5}
                value={variationPct}
                onChange={(e) => setVariationPct(Number(e.target.value))}
                className="w-full accent-teal-600"
              />
              <p className="text-[11px] text-slate-500">Simula absorção e eliminação mais lenta (-30%) ou acelerada (+30%).</p>
            </div>

            <div className="rounded-xl bg-teal-50/70 dark:bg-teal-950/30 border border-teal-100 dark:border-teal-800/40 p-3.5 space-y-2">
              <div className="flex items-center justify-between text-xs gap-2">
                <span className="font-semibold text-teal-900 dark:text-teal-200">
                  🩸 Cruzamento com Exame de Sangue
                </span>
                <span className="font-bold text-teal-700 dark:text-teal-300 tabular-nums shrink-0">
                  Dia {safeLabDay} (Sem {(safeLabDay / 7).toFixed(1)})
                </span>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={1}
                  max={totalDays}
                  step={1}
                  value={safeLabDay}
                  onChange={(e) => setLabDay(Number(e.target.value))}
                  className="w-full accent-teal-600"
                />
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-[11px] text-teal-900 dark:text-teal-200 font-medium">Testo:</span>
                  <input
                    type="number"
                    min={50}
                    max={5000}
                    step={10}
                    value={labTesto}
                    onChange={(e) => setLabTesto(Number(e.target.value))}
                    className="w-16 rounded-md border border-teal-200 bg-white dark:bg-slate-900 px-1.5 py-1 text-xs font-bold text-teal-900 dark:text-white tabular-nums"
                  />
                  <span className="text-[10px] text-teal-700 dark:text-teal-300">ng/dL</span>
                </div>
              </div>
              <p className="text-[11px] text-teal-800 dark:text-teal-200 font-medium">
                {relPos > 0.72
                  ? `📈 Coleta no PICO (${labMgDay.toFixed(1)} mg/d) · Exame ${labTesto} ng/dL (~${calibrationFactor.toFixed(0)} ng/dL por mg/d). Vale estimado: ~${Math.round(stats.troughMg * calibrationFactor)} ng/dL.`
                  : relPos < 0.28
                  ? `📉 Coleta no VALE (${labMgDay.toFixed(1)} mg/d) · Exame ${labTesto} ng/dL (~${calibrationFactor.toFixed(0)} ng/dL por mg/d). Pico estimado: ~${Math.round(stats.peakMg * calibrationFactor)} ng/dL.`
                  : `⚖️ Coleta INTERMEDIÁRIA (${labMgDay.toFixed(1)} mg/d) · Faixa estimada: ${Math.round(stats.troughMg * calibrationFactor)}–${Math.round(stats.peakMg * calibrationFactor)} ng/dL.`}
              </p>
              {realLab && (
                <p className="text-[11px] text-teal-700 dark:text-teal-300">
                  Último laudo real{realLab.examDate ? ` (${realLab.examDate})` : ''}:{' '}
                  {realLab.testosterone != null && <strong>Testo {realLab.testosterone} ng/dL · </strong>}
                  {realLab.estradiol != null && <span>Estradiol {realLab.estradiol} pg/mL · </span>}
                  {realLab.hematocrit != null && <span>Hematócrito {realLab.hematocrit}%</span>}
                </p>
              )}
            </div>
          </div>
        </section>

        {/* Construtor de Compostos & Conversor ml -> mg */}
        <section className="rounded-2xl border border-slate-200/80 dark:border-white/10 bg-white dark:bg-slate-900 p-4 sm:p-6 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Compostos & Ésteres em Uso</h2>
              <p className="text-xs text-slate-500">Informe em ml (na seringa) ou em mg — o conversor calcula o peso do éster automaticamente.</p>
            </div>
            <button
              type="button"
              onClick={addCompound}
              className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-teal-700 transition shadow-sm cursor-pointer"
            >
              + Adicionar Composto
            </button>
          </div>

          <div className="space-y-3">
            {protocol.map((item) => {
              const comp = RADAR_COMPOUNDS.find((c) => c.id === item.compoundId) ?? RADAR_COMPOUNDS[0];
              const totalMg = getDoseMg(item);
              return (
                <div key={item.uid} className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-white/5 p-3.5 grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                  <div className="md:col-span-3 space-y-1">
                    <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full inline-block" style={{ background: comp.color }} />
                      Composto & Éster
                    </label>
                    <select
                      value={item.compoundId}
                      onChange={(e) => updateItem(item.uid, 'compoundId', e.target.value)}
                      className="w-full rounded-lg border border-slate-200 dark:border-white/15 bg-white dark:bg-slate-800 px-2.5 py-2 text-xs font-medium text-slate-800 dark:text-white"
                    >
                      {RADAR_COMPOUNDS.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-3 space-y-1">
                    <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                      Dose ({item.unit === 'ml' ? 'ml na seringa' : 'mg'})
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={0.1}
                        max={2000}
                        step={item.unit === 'ml' ? 0.1 : 5}
                        value={item.amount}
                        onChange={(e) => updateItem(item.uid, 'amount', e.target.value)}
                        className="w-full rounded-lg border border-slate-200 dark:border-white/15 bg-white dark:bg-slate-800 px-2.5 py-2 text-xs font-semibold text-slate-800 dark:text-white tabular-nums"
                      />
                      <div className="inline-flex rounded-lg border border-slate-200 dark:border-white/15 bg-white dark:bg-slate-800 p-0.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => updateItem(item.uid, 'unit', 'ml')}
                          className={`px-2 py-1 text-[11px] font-semibold rounded-md cursor-pointer ${item.unit === 'ml' ? 'bg-teal-600 text-white' : 'text-slate-600 dark:text-slate-300'}`}
                        >
                          ml
                        </button>
                        <button
                          type="button"
                          onClick={() => updateItem(item.uid, 'unit', 'mg')}
                          className={`px-2 py-1 text-[11px] font-semibold rounded-md cursor-pointer ${item.unit === 'mg' ? 'bg-teal-600 text-white' : 'text-slate-600 dark:text-slate-300'}`}
                        >
                          mg
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="md:col-span-2 space-y-1">
                    <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">Concentração (mg/ml)</label>
                    <input
                      type="number"
                      min={10}
                      max={500}
                      step={10}
                      value={item.conc}
                      disabled={item.unit === 'mg'}
                      onChange={(e) => updateItem(item.uid, 'conc', e.target.value)}
                      className="w-full rounded-lg border border-slate-200 dark:border-white/15 bg-white dark:bg-slate-800 px-2.5 py-2 text-xs font-semibold text-slate-800 dark:text-white tabular-nums disabled:opacity-50"
                    />
                  </div>

                  <div className="md:col-span-2 space-y-1">
                    <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">Frequência</label>
                    <select
                      value={item.freqDays}
                      onChange={(e) => updateItem(item.uid, 'freqDays', e.target.value)}
                      className="w-full rounded-lg border border-slate-200 dark:border-white/15 bg-white dark:bg-slate-800 px-2.5 py-2 text-xs font-medium text-slate-800 dark:text-white"
                    >
                      {RADAR_FREQUENCIES.map((f) => (
                        <option key={f.days} value={f.days}>{f.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-1 flex items-center gap-1">
                    <div className="w-1/2 space-y-1">
                      <label className="text-[10px] font-semibold text-slate-600 dark:text-slate-300">Início</label>
                      <input
                        type="number"
                        min={1}
                        max={24}
                        value={item.startWeek}
                        onChange={(e) => updateItem(item.uid, 'startWeek', e.target.value)}
                        className="w-full rounded-lg border border-slate-200 dark:border-white/15 bg-white dark:bg-slate-800 px-1.5 py-2 text-xs tabular-nums"
                      />
                    </div>
                    <div className="w-1/2 space-y-1">
                      <label className="text-[10px] font-semibold text-slate-600 dark:text-slate-300">Fim</label>
                      <input
                        type="number"
                        min={1}
                        max={24}
                        value={item.endWeek}
                        onChange={(e) => updateItem(item.uid, 'endWeek', e.target.value)}
                        className="w-full rounded-lg border border-slate-200 dark:border-white/15 bg-white dark:bg-slate-800 px-1.5 py-2 text-xs tabular-nums"
                      />
                    </div>
                  </div>

                  <div className="md:col-span-1 flex justify-end">
                    <button
                      type="button"
                      onClick={() => removeCompound(item.uid)}
                      disabled={protocol.length <= 1}
                      className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition disabled:opacity-30 cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="md:col-span-12 flex flex-wrap gap-2 pt-1 text-[11px] text-slate-500">
                    <span className="rounded bg-teal-50 dark:bg-teal-950/40 px-2 py-0.5 font-semibold text-teal-800 dark:text-teal-200 ring-1 ring-teal-200 dark:ring-teal-800">
                      Conversão: {item.unit === 'ml' ? `${item.amount} ml × ${item.conc} mg/ml = ${totalMg.toFixed(0)} mg` : `${totalMg.toFixed(0)} mg`}
                    </span>
                    <span className="rounded bg-white dark:bg-slate-800 px-2 py-0.5 ring-1 ring-slate-200 dark:ring-white/10">
                      Meia-vida: <strong>{comp.halfLife}d</strong>
                    </span>
                    <span className="rounded bg-white dark:bg-slate-800 px-2 py-0.5 ring-1 ring-slate-200 dark:ring-white/10">
                      Pico: <strong>{comp.tmax}d</strong>
                    </span>
                    <span className="rounded bg-white dark:bg-slate-800 px-2 py-0.5 ring-1 ring-slate-200 dark:ring-white/10">
                      Ativo real: <strong>{Math.round(comp.esterRatio * 100)}%</strong> ({(totalMg * comp.esterRatio).toFixed(1)} mg/dose)
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Aviso Médico / CFM */}
        <footer className="rounded-xl border border-slate-200 dark:border-white/10 bg-white/70 dark:bg-slate-900/70 p-4 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
          <strong className="text-slate-700 dark:text-slate-200">Aviso Clínico e Educacional (Dr. Exame):</strong> O Radar Hormonal utiliza modelos teóricos de absorção e eliminação apenas para fins educacionais e apoio à interpretação de picos, vales e janela de coleta laboratorial com seu médico. O Dr. Exame <strong>não recomenda, prescreve ou sugere dosagens ou protocolos</strong>.
        </footer>
      </div>
    </PageContainer>
  );
}

