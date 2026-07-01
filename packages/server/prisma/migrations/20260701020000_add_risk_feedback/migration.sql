-- CreateTable: feedback do paciente sobre o plano de ação (loop de melhoria da IA).
-- Manual (migrate dev quebra no shadow DB por drift pré-existente); migrate deploy aplica em prod.
CREATE TABLE "risk_feedbacks" (
    "id" TEXT NOT NULL,
    "riskAssessmentId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "risk_feedbacks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "risk_feedbacks_riskAssessmentId_idx" ON "risk_feedbacks"("riskAssessmentId");

ALTER TABLE "risk_feedbacks" ADD CONSTRAINT "risk_feedbacks_riskAssessmentId_fkey"
    FOREIGN KEY ("riskAssessmentId") REFERENCES "risk_assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
