-- R2: código de exame-por-e-mail POR PERFIL (titular/dependente). Aditiva + idempotente.
ALTER TABLE "email_upload_codes" ADD COLUMN IF NOT EXISTS "patientId" TEXT;
CREATE INDEX IF NOT EXISTS "email_upload_codes_patientId_idx" ON "email_upload_codes"("patientId");
