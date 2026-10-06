-- SAÚDE ESPORTIVA (E2, out/2026) — CAMADA 2 da política de referências: meta clínica
-- individual definida SÓ por médico. Tabela NOVA — aditiva e idempotente (mesmo padrão
-- das anteriores): paciente normal = sem row; nada em patients/exam_items muda aqui.
-- Expiração é UPDATE de validTo (nunca DELETE físico); supersedesId encadeia o histórico.
CREATE TABLE IF NOT EXISTS "clinical_goals" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "analyte" TEXT NOT NULL,
    "unit" TEXT,
    "targetLow" DOUBLE PRECISION,
    "targetHigh" DOUBLE PRECISION,
    "setByDoctorId" TEXT NOT NULL,
    "justification" TEXT NOT NULL,
    "source" TEXT,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validTo" TIMESTAMP(3),
    "supersedesId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "clinical_goals_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "clinical_goals_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "clinical_goals_setByDoctorId_fkey" FOREIGN KEY ("setByDoctorId") REFERENCES "doctors"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "clinical_goals_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "clinical_goals"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "clinical_goals_patientId_analyte_idx" ON "clinical_goals"("patientId", "analyte");
