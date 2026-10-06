-- SAÚDE ESPORTIVA (E2.5, out/2026) — coluna `method` (método do ensaio) em exam_items.
-- ADITIVA e idempotente: NULL = método não informado (comportamento atual preservado);
-- a extração preenche best effort quando o laudo traz. Serve p/ BLOQUEAR comparação
-- entre exames de métodos diferentes (política de referências §4 do RELATORIO).
ALTER TABLE "exam_items" ADD COLUMN IF NOT EXISTS "method" TEXT;
