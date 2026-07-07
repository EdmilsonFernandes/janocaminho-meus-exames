/**
 * clinical-summary.ts — Gera resumo clínico de 1 parágrafo para o médico.
 * "Paciente 54a, DM2, HbA1c 8,1 (↑0,4), eGFR 68 estável. Considerar ajuste."
 *
 * Determinístico (não chama IA — usa os dados já computados pelo health-summary).
 * Gratuito, instantâneo, 1x/dia (cacheado no endpoint).
 */
import type { CurrentHealthSummary } from './health-state';

export function generateClinicalSummary(s: CurrentHealthSummary, patient: { age?: number | null; sex?: string | null; clinicalProfile?: string | null }): string {
  const parts: string[] = [];

  // Demografia
  const age = patient.age ? `${patient.age}a` : '';
  const sex = patient.sex === 'male' ? 'M' : patient.sex === 'female' ? 'F' : '';
  const demo = [age, sex].filter(Boolean).join(' ');
  if (demo) parts.push(`Paciente ${demo}`);

  // Perfil clínico
  if (patient.clinicalProfile) {
    const short = patient.clinicalProfile.slice(0, 60).replace(/[,;]\s*$/, '');
    parts.push(short);
  }

  // Score
  if (s.score != null) parts.push(`Score ${s.score}/100`);

  // Principais alterações
  const altered = s.topAttention.slice(0, 4);
  if (altered.length > 0) {
    const altSummary = altered.map((m) => {
      const delta = m.deltaPct != null ? ` (${m.deltaPct > 0 ? '↑' : '↓'}${Math.abs(Math.round(m.deltaPct))}%)` : '';
      return `${m.name}${delta}`;
    }).join(', ');
    parts.push(altSummary);
  } else if (s.markers > 0) {
    parts.push(`${s.markers} marcadores normais`);
  }

  // Idade biológica
  if (s.biologicalAge?.age) parts.push(`Idade biológica ${s.biologicalAge.age}a`);

  // Risco cardio
  if (s.cardiometabolicRisk?.level) {
    const riskFactors = s.cardiometabolicRisk.factors.filter((f) => f.risk).map((f) => f.label).slice(0, 2);
    parts.push(`Risco cardio ${s.cardiometabolicRisk.level}${riskFactors.length ? ` (${riskFactors.join('; ')})` : ''}`);
  }

  // Stale
  if (s.stale.length > 0) parts.push(`${s.stale.length} marcador(es) desatualizado(s)`);

  return parts.join('. ') + '.';
}
