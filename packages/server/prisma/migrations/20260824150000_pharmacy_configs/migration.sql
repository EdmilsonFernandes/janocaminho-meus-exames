CREATE TABLE IF NOT EXISTS "pharmacy_configs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "logoUrl" TEXT,
    "color" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "pharmacy_configs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "pharmacy_configs_name_key" ON "pharmacy_configs"("name");
CREATE UNIQUE INDEX IF NOT EXISTS "pharmacy_configs_slug_key" ON "pharmacy_configs"("slug");
CREATE UNIQUE INDEX IF NOT EXISTS "pharmacy_configs_hostname_key" ON "pharmacy_configs"("hostname");
