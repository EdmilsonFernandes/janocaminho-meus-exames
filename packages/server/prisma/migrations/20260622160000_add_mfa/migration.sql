-- MFA (TOTP 2FA) pra paciente + médico: fields de secret cifrado em users/doctors + tabela de desafio.
ALTER TABLE "users" ADD COLUMN "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "mfaSecretEncrypted" TEXT, ADD COLUMN "mfaSecretIv" TEXT,
  ADD COLUMN "mfaSecretAuthTag" TEXT, ADD COLUMN "mfaConfirmedAt" TIMESTAMP(3);

ALTER TABLE "doctors" ADD COLUMN "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "mfaSecretEncrypted" TEXT, ADD COLUMN "mfaSecretIv" TEXT,
  ADD COLUMN "mfaSecretAuthTag" TEXT, ADD COLUMN "mfaConfirmedAt" TIMESTAMP(3);

CREATE TABLE "mfa_challenges" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "ownerType" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "sessionPayload" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "attemptsCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mfa_challenges_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "mfa_challenges_tokenHash_key" ON "mfa_challenges"("tokenHash");
CREATE INDEX "mfa_challenges_ownerType_ownerId_idx" ON "mfa_challenges"("ownerType", "ownerId");
