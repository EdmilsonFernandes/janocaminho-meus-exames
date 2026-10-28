-- MEUS MÉDICOS / MINHAS CONSULTAS / ENCONTRAR ESPECIALISTAS (28/10/26, spec §8 V1).
-- Aditiva e idempotente (CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS /
-- FKs via DO-block): sobrevive a re-run e estado parcial (padrão da casa).
--
-- 3 tabelas novas + 1 coluna:
--   patient_doctor_links  — vínculo PRIVADO paciente↔médico (não concede acesso a exames)
--   patient_consultations — consultas registradas pelo paciente (status/convênio/exames)
--   doctor_insurances     — convênio por médico+local+operadora+plano com provenance
--   doctor_shares.expiresAt — compartilhamento por tempo (§6; null = sem expiração)
--
-- patient_consultations.doctorId é SET NULL (Doctor pending é deletável no cleanup do
-- share) e reminderId é TEXTO SEM FK (Reminder é deletável — padrão teleconsulta_queue).

ALTER TABLE "doctor_shares" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "patient_doctor_links" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "patientNotes" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "sourceInfo" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "patient_doctor_links_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "patient_doctor_links_patientId_doctorId_key" ON "patient_doctor_links"("patientId", "doctorId");
CREATE INDEX IF NOT EXISTS "patient_doctor_links_patientId_idx" ON "patient_doctor_links"("patientId");

CREATE TABLE IF NOT EXISTS "patient_consultations" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "doctorId" TEXT,
    "doctorName" TEXT NOT NULL,
    "specialty" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "mode" TEXT NOT NULL DEFAULT 'presencial',
    "placeName" TEXT,
    "address" TEXT,
    "linkUrl" TEXT,
    "paymentType" TEXT NOT NULL DEFAULT 'particular',
    "insuranceOperator" TEXT,
    "insurancePlan" TEXT,
    "priceCents" INTEGER,
    "reason" TEXT,
    "privateNotes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "examIds" TEXT[] NOT NULL DEFAULT '{}',
    "reminderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "patient_consultations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "patient_consultations_patientId_scheduledAt_idx" ON "patient_consultations"("patientId", "scheduledAt");
CREATE INDEX IF NOT EXISTS "patient_consultations_ownerId_status_idx" ON "patient_consultations"("ownerId", "status");

CREATE TABLE IF NOT EXISTS "doctor_insurances" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "locationName" TEXT,
    "operator" TEXT NOT NULL,
    "plan" TEXT,
    "verificationStatus" TEXT NOT NULL DEFAULT 'patient_reported',
    "source" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "doctor_insurances_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "doctor_insurances_doctorId_operator_idx" ON "doctor_insurances"("doctorId", "operator");

-- FKs idempotentes (DO-block): re-run não tenta recriar constraint.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'patient_doctor_links_patientId_fkey') THEN
    ALTER TABLE "patient_doctor_links"
      ADD CONSTRAINT "patient_doctor_links_patientId_fkey"
      FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'patient_doctor_links_doctorId_fkey') THEN
    ALTER TABLE "patient_doctor_links"
      ADD CONSTRAINT "patient_doctor_links_doctorId_fkey"
      FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'patient_consultations_patientId_fkey') THEN
    ALTER TABLE "patient_consultations"
      ADD CONSTRAINT "patient_consultations_patientId_fkey"
      FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'patient_consultations_doctorId_fkey') THEN
    ALTER TABLE "patient_consultations"
      ADD CONSTRAINT "patient_consultations_doctorId_fkey"
      FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'doctor_insurances_doctorId_fkey') THEN
    ALTER TABLE "doctor_insurances"
      ADD CONSTRAINT "doctor_insurances_doctorId_fkey"
      FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
