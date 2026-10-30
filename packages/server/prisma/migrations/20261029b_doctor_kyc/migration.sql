-- KYC do médico (spec docs/design/2026-10-28-verificacao-medico-spec.md §2). Aditiva e idempotente.
-- 1) Status: existentes nascem 'legacy' (nada quebra no deploy); novos = 'pending'.
ALTER TABLE "doctors" ADD COLUMN IF NOT EXISTS "verificationStatus" TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE "doctors" ALTER COLUMN "verificationStatus" SET DEFAULT 'pending';
-- Placeholder de convite e conta que nunca validou e-mail NÃO são legado: quem reivindicasse
-- herdaria acesso total.
UPDATE "doctors" SET "verificationStatus" = 'pending'
  WHERE "verificationStatus" = 'legacy' AND ("passwordHash" = 'pending-invite' OR "emailVerified" = false);
ALTER TABLE "doctors" ADD COLUMN IF NOT EXISTS "verifiedAt" TIMESTAMP(3);
ALTER TABLE "doctors" ADD COLUMN IF NOT EXISTS "verifiedBy" TEXT;

-- 2) Tentativas
CREATE TABLE IF NOT EXISTS "doctor_verifications" (
  "id" TEXT NOT NULL,
  "doctorId" TEXT,
  "crm" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'uaiid',
  "providerId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "reasonCode" TEXT,
  "score" INTEGER,
  "documentName" TEXT,
  "nameRatio" DOUBLE PRECISION,
  "cfmName" TEXT,
  "cfmSituation" TEXT,
  "nameMatch" BOOLEAN,
  "cpfSituacao" TEXT,
  "decision" TEXT,
  "decidedBy" TEXT,
  "expiresAt" TIMESTAMP(3),
  "lastSyncedAt" TIMESTAMP(3),
  "syncSource" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "doctor_verifications_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "doctor_verifications_providerId_key" ON "doctor_verifications"("providerId");
CREATE INDEX IF NOT EXISTS "doctor_verifications_doctorId_createdAt_idx" ON "doctor_verifications"("doctorId", "createdAt");
CREATE INDEX IF NOT EXISTS "doctor_verifications_status_lastSyncedAt_idx" ON "doctor_verifications"("status", "lastSyncedAt");
CREATE INDEX IF NOT EXISTS "doctor_verifications_crm_createdAt_idx" ON "doctor_verifications"("crm", "createdAt");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'doctor_verifications_doctorId_fkey') THEN
    ALTER TABLE "doctor_verifications" ADD CONSTRAINT "doctor_verifications_doctorId_fkey"
      FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
