-- Doctor funnel: aquisição via médico.
-- Aditiva/idempotente. FKs INLINE no CREATE TABLE (Postgres NÃO suporta ADD CONSTRAINT IF NOT EXISTS —
-- armadilha que quebrou o 1º deploy).

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

    CONSTRAINT "patient_invites_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "patient_invites_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE CASCADE,
    CONSTRAINT "patient_invites_acceptedUserId_fkey" FOREIGN KEY ("acceptedUserId") REFERENCES "users"("id") ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "patient_invites_token_key" ON "patient_invites"("token");
CREATE INDEX IF NOT EXISTS "patient_invites_doctorId_status_idx" ON "patient_invites"("doctorId", "status");

-- 2) Consulta registrada pelo médico (botão "Atendi")
CREATE TABLE IF NOT EXISTS "consultations" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "happenedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consultations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "consultations_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE CASCADE,
    CONSTRAINT "consultations_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "consultations_doctorId_happenedAt_idx" ON "consultations"("doctorId", "happenedAt");
CREATE INDEX IF NOT EXISTS "consultations_patientId_happenedAt_idx" ON "consultations"("patientId", "happenedAt");

-- 3) Gate de perguntas: limite de perguntas EM ABERTO por vínculo (anti-flood)
ALTER TABLE "doctor_shares" ADD COLUMN IF NOT EXISTS "openQuestionLimit" INTEGER NOT NULL DEFAULT 2;

-- 4) Limite padrão do médico (configurável no Pro) aplicado a novos shares
ALTER TABLE "doctors" ADD COLUMN IF NOT EXISTS "defaultQuestionLimit" INTEGER NOT NULL DEFAULT 2;
