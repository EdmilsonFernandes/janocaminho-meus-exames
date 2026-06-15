-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN');

-- CreateEnum
CREATE TYPE "ExamKind" AS ENUM ('LAB_PANEL', 'IMAGING', 'OTHER');

-- CreateEnum
CREATE TYPE "ExamStatus" AS ENUM ('UPLOADED', 'EXTRACTING', 'EXTRACTED', 'FAILED');

-- CreateEnum
CREATE TYPE "ItemFlag" AS ENUM ('NORMAL', 'HIGH', 'LOW', 'ABNORMAL', 'CRITICAL', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "AnalysisType" AS ENUM ('SUMMARY', 'CHAT');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'OWNER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patients" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3),
    "cpfEncrypted" TEXT,
    "cpfIv" TEXT,
    "clinicalProfile" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exams" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" "ExamKind" NOT NULL DEFAULT 'OTHER',
    "performedAt" TIMESTAMP(3),
    "sourceLab" TEXT,
    "requestingDoctor" TEXT,
    "filePath" TEXT NOT NULL,
    "fileSha256" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL DEFAULT 0,
    "pageCount" INTEGER NOT NULL DEFAULT 0,
    "status" "ExamStatus" NOT NULL DEFAULT 'UPLOADED',
    "rawExtraction" JSONB,
    "reviewRequired" BOOLEAN NOT NULL DEFAULT false,
    "extractedAt" TIMESTAMP(3),
    "extractionError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_items" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "panel" TEXT,
    "name" TEXT NOT NULL,
    "nameCanonical" TEXT NOT NULL,
    "valueNumeric" DOUBLE PRECISION,
    "valueText" TEXT,
    "unit" TEXT,
    "refLow" DOUBLE PRECISION,
    "refHigh" DOUBLE PRECISION,
    "refText" TEXT,
    "refAppliesTo" TEXT,
    "flag" "ItemFlag" NOT NULL DEFAULT 'NORMAL',
    "isAbnormal" BOOLEAN NOT NULL DEFAULT false,
    "extractedPage" INTEGER NOT NULL,
    "rawRow" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_analyses" (
    "id" TEXT NOT NULL,
    "examId" TEXT,
    "patientId" TEXT,
    "type" "AnalysisType" NOT NULL,
    "contentMd" TEXT NOT NULL,
    "structured" JSONB,
    "modelUsed" TEXT,
    "tokenUsage" JSONB,
    "parentAnalysisId" TEXT,
    "userMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "patients_ownerId_idx" ON "patients"("ownerId");

-- CreateIndex
CREATE INDEX "exams_patientId_performedAt_idx" ON "exams"("patientId", "performedAt");

-- CreateIndex
CREATE INDEX "exams_kind_idx" ON "exams"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "exams_patientId_fileSha256_key" ON "exams"("patientId", "fileSha256");

-- CreateIndex
CREATE INDEX "exam_items_examId_idx" ON "exam_items"("examId");

-- CreateIndex
CREATE INDEX "exam_items_nameCanonical_examId_idx" ON "exam_items"("nameCanonical", "examId");

-- CreateIndex
CREATE INDEX "ai_analyses_examId_type_createdAt_idx" ON "ai_analyses"("examId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "ai_analyses_patientId_createdAt_idx" ON "ai_analyses"("patientId", "createdAt");

-- AddForeignKey
ALTER TABLE "patients" ADD CONSTRAINT "patients_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_items" ADD CONSTRAINT "exam_items_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_analyses" ADD CONSTRAINT "ai_analyses_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
