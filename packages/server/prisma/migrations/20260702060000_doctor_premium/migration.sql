-- Dr. Exame Pro (premium) — paywall: pré-consulta, SOAP, export.
ALTER TABLE "doctors" ADD COLUMN "plan" TEXT NOT NULL DEFAULT 'free';
ALTER TABLE "doctors" ADD COLUMN "planExpiresAt" TIMESTAMP(3);
ALTER TABLE "doctors" ADD COLUMN "freeUsageMonth" TEXT;
ALTER TABLE "doctors" ADD COLUMN "freeUsageCount" INTEGER NOT NULL DEFAULT 0;
