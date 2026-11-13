-- Radar Hormonal: explicações leigas dos compostos (cache de IA). Tabela NOVA, aditiva e idempotente.
CREATE TABLE IF NOT EXISTS "compound_knowledge" (
  "id" TEXT NOT NULL,
  "compoundKey" TEXT NOT NULL,
  "locale" TEXT NOT NULL DEFAULT 'pt-BR',
  "promptVersion" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'ai',
  "sections" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "compound_knowledge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "compound_knowledge_compoundKey_locale_key" ON "compound_knowledge"("compoundKey", "locale");
