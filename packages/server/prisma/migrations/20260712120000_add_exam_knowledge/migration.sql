-- Cache em banco das explicações (leigo) de exames/analitos geradas pela IA.
-- Substitui o arquivo exam-explanations.json (read/rewrite integrais + race condition).
-- Tabela criada vazia; o backfill scripts/backfill-exam-knowledge.ts importa o JSON existente.
-- IF NOT EXISTS por convenção do projeto (SKILL.md): dev usa db push, migrations aditivas,
-- e `prisma migrate dev` falha no shadow DB por drift (P3006) — `migrate deploy` aplica em prod.
CREATE TABLE IF NOT EXISTS "exam_knowledge" (
  "id" TEXT NOT NULL,
  "nameKey" TEXT NOT NULL,
  "locale" TEXT NOT NULL DEFAULT 'pt-BR',
  "promptVersion" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'ai',
  "nameDisplay" TEXT NOT NULL,
  "titulo" TEXT,
  "resumo" TEXT,
  "analogia" TEXT,
  "alterado" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "exam_knowledge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "exam_knowledge_nameKey_locale_key"
  ON "exam_knowledge"("nameKey", "locale");
CREATE INDEX IF NOT EXISTS "exam_knowledge_locale_promptVersion_idx"
  ON "exam_knowledge"("locale", "promptVersion");
