-- Catálogo local de medicamentos (foto + preço pré-buscados da fonte VTEX).
CREATE TABLE IF NOT EXISTS "medication_catalog" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "activeIngredient" TEXT NOT NULL,
    "brands" TEXT[],
    "doses" TEXT[],
    "photoUrl" TEXT,
    "priceCents" INTEGER,
    "productName" TEXT,
    "pharmacy" TEXT,
    "ean" TEXT,
    "offersCount" INTEGER NOT NULL DEFAULT 0,
    "vtexQuery" TEXT,
    "lastRefreshedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "medication_catalog_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "medication_catalog_activeIngredient_key" ON "medication_catalog"("activeIngredient");
