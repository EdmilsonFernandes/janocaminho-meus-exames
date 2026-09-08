-- R2: ingestão de exame por e-mail (código pessoal no assunto). Aditiva + idempotente.
CREATE TABLE IF NOT EXISTS "email_upload_codes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    CONSTRAINT "email_upload_codes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "email_upload_codes_code_key" ON "email_upload_codes"("code");
CREATE INDEX IF NOT EXISTS "email_upload_codes_userId_idx" ON "email_upload_codes"("userId");
ALTER TABLE "email_upload_codes" ADD CONSTRAINT IF NOT EXISTS "email_upload_codes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
