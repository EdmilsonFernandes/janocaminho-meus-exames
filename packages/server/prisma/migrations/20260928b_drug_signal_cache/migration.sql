-- Feature D: farmacovigilância (openFDA FAERS). Tabela nova — aditiva e
-- idempotente. Cache público por remédio (nenhum dado de usuário): TTL 7d
-- sucesso / 1h não-encontrado, controlado por fetchedAt no código.
CREATE TABLE IF NOT EXISTS "drug_signal_cache" (
    "id" TEXT NOT NULL,
    "medKey" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "drug_signal_cache_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "drug_signal_cache_medKey_key" ON "drug_signal_cache"("medKey");
