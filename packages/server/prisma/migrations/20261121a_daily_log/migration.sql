-- Diário de saúde diário (estudo Guava 21/11 — gap #1): sintomas + humor + energia.
-- Aditiva e idempotente (IF NOT EXISTS) — sobrevive a re-run/estado parcial.
CREATE TABLE IF NOT EXISTS "daily_logs" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "symptoms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "mood" INTEGER,
    "energy" INTEGER,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_logs_pkey" PRIMARY KEY ("id")
);

-- FK para patients (idempotente: só cria se não existir)
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'daily_logs_patientId_fkey'
    ) THEN
        ALTER TABLE "daily_logs"
        ADD CONSTRAINT "daily_logs_patientId_fkey"
        FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "daily_logs_patientId_date_key" ON "daily_logs"("patientId", "date");
CREATE INDEX IF NOT EXISTS "daily_logs_patientId_date_idx" ON "daily_logs"("patientId", "date");
