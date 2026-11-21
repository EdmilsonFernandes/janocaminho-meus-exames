-- Cartão de emergência público (estudo Guava gap #3): token opaco do QR impresso.
-- Aditiva e idempotente — NULL = paciente nunca gerou o cartão.
ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "emergencyToken" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "patients_emergencyToken_key" ON "patients"("emergencyToken");
