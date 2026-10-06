-- SAÚDE ESPORTIVA (E1, out/2026): perfil esportivo DECLARADO pelo paciente (opt-in,
-- 1:1 com Patient). Tabela NOVA — aditiva e idempotente (mesmo padrão das anteriores):
-- paciente normal = sem row; nada em patients muda.
CREATE TABLE IF NOT EXISTS "sports_profiles" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "modality" TEXT,
    "trainingFreq" TEXT,
    "goals" TEXT,
    "supplements" JSONB,
    "collectionContext" JSONB,
    "declaredSubstances" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "sports_profiles_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sports_profiles_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "sports_profiles_patientId_key" ON "sports_profiles"("patientId");
