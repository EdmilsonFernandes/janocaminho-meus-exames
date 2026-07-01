-- CreateTable: avaliação de risco por condição (camada de regras — educativa, NÃO diagnóstica).
-- Gerada manualmente (migrate dev quebra no shadow DB por drift pré-existente em
-- 20260622140000_add_app_settings). migrate deploy (boot do container) NÃO usa shadow,
-- então esta migration aplica normalmente em prod.
CREATE TABLE "risk_assessments" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "examId" TEXT,
    "conditionKey" TEXT NOT NULL,
    "conditionLabel" TEXT NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "ruleConfidence" TEXT NOT NULL,
    "basis" TEXT NOT NULL DEFAULT 'rules',
    "mlSuspect" BOOLEAN NOT NULL DEFAULT false,
    "findings" JSONB NOT NULL,
    "doctorQuestions" JSONB,
    "userExplanation" TEXT,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "risk_assessments_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "risk_assessments_patientId_createdAt_idx" ON "risk_assessments"("patientId", "createdAt");
CREATE INDEX "risk_assessments_examId_idx" ON "risk_assessments"("examId");

-- Foreign keys
ALTER TABLE "risk_assessments" ADD CONSTRAINT "risk_assessments_patientId_fkey"
    FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "risk_assessments" ADD CONSTRAINT "risk_assessments_examId_fkey"
    FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
