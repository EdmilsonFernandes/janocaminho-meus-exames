-- Auditoria Postgres (skill supabase-postgres-best-practices, 01/09/26):
-- FKs de users sem índice — o Prisma NÃO cria índice automático pra FK no Postgres,
-- e deletes/updates em users viravam seq scan nessas tabelas conforme crescem.
-- Aditivo e idempotente (IF NOT EXISTS) — regra da casa p/ migrations.

-- Create index
CREATE INDEX IF NOT EXISTS "device_claims_userId_idx" ON "device_claims"("userId");

-- Create index
CREATE INDEX IF NOT EXISTS "api_access_requests_userId_idx" ON "api_access_requests"("userId");

-- Create index
CREATE INDEX IF NOT EXISTS "patient_invites_acceptedUserId_idx" ON "patient_invites"("acceptedUserId");
