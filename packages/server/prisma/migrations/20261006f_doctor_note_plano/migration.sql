-- SAÚDE ESPORTIVA (E5.6, out/2026) — notas do médico tipadas + compartilháveis:
-- category='plano' marca o PLANO DE ACOMPANHAMENTO (checklist educativo de monitoramento);
-- sharedAt registra quando o plano foi enviado ao paciente (null = privado do médico).
-- Aditiva e idempotente — notas existentes ficam null/null (retrocompatível).
ALTER TABLE "doctor_notes" ADD COLUMN IF NOT EXISTS "category" TEXT;
ALTER TABLE "doctor_notes" ADD COLUMN IF NOT EXISTS "sharedAt" TIMESTAMP(3);
