-- Medicamentos do paciente + regras de interação A-X (aditivo, idempotente).
CREATE TABLE IF NOT EXISTS "medications" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dosage" TEXT,
    "frequency" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "startedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "medications_pkey" PRIMARY KEY ("id")
);
-- FK inline (sem ADD CONSTRAINT — não existe IF NOT EXISTS pra constraint e re-run quebraria)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'medications_patientId_fkey') THEN
        ALTER TABLE "medications" ADD CONSTRAINT "medications_patientId_fkey"
            FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS "medications_patientId_active_idx" ON "medications"("patientId", "active");

CREATE TABLE IF NOT EXISTS "interaction_rules" (
    "id" TEXT NOT NULL,
    "drugA" TEXT NOT NULL,
    "drugB" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "effect" TEXT NOT NULL,
    "recommendation" TEXT NOT NULL,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "interaction_rules_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "interaction_rules_drugA_drugB_key" ON "interaction_rules"("drugA", "drugB");
CREATE INDEX IF NOT EXISTS "interaction_rules_severity_idx" ON "interaction_rules"("severity");
