-- CreateTable: anotações clínicas do médico (histórico de atendimento)
CREATE TABLE "doctor_notes" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "doctor_notes_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "doctor_notes_patientId_createdAt_idx" ON "doctor_notes"("patientId", "createdAt");
CREATE INDEX "doctor_notes_doctorId_createdAt_idx" ON "doctor_notes"("doctorId", "createdAt");

-- Foreign keys
ALTER TABLE "doctor_notes" ADD CONSTRAINT "doctor_notes_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "doctor_notes" ADD CONSTRAINT "doctor_notes_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
