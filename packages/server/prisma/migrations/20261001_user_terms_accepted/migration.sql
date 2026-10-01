-- Auditoria LGPD (01/10): trilha do aceite dos Termos de Uso — o front exigia o
-- checkbox mas nada gravava QUANDO nem QUAL versão do documento. Aditiva/idempotente;
-- contas antigas = NULL (histórico honesto, sem inventar retroativo).
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "termsAcceptedAt" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "termsVersion" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "termsUrl" TEXT;
