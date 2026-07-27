-- Fatia 1: campos aditivos em DoctorQuestion (cota de perguntas)
-- sentKey: dedup estável entre regenerações de relatório
-- expiresAt: auto-expiração após 7 dias sem resposta
-- analysisId: provenance (qual relatório motivou)
-- closedReason: "timeout" | "answered" | "revoked"
-- Idempotente (IF NOT EXISTS) — seguro pra re-run.

ALTER TABLE "DoctorQuestion" ADD COLUMN IF NOT EXISTS "sentKey" TEXT;
ALTER TABLE "DoctorQuestion" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);
ALTER TABLE "DoctorQuestion" ADD COLUMN IF NOT EXISTS "analysisId" TEXT;
ALTER TABLE "DoctorQuestion" ADD COLUMN IF NOT EXISTS "closedReason" TEXT;

CREATE INDEX IF NOT EXISTS "DoctorQuestion_sentKey_idx" ON "DoctorQuestion"("sentKey");
CREATE INDEX IF NOT EXISTS "DoctorQuestion_expiresAt_idx" ON "DoctorQuestion"("expiresAt");
