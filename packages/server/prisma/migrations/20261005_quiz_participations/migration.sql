-- QUIZ RESUMÍVEL (05/10): participação persistida do quiz de boas-vindas — abandona no
-- meio, retoma de onde parou. A recompensa (ledger kind='quiz') passa a exigir
-- completedAt != null. Tabela nova — aditiva e idempotente (mesmo padrão das anteriores).
CREATE TABLE IF NOT EXISTS "quiz_participations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "currentIndex" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "quiz_participations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "quiz_participations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "quiz_participations_userId_quizId_key" ON "quiz_participations"("userId", "quizId");
