-- Feature A: rastreamento de saúde mental (PHQ-9 / GAD-7). Tabela nova — aditiva e
-- idempotente (CREATE TABLE IF NOT EXISTS pula a FK inline se a tabela já existe).
-- Gratuito: nenhum vínculo com billing/créditos.
CREATE TABLE IF NOT EXISTS "mental_health_screenings" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "total" INTEGER NOT NULL,
    "answers" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mental_health_screenings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "mental_health_screenings_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "mental_health_screenings_patientId_type_createdAt_idx" ON "mental_health_screenings"("patientId", "type", "createdAt");
