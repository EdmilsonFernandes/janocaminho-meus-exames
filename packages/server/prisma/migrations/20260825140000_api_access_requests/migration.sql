-- API pública Fase 2: fila de solicitações de acesso (admin aprova → concede pacote teste).
CREATE TABLE IF NOT EXISTS "api_access_requests" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "useCase" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "note" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "api_access_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "api_access_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "api_access_requests_status_createdAt_idx" ON "api_access_requests"("status", "createdAt");
