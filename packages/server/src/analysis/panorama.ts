/**
 * PANORAMA DA SAÚDE — fatos determinísticos, por área, para a tela `/relatorio`.
 * Rota: GET /patients/:id/panorama (routes/panorama.routes.ts). Contrato:
 * packages/shared/src/panorama.ts — implemente exatamente ele; frases são da tela.
 *
 * O que esta camada NÃO faz: não chama IA, não cobra crédito, não diagnóstica. Tudo sai de
 * consultas/resumos que o servidor já tem, e `changed` só reporta o que os números mostram.
 *
 * ─── Isolamento das fontes ───
 * Cada área é uma fonte independente (`panoramaSources`). Fonte que falha — tabela ainda não
 * criada no banco (P2021), erro de banco, fonte pendurada (SOURCE_TIMEOUT_MS) — devolve
 * `status: 'unavailable'` + `data: null`; as demais seguem normais. A resposta nunca vira 500
 * por causa de uma área. Exames com CPF divergente ficam de FORA de tudo que vem de exame
 * (mesmo filtro do health-state: `isCpfMismatch`, em código, nunca em query Prisma).
 *
 * ─── Regras de `status` (precedência, da primeira para a última) ───
 *   missing      a pessoa nunca registrou nada na área (é convite, não erro).
 *   unavailable  a fonte falhou (acima). data sempre null.
 *   stale        existe dado, mas antigo — "nunca pode parecer atual". Vence `attention` nas
 *                áreas de MEDIDA (exames, hormônios, pressão, peso, composição): valor fora da
 *                faixa de um ano atrás não é estado atual. Única exceção: ideação suicida no
 *                rastreio — bandeira de segurança, nunca abafada pela idade do dado (mesma
 *                regra do Dashboard, que a mostra pela última resposta).
 *   attention    há algo a olhar (lista por área abaixo).
 *   ok           resto.
 * `asOf` = data (ISO) do dado mais recente da área — do dado que a área MOSTRA; null sem dado.
 *
 * Janelas de `stale`:
 *   exams / hormones / heart / weight / bodyComp → STALE_DAYS_EXAM (180) — a janela do anel
 *       "Exames em dia" da Home (EXAMS_IN_DAY_WINDOW_DAYS no web/src/utils/homeRecency.ts; o
 *       servidor não tinha a constante — espelhada aqui).
 *   mind     → STALE_DAYS_MIND (90)         diary    → STALE_DAYS_DIARY (7, sem registro)
 *   vitality → STALE_DAYS_SYNC (3, sem sincronização)
 *   meds / vaccines / care / emergency → sem janela: não são medidas, são fatos vigentes.
 *
 * `attention` quando:
 *   exams     último exame com algum valor CRITICAL/ABNORMAL/HIGH/LOW
 *   heart     pressão a partir de 13/8 (sistólica ≥ 130 OU diastólica ≥ 80) ou risco
 *             cardiometabólico alto (o MESMO placar do health-summary — sem 2º placar)
 *   hormones  algum marcador fora da faixa (régua do laudo, ou alvo personalizado)
 *   mind      banda do PHQ-9 ou do GAD-7 a partir de "moderada", ou ideação suicida
 *   meds      alguma interação crítica (D/X) entre os remédios ativos (mesma conta do /check)
 *   vaccines  alguma dose com nextDoseDate no passado (mesma conta da tela de vacinas)
 *   diary / vitality / weight / bodyComp / care / emergency → nunca (ok / missing / stale).
 *
 * `changed` (até MAX_CHANGES, do mais recente para o mais antigo):
 *   entered_range / left_range  marcador presente nos 2 últimos exames COM resultados que
 *                               saiu de/entrou em fora da faixa.
 *   improved / worsened         marcador fora da faixa nos dois, que se aproximou/afastou da
 *                               faixa (trendVerdict do shared) — só com |Δ| ≥ 10% do valor
 *                               (corte do /measurements/since-exam), mesma unidade e mesmo método.
 *   screening                   PHQ-9/GAD-7 entre as duas últimas respostas do instrumento:
 *                               banda mudou ou diferença ≥ 3 pontos.
 *   habit                       sono/passos (média 7 × 30 dias do resumo de atividade) ou peso
 *                               (média dos últimos 7 × 30 dias) com diferença ≥ 10%.
 */
import type {
  PanoramaArea, PanoramaResponse, PanoramaKey, PanoramaStatus, PanoramaChange, PanoramaChangeKind,
  PanoramaExamsData, PanoramaExamValue, PanoramaHeartData, PanoramaWeightData, PanoramaBodyCompData,
  PanoramaHormonesData, PanoramaHormoneKey, PanoramaMindData, PanoramaScreening, PanoramaDiaryData,
  PanoramaVitalityData, PanoramaMetric, PanoramaMedsData, PanoramaCareData, PanoramaVaccinesData,
  PanoramaEmergencyData, PanoramaSeriesPoint, PanoramaRef,
} from '@meus-exames/shared';
import { trendVerdict, severityOf, hasSuicidalIdeation } from '@meus-exames/shared';
import { prisma } from '../prisma';
import { getCachedHealthSummary } from './hs-cache';
import { planRetest, prettyMarker } from './retest';
import { priorityOfItem, PRIORITY_RANK } from './health-state';
import { bmi } from './derived-markers';
import { buildActivitySummary, type ActivitySummary, type ActivityMetric } from './activity-summary';
import { symptomLabel, computeDailyStreak, lastBrDays, brDayKey } from './daily-log-utils';
import { matchInteractions, isCritical } from '../utils/interactions';
import { isCpfMismatch } from '../utils/examIdentity';
import { normalizeUnit, parseNumeric } from '../utils/normalize';

// ───────────────────────── constantes (todas em dias/ms) ─────────────────────────
const DAY_MS = 86_400_000;
export const STALE_DAYS_EXAM = 180;
export const STALE_DAYS_MIND = 90;
export const STALE_DAYS_DIARY = 7;
export const STALE_DAYS_SYNC = 3;
/** Teto por fonte: DB pendurado não segura a resposta inteira. */
export const SOURCE_TIMEOUT_MS = 8_000;
/** Pontos por série: 6 meses (peso ≤ 12 no contrato; pressão não declara → mesma) e 12 meses (hormônios ≤ 12). */
export const MAX_SERIES_6M = 12;
export const MAX_SERIES_12M = 12;
export const MAX_ABNORMAL = 6;
export const MAX_EXAMS_SERIES = 8;
export const MAX_CHANGES = 6;
/** hábito: |média 7d − média 30d| ≥ 10% da média 30d. */
export const HABIT_MIN_DELTA_PCT = 10;
/** improved/worsened: |último − anterior| ≥ 10% do anterior (mesmo corte do /measurements/since-exam). */
export const MARKER_MIN_DELTA_PCT = 10;
/** screening: banda mudou OU diferença ≥ 3 pontos. */
export const SCREENING_MIN_DELTA = 3;
/** Pressão "a partir de 13/8". */
export const BP_ATTENTION_SYSTOLIC = 130;
export const BP_ATTENTION_DIASTOLIC = 80;
/** Banda a partir da qual o rastreio pede atenção. */
const MIND_ATTENTION_FROM = 'moderada';
const NOT_ANSWERED_BAND = 'não realizado';

// ───────────────────────── tipos base ─────────────────────────
type PanoramaDataOf<K extends PanoramaKey> = PanoramaResponse[K] extends PanoramaArea<infer T> ? T : never;
/** Resultado de uma fonte: a área pronta + o dado cru que `changed` reaproveita (sem 2ª consulta). */
export type SourceOutcome<T, R> = { area: PanoramaArea<T>; raw: R };
export interface SourceContext {
  patientId: string;
  now: Date;
  /** Snapshot Layer 2 do health-summary (cacheado). UMA promessa por resposta: coração e hormônios
   *  leem o MESMO placar/alvo, sem construir duas vezes em paralelo. Falha → null (nunca rejecta). */
  snapshot: () => Promise<any>;
}
type SourceMap = { [K in PanoramaKey]: (ctx: SourceContext) => Promise<SourceOutcome<PanoramaDataOf<K>, unknown>> };

interface ExamRow { id: string; title: string; performedAt: Date | null; createdAt: Date; itemCount: number }
interface ItemRow {
  id: string; name: string; nameCanonical: string; valueNumeric: number | null; valueText: string | null; unit: string | null;
  refLow: number | null; refHigh: number | null; refText: string | null; flag: string; isAbnormal: boolean;
  extractedPage: number; method: string | null;
}
export interface ExamsRaw { last: ExamRow | null; prev: ExamRow | null; lastItems: ItemRow[]; prevItems: ItemRow[] }
interface ScreeningRow { type: string; total: number; answers: unknown; createdAt: Date }
export interface MindRaw { rows: ScreeningRow[] }
export interface VitalityRaw { summary: ActivitySummary }
export interface WeightRaw { points30: { v: number; at: Date }[] }

/** Select explícito (regra de drift: nunca ler colunas implícitas de tabela com campo novo). */
const ITEM_SELECT = {
  id: true, name: true, nameCanonical: true, valueNumeric: true, valueText: true, unit: true,
  refLow: true, refHigh: true, refText: true, flag: true, isAbnormal: true, extractedPage: true, method: true,
} as const;

// ───────────────────────── helpers puros ─────────────────────────
const ABNORMAL_FLAGS: readonly string[] = ['HIGH', 'LOW', 'ABNORMAL', 'CRITICAL'];
/** Importance da flag para ordenar: CRITICAL > ABNORMAL/HIGH/LOW (o que o contrato pede). */
const FLAG_TIER: Record<string, number> = { CRITICAL: 0, ABNORMAL: 1, HIGH: 2, LOW: 2 };
/** "Fora da faixa" = marcação do laboratório OU flag fora da faixa. */
const isOut = (it: { flag: string; isAbnormal: boolean }): boolean => it.isAbnormal || ABNORMAL_FLAGS.includes(it.flag);

const examDate = (e: { performedAt: Date | null; createdAt: Date }): Date => e.performedAt ?? e.createdAt;
const iso = (d: Date | null | undefined): string | null => (d ? new Date(d).toISOString() : null);
/**
 * ISO de uma data "de dia" (vacina, consulta, avaliação). Entrada só-data gravada como
 * `new Date('YYYY-MM-DD')` fica à MEIA-NOITE UTC — que, formatada no fuso do Brasil (UTC−3),
 * aparece como o dia ANTERIOR. Meia-noite UTC exata sai como meio-dia UTC do mesmo dia civil
 * (convenção do app p/ datas de dia); qualquer outro horário sai como veio.
 */
export function dayIso(d: Date): string {
  const s = d.toISOString();
  return s.endsWith('T00:00:00.000Z') ? `${s.slice(0, 10)}T12:00:00.000Z` : s;
}
const numOf = (it: { valueNumeric: number | null; valueText: string | null }): number | null =>
  it.valueNumeric ?? parseNumeric(it.valueText);
const round1 = (v: number): number => Math.round(v * 10) / 10;
const round2 = (v: number): number => Math.round(v * 100) / 100;
const avgOf = (a: number[]): number | null => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
const nonEmpty = (s: string | null | undefined): boolean => !!(s && s.trim());
const maxDate = (dates: (Date | null | undefined)[]): Date | null =>
  dates.reduce<Date | null>((acc, d) => (d && (!acc || d > acc) ? d : acc), null);
/** Antigo = mais de `days` de idade (igual ainda conta como atual). */
const isOlderThan = (d: Date | null, days: number, now: Date): boolean => !d || now.getTime() - d.getTime() > days * DAY_MS;
/** N meses atrás (dia clamps no último dia do mês — 31/11 não existe). */
function monthsAgo(now: Date, months: number): Date {
  const out = new Date(now.getTime());
  const day = out.getUTCDate();
  out.setUTCMonth(out.getUTCMonth() - months);
  if (out.getUTCDate() !== day) out.setUTCDate(0);
  return out;
}
/** No máx. `max` pontos, espaçados de modo uniforme — sempre inclui o 1º e o último. */
export function downsample<T>(arr: T[], max: number): T[] {
  if (!arr.length) return arr;
  if (arr.length <= max || max <= 1) return max <= 1 ? [arr[arr.length - 1]] : arr;
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(arr[Math.round((i * (arr.length - 1)) / (max - 1))]);
  return out;
}
/** Teto de tempo por fonte: DB pendurado vira `unavailable` na área, não resposta presa. */
export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`fonte "${label}" excedeu ${ms}ms`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

function mkArea<T>(key: PanoramaKey, status: PanoramaStatus, asOf: Date | string | null, data: T): PanoramaArea<T> {
  return { key, status, asOf: typeof asOf === 'string' ? asOf : iso(asOf), data };
}
/** Área sem dado (missing / unavailable): `data: null` como o contrato pede. */
const noData = <T>(key: PanoramaKey, status: PanoramaStatus): PanoramaArea<T> => ({ key, status, asOf: null, data: null });
const unavailable = (key: PanoramaKey): PanoramaArea<never> => noData(key, 'unavailable');
interface AreaRule { hasData: boolean; asOf: Date | null; attention: boolean; staleAfterDays?: number | null }
function statusOf(r: AreaRule, now: Date): PanoramaStatus {
  if (!r.hasData) return 'missing';
  if (r.staleAfterDays != null && isOlderThan(r.asOf, r.staleAfterDays, now)) return 'stale';
  return r.attention ? 'attention' : 'ok';
}

// ═══════════════════════════ EXAMES ═══════════════════════════
async function loadExams(ctx: SourceContext): Promise<SourceOutcome<PanoramaExamsData, ExamsRaw>> {
  const { patientId, now } = ctx;
  // rawExtraction é lido SÓ para o filtro de CPF (o health-state já o lê por ITEM; aqui é por exame).
  const rows = await prisma.exam.findMany({
    where: { patientId, status: 'EXTRACTED' },
    select: { id: true, title: true, performedAt: true, createdAt: true, rawExtraction: true, _count: { select: { items: true } } },
  });
  const exams: ExamRow[] = rows
    .filter((e) => !isCpfMismatch(e.rawExtraction))
    .map((e) => ({ id: e.id, title: e.title, performedAt: e.performedAt, createdAt: e.createdAt, itemCount: e._count.items }));
  const empty: ExamsRaw = { last: null, prev: null, lastItems: [], prevItems: [] };
  if (!exams.length) return { area: noData('exams', 'missing'), raw: empty };
  const byDateDesc = [...exams].sort((a, b) => examDate(b).getTime() - examDate(a).getTime());
  // "Último exame" da área = o mais recente COM resultados: um laudo sem valores estruturados não
  // apaga os resultados de sangue do exame anterior. O prazo de repetir segue o /retest (qualquer
  // exame extraído) — mesma função pura `planRetest`, para não divergir do cartão da Home.
  const latestAny = byDateDesc[0];
  const withItems = byDateDesc.filter((e) => e.itemCount > 0).slice(0, MAX_EXAMS_SERIES);
  const last = withItems[0] ?? null;
  const prev = withItems[1] ?? null;
  const [lastItems, prevItems, olderItems] = await Promise.all([
    last ? prisma.examItem.findMany({ where: { examId: last.id }, select: ITEM_SELECT }) : Promise.resolve([]),
    prev ? prisma.examItem.findMany({ where: { examId: prev.id }, select: ITEM_SELECT }) : Promise.resolve([]),
    prisma.examItem.findMany({ where: { examId: { in: withItems.slice(2).map((e) => e.id) } }, select: { examId: true, flag: true, isAbnormal: true } }),
  ]);
  const outByExam = new Map<string, number>();
  for (const r of olderItems) if (isOut(r)) outByExam.set(r.examId, (outByExam.get(r.examId) ?? 0) + 1);
  const lastOut = lastItems.filter(isOut);
  if (last) outByExam.set(last.id, lastOut.length);
  if (prev) outByExam.set(prev.id, prevItems.filter(isOut).length);

  // Quanto o valor ultrapassa a faixa, relativo à largura dela (sem faixa numérica: 1 se fora).
  const overshoot = (it: ItemRow): number => {
    const v = numOf(it);
    if (v == null) return 0;
    const { refLow: lo, refHigh: hi } = it;
    if (lo != null && hi != null && hi > lo) return v > hi ? (v - hi) / (hi - lo) : v < lo ? (lo - v) / (hi - lo) : 0;
    return (hi != null && v > hi) || (lo != null && v < lo) ? 1 : 0;
  };
  const abnormal: PanoramaExamValue[] = [...lastOut]
    .sort((a, b) =>
      (FLAG_TIER[a.flag] ?? 3) - (FLAG_TIER[b.flag] ?? 3)
      || PRIORITY_RANK[priorityOfItem(b)] - PRIORITY_RANK[priorityOfItem(a)]
      || overshoot(b) - overshoot(a)
      || a.name.localeCompare(b.name))
    .slice(0, MAX_ABNORMAL)
    .map((it) => ({
      id: it.id, name: it.name, nameCanonical: it.nameCanonical,
      valueText: it.valueText, valueNumeric: it.valueNumeric, unit: it.unit, flag: it.flag,
      ref: { low: it.refLow, high: it.refHigh, text: it.refText },
      extractedPage: it.extractedPage,
    }));
  // Se o exame mais recente não é o `last`, ele não tem nenhum item (sem resultados) → nada alterado.
  const retestAbnormal = latestAny.id === last?.id ? lastItems.filter((i) => i.isAbnormal).map((i) => i.name) : [];
  const plan = planRetest({ id: latestAny.id, date: examDate(latestAny), abnormal: retestAbnormal }, now);

  const data: PanoramaExamsData = {
    lastExam: last ? { id: last.id, title: last.title, performedAt: iso(last.performedAt) } : null,
    examCount: exams.length,
    itemCount: lastItems.length,
    abnormalCount: lastOut.length,
    abnormal,
    retest: { dueAt: plan.dueAt, months: plan.months, status: plan.status },
    abnormalPerExam: [...withItems].reverse().map((e) => ({ at: iso(examDate(e))!, count: outByExam.get(e.id) ?? 0 })),
  };
  return {
    area: mkArea('exams', statusOf({ hasData: true, asOf: last ? examDate(last) : examDate(latestAny), attention: lastOut.length > 0, staleAfterDays: STALE_DAYS_EXAM }, now), last ? examDate(last) : examDate(latestAny), data),
    raw: { last, prev, lastItems, prevItems },
  };
}

// ═══════════════════════════ CORAÇÃO E PRESSÃO ═══════════════════════════
/** Mesmo placar do health-summary ('baixo'|'moderado'|'alto') → vocabulário do contrato. */
function cardioOf(snap: any): PanoramaHeartData['cardioRisk'] {
  const level = snap?.cardiometabolicRisk?.level;
  if (level === 'baixo') return { level: 'low', label: 'baixo' };
  if (level === 'moderado') return { level: 'moderate', label: 'moderado' };
  if (level === 'alto') return { level: 'high', label: 'alto' };
  return null;
}
/** Idade do corpo: só método NOMEADO do snapshot (PhenoAge completo; senão KDM). O z-score
 *  'simplified' não está no contrato — não é rotulado de PhenoAge. É uma ESTIMATIVA. */
function bodyAgeOf(snap: any, dateOfBirth: Date | null, now: Date): PanoramaHeartData['bodyAge'] {
  const chrono = dateOfBirth ? Math.floor((now.getTime() - dateOfBirth.getTime()) / (365.25 * DAY_MS)) : null;
  const pheno = snap?.biologicalAge;
  const kdm = snap?.biologicalAgeKdm;
  if (pheno?.method === 'phenoage' && Number.isFinite(pheno.age)) return { estimate: round1(pheno.age), method: 'phenoage', chronologicalAge: chrono };
  if (kdm?.method === 'kdm' && Number.isFinite(kdm.age)) return { estimate: round1(kdm.age), method: 'kdm', chronologicalAge: chrono };
  return null;
}
async function loadHeart(ctx: SourceContext): Promise<SourceOutcome<PanoramaHeartData, null>> {
  const { patientId, now } = ctx;
  const [bp, bpRows, patient, snap] = await Promise.all([
    // Última aferição COMPLETA (sistólica + diastólica): value = sistólica, valueSecondary = diastólica.
    prisma.measurement.findFirst({
      where: { patientId, type: 'BLOOD_PRESSURE', valueSecondary: { not: null } },
      orderBy: { measuredAt: 'desc' }, select: { value: true, valueSecondary: true, measuredAt: true },
    }),
    prisma.measurement.findMany({
      where: { patientId, type: 'BLOOD_PRESSURE', measuredAt: { gte: monthsAgo(now, 6) } },
      orderBy: { measuredAt: 'asc' }, select: { value: true, measuredAt: true },
    }),
    prisma.patient.findUnique({ where: { id: patientId }, select: { dateOfBirth: true } }),
    ctx.snapshot(),
  ]);
  const cardioRisk = cardioOf(snap);
  const bodyAge = bodyAgeOf(snap, patient?.dateOfBirth ?? null, now);
  const hasData = !!bp || !!cardioRisk || !!bodyAge;
  if (!hasData) return { area: noData('heart', 'missing'), raw: null };
  const attention = (!!bp && (bp.value >= BP_ATTENTION_SYSTOLIC || (bp.valueSecondary ?? 0) >= BP_ATTENTION_DIASTOLIC))
    || cardioRisk?.level === 'high';
  const asOf = maxDate([bp?.measuredAt, snap?.recency?.latestExamAt ?? null]);
  const data: PanoramaHeartData = {
    bp: bp ? { systolic: bp.value, diastolic: bp.valueSecondary ?? 0, at: bp.measuredAt.toISOString() } : null,
    bpSeries: downsample(bpRows.map((r) => ({ at: r.measuredAt.toISOString(), v: r.value })), MAX_SERIES_6M),
    cardioRisk,
    bodyAge,
  };
  return { area: mkArea('heart', statusOf({ hasData, asOf, attention, staleAfterDays: STALE_DAYS_EXAM }, now), asOf, data), raw: null };
}

// ═══════════════════════════ PESO ═══════════════════════════
async function loadWeight(ctx: SourceContext): Promise<SourceOutcome<PanoramaWeightData, WeightRaw>> {
  const { patientId, now } = ctx;
  const [latest, rows, patient] = await Promise.all([
    prisma.measurement.findFirst({ where: { patientId, type: 'WEIGHT' }, orderBy: { measuredAt: 'desc' }, select: { value: true, measuredAt: true } }),
    prisma.measurement.findMany({ where: { patientId, type: 'WEIGHT', measuredAt: { gte: monthsAgo(now, 6) } }, orderBy: { measuredAt: 'asc' }, select: { value: true, measuredAt: true } }),
    prisma.patient.findUnique({ where: { id: patientId }, select: { heightCm: true } }),
  ]);
  if (!latest) return { area: noData('weight', 'missing'), raw: { points30: [] } };
  const since30 = now.getTime() - 30 * DAY_MS;
  const points30 = rows.filter((r) => r.measuredAt.getTime() >= since30).map((r) => ({ v: r.value, at: r.measuredAt }));
  const data: PanoramaWeightData = {
    latest: { v: latest.value, at: latest.measuredAt.toISOString() },
    series: downsample(rows.map((r) => ({ at: r.measuredAt.toISOString(), v: r.value })), MAX_SERIES_6M),
    // Mesma conta do IMC do health-summary: peso da última medição × altura do perfil.
    bmi: bmi(latest.value, patient?.heightCm ?? null),
  };
  return { area: mkArea('weight', statusOf({ hasData: true, asOf: latest.measuredAt, attention: false, staleAfterDays: STALE_DAYS_EXAM }, now), latest.measuredAt, data), raw: { points30 } };
}

// ═══════════════════════════ COMPOSIÇÃO CORPORAL ═══════════════════════════
async function loadBodyComp(ctx: SourceContext): Promise<SourceOutcome<PanoramaBodyCompData, null>> {
  const { patientId, now } = ctx;
  const latest = await prisma.bodyComposition.findFirst({
    where: { patientId }, orderBy: { measuredAt: 'desc' },
    select: { measuredAt: true, bodyFatPct: true, skeletalMuscleKg: true, weightKg: true },
  });
  if (!latest) return { area: noData('bodyComp', 'missing'), raw: null };
  const data: PanoramaBodyCompData = {
    latest: {
      at: dayIso(latest.measuredAt),
      bodyFatPct: latest.bodyFatPct,
      // O aparelho guarda músculo em KG. % do peso só quando a MESMA avaliação trouxe os dois.
      skeletalMusclePct: latest.skeletalMuscleKg != null && latest.weightKg != null && latest.weightKg > 0
        ? round1((latest.skeletalMuscleKg / latest.weightKg) * 100) : null,
      skeletalMuscleKg: latest.skeletalMuscleKg,
    },
  };
  return { area: mkArea('bodyComp', statusOf({ hasData: true, asOf: latest.measuredAt, attention: false, staleAfterDays: STALE_DAYS_EXAM }, now), dayIso(latest.measuredAt), data), raw: null };
}

// ═══════════════════════════ HORMÔNIOS E VITAMINAS ═══════════════════════════
const HORMONES: { key: PanoramaHormoneKey; label: string }[] = [
  { key: 'TSH', label: 'TSH' },
  { key: 'T4_FREE', label: 'T4 livre' },
  { key: 'VITAMIN_D', label: 'Vitamina D' },
];
/** Chave do contrato → nameCanonical que o app GRAVA (utils/normalize.ts). O contrato nomeia
 *  `T4_FREE` e `VITAMIN_D`; o app grava `T4_LIVRE` e `VITAMINA_D` (ver normalize.ts, units.ts,
 *  clinical-indices.ts). Sem este mapa, T4 livre e vitamina D nunca seriam encontrados. Aceita
 *  também a grafia do contrato, caso alguma linha antiga tenha sido gravada assim. */
const HORMONE_CANONICALS_BY_KEY: Record<PanoramaHormoneKey, string[]> = {
  TSH: ['TSH'],
  T4_FREE: ['T4_LIVRE', 'T4_FREE'],
  VITAMIN_D: ['VITAMINA_D', 'VITAMIN_D'],
};
const HORMONE_CANONICALS = [...new Set(Object.values(HORMONE_CANONICALS_BY_KEY).flat())];
type HormoneStatus = PanoramaHormonesData['markers'][number]['status'];
type HormoneItem = { flag: string; valueNumeric: number | null; valueText: string | null; refLow: number | null; refHigh: number | null; refText: string | null };
/**
 * Régua do marcador (status e a faixa que o determinou — nunca um sem o outro):
 *  1. flag DIRECIONAL do laboratório manda (é o que a tela do exame mostra);
 *  2. laudo fechou "normal": só um alvo personalizado (ex.: TSH 0,4–2,5 com levotiroxina) aperta;
 *  3. fora da faixa sem direção na flag: o número contra a faixa do laudo diz alto/baixo;
 *  4. não dá para afirmar → 'unknown' (nunca se inventa alto/baixo).
 */
function hormoneStatus(it: HormoneItem, target: { refLow: number | null; refHigh: number | null } | null): { status: HormoneStatus; ref: PanoramaRef } {
  const labRef: PanoramaRef = { low: it.refLow, high: it.refHigh, text: it.refText };
  if (it.flag === 'HIGH') return { status: 'high', ref: labRef };
  if (it.flag === 'LOW') return { status: 'low', ref: labRef };
  const v = numOf(it);
  /** alto/baixo/in pelo intervalo dado; null quando não há número ou nenhum limite. */
  const dir = (lo: number | null, hi: number | null): HormoneStatus | null => {
    if (v == null || (lo == null && hi == null)) return null;
    if (hi != null && v > hi) return 'high';
    if (lo != null && v < lo) return 'low';
    return 'in';
  };
  if (it.flag === 'NORMAL') {
    const byTarget = target ? dir(target.refLow, target.refHigh) : null;
    if (byTarget === 'high' || byTarget === 'low') {
      return { status: byTarget, ref: { low: target!.refLow, high: target!.refHigh, text: `${target!.refLow ?? ''}–${target!.refHigh ?? ''} (alvo personalizado)` } };
    }
    return { status: 'in', ref: labRef };
  }
  const byRange = dir(it.refLow, it.refHigh);
  if (byRange === 'high' || byRange === 'low') return { status: byRange, ref: labRef };
  if (byRange === 'in' && it.flag !== 'ABNORMAL' && it.flag !== 'CRITICAL') return { status: 'in', ref: labRef };
  return { status: 'unknown', ref: labRef };
}
async function loadHormones(ctx: SourceContext): Promise<SourceOutcome<PanoramaHormonesData, null>> {
  const { patientId, now } = ctx;
  const [rows, snap, protocol, dose] = await Promise.all([
    prisma.examItem.findMany({
      where: { nameCanonical: { in: HORMONE_CANONICALS }, exam: { patientId, status: 'EXTRACTED' } },
      select: { ...ITEM_SELECT, examId: true, exam: { select: { performedAt: true, createdAt: true, rawExtraction: true } } },
    }),
    ctx.snapshot(),
    // Radar: se a tabela ainda não existe no banco, é "não confirmado" — não derruba os marcadores.
    prisma.hormoneProtocol.findUnique({ where: { patientId }, select: { id: true } }).catch(() => null),
    prisma.hormoneDose.findFirst({ where: { patientId }, select: { id: true } }).catch(() => null),
  ]);
  const targets: { analyte: string; refLow: number | null; refHigh: number | null }[] = snap?.personalizedTargets ?? [];
  const since12m = monthsAgo(now, 12).getTime();
  const markers: PanoramaHormonesData['markers'] = HORMONES.map(({ key, label }) => {
    const canonicals = HORMONE_CANONICALS_BY_KEY[key];
    // Um ponto por exame (o 1º item do marcador naquele exame), do mais antigo para o mais recente.
    const points = rows
      .filter((r) => canonicals.includes(r.nameCanonical) && !isCpfMismatch((r.exam as any).rawExtraction))
      .map((r) => ({ it: r as unknown as ItemRow, examId: r.examId, at: examDate({ performedAt: r.exam.performedAt, createdAt: r.exam.createdAt }) }))
      .sort((a, b) => a.at.getTime() - b.at.getTime());
    const seenExams = new Set<string>();
    const unique = points.filter((p) => { if (seenExams.has(p.examId)) return false; seenExams.add(p.examId); return true; });
    const latest = unique[unique.length - 1];
    if (!latest) {
      return { key, name: label, valueText: '', valueNumeric: null, unit: null, status: 'unknown', ref: { low: null, high: null, text: null }, at: null, series: [] };
    }
    const { status, ref } = hormoneStatus(latest.it, targets.find((t) => canonicals.includes(t.analyte)) ?? null);
    const series: PanoramaSeriesPoint[] = downsample(
      // Ponto sem número não vira 0: fica fora da série.
      unique.filter((p) => p.at.getTime() >= since12m && numOf(p.it) != null).map((p) => ({ at: p.at.toISOString(), v: numOf(p.it)! })),
      MAX_SERIES_12M,
    );
    return {
      key,
      name: prettyMarker(latest.it.name) || label,
      valueText: latest.it.valueText ?? (numOf(latest.it) != null ? String(numOf(latest.it)) : ''),
      valueNumeric: latest.it.valueNumeric,
      unit: latest.it.unit,
      status,
      ref,
      at: latest.at.toISOString(),
      series,
    };
  });
  const measured = markers.filter((m) => m.at != null);
  if (!measured.length) return { area: noData('hormones', 'missing'), raw: null };
  const asOf = maxDate(measured.map((m) => new Date(m.at!)));
  const attention = measured.some((m) => m.status === 'high' || m.status === 'low');
  const data: PanoramaHormonesData = { markers, radarInUse: !!protocol || !!dose };
  return { area: mkArea('hormones', statusOf({ hasData: true, asOf, attention, staleAfterDays: STALE_DAYS_EXAM }, now), asOf, data), raw: null };
}

// ═══════════════════════════ MENTE E HUMOR (rastreio — nunca diagnóstico) ═══════════════════════════
const MIND_ORDER = ['minima', 'leve', 'moderada', 'moderadamente_grave', 'grave'];
const MIND_ATTENTION_RANK = MIND_ORDER.indexOf(MIND_ATTENTION_FROM);
/** Posição da banda na escala — pela CHAVE (`severityOf().key`), nunca pelo label ("moderadamente grave" tem espaço/acento). */
const bandRankOf = (type: 'phq9' | 'gad7', total: number | null): number => (total == null ? -1 : MIND_ORDER.indexOf(severityOf(type, total).key));
type ScreeningState = Omit<PanoramaScreening, 'phq9' | 'gad7'> & { phq9: number | null; gad7: number | null; phq9At: string | null; gad7At: string | null };
/** Contrato diz `number`; em runtime vem null quando o questionário nunca foi respondido (ver cabeçalho). */
const toContract = (s: ScreeningState): PanoramaScreening => s as unknown as PanoramaScreening;
async function loadMind(ctx: SourceContext): Promise<SourceOutcome<PanoramaMindData, MindRaw>> {
  const { patientId, now } = ctx;
  // Mais recentes primeiro (o teto de 200 não pode cortar justamente o que é atual).
  const recent = await prisma.mentalHealthScreening.findMany({
    where: { patientId }, orderBy: { createdAt: 'desc' }, take: 200,
    select: { id: true, type: true, total: true, answers: true, createdAt: true },
  });
  const rows: ScreeningRow[] = recent.reverse().map((r) => ({ type: r.type === 'gad7' ? 'gad7' : 'phq9', total: r.total, answers: r.answers, createdAt: r.createdAt }));
  if (!rows.length) return { area: noData('mind', 'missing'), raw: { rows } };
  /** Estado "até a resposta i": o último total conhecido de CADA instrumento até ali. */
  const stateAt = (upto: number): ScreeningState => {
    let pi = -1; let gi = -1;
    for (let i = upto; i >= 0; i--) { if (pi < 0 && rows[i].type === 'phq9') pi = i; if (gi < 0 && rows[i].type === 'gad7') gi = i; if (pi >= 0 && gi >= 0) break; }
    const band = (type: 'phq9' | 'gad7', total: number | null) => (total == null ? NOT_ANSWERED_BAND : severityOf(type, total).label);
    return {
      at: rows[upto].createdAt.toISOString(),
      phq9: pi >= 0 ? rows[pi].total : null,
      gad7: gi >= 0 ? rows[gi].total : null,
      phq9Band: band('phq9', pi >= 0 ? rows[pi].total : null),
      gad7Band: band('gad7', gi >= 0 ? rows[gi].total : null),
      phq9At: pi >= 0 ? rows[pi].createdAt.toISOString() : null,
      gad7At: gi >= 0 ? rows[gi].createdAt.toISOString() : null,
    };
  };
  const lastIdx = rows.length - 1;
  const latestState = stateAt(lastIdx);
  const lastPhq9 = [...rows].reverse().find((r) => r.type === 'phq9') ?? null;
  const answers = Array.isArray(lastPhq9?.answers) ? (lastPhq9!.answers as number[]) : [];
  const suicidalIdeation = !!lastPhq9 && hasSuicidalIdeation(answers); // item 9 > 0 — mesma regra do app
  const asOf = rows[lastIdx].createdAt;
  const attention = suicidalIdeation
    || bandRankOf('phq9', latestState.phq9) >= MIND_ATTENTION_RANK
    || bandRankOf('gad7', latestState.gad7) >= MIND_ATTENTION_RANK;
  const status: PanoramaStatus = suicidalIdeation ? 'attention' : statusOf({ hasData: true, asOf, attention, staleAfterDays: STALE_DAYS_MIND }, now);
  const data: PanoramaMindData = {
    latest: { ...toContract(latestState), phq9At: latestState.phq9At, gad7At: latestState.gad7At, suicidalIdeation },
    previous: lastIdx >= 1 ? toContract(stateAt(lastIdx - 1)) : null,
    history: rows.slice(-8).map((_, i) => toContract(stateAt(lastIdx - Math.min(8, rows.length) + 1 + i))),
  };
  return { area: mkArea('mind', status, asOf, data), raw: { rows } };
}

// ═══════════════════════════ DIÁRIO DE SAÚDE ═══════════════════════════
async function loadDiary(ctx: SourceContext): Promise<SourceOutcome<PanoramaDiaryData, null>> {
  const { patientId, now } = ctx;
  const rows = await prisma.dailyLog.findMany({
    where: { patientId }, orderBy: { date: 'asc' },
    select: { date: true, symptoms: true, mood: true, energy: true },
  });
  if (!rows.length) return { area: noData('diary', 'missing'), raw: null };
  const byDay = new Map(rows.map((r) => [r.date.toISOString().slice(0, 10), r]));
  const todayKey = brDayKey(now);
  const last7 = lastBrDays(7, now).map((date) => {
    const r = byDay.get(date);
    return { date, mood: r?.mood ?? null, energy: r?.energy ?? null, symptoms: (r?.symptoms ?? []).map(symptomLabel) };
  });
  const withMood = last7.flatMap((d) => (d.mood != null ? [d.mood] : []));
  const withEnergy = last7.flatMap((d) => (d.energy != null ? [d.energy] : []));
  const moodAvg7 = avgOf(withMood);
  const energyAvg7 = avgOf(withEnergy);
  const symptomDays = new Map<string, { name: string; days: number; first: number }>();
  last7.forEach((d, idx) => {
    for (const s of new Set(d.symptoms)) {
      const cur = symptomDays.get(s);
      if (cur) cur.days++;
      else symptomDays.set(s, { name: s, days: 1, first: idx });
    }
  });
  const topSymptoms = [...symptomDays.values()]
    .sort((a, b) => b.days - a.days || a.first - b.first)
    .slice(0, 3)
    .map(({ name, days }) => ({ name, days }));
  const latest = rows[rows.length - 1].date;
  // Stale = sem registro nos últimos 7 dias (hoje conta como dia 0).
  const dayDiff = Math.round((new Date(`${todayKey}T12:00:00Z`).getTime() - new Date(`${latest.toISOString().slice(0, 10)}T12:00:00Z`).getTime()) / DAY_MS);
  const data: PanoramaDiaryData = {
    streak: computeDailyStreak(rows.filter((r) => r.date.getTime() >= now.getTime() - 120 * DAY_MS).map((r) => r.date), now),
    daysLogged90: rows.filter((r) => r.date.getTime() >= now.getTime() - 90 * DAY_MS).length,
    last7,
    moodAvg7: moodAvg7 != null ? round1(moodAvg7) : null,
    energyAvg7: energyAvg7 != null ? round1(energyAvg7) : null,
    topSymptoms,
  };
  const status: PanoramaStatus = dayDiff >= STALE_DAYS_DIARY ? 'stale' : 'ok';
  // asOf = o dia civil ao MEIO-DIA UTC (convenção do app p/ datas de dia): a coluna é DATE e o
  // Prisma devolve meia-noite UTC, que formatada no fuso BR vira o dia ANTERIOR.
  const asOf = new Date(`${latest.toISOString().slice(0, 10)}T12:00:00.000Z`);
  return { area: mkArea('diary', status, asOf, data), raw: null };
}

// ═══════════════════════════ SONO E ATIVIDADE (Health Connect) ═══════════════════════════
async function loadVitality(ctx: SourceContext): Promise<SourceOutcome<PanoramaVitalityData, VitalityRaw>> {
  const { patientId, now } = ctx;
  const summary = await buildActivitySummary(patientId, 30, now);
  const metricOf = (t: ActivityMetric): PanoramaMetric | null => {
    const m = summary.metrics[t];
    if (m.latest == null) return null;
    return { latest: m.latest, avg7: m.avg7, avg30: m.avg30, series7: m.series7.map((p) => ({ at: `${p.date}T12:00:00.000Z`, v: p.value })) };
  };
  // Sem linha na janela de 60 dias ≠ nunca sincronizou: uma linha antiga basta para ser "stale".
  const lastSyncAt = summary.lastSyncAt
    ? new Date(summary.lastSyncAt)
    : (await prisma.measurement.findFirst({ where: { patientId, note: 'Health Connect' }, orderBy: { measuredAt: 'desc' }, select: { measuredAt: true } }))?.measuredAt ?? null;
  if (!lastSyncAt) return { area: noData('vitality', 'missing'), raw: { summary } };
  const data: PanoramaVitalityData = {
    lastSyncAt: lastSyncAt.toISOString(),
    sleepMinutes: metricOf('SLEEP_MINUTES'),
    steps: metricOf('STEPS'),
    heartRate: metricOf('HEART_RATE'),
    exerciseMinutes: metricOf('EXERCISE_MINUTES'),
  };
  return { area: mkArea('vitality', statusOf({ hasData: true, asOf: lastSyncAt, attention: false, staleAfterDays: STALE_DAYS_SYNC }, now), lastSyncAt, data), raw: { summary } };
}

// ═══════════════════════════ REMÉDIOS ═══════════════════════════
async function loadMeds(ctx: SourceContext): Promise<SourceOutcome<PanoramaMedsData, null>> {
  const { patientId, now } = ctx;
  const [meds, rules] = await Promise.all([
    prisma.medication.findMany({ where: { patientId, active: true }, select: { id: true, name: true, dosage: true, createdAt: true }, orderBy: { createdAt: 'desc' } }),
    prisma.interactionRule.findMany({ select: { drugA: true, drugB: true, severity: true, effect: true, recommendation: true } }),
  ]);
  if (!meds.length) return { area: noData('meds', 'missing'), raw: null };
  // Mesma conta do GET /medications/check (grátis): só as críticas D/X.
  const criticalInteractions = matchInteractions(meds, rules).filter((h) => isCritical(h.severity)).length;
  const asOf = maxDate(meds.map((m) => m.createdAt));
  const data: PanoramaMedsData = {
    active: meds.map((m) => ({ id: m.id, name: m.name, dose: m.dosage })),
    criticalInteractions,
  };
  return { area: mkArea('meds', statusOf({ hasData: true, asOf, attention: criticalInteractions > 0 }, now), asOf, data), raw: null };
}

// ═══════════════════════════ CONSULTAS E PERGUNTAS ═══════════════════════════
async function loadCare(ctx: SourceContext): Promise<SourceOutcome<PanoramaCareData, null>> {
  const { patientId, now } = ctx;
  const nowT = now.getTime();
  const [reminders, consults, questions] = await Promise.all([
    prisma.reminder.findMany({
      where: { patientId },
      select: { title: true, dueDate: true, done: true, type: true, teleStatus: true, createdByDoctorId: true, createdAt: true },
    }),
    prisma.patientConsultation.findMany({
      where: { patientId },
      select: { doctorName: true, specialty: true, scheduledAt: true, status: true, reason: true, placeName: true, createdAt: true },
    }),
    prisma.doctorQuestion.findMany({ where: { patientId }, select: { status: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 100 }),
  ]);
  // Compromisso = consulta/teleconsulta (lembrete não feito no futuro, não cancelado) ou consulta
  // registrada agendada. Lembrete de exame/remédio é tarefa, não consulta.
  const candidates: { at: Date; doctor: string | null; specialty: string | null; title: string | null; doctorId: string | null }[] = [];
  for (const r of reminders) {
    if (r.done || r.dueDate.getTime() < nowT || (r.type !== 'consulta' && r.type !== 'teleconsulta')) continue;
    if (r.teleStatus === 'cancelled' || r.teleStatus === 'no_show') continue;
    candidates.push({ at: r.dueDate, doctor: null, specialty: null, title: r.title, doctorId: r.createdByDoctorId });
  }
  for (const c of consults) {
    if (c.status !== 'scheduled' || c.scheduledAt.getTime() < nowT) continue;
    candidates.push({ at: c.scheduledAt, doctor: c.doctorName, specialty: c.specialty, title: c.reason ?? c.placeName ?? null, doctorId: null });
  }
  candidates.sort((a, b) => a.at.getTime() - b.at.getTime());
  const next = candidates[0] ?? null;
  const doctor = next?.doctorId
    ? await prisma.doctor.findUnique({ where: { id: next.doctorId }, select: { name: true, specialty: true } })
    : null;
  const hasData = reminders.length + consults.length + questions.length > 0;
  if (!hasData) return { area: noData('care', 'missing'), raw: null };
  const asOf = next
    ? next.at
    : maxDate([...reminders.map((r) => r.createdAt), ...consults.map((c) => c.scheduledAt), questions[0]?.createdAt ?? null]);
  const data: PanoramaCareData = {
    nextAppointment: next ? {
      at: dayIso(next.at),
      doctor: doctor?.name ?? next.doctor,
      specialty: doctor?.specialty ?? next.specialty,
      title: next.title,
    } : null,
    pendingQuestions: questions.filter((q) => q.status === 'open').length,
    overdueReminders: reminders.filter((r) => !r.done && r.dueDate.getTime() < nowT).length,
  };
  return { area: mkArea('care', 'ok', asOf ? dayIso(asOf) : null, data), raw: null };
}

// ═══════════════════════════ VACINAS ═══════════════════════════
async function loadVaccines(ctx: SourceContext): Promise<SourceOutcome<PanoramaVaccinesData, null>> {
  const { patientId, now } = ctx;
  const rows = await prisma.vaccine.findMany({ where: { patientId }, select: { name: true, dateApplied: true, nextDoseDate: true } });
  if (!rows.length) return { area: noData('vaccines', 'missing'), raw: null };
  const nowT = now.getTime();
  const upcoming = rows
    .filter((v) => v.nextDoseDate && v.nextDoseDate.getTime() >= nowT)
    .sort((a, b) => (a.nextDoseDate!.getTime() - b.nextDoseDate!.getTime()));
  const data: PanoramaVaccinesData = {
    count: rows.length,
    overdue: rows.filter((v) => v.nextDoseDate && v.nextDoseDate.getTime() < nowT).length,
    nextDue: upcoming[0]?.nextDoseDate ? { name: upcoming[0].name, date: dayIso(upcoming[0].nextDoseDate!) } : null,
  };
  const asOf = maxDate(rows.map((v) => v.dateApplied));
  return { area: mkArea('vaccines', statusOf({ hasData: true, asOf, attention: data.overdue > 0 }, now), asOf ? dayIso(asOf) : null, data), raw: null };
}

// ═══════════════════════════ CARTÃO DE EMERGÊNCIA ═══════════════════════════
async function loadEmergency(ctx: SourceContext): Promise<SourceOutcome<PanoramaEmergencyData, null>> {
  const p = await prisma.patient.findUnique({ where: { id: ctx.patientId }, select: { allergies: true, clinicalProfile: true } });
  const configured = !!p && (nonEmpty(p.allergies) || nonEmpty(p.clinicalProfile));
  // Paciente tem createdAt, mas alergias/perfil clínico não têm data própria: asOf fica null
  // (o contrato pede a data DO DADO; não existe uma para estes campos).
  if (!configured) return { area: noData('emergency', 'missing'), raw: null };
  return { area: mkArea('emergency', 'ok', null, { configured: true }), raw: null };
}

// ═══════════════════════════ O QUE MUDOU ═══════════════════════════
interface ChangeCandidate extends PanoramaChange { rank: number }
const KIND_RANK: Record<PanoramaChangeKind, number> = { left_range: 0, worsened: 1, screening: 1, habit: 1, entered_range: 2, improved: 3 };
const normUnit = (u: string | null | undefined): string => (u ? (normalizeUnit(u) ?? '').toLowerCase() : '');

function examChanges(raw: ExamsRaw | null): ChangeCandidate[] {
  if (!raw?.last || !raw.prev) return [];
  const at = examDate(raw.last);
  const prevByCanon = new Map<string, ItemRow>();
  for (const it of raw.prevItems) { const k = it.nameCanonical || it.name; if (!prevByCanon.has(k)) prevByCanon.set(k, it); }
  const seen = new Set<string>();
  const out: ChangeCandidate[] = [];
  for (const it of raw.lastItems) {
    const k = it.nameCanonical || it.name;
    const prev = prevByCanon.get(k);
    if (!prev || seen.has(k)) continue;
    seen.add(k);
    const outNow = isOut(it); const outBefore = isOut(prev);
    let kind: PanoramaChangeKind | null = null;
    if (outBefore && !outNow) kind = 'entered_range';
    else if (!outBefore && outNow) kind = 'left_range';
    else if (outNow) {
      // Segue fora da faixa: só declara aproximação/afastamento com valores comparáveis.
      if (it.unit && prev.unit && normUnit(it.unit) !== normUnit(prev.unit)) continue;
      if (it.method && prev.method && it.method !== prev.method) continue;
      const a = numOf(prev); const b = numOf(it);
      if (a == null || b == null || a === 0) continue;
      if ((Math.abs(b - a) / Math.abs(a)) * 100 < MARKER_MIN_DELTA_PCT) continue; // ruído de laboratório
      const verdict = trendVerdict(a, b, it.refLow, it.refHigh);
      if (verdict === 'melhorou') kind = 'improved';
      else if (verdict === 'piorou') kind = 'worsened';
    }
    if (!kind) continue;
    out.push({
      area: 'exams', kind, subject: prettyMarker(it.name) || it.name,
      before: numOf(prev), after: numOf(it), unit: it.unit, at: at.toISOString(),
      rank: (FLAG_TIER[it.flag] ?? 3) * 10 + KIND_RANK[kind],
    });
  }
  return out;
}
function screeningChanges(raw: MindRaw | null): ChangeCandidate[] {
  const rows = raw?.rows ?? [];
  const out: ChangeCandidate[] = [];
  for (const [type, subject] of [['phq9', 'PHQ-9'], ['gad7', 'GAD-7']] as const) {
    const idx = rows.flatMap((r, i) => (r.type === type ? [i] : []));
    if (idx.length < 2) continue;
    const prev = rows[idx[idx.length - 2]]; const last = rows[idx[idx.length - 1]];
    const bandChanged = severityOf(type, prev.total).key !== severityOf(type, last.total).key;
    if (!bandChanged && Math.abs(last.total - prev.total) < SCREENING_MIN_DELTA) continue;
    out.push({ area: 'mind', kind: 'screening', subject, before: prev.total, after: last.total, unit: 'pontos', at: last.createdAt.toISOString(), rank: KIND_RANK.screening });
  }
  return out;
}
function habitChanges(vitality: VitalityRaw | null, weight: WeightRaw | null, now: Date): ChangeCandidate[] {
  const out: ChangeCandidate[] = [];
  const moved = (avg7: number | null, avg30: number | null): boolean => !!avg7 && avg30 != null && avg30 > 0 && (Math.abs(avg7 - avg30) / avg30) * 100 >= HABIT_MIN_DELTA_PCT;
  for (const [metric, subject, unit] of [['SLEEP_MINUTES', 'Sono', 'min'], ['STEPS', 'Passos', 'passos']] as const) {
    const m = vitality?.summary.metrics[metric];
    if (!m || !moved(m.avg7, m.avg30)) continue;
    const lastPoint = m.series7[m.series7.length - 1];
    out.push({
      area: 'vitality', kind: 'habit', subject, before: m.avg30, after: m.avg7, unit,
      at: lastPoint ? `${lastPoint.date}T12:00:00.000Z` : now.toISOString(), rank: KIND_RANK.habit,
    });
  }
  const points = weight?.points30 ?? [];
  const since7 = now.getTime() - 7 * DAY_MS;
  const last7 = points.filter((p) => p.at.getTime() >= since7);
  const a7 = avgOf(last7.map((p) => p.v)); const a30 = avgOf(points.map((p) => p.v));
  if (moved(a7, a30)) {
    out.push({
      area: 'weight', kind: 'habit', subject: 'Peso', before: round2(a30!), after: round2(a7!), unit: 'kg',
      at: maxDate(last7.map((p) => p.at))!.toISOString(), rank: KIND_RANK.habit,
    });
  }
  return out;
}
export function computeChanges(now: Date, r: { exams: ExamsRaw | null; mind: MindRaw | null; vitality: VitalityRaw | null; weight: WeightRaw | null }): PanoramaChange[] {
  const all: ChangeCandidate[] = [...examChanges(r.exams), ...screeningChanges(r.mind), ...habitChanges(r.vitality, r.weight, now)];
  // Mais recente primeiro; no mesmo instante (mesmo exame), o mais importante primeiro e, entre
  // iguais, ordem alfabética — nunca a ordem das linhas do banco.
  all.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime() || a.rank - b.rank || a.subject.localeCompare(b.subject));
  return all.slice(0, MAX_CHANGES).map(({ rank: _rank, ...change }) => change);
}

// ───────────────────────── fontes + montagem ─────────────────────────
export const panoramaSources: SourceMap = {
  exams: loadExams,
  heart: loadHeart,
  weight: loadWeight,
  bodyComp: loadBodyComp,
  hormones: loadHormones,
  mind: loadMind,
  diary: loadDiary,
  vitality: loadVitality,
  meds: loadMeds,
  care: loadCare,
  vaccines: loadVaccines,
  emergency: loadEmergency,
};
const AREA_KEYS = Object.keys(panoramaSources) as PanoramaKey[];

/** Monta o panorama: todas as fontes em paralelo, cada uma isolada (falha = área `unavailable`). */
export async function buildPanorama(patientId: string, now: Date = new Date()): Promise<PanoramaResponse> {
  let snapshotP: Promise<any> | null = null;
  const ctx: SourceContext = {
    patientId,
    now,
    snapshot: () => {
      if (!snapshotP) snapshotP = getCachedHealthSummary(patientId).catch((e: unknown) => { console.warn('[panorama] health-summary indisponível:', (e as Error)?.message); return null; });
      return snapshotP;
    },
  };
  const byKey = {} as Record<PanoramaKey, SourceOutcome<any, any> | null>;
  await Promise.all(AREA_KEYS.map(async (key) => {
    try {
      const load = panoramaSources[key] as (c: SourceContext) => Promise<SourceOutcome<any, any>>;
      byKey[key] = await withTimeout(load(ctx), SOURCE_TIMEOUT_MS, key);
    } catch (e) {
      console.warn(`[panorama] área "${key}" indisponível:`, (e as Error)?.message);
      byKey[key] = null;
    }
  }));
  const areaOf = (key: PanoramaKey) => byKey[key]?.area ?? unavailable(key);
  return {
    patientId,
    generatedAt: now.toISOString(),
    changed: computeChanges(now, {
      exams: byKey.exams?.raw ?? null,
      mind: byKey.mind?.raw ?? null,
      vitality: byKey.vitality?.raw ?? null,
      weight: byKey.weight?.raw ?? null,
    }),
    exams: areaOf('exams'),
    heart: areaOf('heart'),
    weight: areaOf('weight'),
    bodyComp: areaOf('bodyComp'),
    hormones: areaOf('hormones'),
    mind: areaOf('mind'),
    diary: areaOf('diary'),
    vitality: areaOf('vitality'),
    meds: areaOf('meds'),
    care: areaOf('care'),
    vaccines: areaOf('vaccines'),
    emergency: areaOf('emergency'),
  };
}

/** Alguma área veio `unavailable`? (Resposta assim não entra no cache — o próximo pedido tenta de novo.) */
export function hasUnavailableArea(p: PanoramaResponse): boolean {
  return AREA_KEYS.some((key) => (p[key] as PanoramaArea<unknown>).status === 'unavailable');
}
