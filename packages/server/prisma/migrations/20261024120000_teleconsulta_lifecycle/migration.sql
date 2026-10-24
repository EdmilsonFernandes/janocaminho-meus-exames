-- Ciclo de vida da teleconsulta (24/10/26, spec docs/design/2026-10-24-teleconsulta-gaps-spec.md §1-§2):
-- estado explícito (teleStatus), presença do paciente (patientJoinedAt) e tempo conjunto
-- acumulado (jointMs, ms). Aditiva e idempotente (IF NOT EXISTS — sobrevive a re-run/estado
-- parcial), mesmo padrão das migrations anteriores de reminders (endedAt, payment).
ALTER TABLE "reminders" ADD COLUMN IF NOT EXISTS "teleStatus" TEXT;
ALTER TABLE "reminders" ADD COLUMN IF NOT EXISTS "patientJoinedAt" TIMESTAMP(3);
ALTER TABLE "reminders" ADD COLUMN IF NOT EXISTS "jointMs" INTEGER NOT NULL DEFAULT 0;
