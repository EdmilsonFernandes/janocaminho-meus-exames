-- Doctor funnel: aquisição via médico.
-- Aditiva e idempotente (IF NOT EXISTS) — sobrevive a re-run/estado parcial (padrão do projeto p/ prod).

-- 1) Convite de paciente (pré-cadastro do médico com share pré-autorizado)
CREATE TABLE IF NOT EXISTS "patient_invites" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "patientName" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "token" TEXT NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "acceptedUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_invites_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "patient_invites_token_key" ON "patient_invites"("token");
CREATE INDEX IF NOT EXISTS "patient_invites_doctorId_status_idx" ON "patient_invites"("doctorId", "status");
ALTER TABLE "patient_invites" ADD CONSTRAINT IF NOT EXISTS "patient_invites_doctorId_fkey"
    FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE CASCADE;
ALTER TABLE "patient_invites" ADD CONSTRAINT IF NOT EXISTS "patient_invites_acceptedUserId_fkey"
    FOREIGN KEY ("acceptedUserId") REFERENCES "users"("id") ON DELETE SET NULL;

-- 2) Consulta registrada pelo médico (botão "Atendi")
CREATE TABLE IF NOT EXISTS "consultations" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "happenedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consultations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "consultations_doctorId_happenedAt_idx" ON "consultations"("doctorId", "happenedAt");
CREATE INDEX IF NOT EXISTS "consultations_patientId_happenedAt_idx" ON "consultations"("patientId", "happenedAt");
ALTER TABLE "consultations" ADD CONSTRAINT IF NOT EXISTS "consultations_doctorId_fkey"
    FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE CASCADE;
ALTER TABLE "consultations" ADD CONSTRAINT IF NOT EXISTS "consultations_patientId_fkey"
    FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE;

-- 3) Gate de perguntas: limite de perguntas EM ABERTO por vínculo (anti-flood)
ALTER TABLE "doctor_shares" ADD COLUMN IF NOT EXISTS "openQuestionLimit" INTEGER NOT NULL DEFAULT 2;

-- 4) Limite padrão do médico (configurável no Pro) aplicado a novos shares
ALTER TABLE "doctors" ADD COLUMN IF NOT EXISTS "defaultQuestionLimit" INTEGER NOT NULL DEFAULT 2;
