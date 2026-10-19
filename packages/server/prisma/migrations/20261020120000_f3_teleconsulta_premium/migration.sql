-- F3 Telemedicina premium (20/10/26): transcrição cifrada POR consulta + pedidos de
-- exame do médico ("dr. pediu 1 toque"). Aditiva + idempotente (IF NOT EXISTS) —
-- sobrevive a re-run/estado parcial (padrão da casa, ver 20261019120000_add_reminder_livekit).
-- Reminder: consent de GRAVAÇÃO (titular = paciente) + estado do STT + transcript cifrado.
ALTER TABLE "reminders" ADD COLUMN IF NOT EXISTS "recordConsentAt" TIMESTAMP;
ALTER TABLE "reminders" ADD COLUMN IF NOT EXISTS "recordingAt" TIMESTAMP;
ALTER TABLE "reminders" ADD COLUMN IF NOT EXISTS "transcriptEnc" TEXT;
ALTER TABLE "reminders" ADD COLUMN IF NOT EXISTS "transcriptIv" TEXT;
ALTER TABLE "reminders" ADD COLUMN IF NOT EXISTS "transcriptAt" TIMESTAMP;

-- ExamRequest: pedido do médico respondido pelo paciente. FKs INLINE no CREATE TABLE
-- (idempotente: se a tabela já existe, tudo aqui é no-op).
CREATE TABLE IF NOT EXISTS "exam_requests" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "reminderId" TEXT,
    "title" TEXT NOT NULL,
    "note" TEXT,
    "existingExamId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP,
    CONSTRAINT "exam_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "exam_requests_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "exam_requests_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "exam_requests_patientId_status_idx" ON "exam_requests"("patientId", "status");
