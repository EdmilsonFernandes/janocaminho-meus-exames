/** Carimbo de uso de IA como apoio à decisão médica (Res. CFM 2.454/2026, em vigor
 *  26/08/26 — retroativa a sistemas em uso): documentos clínicos gerados com apoio
 *  de IA (SOAP, resumo pós-consulta) carregam disclosure fixo. Idempotente: texto
 *  já carimbado (ex.: edição do médico que preservou a marca) não recebe 2ª cópia. */
export const AI_DISCLOSURE_MARK = 'Res. CFM 2.454/2026';

const AI_DISCLOSURE_FOOTER =
  '\n\n---\n' +
  `> 📋 Documento elaborado com apoio de ferramenta de IA (Dr. Exame), revisado e validado ` +
  `pelo médico responsável (${AI_DISCLOSURE_MARK}). A decisão clínica é do médico.`;

/** Anexa o disclosure ao Markdown; vazio/nulo devolve como está (não carimba o nada). */
export function appendAiFooter(md: string): string {
  if (!md.trim() || md.includes(AI_DISCLOSURE_MARK)) return md;
  return md.trimEnd() + AI_DISCLOSURE_FOOTER;
}
