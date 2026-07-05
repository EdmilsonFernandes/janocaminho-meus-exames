-- DoctorQuestion + DoctorQuestionMessage: pergunta do paciente ao médico (paga créditos).
-- Aparece no resumo IA do médico; paciente vê status "enviada/respondida". Espelha SupportTicket
-- mas com doctorId/doctorShareId (ator médico ≠ admin) + creditsCharged + aiDraft.
-- Criada manualmente (migrate dev falha no shadow por drift credits/vaccines); migrate deploy aplica.

CREATE TABLE IF NOT EXISTS "doctor_questions" (
  "id" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "doctorId" TEXT NOT NULL,
  "doctorShareId" TEXT,
  "subject" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "creditsCharged" INTEGER NOT NULL DEFAULT 0,
  "aiDraft" TEXT,
  "unreadByDoctor" BOOLEAN NOT NULL DEFAULT true,
  "unreadByPatient" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "answeredAt" TIMESTAMP(3),
  CONSTRAINT "doctor_questions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "doctor_question_messages" (
  "id" TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "authorRole" TEXT NOT NULL,
  "authorId" TEXT,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "doctor_question_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "doctor_questions_doctorId_status_createdAt_idx" ON "doctor_questions"("doctorId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "doctor_questions_patientId_createdAt_idx" ON "doctor_questions"("patientId", "createdAt");
CREATE INDEX IF NOT EXISTS "doctor_question_messages_questionId_createdAt_idx" ON "doctor_question_messages"("questionId", "createdAt");

ALTER TABLE "doctor_questions" ADD CONSTRAINT "doctor_questions_patientId_fkey"
  FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "doctor_questions" ADD CONSTRAINT "doctor_questions_doctorId_fkey"
  FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "doctor_question_messages" ADD CONSTRAINT "doctor_question_messages_questionId_fkey"
  FOREIGN KEY ("questionId") REFERENCES "doctor_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
