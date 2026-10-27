-- Medication estruturado — blueprint AAS P0.1 (docs/design/2026-10-26-musculacao-saude-AAS.md §7)
-- Aditiva + idempotente: sobrevive a re-run/estado parcial (regra do projeto p/ prod com drift P3006).
-- Registro antigo sem fim-de-uso = 'nao_sei' (default) — continua válido.
DO $$ BEGIN
  CREATE TYPE "MedicationEndStatus" AS ENUM ('em_uso', 'interrompi', 'nao_sei');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE "medications" ADD COLUMN IF NOT EXISTS "endStatus" "MedicationEndStatus" NOT NULL DEFAULT 'nao_sei';
ALTER TABLE "medications" ADD COLUMN IF NOT EXISTS "endedAt" TIMESTAMP(3);
ALTER TABLE "medications" ADD COLUMN IF NOT EXISTS "lastAdministeredAt" TIMESTAMP(3);
ALTER TABLE "medications" ADD COLUMN IF NOT EXISTS "prescriberName" TEXT;
