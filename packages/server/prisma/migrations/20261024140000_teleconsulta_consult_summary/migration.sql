-- §14.1 RESUMO PÓS-CONSULTA (24/10/26, spec docs/design/2026-10-24-teleconsulta-gaps-spec.md):
-- rascunho IA revisado/aprovado pelo MÉDICO; paciente só lê a versão aprovada.
-- Aditiva e idempotente: CREATE TABLE IF NOT EXISTS com FKs INLINE (re-run/estado parcial
-- não explode — mesma filosofia ADD COLUMN IF NOT EXISTS das migrations de reminders).
CREATE TABLE IF NOT EXISTS "consult_summaries" (
    "id" TEXT NOT NULL,
    "reminderId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "draftMd" TEXT,
    "summaryMd" TEXT,
    "generatedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "approvedByDoctorId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "revisions" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "consult_summaries_pkey" PRIMARY KEY ("id")
);
-- 1 resumo por consulta (reminderId unique) + FK cascade (resumo morre com a consulta;
-- pedidos de exame seguem outro padrão — estes são desvinculados, o resumo NÃO: é
-- documento clínico daquela consulta).
CREATE UNIQUE INDEX IF NOT EXISTS "consult_summaries_reminderId_key" ON "consult_summaries"("reminderId");
CREATE INDEX IF NOT EXISTS "consult_summaries_approvedByDoctorId_idx" ON "consult_summaries"("approvedByDoctorId");
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'consult_summaries_reminderId_fkey') THEN
        ALTER TABLE "consult_summaries" ADD CONSTRAINT "consult_summaries_reminderId_fkey"
            FOREIGN KEY ("reminderId") REFERENCES "reminders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'consult_summaries_approvedByDoctorId_fkey') THEN
        ALTER TABLE "consult_summaries" ADD CONSTRAINT "consult_summaries_approvedByDoctorId_fkey"
            FOREIGN KEY ("approvedByDoctorId") REFERENCES "doctors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
