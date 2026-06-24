-- 1 bônus de boas-vindas por dispositivo (anti-farm de créditos)
-- deviceId em User (qual aparelho criou a conta) + tabela device_claims (deviceId UNIQUE).

ALTER TABLE "users" ADD COLUMN "deviceId" TEXT;

CREATE TABLE "device_claims" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_claims_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "device_claims_deviceId_key" ON "device_claims"("deviceId");

ALTER TABLE "device_claims" ADD CONSTRAINT "device_claims_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
