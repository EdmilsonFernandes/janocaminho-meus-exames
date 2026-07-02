/**
 * insights.ts — Score de Adesão + Alertas Preditivos do paciente.
 *
 * Score de Adesão: gamificação (0-100) baseada em engajamento real do paciente
 * (exames no prazo, medições regulares, feedback, consentimento, uso da IA).
 *
 * Alerta Preditivo: projeta a tendência de cada marcador (regressão linear simples
 * com 2+ pontos) e estima quando pode cruzar o limite de referência.
 *
 * Ambos reaproveitam dados que já existem (ExamItem, Measurement, RiskFeedback,
 * RiskAssessment, MarkerState). Determinísticos, instantâneos, sem IA.
 */
import { prisma } from '../prisma';
import { buildMarkerState } from './health-state';

// === SCORE DE ADESÃO ===

export interface AdherenceResult {
  score: number;
  level: 'bronze' | 'prata' | 'ouro' | 'diamante';
  breakdown: { exams: number; measurements: number; feedback: number; consent: number; engagement: number; freshness: number };
  tips: string[];
}

export async function computeAdherenceScore(patientId: string): Promise<AdherenceResult> {
  const yearAgo = new Date(Date.now() - 365 * 86400000);
  const monthAgo3 = new Date(Date.now() - 90 * 86400000);

  const [examCount, measurementCount, feedbackCount, riskCount, patient, markers] = await Promise.all([
    prisma.exam.count({ where: { patientId, status: 'EXTRACTED', performedAt: { gte: yearAgo } } }),
    prisma.measurement.count({ where: { patientId, measuredAt: { gte: monthAgo3 } } }),
    prisma.riskFeedback.count({ where: { riskAssessment: { patientId } } }),
    prisma.riskAssessment.count({ where: { patientId } }),
    prisma.patient.findUnique({ where: { id: patientId }, select: { dataContributionConsent: true } }),
    buildMarkerState(patientId),
  ]);

  const breakdown = {
    exams: Math.min(30, examCount * 10),           // 3+ exames/ano = 30 pts
    measurements: Math.min(20, measurementCount * 5), // 4+ medições/3m = 20 pts
    feedback: Math.min(15, feedbackCount * 5),       // 3+ feedbacks = 15 pts
    consent: patient?.dataContributionConsent ? 10 : 0,
    engagement: Math.min(15, riskCount * 5),         // 3+ leituras de risco = 15 pts
    freshness: markers.length > 0
      ? Math.round((1 - markers.filter((m) => m.latest.stale).length / markers.length) * 10)
      : 0,                                           // marcadores atualizados = até 10 pts
  };

  const score = Math.min(100, Object.values(breakdown).reduce((a, b) => a + b, 0));
  const level = score >= 80 ? 'diamante' : score >= 60 ? 'ouro' : score >= 40 ? 'prata' : 'bronze';

  const tips: string[] = [];
  if (breakdown.exams < 30) tips.push('Envie exames regularmente (1 a cada 4 meses maximiza seus pontos).');
  if (breakdown.measurements < 20) tips.push('Registre medições (pressão, peso) — 4 a cada 3 meses.');
  if (breakdown.feedback < 15) tips.push('Avalie os planos de ação (👍/👎) pra ajudar a IA a melhorar.');
  if (breakdown.consent < 10) tips.push('Ative a contribuição anônima de dados (ajuda a IA a aprender).');
  if (breakdown.freshness < 10) tips.push('Refazer exames antigos (mais de 1 ano) mantém seus dados atualizados.');

  return { score, level, breakdown, tips: tips.slice(0, 3) };
}

// === ALERTA PREDITIVO ===

export interface Prediction {
  marker: string;
  current: number;
  refHigh: number | null;
  refLow: number | null;
  monthlyRate: number;       // taxa de variação por mês (positiva = subindo)
  projected3m: number;       // valor projetado em 3 meses
  risk: 'normal' | 'watch' | 'alert'; // normal=dentro, watch=próximo do limite, alert=provavelmente ultrapassa
  message: string;
}

export async function computePredictions(patientId: string): Promise<Prediction[]> {
  const markers = await buildMarkerState(patientId);
  const predictions: Prediction[] = [];

  for (const m of markers) {
    if (m.latest.valueNumeric == null) continue;
    if (m.points < 2 || !m.prior || m.prior.valueNumeric == null) continue;
    if (m.refLow == null && m.refHigh == null) continue;

    const latest = m.latest.valueNumeric;
    const prior = m.prior.valueNumeric;

    // Meses entre as 2 medições
    const latestTime = m.latest.performedAt ? m.latest.performedAt.getTime() : Date.now();
    const priorTime = m.prior.performedAt ? m.prior.performedAt.getTime() : Date.now();
    const monthsBetween = Math.max(0.5, (latestTime - priorTime) / (30 * 86400000));

    const monthlyRate = (latest - prior) / monthsBetween; // variação por mês
    const projected3m = latest + monthlyRate * 3;

    // Verificar se vai cruzar o limite em 3 meses
    let risk: Prediction['risk'] = 'normal';
    let message = `${m.name} está estável na faixa de referência.`;

    if (m.refHigh != null && monthlyRate > 0) {
      // subindo — vai ultrapassar refHigh?
      if (projected3m > m.refHigh) {
        risk = 'alert';
        const monthsToExceed = monthlyRate > 0 ? Math.ceil((m.refHigh - latest) / monthlyRate) : 99;
        message = `${m.name} subindo ${monthlyRate > 0 ? '+' : ''}${monthlyRate.toFixed(1)}/mês — pode ultrapassar ${m.refHigh} em ~${monthsToExceed}m.`;
      } else if (projected3m > m.refHigh * 0.9) {
        risk = 'watch';
        message = `${m.name} subindo — projeta ${projected3m.toFixed(1)} em 3m (limite ${m.refHigh}). Vale acompanhar.`;
      }
    } else if (m.refLow != null && monthlyRate < 0) {
      // descendo — vai ficar abaixo de refLow?
      if (projected3m < m.refLow) {
        risk = 'alert';
        const monthsToExceed = monthlyRate < 0 ? Math.ceil((m.refLow - latest) / monthlyRate) : 99;
        message = `${m.name} caindo ${monthlyRate.toFixed(1)}/mês — pode ficar abaixo de ${m.refLow} em ~${monthsToExceed}m.`;
      } else if (projected3m < m.refLow * 1.1) {
        risk = 'watch';
        message = `${m.name} caindo — projeta ${projected3m.toFixed(1)} em 3m (mínimo ${m.refLow}). Vale acompanhar.`;
      }
    }

    if (risk !== 'normal') {
      predictions.push({ marker: m.name, current: latest, refHigh: m.refHigh, refLow: m.refLow, monthlyRate, projected3m, risk, message });
    }
  }

  // Ordenar: alert primeiro, depois watch
  return predictions.sort((a, b) => (a.risk === 'alert' ? -1 : 1) - (b.risk === 'alert' ? -1 : 1));
}
