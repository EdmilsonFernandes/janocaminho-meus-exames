-- Alimentação e exames: resumo personalizado por IA (cache por paciente). Aditiva e idempotente.
CREATE TABLE IF NOT EXISTS "food_summaries" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "food_summaries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "food_summaries_patientId_key" ON "food_summaries"("patientId");

DO $$ BEGIN
  ALTER TABLE "food_summaries" ADD CONSTRAINT "food_summaries_patientId_fkey"
    FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
