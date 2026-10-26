-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('DRAFT', 'QUEUED', 'EXTRACTING', 'NORMALIZING', 'MATCHING', 'CALCULATING', 'READY', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "JobEventType" AS ENUM ('CREATED', 'FILE_UPLOADED', 'FILE_REMOVED', 'SUBMITTED', 'STAGE_CHANGED', 'TASK_FAILED', 'REVISION_APPROVED', 'EXPORT_CREATED', 'EXPORT_DOWNLOADED', 'DELETED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "FileCategory" AS ENUM ('MENU', 'INVOICE', 'POS');

-- CreateEnum
CREATE TYPE "FileStatus" AS ENUM ('UPLOADED', 'PROCESSING', 'PROCESSED', 'FAILED', 'DELETED');

-- CreateEnum
CREATE TYPE "ExtractionMethod" AS ENUM ('DETERMINISTIC', 'AI');

-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('PARSE_FILE', 'EXTRACT_FILE');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'RUNNING', 'DISPATCHED', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "Confidence" AS ENUM ('VERIFIED', 'PARTIALLY_VERIFIED', 'ESTIMATED', 'INCOMPLETE');

-- CreateEnum
CREATE TYPE "RowOrigin" AS ENUM ('EXTRACTED', 'USER');

-- CreateEnum
CREATE TYPE "BaseUnit" AS ENUM ('G', 'ML', 'EACH');

-- CreateEnum
CREATE TYPE "PriceSource" AS ENUM ('INVOICE', 'USER');

-- CreateEnum
CREATE TYPE "RecipeSource" AS ENUM ('USER', 'AI_ESTIMATE');

-- CreateEnum
CREATE TYPE "MatchMethod" AS ENUM ('EXACT', 'FUZZY', 'USER');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('AUTO_ACCEPTED', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RevisionStatus" AS ENUM ('PROPOSED', 'APPROVED', 'REJECTED', 'STALE');

-- CreateEnum
CREATE TYPE "RevisionSource" AS ENUM ('CHAT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ChatRole" AS ENUM ('USER', 'ASSISTANT');

-- CreateEnum
CREATE TYPE "ExportFormat" AS ENUM ('XLSX');

-- CreateEnum
CREATE TYPE "ExportStatus" AS ENUM ('READY', 'FAILED');

-- CreateTable
CREATE TABLE "AnalysisJob" (
    "id" UUID NOT NULL,
    "accessTokenHash" CHAR(64) NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'DRAFT',
    "progress" JSONB NOT NULL DEFAULT '{}',
    "idempotencyKey" TEXT,
    "currency" CHAR(3) NOT NULL DEFAULT 'EUR',
    "currentRevision" INTEGER NOT NULL DEFAULT 0,
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "submittedAt" TIMESTAMPTZ(6),
    "rawFilesExpireAt" TIMESTAMPTZ(6),
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "purgedAt" TIMESTAMPTZ(6),
    "cleanupAttempts" INTEGER NOT NULL DEFAULT 0,
    "lastCleanupError" TEXT,
    "aiUsage" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "AnalysisJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobEvent" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "type" "JobEventType" NOT NULL,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UploadedFile" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "category" "FileCategory" NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "storageKey" TEXT NOT NULL,
    "pageCount" INTEGER,
    "status" "FileStatus" NOT NULL DEFAULT 'UPLOADED',
    "extractionMethod" "ExtractionMethod",
    "statusMessage" TEXT,
    "deletedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UploadedFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessingTask" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "fileId" UUID,
    "type" "TaskType" NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "deadlineAt" TIMESTAMPTZ(6),
    "nextAttemptAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "n8nExecutionId" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "resultReceivedAt" TIMESTAMPTZ(6),
    "usage" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ProcessingTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuItem" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "sourceFileId" UUID,
    "sourceRef" TEXT,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "category" TEXT,
    "description" TEXT,
    "grossPrice" DECIMAL(14,4),
    "confidence" "Confidence" NOT NULL DEFAULT 'VERIFIED',
    "origin" "RowOrigin" NOT NULL DEFAULT 'EXTRACTED',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosSalesLine" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "sourceFileId" UUID NOT NULL,
    "sourceRef" TEXT,
    "rawItemName" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "rawCategory" TEXT,
    "periodStart" DATE,
    "periodEnd" DATE,
    "quantity" DECIMAL(14,4) NOT NULL,
    "netRevenue" DECIMAL(14,4),
    "grossRevenue" DECIMAL(14,4),
    "menuItemId" UUID,
    "isDuplicate" BOOLEAN NOT NULL DEFAULT false,
    "confidence" "Confidence" NOT NULL DEFAULT 'VERIFIED',

    CONSTRAINT "PosSalesLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierInvoice" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "sourceFileId" UUID NOT NULL,
    "supplierName" TEXT,
    "supplierNormalized" TEXT,
    "invoiceNumber" TEXT,
    "invoiceDate" DATE,
    "currency" CHAR(3),
    "netTotal" DECIMAL(14,4),
    "vatTotal" DECIMAL(14,4),
    "grossTotal" DECIMAL(14,4),
    "duplicateOfId" UUID,
    "checks" JSONB NOT NULL DEFAULT '{}',
    "confidence" "Confidence" NOT NULL DEFAULT 'VERIFIED',

    CONSTRAINT "SupplierInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLine" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "sourceRef" TEXT,
    "rawDescription" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "quantity" DECIMAL(14,4),
    "packCount" DECIMAL(14,4),
    "packSize" DECIMAL(14,4),
    "packUnit" TEXT,
    "baseUnit" "BaseUnit",
    "baseQuantity" DECIMAL(18,6),
    "unitPrice" DECIMAL(14,4),
    "lineNet" DECIMAL(14,4),
    "vatRate" DECIMAL(7,4),
    "costPerBaseUnit" DECIMAL(18,8),
    "ingredientId" UUID,
    "confidence" "Confidence" NOT NULL DEFAULT 'VERIFIED',
    "modelConfidence" TEXT,

    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ingredient" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "baseUnit" "BaseUnit" NOT NULL,
    "origin" "RowOrigin" NOT NULL DEFAULT 'EXTRACTED',

    CONSTRAINT "Ingredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngredientPrice" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "ingredientId" UUID NOT NULL,
    "source" "PriceSource" NOT NULL,
    "invoiceLineId" UUID,
    "pricePerBaseUnit" DECIMAL(18,8) NOT NULL,
    "effectiveDate" DATE,
    "revisionNumber" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IngredientPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeLine" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "menuItemId" UUID NOT NULL,
    "ingredientId" UUID NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL,
    "unit" TEXT NOT NULL,
    "baseQuantity" DECIMAL(18,6) NOT NULL,
    "source" "RecipeSource" NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecipeLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchSuggestion" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "posNormalizedName" TEXT NOT NULL,
    "posDisplayName" TEXT NOT NULL,
    "candidateId" UUID,
    "score" DECIMAL(5,4) NOT NULL,
    "method" "MatchMethod" NOT NULL,
    "status" "MatchStatus" NOT NULL,
    "decidedInRevision" INTEGER,

    CONSTRAINT "MatchSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assumption" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "source" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Assumption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Revision" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "number" INTEGER,
    "status" "RevisionStatus" NOT NULL,
    "source" "RevisionSource" NOT NULL,
    "baseRevision" INTEGER NOT NULL,
    "operations" JSONB NOT NULL,
    "appliedDiff" JSONB,
    "rationale" TEXT,
    "impactPreview" JSONB,
    "proposedByMessageId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMPTZ(6),

    CONSTRAINT "Revision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResultSnapshot" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "calcVersion" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "payloadHash" CHAR(64) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResultSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "role" "ChatRole" NOT NULL,
    "content" TEXT NOT NULL,
    "apiContent" JSONB NOT NULL,
    "revisionAtTime" INTEGER NOT NULL,
    "usage" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportExport" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "format" "ExportFormat" NOT NULL,
    "status" "ExportStatus" NOT NULL,
    "storageKey" TEXT,
    "sizeBytes" INTEGER,
    "sha256" CHAR(64),
    "snapshotHash" CHAR(64) NOT NULL,
    "downloadedTokens" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportExport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AnalysisJob_idempotencyKey_key" ON "AnalysisJob"("idempotencyKey");

-- CreateIndex
CREATE INDEX "AnalysisJob_status_expiresAt_idx" ON "AnalysisJob"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "AnalysisJob_expiresAt_idx" ON "AnalysisJob"("expiresAt");

-- CreateIndex
CREATE INDEX "JobEvent_jobId_createdAt_idx" ON "JobEvent"("jobId", "createdAt");

-- CreateIndex
CREATE INDEX "UploadedFile_jobId_category_idx" ON "UploadedFile"("jobId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "UploadedFile_jobId_sha256_key" ON "UploadedFile"("jobId", "sha256");

-- CreateIndex
CREATE INDEX "ProcessingTask_status_nextAttemptAt_idx" ON "ProcessingTask"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "ProcessingTask_jobId_type_idx" ON "ProcessingTask"("jobId", "type");

-- CreateIndex
CREATE INDEX "MenuItem_jobId_normalizedName_idx" ON "MenuItem"("jobId", "normalizedName");

-- CreateIndex
CREATE INDEX "PosSalesLine_jobId_menuItemId_idx" ON "PosSalesLine"("jobId", "menuItemId");

-- CreateIndex
CREATE INDEX "PosSalesLine_jobId_normalizedName_idx" ON "PosSalesLine"("jobId", "normalizedName");

-- CreateIndex
CREATE INDEX "SupplierInvoice_jobId_idx" ON "SupplierInvoice"("jobId");

-- CreateIndex
CREATE INDEX "InvoiceLine_jobId_ingredientId_idx" ON "InvoiceLine"("jobId", "ingredientId");

-- CreateIndex
CREATE UNIQUE INDEX "Ingredient_jobId_normalizedName_key" ON "Ingredient"("jobId", "normalizedName");

-- CreateIndex
CREATE INDEX "IngredientPrice_jobId_ingredientId_idx" ON "IngredientPrice"("jobId", "ingredientId");

-- CreateIndex
CREATE INDEX "RecipeLine_menuItemId_idx" ON "RecipeLine"("menuItemId");

-- CreateIndex
CREATE INDEX "MatchSuggestion_jobId_status_idx" ON "MatchSuggestion"("jobId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MatchSuggestion_jobId_posNormalizedName_key" ON "MatchSuggestion"("jobId", "posNormalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "Assumption_jobId_key_key" ON "Assumption"("jobId", "key");

-- CreateIndex
CREATE INDEX "Revision_jobId_status_idx" ON "Revision"("jobId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Revision_jobId_number_key" ON "Revision"("jobId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "ResultSnapshot_jobId_revisionNumber_key" ON "ResultSnapshot"("jobId", "revisionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ChatMessage_jobId_seq_key" ON "ChatMessage"("jobId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "ReportExport_jobId_revisionNumber_format_key" ON "ReportExport"("jobId", "revisionNumber", "format");

-- AddForeignKey
ALTER TABLE "JobEvent" ADD CONSTRAINT "JobEvent_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "AnalysisJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadedFile" ADD CONSTRAINT "UploadedFile_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "AnalysisJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessingTask" ADD CONSTRAINT "ProcessingTask_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "AnalysisJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessingTask" ADD CONSTRAINT "ProcessingTask_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "UploadedFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "AnalysisJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosSalesLine" ADD CONSTRAINT "PosSalesLine_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "AnalysisJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosSalesLine" ADD CONSTRAINT "PosSalesLine_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierInvoice" ADD CONSTRAINT "SupplierInvoice_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "AnalysisJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "AnalysisJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "SupplierInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ingredient" ADD CONSTRAINT "Ingredient_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "AnalysisJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngredientPrice" ADD CONSTRAINT "IngredientPrice_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "AnalysisJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngredientPrice" ADD CONSTRAINT "IngredientPrice_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngredientPrice" ADD CONSTRAINT "IngredientPrice_invoiceLineId_fkey" FOREIGN KEY ("invoiceLineId") REFERENCES "InvoiceLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeLine" ADD CONSTRAINT "RecipeLine_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "AnalysisJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeLine" ADD CONSTRAINT "RecipeLine_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeLine" ADD CONSTRAINT "RecipeLine_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchSuggestion" ADD CONSTRAINT "MatchSuggestion_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "AnalysisJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assumption" ADD CONSTRAINT "Assumption_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "AnalysisJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Revision" ADD CONSTRAINT "Revision_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "AnalysisJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultSnapshot" ADD CONSTRAINT "ResultSnapshot_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "AnalysisJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "AnalysisJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportExport" ADD CONSTRAINT "ReportExport_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "AnalysisJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
