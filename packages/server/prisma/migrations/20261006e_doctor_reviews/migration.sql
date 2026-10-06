-- SAÚDE ESPORTIVA (E5.3, out/2026) — estado de achado atribuído pelo médico no portal:
-- REVISADO | EM_ACOMPANHAMENTO | RESOLVIDO. Tabela NOVA — aditiva e idempotente (mesmo
-- padrão das anteriores). NUNCA DELETE físico: transição de estado é UPDATE de status.
-- examItemId/examId SEM FK (texto cru): posse validada na rota; revisões sobrevivem a
-- reprocessamentos de exame sem bloquear cascata.
CREATE TABLE IF NOT EXISTS "doctor_reviews" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "examItemId" TEXT,
    "examId" TEXT,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "doctor_reviews_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "doctor_reviews_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "doctor_reviews_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "doctor_reviews_doctorId_patientId_idx" ON "doctor_reviews"("doctorId", "patientId");
CREATE UNIQUE INDEX IF NOT EXISTS "doctor_reviews_doctorId_examItemId_kind_key" ON "doctor_reviews"("doctorId", "examItemId", "kind");
