-- Lote "encontro estilo Teams" (18/10/26): lembrete ganha tipo, link externo de
-- teleconsulta, recorrência (linha que rola), consentimento Art.15 e autor médico.
-- Aditiva + idempotente (IF NOT EXISTS) — sobrevive a re-run/estado parcial.
ALTER TABLE "reminders" ADD COLUMN IF NOT EXISTS "type" TEXT;
ALTER TABLE "reminders" ADD COLUMN IF NOT EXISTS "linkUrl" TEXT;
ALTER TABLE "reminders" ADD COLUMN IF NOT EXISTS "recurrence" TEXT;
ALTER TABLE "reminders" ADD COLUMN IF NOT EXISTS "consentAt" TIMESTAMP(3);
ALTER TABLE "reminders" ADD COLUMN IF NOT EXISTS "createdByDoctorId" TEXT;
