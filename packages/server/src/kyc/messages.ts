/** Mensagem amigável por motivo (spec §3/§5b) — GET /verification e e-mail de recusa. */
const MESSAGES: Record<string, string> = {
  face_mismatch: 'O rosto não bateu com a foto do documento. Tente de novo com boa luz e sem óculos.',
  face_mismatch_review: 'Estamos conferindo sua foto — a resposta chega em breve.',
  liveness_fail: 'Não conseguimos confirmar a prova de vida. Use a câmera ao vivo, em local iluminado.',
  challenge_failed: 'O desafio de movimento não foi concluído. Tente de novo.',
  data_mismatch_name: 'O nome do documento é diferente do nome no CFM. Estamos analisando.',
  data_mismatch_cpf: 'O CPF do documento é diferente do CPF do seu cadastro.',
  document_expired: 'Documento vencido ou emitido há mais de 10 anos. Use um documento atual.',
  document_not_recognized: 'Não reconhecemos o documento. Use RG, CNH ou RNE originais, sem reflexo.',
  fraud_confirmed: 'Não foi possível concluir a verificação. Fale com o suporte: contato@janocaminho.com.br',
  crm_inactive: 'Seu CRM consta como inativo no CFM. Fale com o suporte.',
  name_mismatch: 'O nome do documento não bate com o nome no CFM. Estamos analisando.',
  cfm_unavailable: 'Recebemos sua verificação — falta conferir seu CRM. Estamos analisando.',
  document_name_unavailable: 'Recebemos sua verificação — estamos concluindo a análise.',
  cfm_situation_unknown: 'Recebemos sua verificação — estamos conferindo seu CRM.',
  manual_policy: 'Recebemos sua verificação — nossa equipe está conferindo seus dados.',
  admin_rejected: 'Nossa equipe não conseguiu confirmar seus dados. Fale com o suporte para entender o motivo.',
  expired: 'O link expirou. Gere um novo para continuar.',
};

export function kycMessage(reasonCode: string | null | undefined): string | null {
  return reasonCode ? MESSAGES[reasonCode] ?? null : null;
}
