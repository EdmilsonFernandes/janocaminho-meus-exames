-- Exam: estado REJECTED (rejeição por identidade — CPF do documento ≠ CPF da conta)
-- + failureKind estruturado p/ FAILED ('ia_error' | 'not_a_document' | 'low_quality').
-- Aditivo e idempotente. O backfill que USA o novo valor vem em migration SEPARADA
-- (PG não permite usar novo valor de enum na mesma transação que o criou).
ALTER TYPE "ExamStatus" ADD VALUE IF NOT EXISTS 'REJECTED';
ALTER TABLE "exams" ADD COLUMN IF NOT EXISTS "failureKind" TEXT;
