-- Backfill: exames EXTRAÍDOS com CPF divergente (identityMatch.method='cpf' E cpfMatch=false)
-- migram p/ REJECTED. Sem mudança de semântica p/ o usuário: esses exames JÁ eram bloqueados
-- da análise (403) e excluídos dos agregados do paciente via filtro em código (isCpfMismatch).
-- Com status REJECTED ficam fora também do portal do médico/conquistas/insights por
-- construção (essas queries filtram status:'EXTRACTED') e a UI os exibe como rejeição
-- com CTA de apelação (suporte) e exclusão. Espelha exatamente utils/examIdentity.ts.
UPDATE "exams"
SET "status" = 'REJECTED', "updatedAt" = now()
WHERE "status" = 'EXTRACTED'
  AND "rawExtraction"->'identityMatch'->>'method' = 'cpf'
  AND "rawExtraction"->'identityMatch'->>'cpfMatch' = 'false';
