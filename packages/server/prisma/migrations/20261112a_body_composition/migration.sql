-- Composição corporal (bioimpedância): tabela NOVA, aditiva e idempotente.
CREATE TABLE IF NOT EXISTS "body_compositions" (
  "id" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "measuredAt" TIMESTAMP(3) NOT NULL,
  "source" TEXT NOT NULL,
  "deviceBrand" TEXT,
  "deviceModel" TEXT,
  "weightKg" DOUBLE PRECISION,
  "heightCm" DOUBLE PRECISION,
  "bodyFatPct" DOUBLE PRECISION,
  "fatMassKg" DOUBLE PRECISION,
  "skeletalMuscleKg" DOUBLE PRECISION,
  "fatFreeMassKg" DOUBLE PRECISION,
  "bodyWaterL" DOUBLE PRECISION,
  "proteinKg" DOUBLE PRECISION,
  "mineralKg" DOUBLE PRECISION,
  "bmi" DOUBLE PRECISION,
  "bmrKcal" INTEGER,
  "waistHipRatio" DOUBLE PRECISION,
  "visceralFatLevel" DOUBLE PRECISION,
  "ranges" JSONB,
  "rawPayload" TEXT,
  "parserVersion" TEXT,
  "needsReview" BOOLEAN NOT NULL DEFAULT false,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "body_compositions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "body_compositions_patientId_measuredAt_idx" ON "body_compositions"("patientId", "measuredAt");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'body_compositions_patientId_fkey') THEN
    ALTER TABLE "body_compositions" ADD CONSTRAINT "body_compositions_patientId_fkey"
      FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
