export interface RadarCompoundDef {
  id: string;
  name: string;
  halfLife: number;
  tmax: number;
  esterRatio: number;
  defaultConc: number;
  color: string;
  isOral?: boolean;
  isBlend?: boolean;
}

export interface RadarProtocolItem {
  uid: string;
  compoundId: string;
  unit: 'ml' | 'mg';
  amount: number;
  conc: number;
  freqDays: number;
  startWeek: number;
  endWeek: number;
}

export interface RadarSeriesResult {
  stepsPerDay: number;
  totalSteps: number;
  seriesPerItem: Array<{
    item: RadarProtocolItem;
    comp: RadarCompoundDef;
    values: number[];
  }>;
  total: number[];
}

export interface RadarStats {
  avgDailyMg: number;
  peakMg: number;
  troughMg: number;
  swingPct: number;
  stability: 'estavel' | 'moderado' | 'alto';
}

export const RADAR_COMPOUNDS: RadarCompoundDef[] = [
  { id: 'sustanon',  name: 'Durateston / Sustanon (Mistura 4 ésteres)', halfLife: 4.8,  tmax: 1.4, esterRatio: 0.710, defaultConc: 250, color: '#0d9488', isBlend: true },
  { id: 'mast_prop', name: 'Masteron Propionato',                       halfLife: 2.0,  tmax: 0.9, esterRatio: 0.840, defaultConc: 100, color: '#ec4899' },
  { id: 'mast_enan', name: 'Masteron Enantato',                         halfLife: 5.0,  tmax: 2.0, esterRatio: 0.730, defaultConc: 200, color: '#db2777' },
  { id: 'test_cyp',  name: 'Testosterona Cipionato (Deposteron)',       halfLife: 5.0,  tmax: 2.0, esterRatio: 0.699, defaultConc: 200, color: '#0284c7' },
  { id: 'test_enan', name: 'Testosterona Enantato',                     halfLife: 4.5,  tmax: 1.8, esterRatio: 0.720, defaultConc: 250, color: '#0369a1' },
  { id: 'test_prop', name: 'Testosterona Propionato',                   halfLife: 0.9,  tmax: 0.5, esterRatio: 0.837, defaultConc: 100, color: '#059669' },
  { id: 'test_und',  name: 'Testosterona Undecanoato (Nebido)',         halfLife: 21.0, tmax: 7.0, esterRatio: 0.632, defaultConc: 250, color: '#0f766e' },
  { id: 'nand_dec',  name: 'Nandrolona Decanoato (Deca)',               halfLife: 7.5,  tmax: 3.0, esterRatio: 0.640, defaultConc: 200, color: '#6366f1' },
  { id: 'nand_npp',  name: 'Nandrolona Fenilpropionato (NPP)',          halfLife: 2.5,  tmax: 1.2, esterRatio: 0.670, defaultConc: 100, color: '#8b5cf6' },
  { id: 'bold_und',  name: 'Boldenona Undecilenato',                    halfLife: 14.0, tmax: 4.5, esterRatio: 0.630, defaultConc: 250, color: '#10b981' },
  { id: 'tren_ace',  name: 'Trembolona Acetato',                        halfLife: 1.2,  tmax: 0.6, esterRatio: 0.870, defaultConc: 100, color: '#f59e0b' },
  { id: 'tren_enan', name: 'Trembolona Enantato',                       halfLife: 5.5,  tmax: 2.2, esterRatio: 0.720, defaultConc: 200, color: '#d97706' },
  { id: 'oxand',     name: 'Oxandrolona (Oral)',                        halfLife: 0.4,  tmax: 0.1, esterRatio: 1.000, defaultConc: 10,  color: '#ef4444', isOral: true },
];

export const RADAR_FREQUENCIES = [
  { label: 'Todos os dias',            days: 1 },
  { label: 'Dia sim, dia não',         days: 2 },
  { label: 'A cada 3,5 dias (2x/sem)', days: 3.5 },
  { label: '1x por semana',            days: 7 },
  { label: 'A cada 10 dias',           days: 10 },
  { label: 'A cada 14 dias',           days: 14 },
  { label: 'A cada 10 semanas (Nebido)', days: 70 },
];

export function getDoseMg(item: Pick<RadarProtocolItem, 'unit' | 'amount' | 'conc'>): number {
  return item.unit === 'ml' ? item.amount * item.conc : item.amount;
}

/** Equação de Bateman normalizada pela integral = doseAtiva (mg/dia liberados). */
export function batemanReleasePerDay(
  tDays: number,
  activeDoseMg: number,
  halfLifeDays: number,
  tmaxDays: number,
): number {
  if (tDays < 0 || activeDoseMg <= 0) return 0;
  const ke = Math.LN2 / Math.max(0.15, halfLifeDays);
  const ka = Math.max(ke * 1.4, Math.log(3.5) / Math.max(0.08, tmaxDays));
  if (Math.abs(ka - ke) < 1e-4) {
    return activeDoseMg * ke * ke * tDays * Math.exp(-ke * tDays);
  }
  const val = activeDoseMg * ((ka * ke) / (ka - ke)) * (Math.exp(-ke * tDays) - Math.exp(-ka * tDays));
  return Math.max(0, val);
}

export function computeRadarSeries(
  items: RadarProtocolItem[],
  totalDays: number,
  variationPct: number,
  split2x = false,
): RadarSeriesResult {
  const stepsPerDay = 4; // resolução de 6 horas
  const totalSteps = totalDays * stepsPerDay;
  const scaleMeta = Math.max(0.5, 1 + variationPct / 100);

  const seriesPerItem = items.map((item) => {
    const comp = RADAR_COMPOUNDS.find((c) => c.id === item.compoundId) ?? RADAR_COMPOUNDS[0];
    const rawDoseMg = getDoseMg(item);
    const effDose = split2x && item.freqDays >= 7 ? rawDoseMg / 2 : rawDoseMg;
    const effFreq = split2x && item.freqDays >= 7 ? item.freqDays / 2 : item.freqDays;
    const activeDose = effDose * comp.esterRatio;

    const startDay = Math.max(0, (item.startWeek - 1) * 7);
    const endDay = Math.min(totalDays, item.endWeek * 7);
    const injectionDays: number[] = [];
    for (let d = startDay; d < endDay; d += Math.max(0.5, effFreq)) {
      injectionDays.push(d);
    }

    const values = new Array<number>(totalSteps + 1);
    const hl = comp.halfLife / scaleMeta;
    const tm = comp.tmax / scaleMeta;

    for (let s = 0; s <= totalSteps; s++) {
      const day = s / stepsPerDay;
      let sum = 0;
      for (let j = 0; j < injectionDays.length; j++) {
        const dt = day - injectionDays[j];
        if (dt >= 0) sum += batemanReleasePerDay(dt, activeDose, hl, tm);
      }
      values[s] = sum;
    }
    return { item, comp, values };
  });

  const total = new Array<number>(totalSteps + 1);
  for (let s = 0; s <= totalSteps; s++) {
    let sum = 0;
    for (const ser of seriesPerItem) sum += ser.values[s];
    total[s] = sum;
  }

  return { stepsPerDay, totalSteps, seriesPerItem, total };
}

export function computeRadarStats(series: RadarSeriesResult): RadarStats {
  const steadyStart = Math.floor(series.totalSteps * 0.4);
  let sum = 0;
  let count = 0;
  let peak = 0;
  let trough = Infinity;

  for (let s = steadyStart; s <= Math.max(steadyStart, series.totalSteps - 4); s++) {
    const v = series.total[s] ?? 0;
    sum += v;
    count++;
    if (v > peak) peak = v;
    if (v < trough) trough = v;
  }

  const avgDailyMg = count > 0 ? sum / count : 0;
  const safeTrough = trough === Infinity ? 0 : trough;
  const swingPct = avgDailyMg > 0 ? ((peak - safeTrough) / avgDailyMg) * 100 : 0;
  const stability: RadarStats['stability'] =
    swingPct < 35 ? 'estavel' : swingPct < 70 ? 'moderado' : 'alto';

  return { avgDailyMg, peakMg: peak, troughMg: safeTrough, swingPct, stability };
}

