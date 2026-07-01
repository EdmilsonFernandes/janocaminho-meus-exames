-- Flywheel de dados: opt-in (consent) no Patient + tabela anonimizada de contribuições.
-- Manual (drift pré-existente no shadow DB); migrate deploy aplica em prod.
ALTER TABLE "patients" ADD COLUMN "dataContributionConsent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "patients" ADD COLUMN "consentedAt" TIMESTAMP(3);

CREATE TABLE "data_contributions" (
    "id" TEXT NOT NULL,
    "conditionKey" TEXT NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "markers" JSONB NOT NULL,
    "sex" TEXT,
    "ageRange" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "data_contributions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "data_contributions_conditionKey_idx" ON "data_contributions"("conditionKey");
