-- Portal do Médico — médico + compartilhamento seletivo de dados
CREATE TABLE "doctors" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "crm" TEXT NOT NULL,
    "specialty" TEXT,
    "photoUrl" TEXT,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "doctors_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "doctors_crm_key" ON "doctors"("crm");
CREATE UNIQUE INDEX "doctors_email_key" ON "doctors"("email");

CREATE TABLE "doctor_shares" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "convenio" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    CONSTRAINT "doctor_shares_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "doctor_shares_patientId_doctorId_key" ON "doctor_shares"("patientId", "doctorId");
CREATE INDEX "doctor_shares_doctorId_active_idx" ON "doctor_shares"("doctorId", "active");
ALTER TABLE "doctor_shares" ADD CONSTRAINT "doctor_shares_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "doctor_shares" ADD CONSTRAINT "doctor_shares_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
