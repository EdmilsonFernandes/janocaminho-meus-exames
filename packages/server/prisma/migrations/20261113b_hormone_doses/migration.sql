-- Radar Hormonal: aplicações registradas pelo paciente. Aditiva e idempotente.
CREATE TABLE IF NOT EXISTS "hormone_doses" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "compoundId" TEXT NOT NULL,
    "doseMg" DOUBLE PRECISION NOT NULL,
    "takenAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "hormone_doses_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "hormone_doses_patientId_takenAt_idx" ON "hormone_doses"("patientId", "takenAt");

DO $$ BEGIN
  ALTER TABLE "hormone_doses" ADD CONSTRAINT "hormone_doses_patientId_fkey"
    FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
