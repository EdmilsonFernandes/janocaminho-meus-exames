-- CHECKLIST DE COLETA (T2, 28/10/26): médico define exames que o paciente deve coletar.
-- Aditiva e idempotente (IF NOT EXISTS — sobrevive a re-run/estado parcial).
CREATE TABLE IF NOT EXISTS "collection_checklist_items" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT,
    "analyteName" TEXT NOT NULL,
    "analyteCanonical" TEXT NOT NULL,
    "instruction" TEXT,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "collectedAt" TIMESTAMP(3),
    "collectedExamId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collection_checklist_items_pkey" PRIMARY KEY ("id")
);

-- FK para patients (cascade: paciente some → checklist some junto).
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'collection_checklist_items_patientId_fkey'
    ) THEN
        ALTER TABLE "collection_checklist_items"
            ADD CONSTRAINT "collection_checklist_items_patientId_fkey"
            FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "collection_checklist_items_patientId_status_dueAt_idx"
    ON "collection_checklist_items"("patientId", "status", "dueAt");
