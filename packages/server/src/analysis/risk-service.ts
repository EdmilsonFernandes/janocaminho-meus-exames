/**
 * risk-service.ts — Orquestra a avaliação de risco e persiste.
 *
 * Pipeline (TUDO que já existia no servidor — não inventa do zero):
 *   ExamItem (nameCanonical via normalize.ts)
 *     -> health-state.buildMarkerState()  (Layer 1, por marcador)
 *     -> [última Measurement BLOOD_PRESSURE]  (sistólica/diastólica)
 *     -> risk-engine.assessRisk()  (Layer 3, por condição)  [CAMADA NOVA]
 *     -> persiste RiskAssessment (histórico -> tendência de risco)
 *
 * As chaves canônicas do MarkerState (GLICEMIA, HEMOGLOBINA_GLICADA, LDL, HDL,
 * TRIGLICERIDES, HEMOGLOBINA, VCM) JÁ são as chaves das regras em risk-rules.ts —
 * alinhamento direto, sem camada de tradução. A PA é montada a partir de Measurement
 * (value=sistólica, valueSecondary=diastólica — confirmado pelo front Measurements.tsx).
 *
 * SEM IA/créditos: a camada de regras é determinística e grátis (diferente de /analyses).
 */
import { prisma } from '../prisma';
import { buildMarkerState, ageMonths, STALE_MONTHS } from './health-state';
import { assessRisk, type RiskMarker, type RiskResult } from './risk-engine';
import { RISK_RULES, MEDICAL_DISCLAIMER } from './risk-rules';
import { bmi, egfr, homaIr, type BioSex } from './derived-markers';

const RULE_KEYS = new Set(RISK_RULES.markers.map((m) => m.key));

/** Janela de cache: se há avaliação há menos de N horas e !force, devolve a existente. */
const CACHE_HOURS = 24;

// Tendência de risco entre duas leituras (melhorou/piorou/estável) — ALAVANCA DE RETENÇÃO.
export type RiskTrend = 'melhorou' | 'piorou' | 'estavel' | 'primeiro';
const RISK_RANK: Record<string, number> = { low: 0, moderate: 1, high: 2 };
export interface RiskPrior { riskLevel: string; conditionKey: string; conditionLabel: string; createdAt: Date }

function trendBetween(cur: string, prior: RiskPrior | null): { trend: RiskTrend; prior: RiskPrior | null } {
  if (!prior) return { trend: 'primeiro', prior: null };
  const c = RISK_RANK[cur] ?? 0;
  const p = RISK_RANK[prior.riskLevel] ?? 0;
  return { trend: c < p ? 'melhorou' : c > p ? 'piorou' : 'estavel', prior };
}

/** Penúltima leitura (exclui a atual) — vira o "antes" da tendência. */
async function loadPriorExcept(patientId: string, currentId: string): Promise<RiskPrior | null> {
  const row = await prisma.riskAssessment.findFirst({
    where: { patientId, NOT: { id: currentId } },
    orderBy: { createdAt: 'desc' },
  });
  return row ? { riskLevel: row.riskLevel, conditionKey: row.conditionKey, conditionLabel: row.conditionLabel, createdAt: row.createdAt } : null;
}

/** Carrega os marcadores de entrada (lab de MarkerState + PA de Measurement). */
async function loadRiskMarkers(patientId: string): Promise<{ markers: RiskMarker[]; gender: BioSex | undefined }> {
  const [markerStates, bp, patient, weight] = await Promise.all([
    buildMarkerState(patientId),
    prisma.measurement.findFirst({
      where: { patientId, type: 'BLOOD_PRESSURE' },
      orderBy: { measuredAt: 'desc' },
    }),
    prisma.patient.findUnique({ where: { id: patientId }, select: { gender: true, dateOfBirth: true, heightCm: true } }),
    prisma.measurement.findFirst({ where: { patientId, type: 'WEIGHT' }, orderBy: { measuredAt: 'desc' } }),
  ]);

  const riskMarkers: RiskMarker[] = [];
  for (const m of markerStates) {
    if (!RULE_KEYS.has(m.nameCanonical)) continue; // só marcadores do escopo das regras
    if (m.latest.valueNumeric == null) continue;   // sem valor numérico -> ignora
    riskMarkers.push({
      key: m.nameCanonical,
      value: m.latest.valueNumeric,
      unit: m.unit,
      namePt: m.name,
      performedAt: m.latest.performedAt,
      stale: m.latest.stale,
    });
  }

  if (bp) {
    const bpStale = (() => { const a = ageMonths(bp.measuredAt); return a != null && a > STALE_MONTHS; })();
    if (bp.value != null) {
      riskMarkers.push({ key: 'PRESSAO_SISTOLICA', value: bp.value, unit: 'mmHg',
        namePt: 'Pressão sistólica (PAS)', performedAt: bp.measuredAt, stale: bpStale });
    }
    if (bp.valueSecondary != null) {
      riskMarkers.push({ key: 'PRESSAO_DIASTOLICA', value: bp.valueSecondary, unit: 'mmHg',
        namePt: 'Pressão diastólica (PAD)', performedAt: bp.measuredAt, stale: bpStale });
    }
  }

  // ÍNDICES DERIVADOS (M2) — calculados a partir do perfil + exames (NÃO vêm do laudo):
  // IMC precisa de peso+altura; eGFR de creatinina+idade+sexo; HOMA-IR de glicemia+insulina.
  const latestVal = (key: string) =>
    markerStates.find((m) => m.nameCanonical === key && m.latest.valueNumeric != null)?.latest.valueNumeric ?? null;
  const ageYears = patient?.dateOfBirth
    ? Math.floor((Date.now() - new Date(patient.dateOfBirth).getTime()) / (365.25 * 86400000))
    : null;
  const sex: BioSex | undefined = patient?.gender === 'male' || patient?.gender === 'female' ? patient.gender : undefined;
  const imc = bmi(weight?.value ?? null, patient?.heightCm ?? null);
  const egfrVal = egfr(latestVal('CREATININA'), ageYears, sex);
  const homa = homaIr(latestVal('GLICEMIA'), latestVal('INSULINA'));
  if (imc != null) riskMarkers.push({ key: 'IMC', value: imc, unit: 'kg/m²', namePt: 'IMC (Índice de Massa Corporal)' });
  if (egfrVal != null) riskMarkers.push({ key: 'EGFR', value: egfrVal, unit: 'mL/min/1.73m²', namePt: 'TFG estimada (eGFR)' });
  if (homa != null) riskMarkers.push({ key: 'HOMA_IR', value: homa, unit: '', namePt: 'HOMA-IR (resistência insulínica)' });

  return { markers: riskMarkers, gender: sex };
}

/** Confiança da análise (sem ML por enquanto): baseada em quantidade de dados + achados. */
function computeConfidence(result: RiskResult): number {
  if (result.findings.length === 0) return 0.9; // painel avaliado, sem alterações
  const base = result.ruleConfidence === 'alta' ? 0.62 : 0.4;
  return Math.min(0.9, base + Math.min(0.2, result.findings.length * 0.05));
}

/** Faixa etária ANONIMIZADA ("30-39") a partir da data de nascimento (ou null). */
function ageRangeFrom(dob: Date | null): string | null {
  if (!dob) return null;
  const age = Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 86400000));
  if (!Number.isFinite(age) || age < 0 || age > 120) return null;
  const lo = Math.floor(age / 10) * 10;
  return `${lo}-${lo + 9}`;
}

export interface BuildOptions { force?: boolean; examId?: string | null; }

/** Computa a avaliação de risco de um paciente e persiste (com cache de CACHE_HOURS). */
export async function buildRiskAssessment(patientId: string, opts: BuildOptions = {}): Promise<{
  result: RiskResult; saved: { id: string; createdAt: Date }; fromCache: boolean;
  trend: RiskTrend; prior: RiskPrior | null;
}> {
  // cache: devolve a avaliação recente se !force
  if (!opts.force) {
    const recent = await prisma.riskAssessment.findFirst({
      where: { patientId, createdAt: { gt: new Date(Date.now() - CACHE_HOURS * 3600_000) } },
      orderBy: { createdAt: 'desc' },
    });
    if (recent) {
      const prior = await loadPriorExcept(patientId, recent.id);
      const { trend } = trendBetween(recent.riskLevel, prior);
      return { result: deserialize(recent), saved: { id: recent.id, createdAt: recent.createdAt }, fromCache: true, trend, prior };
    }
  }

  const { markers, gender } = await loadRiskMarkers(patientId);
  const result = assessRisk(markers, gender);
  const confidence = computeConfidence(result);
  const snapshot = markers.map((m) => ({ key: m.key, value: m.value, unit: m.unit ?? null, stale: m.stale ?? false }));

  const created = await prisma.riskAssessment.create({
    data: {
      patientId,
      examId: opts.examId ?? null,
      conditionKey: result.predictedConditionKey,
      conditionLabel: result.predictedCondition,
      riskLevel: result.riskLevel,
      confidence,
      ruleConfidence: result.ruleConfidence,
      basis: 'rules',
      mlSuspect: false,
      findings: result.findings as any,
      doctorQuestions: result.doctorQuestions as any,
      userExplanation: result.userExplanation,
      snapshot: snapshot as any,
    },
    select: { id: true, createdAt: true },
  });
  const prior = await loadPriorExcept(patientId, created.id);
  const { trend } = trendBetween(result.riskLevel, prior);

  // FLYWHEEL: se o paciente deu opt-in, grava registro ANONIMIZADO (sem PHI) p/ treinar o modelo.
  // Best-effort (fire-and-forget): nunca bloqueia/quebra a leitura de risco do paciente.
  prisma.patient.findUnique({ where: { id: patientId }, select: { dataContributionConsent: true, gender: true, dateOfBirth: true } })
    .then((pat) => pat?.dataContributionConsent
      ? prisma.dataContributionRecord.create({ data: {
          conditionKey: result.predictedConditionKey,
          riskLevel: result.riskLevel,
          markers: Object.fromEntries(markers.map((m) => [m.key, m.value])) as any,
          sex: pat.gender ?? null,
          ageRange: ageRangeFrom(pat.dateOfBirth),
        } })
      : null)
    .catch((e) => console.error('[risk] flywheel: falha ao gravar contribuição anonimizada:', (e as Error)?.message));

  return { result, saved: created, fromCache: false, trend, prior };
}

/** Reconstrói um RiskResult a partir do registro persistido (p/ GET /latest). */
function deserialize(r: {
  conditionKey: string; conditionLabel: string; riskLevel: string; ruleConfidence: string;
  confidence: number; findings: unknown; doctorQuestions: unknown; userExplanation: string | null;
  snapshot: unknown;
}): RiskResult {
  const findings = (r.findings as any[]) ?? [];
  const conditions = [...new Set(findings.map((f) => f?.condition).filter(Boolean))] as RiskResult['conditions'];
  // markersEvaluated = qtd de marcadores no snapshot (snapshot já é só os avaliados pelas regras)
  const markersEvaluated = ((r.snapshot as any[]) ?? []).length;
  return {
    predictedConditionKey: r.conditionKey as RiskResult['predictedConditionKey'],
    predictedCondition: r.conditionLabel,
    conditions,
    riskLevel: r.riskLevel as RiskResult['riskLevel'],
    ruleConfidence: r.ruleConfidence as RiskResult['ruleConfidence'],
    markersEvaluated,
    findings,
    detectedFindings: findings.map((f: any) => f?.finding).filter(Boolean),
    userExplanation: r.userExplanation ?? '',
    doctorQuestions: (r.doctorQuestions as string[]) ?? [],
    medicalDisclaimer: MEDICAL_DISCLAIMER,
  } as RiskResult;
}

/** Devolve o último RiskAssessment persistido + tendência vs o anterior (não computa — só leitura). */
export async function latestRiskAssessment(patientId: string) {
  const rows = await prisma.riskAssessment.findMany({
    where: { patientId },
    orderBy: { createdAt: 'desc' },
    take: 2,
  });
  if (!rows.length) return null;
  const current = rows[0];
  const priorRow = rows[1] ?? null;
  const prior: RiskPrior | null = priorRow
    ? { riskLevel: priorRow.riskLevel, conditionKey: priorRow.conditionKey, conditionLabel: priorRow.conditionLabel, createdAt: priorRow.createdAt }
    : null;
  const { trend } = trendBetween(current.riskLevel, prior);
  return { id: current.id, createdAt: current.createdAt, result: deserialize(current), trend, prior };
}
