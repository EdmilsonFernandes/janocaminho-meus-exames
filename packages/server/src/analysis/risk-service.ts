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

const RULE_KEYS = new Set(RISK_RULES.markers.map((m) => m.key));

/** Janela de cache: se há avaliação há menos de N horas e !force, devolve a existente. */
const CACHE_HOURS = 24;

/** Carrega os marcadores de entrada (lab de MarkerState + PA de Measurement). */
async function loadRiskMarkers(patientId: string): Promise<RiskMarker[]> {
  const [markerStates, bp] = await Promise.all([
    buildMarkerState(patientId),
    prisma.measurement.findFirst({
      where: { patientId, type: 'BLOOD_PRESSURE' },
      orderBy: { measuredAt: 'desc' },
    }),
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
  return riskMarkers;
}

/** Confiança da análise (sem ML por enquanto): baseada em quantidade de dados + achados. */
function computeConfidence(result: RiskResult): number {
  if (result.findings.length === 0) return 0.9; // painel avaliado, sem alterações
  const base = result.ruleConfidence === 'alta' ? 0.62 : 0.4;
  return Math.min(0.9, base + Math.min(0.2, result.findings.length * 0.05));
}

export interface BuildOptions { force?: boolean; examId?: string | null; }

/** Computa a avaliação de risco de um paciente e persiste (com cache de CACHE_HOURS). */
export async function buildRiskAssessment(patientId: string, opts: BuildOptions = {}): Promise<{
  result: RiskResult; saved: { id: string; createdAt: Date }; fromCache: boolean;
}> {
  // cache: devolve a avaliação recente se !force
  if (!opts.force) {
    const recent = await prisma.riskAssessment.findFirst({
      where: { patientId, createdAt: { gt: new Date(Date.now() - CACHE_HOURS * 3600_000) } },
      orderBy: { createdAt: 'desc' },
    });
    if (recent) {
      return { result: deserialize(recent), saved: { id: recent.id, createdAt: recent.createdAt }, fromCache: true };
    }
  }

  const markers = await loadRiskMarkers(patientId);
  const result = assessRisk(markers);
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
  return { result, saved: created, fromCache: false };
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

/** Devolve o último RiskAssessment persistido (não computa — só leitura). */
export async function latestRiskAssessment(patientId: string) {
  const r = await prisma.riskAssessment.findFirst({
    where: { patientId },
    orderBy: { createdAt: 'desc' },
  });
  return r ? { id: r.id, createdAt: r.createdAt, result: deserialize(r) } : null;
}
