-- Protocolo do Radar Hormonal salvo no servidor (25/11/26): antes ficava só no aparelho, então
-- o que a pessoa montava no app não aparecia na web (e vice-versa). Uma linha por paciente.
-- Aditiva e idempotente.
CREATE TABLE IF NOT EXISTS "hormone_protocols" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hormone_protocols_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "hormone_protocols_patientId_key" ON "hormone_protocols"("patientId");

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hormone_protocols_patientId_fkey') THEN
        ALTER TABLE "hormone_protocols"
        ADD CONSTRAINT "hormone_protocols_patientId_fkey"
        FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
