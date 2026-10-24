-- CID-10 estruturado na teleconsulta (P0.3 estudo 24/10): diagnóstico do médico com
-- código validado na base DATASUS. Aditiva e idempotente (sobrevive a re-run/estado parcial).
ALTER TABLE "reminders" ADD COLUMN IF NOT EXISTS "cid10Code" TEXT;
ALTER TABLE "reminders" ADD COLUMN IF NOT EXISTS "cid10Desc" TEXT;
