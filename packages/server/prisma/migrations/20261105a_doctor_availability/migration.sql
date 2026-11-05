-- MOTOR DE SLOTS (contrato item 7, 05/11): janelas semanais de disponibilidade do
-- médico. Aditiva e idempotente (IF NOT EXISTS) — padrão do repo.
CREATE TABLE IF NOT EXISTS "doctor_availability" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startMinutes" INTEGER NOT NULL,
    "endMinutes" INTEGER NOT NULL,
    "slotMinutes" INTEGER NOT NULL DEFAULT 30,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "doctor_availability_pkey" PRIMARY KEY ("id")
);

-- FK para doctors (cascade: médico some → janelas somem)
DO $$ BEGIN
    ALTER TABLE "doctor_availability" ADD CONSTRAINT "doctor_availability_doctorId_fkey"
        FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "doctor_availability_doctorId_active_idx" ON "doctor_availability"("doctorId", "active");
