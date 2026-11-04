-- Additive update 0.2. Back up database and data/ first. Run once.
BEGIN;
CREATE TABLE "Attachment" (
 "id" TEXT PRIMARY KEY, "schoolId" TEXT NOT NULL, "targetType" TEXT NOT NULL,
 "targetId" TEXT NOT NULL, "originalName" TEXT NOT NULL, "storageKey" TEXT NOT NULL,
 "mime" TEXT NOT NULL, "size" INTEGER NOT NULL, "createdBy" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "Attachment_storageKey_key" ON "Attachment"("storageKey");
CREATE INDEX "Attachment_schoolId_targetType_targetId_idx" ON "Attachment"("schoolId","targetType","targetId");
CREATE TABLE "Repair" (
 "id" TEXT PRIMARY KEY, "schoolId" TEXT NOT NULL, "assetId" TEXT NOT NULL,
 "problem" TEXT NOT NULL, "executor" TEXT NOT NULL DEFAULT '',
 "status" TEXT NOT NULL DEFAULT 'OPEN', "cost" DECIMAL(16,2) NOT NULL DEFAULT 0,
 "notes" TEXT NOT NULL DEFAULT '', "dueAt" TIMESTAMP(3), "completedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "Repair_schoolId_assetId_idx" ON "Repair"("schoolId","assetId");
CREATE TABLE "Loan" (
 "id" TEXT PRIMARY KEY, "schoolId" TEXT NOT NULL, "assetId" TEXT, "lotId" TEXT,
 "recipient" TEXT NOT NULL, "quantity" DECIMAL(16,3) NOT NULL,
 "returned" DECIMAL(16,3) NOT NULL DEFAULT 0, "dueAt" TIMESTAMP(3),
 "notes" TEXT NOT NULL DEFAULT '', "createdBy" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "closedAt" TIMESTAMP(3)
);
CREATE INDEX "Loan_schoolId_assetId_idx" ON "Loan"("schoolId","assetId");
CREATE INDEX "Loan_schoolId_lotId_idx" ON "Loan"("schoolId","lotId");
CREATE TABLE "AssetSet" (
 "id" TEXT PRIMARY KEY, "schoolId" TEXT NOT NULL, "name" TEXT NOT NULL,
 "assetIds" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AssetSet_schoolId_idx" ON "AssetSet"("schoolId");
COMMIT;
