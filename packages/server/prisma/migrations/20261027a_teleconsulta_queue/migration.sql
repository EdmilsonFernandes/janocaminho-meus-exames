-- FILA DE TELECONSULTA IMEDIATA ("Falar agora") — spec docs/design/2026-10-27-fila-imediata-spec.md §1.
-- Aditiva e idempotente (CREATE TABLE IF NOT EXISTS / índices IF NOT EXISTS / FKs via DO-block):
-- sobrevive a re-run e estado parcial (padrão da casa — nunca migrate dev em prod).
--
-- reminderId é TEXTO SEM FK: Reminder é deletável (DELETE do portal, doctor.routes) —
-- a entrada da fila não pode órfã quebrar integridade nem bloquear o DELETE.
-- Share efêmero do match = marker DoctorShare.convenio='fila-imediata' (sem coluna nova).

CREATE TABLE IF NOT EXISTS "doctor_online_presence" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "online" BOOLEAN NOT NULL DEFAULT false,
    "lastHeartbeatAt" TIMESTAMP(3),
    "lastOnlineAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "doctor_online_presence_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "doctor_online_presence_doctorId_key" ON "doctor_online_presence"("doctorId");

CREATE TABLE IF NOT EXISTS "teleconsulta_queue" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'waiting',
    "consentAt" TIMESTAMP(3) NOT NULL,
    "maxPriceCents" INTEGER,
    "matchedDoctorId" TEXT,
    "reminderId" TEXT,
    "offerExpiresAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "matchedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    CONSTRAINT "teleconsulta_queue_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "teleconsulta_queue_status_enteredAt_idx" ON "teleconsulta_queue"("status", "enteredAt");
CREATE INDEX IF NOT EXISTS "teleconsulta_queue_status_matchedDoctorId_idx" ON "teleconsulta_queue"("status", "matchedDoctorId");

-- 1 entrada ATIVA por paciente (waiting|matched|accepted) — corrida de 2× POST falha aqui.
CREATE UNIQUE INDEX IF NOT EXISTS "teleconsulta_queue_active_patient_uidx"
  ON "teleconsulta_queue"("patientId")
  WHERE status IN ('waiting', 'matched', 'accepted');
-- 1 offer pendente por médico — 2 ticks concorrentes não duplicam oferta pro mesmo médico.
CREATE UNIQUE INDEX IF NOT EXISTS "teleconsulta_queue_offer_doctor_uidx"
  ON "teleconsulta_queue"("matchedDoctorId")
  WHERE status = 'matched';

-- FKs idempotentes (DO-block): re-run não tenta recriar constraint.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'doctor_online_presence_doctorId_fkey') THEN
    ALTER TABLE "doctor_online_presence"
      ADD CONSTRAINT "doctor_online_presence_doctorId_fkey"
      FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'teleconsulta_queue_patientId_fkey') THEN
    ALTER TABLE "teleconsulta_queue"
      ADD CONSTRAINT "teleconsulta_queue_patientId_fkey"
      FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'teleconsulta_queue_matchedDoctorId_fkey') THEN
    ALTER TABLE "teleconsulta_queue"
      ADD CONSTRAINT "teleconsulta_queue_matchedDoctorId_fkey"
      FOREIGN KEY ("matchedDoctorId") REFERENCES "doctors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
