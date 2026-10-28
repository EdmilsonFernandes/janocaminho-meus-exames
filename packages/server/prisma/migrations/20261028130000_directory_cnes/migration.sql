-- CATÁLOGO PÚBLICO CNES/DATASUS (28/10/26) — descoberta "perto de você" com dados
-- abertos oficiais. Aditiva e idempotente (padrão da casa): 2 tabelas novas, zero
-- mudança em tabelas existentes. Import por região (scripts/cnes-import.mjs).

CREATE TABLE IF NOT EXISTS "directory_facilities" (
    "id" TEXT NOT NULL,
    "cnesCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "uf" TEXT NOT NULL,
    "address" TEXT,
    "district" TEXT,
    "phone" TEXT,
    "lat" TEXT,
    "lng" TEXT,
    "facilityTyp" TEXT,
    "source" TEXT NOT NULL DEFAULT 'cnes',
    "importedAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "directory_facilities_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "directory_facilities_cnesCode_key" ON "directory_facilities"("cnesCode");
CREATE INDEX IF NOT EXISTS "directory_facilities_city_uf_idx" ON "directory_facilities"("city", "uf");
CREATE INDEX IF NOT EXISTS "directory_facilities_uf_idx" ON "directory_facilities"("uf");

CREATE TABLE IF NOT EXISTS "directory_professionals" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cboCode" TEXT,
    "cboName" TEXT,
    "source" TEXT NOT NULL DEFAULT 'cnes',
    "importedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "directory_professionals_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "directory_professionals_facilityId_idx" ON "directory_professionals"("facilityId");
CREATE INDEX IF NOT EXISTS "directory_professionals_name_idx" ON "directory_professionals"("name");
CREATE INDEX IF NOT EXISTS "directory_professionals_cboCode_idx" ON "directory_professionals"("cboCode");

-- FK idempotente (DO-block)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'directory_professionals_facilityId_fkey') THEN
    ALTER TABLE "directory_professionals"
      ADD CONSTRAINT "directory_professionals_facilityId_fkey"
      FOREIGN KEY ("facilityId") REFERENCES "directory_facilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
