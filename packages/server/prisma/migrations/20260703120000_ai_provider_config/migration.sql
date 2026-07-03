-- Provedor de IA ativo + credenciais (parametrizado no banco). Chave cifrada AES-256-GCM.
CREATE TABLE "ai_provider_configs" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "apiKeyEnc" TEXT,
    "apiKeyIv" TEXT,
    "baseURL" TEXT,
    "model" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_provider_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_provider_configs_provider_key" ON "ai_provider_configs"("provider");
