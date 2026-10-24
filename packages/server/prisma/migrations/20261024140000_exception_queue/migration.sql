-- §15.2 (spec gaps teleconsulta 24/10): fila de exceções — base da central do ADMIN
-- (§14.5; UI vem depois). Aditiva e idempotente (IF NOT EXISTS — sobrevive a re-run).
CREATE TABLE IF NOT EXISTS "exception_queue" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "reminderId" TEXT,
    "payload" JSONB,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    CONSTRAINT "exception_queue_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "exception_queue_kind_status_idx" ON "exception_queue"("kind", "status");
CREATE INDEX IF NOT EXISTS "exception_queue_reminderId_idx" ON "exception_queue"("reminderId");
