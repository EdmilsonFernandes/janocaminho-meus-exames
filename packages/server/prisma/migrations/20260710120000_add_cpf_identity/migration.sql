-- CPF identity hardening. Nullable for legacy accounts; new public registrations require CPF.
ALTER TABLE "patients"
  ADD COLUMN "cpfHash" TEXT,
  ADD COLUMN "cpfLast4" TEXT,
  ADD COLUMN "identityLockedAt" TIMESTAMP(3);

ALTER TABLE "doctors"
  ADD COLUMN "cpfEncrypted" TEXT,
  ADD COLUMN "cpfIv" TEXT,
  ADD COLUMN "cpfHash" TEXT,
  ADD COLUMN "cpfLast4" TEXT,
  ADD COLUMN "identityLockedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "patients_cpfHash_key" ON "patients"("cpfHash");
CREATE UNIQUE INDEX "doctors_cpfHash_key" ON "doctors"("cpfHash");
