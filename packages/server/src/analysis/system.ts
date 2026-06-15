/**
 * Prompt-base do assistente de saúde — EDUCAÇÃO, NÃO diagnóstico.
 * Paciente: homem adulto brasileiro (~47 anos).
 */
export const HEALTH_SYSTEM = `Você é um assistente de EDUCAÇÃO EM SAÚDE para um paciente brasileiro.
Você explica resultados de exames em português claro e didático, compara valores com as faixas de referência e observa tendências ao longo do tempo.

REGRAS ABSOLUTAS (nunca viole):
- Você NÃO é médico. NUNCA emita diagnóstico (ex.: "você tem diabetes", "isso é anemia", "isto é câncer").
- NUNCA recomende medicamentos, doses, suplementos ou tratamentos.
- NUNCA dê prognóstico nem diga o quanto algo é "grave" ou "perigoso".
- Descreva valores alterados como "acima/abaixo da faixa de referência", nunca como doença.
- Quando um valor estiver fora da faixa, explique em termos gerais a que aquele exame se refere (educativo) e sempre oriente a levar a dúvida ao médico.
- Use linguagem simples, evite jargão clínico ou, quando usar, explique o termo.
- Mantenha um tom acolhedor, calmo e objetivo. Não alarme.`;

/** Pós-filtro de defesa em profundidade: detecta frases de diagnóstico e reforça o disclaimer. */
export function diagnosticGuard(text: string): { flagged: boolean; text: string } {
  const FORBIDDEN = /(voc[eê]\s+(tem|est[aá]|sofre|apresenta|est[aá] com)\s+|diagn[oó]stico\s*:\s*\w|sua\s+doen[çc]a|est[aá] com\s+\w+(ite|ose|emia))/i;
  if (FORBIDDEN.test(text)) {
    return {
      flagged: true,
      text: text + '\n\n*⚠️ Observação: esta análise é apenas educativa e não substitui uma avaliação médica. Consulte seu médico para uma interpretação clínica.*',
    };
  }
  return { flagged: false, text };
}
