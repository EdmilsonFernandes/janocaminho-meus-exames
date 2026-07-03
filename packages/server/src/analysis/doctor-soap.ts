/**
 * doctor-soap.ts — Gera SOAP (Subjetivo/Objetivo/Avaliação/Plano) com IA pro médico.
 *
 * O médico clica "Gerar SOAP" e a IA preenche o rascunho a partir dos dados reais do
 * paciente (snapshot + risk + perfil clínico). O médico revisa/edita — não é definitivo.
 * Grátis (engajamento médico). Reusa getLlm + buildCurrentHealthSummary + latestRiskAssessment.
 */
import { prisma } from '../prisma';
import { getLlm, getModel } from '../llm';
import { HEALTH_SYSTEM, diagnosticGuard } from './system';
import { buildCurrentHealthSummary, formatSnapshotContext } from './health-state';
import { latestRiskAssessment } from './risk-service';

export async function generateSoap(patientId: string): Promise<{ contentMd: string; modelUsed: string }> {
  const patient = await prisma.patient.findUnique({ where: { id: patientId } });
  if (!patient) { const err = new Error('Paciente não encontrado'); (err as any).status = 404; throw err; }

  const snapshot = await buildCurrentHealthSummary(patientId);
  if (snapshot.markers === 0) { const err = new Error('Sem exames extraídos'); (err as any).status = 400; throw err; }

  const risk = await latestRiskAssessment(patientId);
  const perfil = patient.clinicalProfile?.trim() || 'Não informado.';

  const abnormal = snapshot.topAttention.slice(0, 6).map((m) =>
    `${m.name}: ${m.latest.valueText ?? m.latest.valueNumeric ?? '—'} ${m.unit ?? ''} (ref ${m.refText ?? `${m.refLow ?? '?'}-${m.refHigh ?? '?'}`}, ${m.flag}, ${m.priority})`
  ).join('\n');

  const riskTxt = risk?.result
    ? `Risco: ${risk.result.predictedCondition} (${risk.result.riskLevel}). Findings: ${(risk.result.detectedFindings ?? []).join('; ')}.`
    : 'Sem leitura de risco.';

  const userContent =
    `Gere um SOAP (Subjetivo, Objetivo, Avaliação, Plano) em Markdown clínico para o médico, ` +
    `baseado APENAS nos dados abaixo. Tom técnico, objetivo, SEM diagnóstico definitivo, SEM prescrever.\n\n` +
    `PACIENTE: ${patient.fullName} (${patient.gender ?? 'sexo NI'}, ${patient.dateOfBirth ? Math.floor((Date.now() - new Date(patient.dateOfBirth).getTime()) / (365.25 * 86400000)) + ' anos' : 'idade NI'})\n` +
    `PERFIL CLÍNICO: ${perfil}\n\n` +
    `VALORES ALTERADOS / EM ATENÇÃO:\n${abnormal || '(sem alterações relevantes)'}\n\n` +
    `${riskTxt}\n\n` +
    `ESTADO ATUAL + TENDÊNCIAS:\n${formatSnapshotContext(snapshot)}\n\n` +
    `Monte o SOAP em Markdown:\n` +
    `## S (Subjetivo)\n- Queixa/perfil contextualizado (1-2 linhas)\n\n` +
    `## O (Objetivo)\n- Valores alterados com referência (bullet points)\n\n` +
    `## A (Avaliação)\n- Possível interpretação clínica (linguagem de risco, SEM diagnóstico fechado)\n\n` +
    `## P (Plano)\n- Investigações sugeridas, follow-up, orientaçõs ao paciente\n\n` +
    `Máx ~300 palavras. Sem prescrever medicamentos.`;

  const s = await getLlm().stream({
    model: getModel(), maxTokens: 2000,
    system: HEALTH_SYSTEM + '\n\nVocê gera SOAP clnico para prontuário médico. Tom técnico, conciso, SEM diagnóstico definitivo.',
    messages: [{ role: 'user', content: userContent }] as any,
  });
  const response = await s.final();
  if (!response) throw new Error('SOAP: resposta vazia');

  const contentMd = diagnosticGuard(response.text || '').text;
  return { contentMd, modelUsed: response.model || getModel() };
}
