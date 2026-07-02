/**
 * risk-action-plan.ts — "Plano de ação do Dr. Exame" (ALAVANCA DE CRÉDITOS).
 *
 * O RiskCard (grátis) mostra a LEITURA de risco (camada de regras). Aqui geramos o
 * PLANO DE AÇÃO em linguagem natural via GLM — o upsell que consome créditos.
 *
 * Segurança (igual ao health-summary.ts): o GLM é EXPLICADOR. Os findings do último
 * RiskAssessment entram como FATO decidido pelas regras; a IA só redige próximos passos
 * concretos (hábitos, quando refazer, o que perguntar ao médico). Proibido diagnosticar,
 * receitar ou inventar valores. Pós-filtro diagnosticGuard + HEALTH_SYSTEM.
 *
 * Porta o build_glm_prompt do risk-ml (Python) pra TS.
 */
import { prisma } from '../prisma';
import { getAnthropic, MODEL } from '../claude/client';
import { HEALTH_SYSTEM, diagnosticGuard } from './system';
import { MEDICAL_DISCLAIMER } from './risk-rules';
import { knowledgeFor } from './knowledge';

const PLAN_SYSTEM =
  HEALTH_SYSTEM +
  '\n\nNesta tarefa você escreve um PLANO DE AÇÃO EDUCATIVO a partir de achados de risco JÁ DECIDIDOS pelo sistema (não inferir novos). ' +
  'Estruture em Markdown curto, prático e não-alarmista. NÃO repita diagnósticos, NÃO prescreva. ' +
  'Foque em: o que o paciente pode fazer (hábitos/prevenção), quando refazer exames, e perguntas concretas para o médico.';

export interface ActionResult {
  contentMd: string;
  modelUsed: string;
  usage: any;
  basedOn: { conditionKey: string; riskLevel: string; findingsCount: number; assessmentId: string; knowledgeUsed: boolean };
}

/** Gera o plano de ação baseado no último RiskAssessment do paciente.
 *  audience='doctor' → plano de CONDUTA CLÍNICA (tom técnico pro médico); 'patient' → educativo leigo. */
export async function generateActionPlan(patientId: string, audience: 'patient' | 'doctor' = 'patient'): Promise<ActionResult> {
  const last = await prisma.riskAssessment.findFirst({
    where: { patientId },
    orderBy: { createdAt: 'desc' },
  });
  if (!last) {
    const err = new Error('Gere sua leitura de risco antes de pedir o plano de ação.');
    (err as any).status = 409;
    throw err;
  }

  const findings = (last.findings as any[]) ?? [];
  const facts = findings.length
    ? findings.map((f) => `- ${f.name_pt}: ${f.value} ${f.unit} → ${f.finding}`).join('\n')
    : '- (sem alterações relevantes nos marcadores analisados)';

  // RAG: injeta o card de conhecimento clínico curado da condição (deixa a IA mais rica/consistente).
  const kb = knowledgeFor(last.conditionKey);

  const isDoctor = audience === 'doctor';
  const userContent =
    (isDoctor
      ? `Escreva um PLANO DE CONDUTA CLÍNICA em português, para o MÉDICO (pré-consulta), baseado APENAS nestes achados de risco já calculados pelo sistema. Tom clínico, técnico e objetivo — foque em conduta: investigação complementar, diferenciais, follow-up.\n\n`
      : `Escreva um PLANO DE AÇÃO em português, para o paciente, baseado APENAS nestes achados de risco já calculados pelo sistema.\n\n`) +
    `CONDIÇÃO: ${last.conditionLabel}\n` +
    `NÍVEL DE RISCO: ${last.riskLevel}\n` +
    `ACHADOS (use só estes como fato — não invente outros):\n${facts}\n\n` +
    (kb ? `BASE DE CONHECIMENTO CLÍNICO (use como referência factual; NÃO invente além do que está aqui):\n${kb}\n\n` : '') +
    (isDoctor
      ? `Monte em Markdown CLÍNICO (sem prescrever, sem diagnóstico fechado, máx ~250 palavras):\n` +
        `- Contexto objetivo (achados + possível significado clínico)\n` +
        `- Investigação complementar sugerida (exames/diferenciais a considerar)\n` +
        `- Follow-up (quando reavaliar, sinais de alerta)\n` +
        `- Observações pra consulta\n`
      : `Monte o plano em Markdown com:\n` +
        `- 1 parágrafo curto de contexto (o que os achados podem indicar, em linguagem de risco/possível)\n` +
        `- "O que você pode fazer" (3 a 4 ações práticas de hábito/prevenção, educativas — sem prescrever)\n` +
        `- "Quando refazer os exames" (sugestão de periodicidade, se aplicável)\n` +
        `- "Perguntas para levar ao médico" (2 a 4 perguntas objetivas)\n` +
        `- Feche sempre reforçando que é educativo e não substitui consulta.\n` +
        `Máx. ~250 palavras. Tom calmo e respeitoso.`);

  const client = getAnthropic();
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 2000,
    system: PLAN_SYSTEM,
    messages: [{ role: 'user', content: userContent }],
  } as any);

  let response: any;
  try {
    response = await stream.finalMessage();
  } catch (e: any) {
    console.error('[risk-action-plan] erro GLM:', e?.status, e?.message);
    throw new Error('Não foi possível gerar o plano agora (serviço de IA). Tente novamente em instantes.');
  }

  const raw = (response.content as any[]).filter((b) => b.type === 'text').map((b) => b.text).join('');
  const contentMd = diagnosticGuard(raw).text + `\n\n*${MEDICAL_DISCLAIMER}*`;

  return {
    contentMd,
    modelUsed: response.model,
    usage: response.usage,
    basedOn: { conditionKey: last.conditionKey, riskLevel: last.riskLevel, findingsCount: findings.length, assessmentId: last.id, knowledgeUsed: !!kb },
  };
}
