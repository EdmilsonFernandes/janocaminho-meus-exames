-- Lote ReUI 04/11/26: assinatura desenhada do consentimento de teleconsulta (Art.15).
-- Aditiva e idempotente (IF NOT EXISTS) — sobrevive a re-run/estado parcial (padrão do repo).
-- (Avaliação pós-consulta NÃO precisa de coluna: já existe POST /teleconsulta/:id/feedback.)
ALTER TABLE "reminders" ADD COLUMN IF NOT EXISTS "consentSignaturePath" TEXT;
