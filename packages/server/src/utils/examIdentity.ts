/**
 * Exames cujo CPF do documento diverge do CPF do perfil (`rawExtraction.identityMatch.cpfMatch
 * === false` — gate anti-farm/usurpação). NÃO entram em AGREGADOS do paciente (contagens,
 * alterados, evolução, timeseries): valores de terceiro nunca contam como "sua saúde"
 * (auditoria premium 2026-08: exame mismatched alimentava hero/timeline/contagens).
 * O exame SEGUE listado — o dono precisa ver o aviso de CPF divergente e poder excluí-lo.
 *
 * ⚠️ FILTRO EM CÓDIGO, não em query Prisma: JSON path filter (`rawExtraction.path.equals`)
 * dentro de `NOT` cai na lógica trivalente do SQL — `NOT(NULL) = NULL` exclui TODA linha cujo
 * rawExtraction é null ou não tem o caminho (quebrou 6 testes do items.test.ts). Em JS a
 * semântica é explícita: só exclui quando o caminho EXISTE e é false.
 */
export const isCpfMismatch = (rawExtraction: unknown): boolean => {
  const id = (rawExtraction as any)?.identityMatch;
  return id?.method === 'cpf' && id?.cpfMatch === false;
};
