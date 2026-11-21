-- AlterTable
ALTER TABLE "PendingRegistration" ADD COLUMN     "policyAcceptedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'OTHER',
ADD COLUMN     "copyrightDeclaredAt" TIMESTAMP(3),
ADD COLUMN     "originalWorkUrl" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "policyAcceptedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Report_status_category_createdAt_idx" ON "Report"("status", "category", "createdAt");

