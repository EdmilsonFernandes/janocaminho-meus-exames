/**
 * Radar Hormonal — motor de cálculo (puro, testável).
 *
 * Modelo: cada aplicação libera o hormônio seguindo a curva de Bateman (absorção de 1ª
 * ordem do depósito + eliminação de 1ª ordem). A área sob a curva de UMA aplicação é
 * exatamente a dose ativa (a parte do peso que é hormônio, sem o éster).
 *
 * É um modelo EDUCATIVO de tendência: meia-vida e pico são médias de literatura e variam
 * de pessoa para pessoa (veículo, local da aplicação, metabolismo). Nunca é um nível no
 * sangue — isso só o exame mostra.
 *
 * Correções em relação à 1ª versão (13/11/26):
 *  1. O pico da curva agora cai no `tmax` declarado (antes saía ~50% atrasado: a constante
 *     de absorção era chutada por uma fórmula que não resolve a equação).
 *  2. Durateston/Sustanon é a soma dos 4 ésteres reais, não um éster "médio".
 *  3. Pico/vale/oscilação são medidos no ÚLTIMO intervalo completo enquanto o protocolo
 *     está ativo — antes usava os 60% finais da tela, e um ciclo que terminava antes
 *     aparecia com "220% de oscilação".
 *  4. Diz quando o nível ainda NÃO estabilizou (ex.: Nebido em 12 semanas).
 *  5. Cada composto tem FAMÍLIA: o exame de testosterona só se compara com testosterona
 *     (antes somava Masteron/Deca no mesmo total).
 */

export type RadarFamily = 'testosterona' | 'nandrolona' | 'drostanolona' | 'boldenona' | 'trembolona' | 'oxandrolona';

export const RADAR_FAMILIES: Record<RadarFamily, { label: string; aromatizes: boolean; oral17aa?: boolean }> = {
  testosterona: { label: 'Testosterona', aromatizes: true },
  nandrolona: { label: 'Nandrolona', aromatizes: false },
  drostanolona: { label: 'Drostanolona (Masteron)', aromatizes: false },
  boldenona: { label: 'Boldenona', aromatizes: true },
  trembolona: { label: 'Trembolona', aromatizes: false },
  oxandrolona: { label: 'Oxandrolona', aromatizes: false, oral17aa: true },
};

/** Um éster dentro de um produto (misturas têm vários). `share` = fração do peso do frasco. */
export interface RadarEster {
  share: number;
  halfLife: number;
  tmax: number;
  esterRatio: number;
}

export interface RadarCompoundDef {
  id: string;
  name: string;
  /** Nome curto para legenda e chips. */
  short: string;
  family: RadarFamily;
  /** Meia-vida e pico representativos (para exibir); a conta usa `esters`. */
  halfLife: number;
  tmax: number;
  /** Fração do peso que é hormônio (média ponderada nas misturas). */
  esterRatio: number;
  defaultConc: number;
  color: string;
  isOral?: boolean;
  isBlend?: boolean;
  esters: RadarEster[];
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

export interface RadarItemSeries {
  item: RadarProtocolItem;
  comp: RadarCompoundDef;
  values: number[];
  /** Dias (a partir do dia 0) em que há aplicação. */
  injectionDays: number[];
  /** Quais desses dias vieram do REGISTRO do paciente (o resto é previsão pelo intervalo). */
  loggedDays: number[];
}

/** Aplicação registrada, já convertida para "dias desde o início do protocolo". */
export interface LoggedDose {
  day: number;
  /** mg do produto (com o éster). */
  mg: number;
}

export interface RadarSeriesResult {
  stepsPerDay: number;
  totalSteps: number;
  totalDays: number;
  seriesPerItem: RadarItemSeries[];
  total: number[];
}

export interface RadarStats {
  avgDailyMg: number;
  peakMg: number;
  troughMg: number;
  swingPct: number;
  stability: 'estavel' | 'moderado' | 'alto';
  /** Janela medida (em dias desde o início). */
  windowStartDay: number;
  windowEndDay: number;
  /** false = a tela termina antes de o nível estabilizar; os números ainda vão subir. */
  settled: boolean;
  /** Dia aproximado em que o nível estabiliza (≈ 5 meias-vidas do éster mais lento). */
  settleDay: number;
}

const single = (halfLife: number, tmax: number, esterRatio: number): RadarEster[] => [{ share: 1, halfLife, tmax, esterRatio }];

// Durateston/Sustanon 250: propionato 30 + fenilpropionato 60 + isocaproato 60 + decanoato 100 mg.
const SUSTANON_ESTERS: RadarEster[] = [
  { share: 30 / 250, halfLife: 0.9, tmax: 0.5, esterRatio: 0.837 },
  { share: 60 / 250, halfLife: 2.5, tmax: 1.2, esterRatio: 0.686 },
  { share: 60 / 250, halfLife: 4.0, tmax: 1.6, esterRatio: 0.720 },
  { share: 100 / 250, halfLife: 7.5, tmax: 3.0, esterRatio: 0.648 },
];
const blendRatio = (esters: RadarEster[]) => esters.reduce((sum, e) => sum + e.share * e.esterRatio, 0);

// prettier-ignore
export const RADAR_COMPOUNDS: RadarCompoundDef[] = [
  { id: 'sustanon',  name: 'Durateston / Sustanon (mistura de 4 ésteres)', short: 'Durateston',    family: 'testosterona', halfLife: 7.5,  tmax: 1.4, esterRatio: blendRatio(SUSTANON_ESTERS), defaultConc: 250, color: '#0d9488', isBlend: true, esters: SUSTANON_ESTERS },
  { id: 'test_cyp',  name: 'Testosterona Cipionato (Deposteron)',          short: 'Cipionato',     family: 'testosterona', halfLife: 5.0,  tmax: 2.0, esterRatio: 0.699, defaultConc: 200, color: '#0284c7', esters: single(5.0, 2.0, 0.699) },
  { id: 'test_enan', name: 'Testosterona Enantato',                        short: 'Enantato',      family: 'testosterona', halfLife: 4.5,  tmax: 1.8, esterRatio: 0.720, defaultConc: 250, color: '#0369a1', esters: single(4.5, 1.8, 0.720) },
  { id: 'test_prop', name: 'Testosterona Propionato',                      short: 'Propionato',    family: 'testosterona', halfLife: 0.9,  tmax: 0.5, esterRatio: 0.837, defaultConc: 100, color: '#059669', esters: single(0.9, 0.5, 0.837) },
  { id: 'test_und',  name: 'Testosterona Undecanoato (Nebido)',            short: 'Nebido',        family: 'testosterona', halfLife: 21.0, tmax: 7.0, esterRatio: 0.632, defaultConc: 250, color: '#0f766e', esters: single(21.0, 7.0, 0.632) },
  { id: 'nand_dec',  name: 'Nandrolona Decanoato (Deca)',                  short: 'Deca',          family: 'nandrolona',   halfLife: 7.5,  tmax: 3.0, esterRatio: 0.640, defaultConc: 200, color: '#6366f1', esters: single(7.5, 3.0, 0.640) },
  { id: 'nand_npp',  name: 'Nandrolona Fenilpropionato (NPP)',             short: 'NPP',           family: 'nandrolona',   halfLife: 2.5,  tmax: 1.2, esterRatio: 0.670, defaultConc: 100, color: '#8b5cf6', esters: single(2.5, 1.2, 0.670) },
  { id: 'mast_prop', name: 'Masteron Propionato',                          short: 'Masteron P',    family: 'drostanolona', halfLife: 2.0,  tmax: 0.9, esterRatio: 0.840, defaultConc: 100, color: '#ec4899', esters: single(2.0, 0.9, 0.840) },
  { id: 'mast_enan', name: 'Masteron Enantato',                            short: 'Masteron E',    family: 'drostanolona', halfLife: 5.0,  tmax: 2.0, esterRatio: 0.730, defaultConc: 200, color: '#db2777', esters: single(5.0, 2.0, 0.730) },
  { id: 'bold_und',  name: 'Boldenona Undecilenato',                       short: 'Boldenona',     family: 'boldenona',    halfLife: 14.0, tmax: 4.5, esterRatio: 0.630, defaultConc: 250, color: '#10b981', esters: single(14.0, 4.5, 0.630) },
  { id: 'tren_ace',  name: 'Trembolona Acetato',                           short: 'Trembolona A',  family: 'trembolona',   halfLife: 1.2,  tmax: 0.6, esterRatio: 0.870, defaultConc: 100, color: '#f59e0b', esters: single(1.2, 0.6, 0.870) },
  { id: 'tren_enan', name: 'Trembolona Enantato',                          short: 'Trembolona E',  family: 'trembolona',   halfLife: 5.5,  tmax: 2.2, esterRatio: 0.720, defaultConc: 200, color: '#d97706', esters: single(5.5, 2.2, 0.720) },
  { id: 'oxand',     name: 'Oxandrolona (oral)',                           short: 'Oxandrolona',   family: 'oxandrolona',  halfLife: 0.4,  tmax: 0.1, esterRatio: 1.000, defaultConc: 10,  color: '#ef4444', isOral: true, esters: single(0.4, 0.1, 1.000) },
];

export const compoundById = (id: string): RadarCompoundDef => RADAR_COMPOUNDS.find((c) => c.id === id) ?? RADAR_COMPOUNDS[0];

export const RADAR_FREQUENCIES = [
  { label: 'Todos os dias',              days: 1 },
  { label: 'Dia sim, dia não',           days: 2 },
  { label: '2x por semana',              days: 3.5 },
  { label: '1x por semana',              days: 7 },
  { label: 'A cada 10 dias',             days: 10 },
  { label: 'A cada 14 dias',             days: 14 },
  { label: 'A cada 10 semanas (Nebido)', days: 70 },
];

export function getDoseMg(item: Pick<RadarProtocolItem, 'unit' | 'amount' | 'conc'>): number {
  return item.unit === 'ml' ? item.amount * item.conc : item.amount;
}

/**
 * Constante de absorção (ka) que faz o pico da curva cair EXATAMENTE em `tmax`, dado ke.
 * tmax = ln(ka/ke) / (ka − ke) → sem solução fechada; bisseção (a função é monótona em ka).
 * Só existe solução com ka > ke quando tmax < 1/ke; no limite, usa ka ≈ ke.
 */
export function absorptionRate(ke: number, tmaxDays: number): number {
  const tmax = Math.max(0.02, tmaxDays);
  if (tmax >= 1 / ke) return ke * 1.0001;
  let lo = ke * 1.0001;
  let hi = ke * 1e4;
  for (let i = 0; i < 80; i++) {
    const mid = Math.sqrt(lo * hi);
    const t = Math.log(mid / ke) / (mid - ke);
    if (t > tmax) lo = mid; else hi = mid;
  }
  return Math.sqrt(lo * hi);
}

/** Bateman: mg/dia liberados `tDays` após UMA aplicação; integral de 0 a ∞ = activeDoseMg. */
export function batemanReleasePerDay(tDays: number, activeDoseMg: number, halfLifeDays: number, tmaxDays: number): number {
  if (tDays < 0 || activeDoseMg <= 0) return 0;
  const ke = Math.LN2 / Math.max(0.15, halfLifeDays);
  const ka = absorptionRate(ke, tmaxDays);
  if (Math.abs(ka - ke) < ke * 1e-3) return activeDoseMg * ke * ke * tDays * Math.exp(-ke * tDays);
  return Math.max(0, activeDoseMg * ((ka * ke) / (ka - ke)) * (Math.exp(-ke * tDays) - Math.exp(-ka * tDays)));
}

/**
 * `logged` (por compoundId): aplicações que o paciente REGISTROU. Quando existem, valem no lugar
 * do calendário teórico a partir da primeira registrada; depois da última, a previsão continua
 * pelo intervalo do protocolo. Sem registro, tudo é o calendário teórico (como sempre foi).
 */
export function computeRadarSeries(items: RadarProtocolItem[], totalDays: number, variationPct: number, split2x = false, logged?: Record<string, LoggedDose[]>): RadarSeriesResult {
  const usedLog = new Set<string>();
  const stepsPerDay = 4; // resolução de 6 horas
  const totalSteps = totalDays * stepsPerDay;
  // Metabolismo mais rápido (+) encurta meia-vida e pico; mais lento (−) alonga.
  const speed = Math.max(0.5, 1 + variationPct / 100);

  const seriesPerItem = items.map((item) => {
    const comp = compoundById(item.compoundId);
    const rawDoseMg = getDoseMg(item);
    const halve = split2x && item.freqDays >= 7;
    const doseMg = halve ? rawDoseMg / 2 : rawDoseMg;
    const freq = Math.max(0.5, halve ? item.freqDays / 2 : item.freqDays);

    const startDay = Math.max(0, (item.startWeek - 1) * 7);
    const endDay = Math.min(totalDays, item.endWeek * 7);
    // Cada aplicação: dia e mg do produto. O registro só entra no cenário real (não no "e se 2x").
    const real = !split2x && logged && !usedLog.has(item.compoundId)
      ? (logged[item.compoundId] ?? []).filter((d) => Number.isFinite(d.day) && d.mg > 0 && d.day <= totalDays).sort((a, b) => a.day - b.day)
      : [];
    if (real.length) usedLog.add(item.compoundId);
    const shots: Array<{ day: number; mg: number; logged: boolean }> = [];
    const firstReal = real.length ? real[0].day : Infinity;
    for (let d = startDay; d < Math.min(endDay, firstReal) - 1e-9; d += freq) shots.push({ day: d, mg: doseMg, logged: false });
    for (const r of real) shots.push({ day: r.day, mg: r.mg, logged: true });
    if (real.length) for (let d = real[real.length - 1].day + freq; d < endDay - 1e-9; d += freq) shots.push({ day: d, mg: doseMg, logged: false });
    const injectionDays = shots.filter((x) => x.day >= 0).map((x) => x.day);
    const loggedDays = shots.filter((x) => x.logged && x.day >= 0).map((x) => x.day);

    // Pré-calcula as constantes por éster (a conta roda milhares de vezes).
    const parts = comp.esters.map((e) => {
      const ke = Math.LN2 / Math.max(0.15, e.halfLife / speed);
      const ka = absorptionRate(ke, e.tmax / speed);
      const active = e.share * e.esterRatio; // por mg de produto; a dose entra em cada aplicação
      const same = Math.abs(ka - ke) < ke * 1e-3;
      return { ke, ka, same, scale: same ? active * ke * ke : active * ((ka * ke) / (ka - ke)) };
    });

    const values = new Array<number>(totalSteps + 1).fill(0);
    for (let s = 0; s <= totalSteps; s++) {
      const day = s / stepsPerDay;
      let sum = 0;
      for (const inj of shots) {
        const dt = day - inj.day;
        if (dt < 0) break; // aplicações em ordem crescente
        for (const p of parts) {
          sum += inj.mg * (p.same ? p.scale * dt * Math.exp(-p.ke * dt) : p.scale * (Math.exp(-p.ke * dt) - Math.exp(-p.ka * dt)));
        }
      }
      values[s] = Math.max(0, sum);
    }
    return { item, comp, values, injectionDays, loggedDays };
  });

  const total = new Array<number>(totalSteps + 1).fill(0);
  for (const ser of seriesPerItem) for (let s = 0; s <= totalSteps; s++) total[s] += ser.values[s];

  return { stepsPerDay, totalSteps, totalDays, seriesPerItem, total };
}

/** Soma só as séries de uma família (ex.: testosterona, para comparar com o exame). */
export function familyTotal(series: RadarSeriesResult, family: RadarFamily): number[] | null {
  const picked = series.seriesPerItem.filter((s) => s.comp.family === family);
  if (!picked.length) return null;
  const out = new Array<number>(series.totalSteps + 1).fill(0);
  for (const ser of picked) for (let s = 0; s <= series.totalSteps; s++) out[s] += ser.values[s];
  return out;
}

const gcd2 = (a: number, b: number): number => (b < 1e-6 ? a : gcd2(b, a % b));

/**
 * Pico, vale e oscilação medidos no ÚLTIMO ciclo completo de aplicações enquanto todos os
 * compostos ainda estão sendo aplicados. `values` permite medir uma família; padrão = total.
 */
export function computeRadarStats(series: RadarSeriesResult, values: number[] = series.total, only?: RadarItemSeries[]): RadarStats {
  const active = (only ?? series.seriesPerItem).filter((s) => s.injectionDays.length > 0);
  const empty: RadarStats = { avgDailyMg: 0, peakMg: 0, troughMg: 0, swingPct: 0, stability: 'estavel', windowStartDay: 0, windowEndDay: 0, settled: false, settleDay: 0 };
  if (!active.length) return empty;

  // Fim da janela: quando o primeiro composto para (ou o fim da tela). Tamanho: o menor
  // período em que TODAS as frequências se repetem (mmc, em meias-doses de 0,5 dia).
  const end = Math.min(series.totalDays, ...active.map((s) => Math.min(series.totalDays, s.item.endWeek * 7)));
  const start0 = Math.max(...active.map((s) => (s.item.startWeek - 1) * 7));
  const halves = active.map((s) => Math.max(1, Math.round(s.item.freqDays * 2)));
  const lcmHalves = halves.reduce((acc, h) => (acc * h) / gcd2(Math.max(acc, h), Math.min(acc, h)), 1);
  const period = Math.min(lcmHalves / 2, Math.max(1, end - start0));
  const windowEndDay = end;
  const windowStartDay = Math.max(start0, end - period);

  const from = Math.round(windowStartDay * series.stepsPerDay);
  const to = Math.min(series.totalSteps, Math.round(windowEndDay * series.stepsPerDay));
  let sum = 0, count = 0, peak = 0, trough = Infinity;
  // O último ponto pertence ao intervalo seguinte (é o instante da próxima aplicação).
  for (let s = from; s < Math.max(from + 1, to); s++) {
    const v = values[s] ?? 0;
    sum += v; count++;
    if (v > peak) peak = v;
    if (v < trough) trough = v;
  }
  const avgDailyMg = count ? sum / count : 0;
  const troughMg = trough === Infinity ? 0 : trough;
  const swingPct = avgDailyMg > 0 ? ((peak - troughMg) / avgDailyMg) * 100 : 0;

  // Estabiliza em ~5 meias-vidas do éster mais lento, contadas do início dele.
  const settleDay = Math.max(...active.map((s) => (s.item.startWeek - 1) * 7 + 5 * Math.max(...s.comp.esters.map((e) => e.halfLife))));
  return {
    avgDailyMg, peakMg: peak, troughMg, swingPct,
    stability: swingPct < 35 ? 'estavel' : swingPct < 70 ? 'moderado' : 'alto',
    windowStartDay, windowEndDay,
    settled: windowStartDay >= settleDay - 0.5,
    settleDay,
  };
}

// ───────────────────────── exames que estes compostos costumam mexer ─────────────────────────

export interface RadarMarkerDef {
  key: string;
  label: string;
  /** Casa com `nameCanonical` dos exames (MAIÚSCULAS, sem acento). */
  match: RegExp;
  /** Não casar com estes (ex.: "TESTOSTERONA LIVRE" quando se quer a total). */
  exclude?: RegExp;
  /** Para onde costuma ir com o uso. */
  direction: 'sobe' | 'cai' | 'varia';
  /** Por quê, em linguagem de paciente. */
  why: string;
  families: RadarFamily[] | 'todas';
}

const ALL: RadarMarkerDef['families'] = 'todas';

/**
 * Efeitos BEM estabelecidos de andrógenos em exames de rotina. Educativo: diz o que
 * costuma acontecer e por quê — quem interpreta o SEU resultado é o médico.
 */
export const RADAR_MARKERS: RadarMarkerDef[] = [
  { key: 'testosterona', label: 'Testosterona total', match: /TESTOSTERONA/, exclude: /LIVRE|BIODISPON/, direction: 'varia', families: ALL,
    why: 'Com testosterona aplicada, sobe e oscila entre as aplicações. Com outros compostos sem testosterona, a sua produção natural cai.' },
  { key: 'estradiol', label: 'Estradiol', match: /ESTRADIOL/, direction: 'sobe', families: ['testosterona', 'boldenona'],
    why: 'Parte da testosterona vira estradiol no corpo. Quanto mais alto o pico, mais conversão.' },
  { key: 'hematocrito', label: 'Hematócrito', match: /HEMATOCRITO/, direction: 'sobe', families: ALL,
    why: 'Andrógenos estimulam a produção de glóbulos vermelhos; o sangue fica mais "grosso".' },
  { key: 'hemoglobina', label: 'Hemoglobina', match: /^HEMOGLOBINA$|HEMOGLOBINA(?!.*GLIC)/, exclude: /GLIC|A1C|CORPUSCULAR|HCM|CHCM/, direction: 'sobe', families: ALL,
    why: 'Acompanha o hematócrito: mais glóbulos vermelhos, mais hemoglobina.' },
  { key: 'hdl', label: 'Colesterol HDL', match: /HDL/, exclude: /NAO.?HDL|NÃO.?HDL/, direction: 'cai', families: ALL,
    why: 'O colesterol "bom" costuma cair com andrógenos — mais com os orais.' },
  { key: 'ldl', label: 'Colesterol LDL', match: /LDL/, exclude: /VLDL/, direction: 'sobe', families: ALL,
    why: 'O colesterol "ruim" tende a subir enquanto o HDL cai.' },
  { key: 'lh', label: 'LH', match: /^LH\b|HORMONIO LUTEINIZANTE/, direction: 'cai', families: ALL,
    why: 'O corpo percebe hormônio de fora e desliga o sinal que manda os testículos produzirem.' },
  { key: 'fsh', label: 'FSH', match: /^FSH\b|FOLICULO.?ESTIMULANTE/, direction: 'cai', families: ALL,
    why: 'Mesmo motivo do LH; é o sinal ligado à produção de espermatozoides.' },
  { key: 'psa', label: 'PSA', match: /^PSA\b|ANTIGENO PROSTATICO/, exclude: /LIVRE|RELACAO/, direction: 'sobe', families: ['testosterona'],
    why: 'A próstata responde à testosterona; por isso o PSA é acompanhado em quem repõe.' },
  { key: 'tgo', label: 'TGO (AST)', match: /TGO|\bAST\b|ASPARTATO/, direction: 'sobe', families: ['oxandrolona'],
    why: 'Orais passam pelo fígado e podem elevar as enzimas. Treino pesado também eleva o TGO.' },
  { key: 'tgp', label: 'TGP (ALT)', match: /TGP|\bALT\b|ALANINA/, direction: 'sobe', families: ['oxandrolona'],
    why: 'É a enzima mais específica do fígado; orais podem elevá-la.' },
];

/** Marcadores relevantes para os compostos do protocolo, na ordem acima. */
export function markersForProtocol(items: RadarProtocolItem[]): RadarMarkerDef[] {
  const families = new Set(items.map((i) => compoundById(i.compoundId).family));
  return RADAR_MARKERS.filter((m) => m.families === 'todas' || m.families.some((f) => families.has(f)));
}

export interface EvolutionRow {
  nameCanonical: string;
  unit: string | null;
  refLow: number | null;
  refHigh: number | null;
  lastValue: number;
  lastDate: string | null;
  inRange: boolean;
  direction?: 'up' | 'down' | 'stable';
  /** Histórico do analito (mais antigo primeiro), quando a API envia. */
  points?: Array<{ value: number | null; date: string | null }>;
}

/** O resultado mais recente do paciente para um marcador (linhas de GET /items/evolution). */
export function findMarker(rows: EvolutionRow[], marker: RadarMarkerDef): EvolutionRow | null {
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  const hits = rows.filter((r) => {
    const name = norm(String(r.nameCanonical ?? ''));
    return marker.match.test(name) && !(marker.exclude && marker.exclude.test(name)) && Number.isFinite(r.lastValue);
  });
  if (!hits.length) return null;
  return hits.sort((a, b) => new Date(b.lastDate ?? 0).getTime() - new Date(a.lastDate ?? 0).getTime())[0];
}

/** Em que ponto da oscilação um dia cai: 0 = no vale, 1 = no pico. */
export function positionInSwing(valueMg: number, stats: Pick<RadarStats, 'peakMg' | 'troughMg'>): number {
  if (stats.peakMg - stats.troughMg < 1e-6) return 0.5;
  return Math.min(1, Math.max(0, (valueMg - stats.troughMg) / (stats.peakMg - stats.troughMg)));
}

// ───────────────────────── próxima coleta comparável e perguntas para o médico ─────────────────────────

/**
 * Próximos dias em que a coleta cai no MESMO ponto da curva da coleta anterior: cada
 * aplicação futura + o mesmo intervalo (dias depois da aplicação). Serve para COMPARAR
 * exames entre si — não é "melhor dia para um resultado".
 */
export function nextComparableDraws(injectionDays: number[], daysAfterShot: number, todayDay: number, count = 2): number[] {
  const out: number[] = [];
  for (const d of [...injectionDays].sort((a, b) => a - b)) {
    const draw = Math.round(d + daysAfterShot);
    if (draw > todayDay && !out.includes(draw)) out.push(draw);
    if (out.length >= count) break;
  }
  return out;
}

export interface MarkerFinding {
  marker: RadarMarkerDef;
  row: EvolutionRow | null;
}

const MONTH_MS = 30.44 * 86_400_000;

/** Marcadores sem resultado nos últimos `months` meses (ou nunca enviados). */
export function staleMarkers(found: MarkerFinding[], now = Date.now(), months = 6): Array<{ label: string; monthsAgo: number | null }> {
  const out: Array<{ label: string; monthsAgo: number | null }> = [];
  for (const { marker, row } of found) {
    if (!row || !row.lastDate) { out.push({ label: marker.label, monthsAgo: null }); continue; }
    const ago = Math.floor((now - new Date(row.lastDate).getTime()) / MONTH_MS);
    if (ago >= months) out.push({ label: marker.label, monthsAgo: ago });
  }
  return out;
}

const br = (v: number) => v.toLocaleString('pt-BR');

/**
 * Perguntas prontas para a consulta, geradas por REGRA a partir dos dados do paciente
 * (sem IA): transformam número em conversa, não em autodecisão. No máximo `max`.
 */
export function doctorQuestions(
  input: { found: MarkerFinding[]; swingPct: number; drawPosition: number | null; settled: boolean; now?: number },
  max = 6,
): string[] {
  const out: string[] = [];
  for (const { marker, row } of input.found) {
    if (!row || row.inRange || (row.refLow == null && row.refHigh == null)) continue;
    const side = row.refHigh != null && row.lastValue > row.refHigh ? 'acima' : 'abaixo';
    // Faixa com um lado só é comum (HDL "acima de 40", LDL "até 130"): escreve como gente fala.
    const range = row.refLow != null && row.refHigh != null ? `${br(row.refLow)} a ${br(row.refHigh)}` : row.refLow != null ? `a partir de ${br(row.refLow)}` : `até ${br(row.refHigh!)}`;
    out.push(`Meu exame de ${marker.label} veio ${br(row.lastValue)}${row.unit ? ` ${row.unit}` : ''}, ${side} da faixa do laudo (${range}). Isso precisa de acompanhamento no meu caso?`);
  }
  if (input.drawPosition != null && (input.drawPosition > 0.72 || input.drawPosition < 0.28)) {
    out.push(`Meu exame de testosterona foi colhido perto do ${input.drawPosition > 0.72 ? 'pico' : 'vale'} entre as aplicações. Como devo interpretar esse número, e em que momento devo colher o próximo?`);
  }
  if (input.swingPct >= 70) out.push('Pelo que entendi, meu nível sobe e desce bastante entre uma aplicação e outra. Isso faz diferença para mim?');
  if (!input.settled) out.push('Faz pouco tempo que comecei. Quando faz sentido repetir os exames para ver o nível já estabilizado?');
  const missing = staleMarkers(input.found, input.now).map((m) => m.label);
  if (missing.length) out.push(`Não tenho resultado recente de ${missing.slice(0, 4).join(', ')}${missing.length > 4 ? ' e outros' : ''}. Quais desses eu devo acompanhar?`);
  out.push('O que isso muda para a minha fertilidade e para o meu coração a longo prazo?');
  return out.slice(0, max);
}

// ───────────────────────── Registro de aplicações ─────────────────────────

const DAY = 86_400_000;

/** Situação das aplicações de UM composto: última registrada, próxima prevista e atraso. */
export function doseStatus(freqDays: number, takenAtMs: number[], now = Date.now()): { last: number | null; next: number | null; lateDays: number } {
  if (!takenAtMs.length) return { last: null, next: null, lateDays: 0 };
  const last = Math.max(...takenAtMs);
  const next = last + Math.max(0.5, freqDays) * DAY;
  return { last, next, lateDays: Math.max(0, Math.floor((now - next) / DAY)) };
}

// ───────────────────────── Pontos de atenção nos exames ─────────────────────────

export interface ExamAlert {
  key: string;
  level: 'atencao' | 'info';
  title: string;
  text: string;
}

const fmtNum = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const dateBr = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).split('.').join('').split(' de ').join(' ');

/**
 * Avisos por REGRA sobre os exames que os compostos do protocolo costumam mexer.
 * Sempre presos à faixa do PRÓPRIO laudo e à tendência; nunca a um corte clínico fixo, e nunca
 * dizem o que fazer com a dose: a saída é "leve ao seu médico".
 */
export function examAlerts(input: { found: MarkerFinding[]; protocolStart: number | null; now?: number }): ExamAlert[] {
  const now = input.now ?? Date.now();
  const start = input.protocolStart;
  const out: ExamAlert[] = [];

  for (const { marker, row } of input.found) {
    if (!row) continue;
    const unit = row.unit ? ` ${row.unit}` : '';
    const when = row.lastDate ? ` em ${dateBr(row.lastDate)}` : '';
    const hasRef = row.refLow != null || row.refHigh != null;

    if (hasRef && !row.inRange) {
      const above = row.refHigh != null && row.lastValue > row.refHigh;
      const usual = marker.direction === 'varia'
        ? 'Com o que você usa, esse exame varia bastante.'
        : `Com o que você usa, esse exame costuma ${marker.direction === 'sobe' ? 'subir' : 'cair'}.`;
      out.push({
        key: `faixa-${marker.key}`, level: 'atencao',
        title: `${marker.label} ${above ? 'acima' : 'abaixo'} da faixa do laudo`,
        text: `${fmtNum(row.lastValue)}${unit}${when}. ${usual} Leve ao seu médico.`,
      });
      continue;
    }

    // Dentro da faixa, mas andando na direção esperada desde antes do protocolo.
    if (start != null && marker.direction !== 'varia' && row.points?.length) {
      const pts = row.points
        .filter((pt) => pt.value != null && pt.date)
        .map((pt) => ({ v: pt.value as number, t: new Date(pt.date as string).getTime() }))
        .sort((a, b) => a.t - b.t);
      const before = [...pts].reverse().find((pt) => pt.t < start);
      const after = [...pts].reverse().find((pt) => pt.t >= start);
      if (before && after && before.v > 0) {
        const pct = ((after.v - before.v) / before.v) * 100;
        const moved = marker.direction === 'sobe' ? pct >= 10 : pct <= -10;
        if (moved) {
          out.push({
            key: `tendencia-${marker.key}`, level: 'info',
            title: `${marker.label} ${pct > 0 ? 'subiu' : 'caiu'} ${Math.round(Math.abs(pct))}% desde antes do protocolo`,
            text: `De ${fmtNum(before.v)} para ${fmtNum(after.v)}${unit}. Ainda está na faixa do laudo; vale mostrar a evolução ao seu médico.`,
          });
        }
      }
    }
  }

  // Controle: 3 meses de protocolo sem exame depois do início.
  if (start != null && now - start >= 90 * DAY) {
    const months = Math.floor((now - start) / (30.44 * DAY));
    const missing = input.found
      .filter((f) => (f.marker.key === 'hematocrito' || f.marker.key === 'testosterona') && f.row?.lastDate && new Date(f.row.lastDate).getTime() < start)
      .map((f) => f.marker.label);
    if (missing.length) {
      out.push({
        key: 'controle', level: 'info',
        title: `${months} meses de protocolo sem exame de controle`,
        text: `O último resultado de ${missing.join(' e ')} é de antes de você começar. Diretrizes médicas de reposição de testosterona pedem esse controle entre 3 e 6 meses depois do início.`,
      });
    }
  }

  return out.sort((a, b) => (a.level === b.level ? 0 : a.level === 'atencao' ? -1 : 1)).slice(0, 6);
}

// ───────────────────────── Calibração pelos exames da pessoa ─────────────────────────

/**
 * Com 2 ou mais exames de testosterona colhidos DURANTE o protocolo, mede quanto de ng/dL cada
 * mg/dia estimado rendeu naquela pessoa, e devolve o menor e o maior fator. A diferença entre
 * eles é a incerteza honesta da estimativa: quanto maior, menos a curva explica os exames.
 */
export function calibrationRange(
  points: Array<{ value: number | null; date: string | null }> | undefined,
  testoValues: number[] | null,
  stepsPerDay: number,
  protocolStart: number | null,
  totalDays: number,
): { n: number; lo: number; hi: number } | null {
  if (!points?.length || !testoValues || protocolStart == null) return null;
  const factors: number[] = [];
  for (const pt of points) {
    if (pt.value == null || !pt.date) continue;
    const day = (new Date(pt.date).getTime() - protocolStart) / DAY;
    if (day < 14 || day > totalDays) continue; // antes de 2 semanas a curva ainda está subindo
    const model = testoValues[Math.round(day * stepsPerDay)] ?? 0;
    if (model > 0.5 && pt.value > 0) factors.push(pt.value / model);
  }
  if (factors.length < 2) return null;
  return { n: factors.length, lo: Math.min(...factors), hi: Math.max(...factors) };
}
