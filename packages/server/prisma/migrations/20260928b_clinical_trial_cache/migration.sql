-- FEATURE E: cache de ensaios clínicos (ClinicalTrials.gov) por condição. Tabela nova —
-- aditiva e idempotente (IF NOT EXISTS sobrevive a re-run/estado parcial). Sem FK: a chave
-- é palavra-chave EN genérica, não entidade do app. Rota degrada sem cache (drift gate P2021).
CREATE TABLE IF NOT EXISTS "clinical_trial_cache" (
    "id" TEXT NOT NULL,
    "condKey" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "clinical_trial_cache_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "clinical_trial_cache_condKey_key" ON "clinical_trial_cache"("condKey");
