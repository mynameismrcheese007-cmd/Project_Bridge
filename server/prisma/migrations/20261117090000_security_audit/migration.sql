-- CreateTable
CREATE TABLE "SecurityAudit" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "revisionId" TEXT,
    "verdict" TEXT NOT NULL,
    "findings" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SecurityAudit_projectId_createdAt_idx" ON "SecurityAudit"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "SecurityAudit_verdict_createdAt_idx" ON "SecurityAudit"("verdict", "createdAt");

-- AddForeignKey
ALTER TABLE "SecurityAudit" ADD CONSTRAINT "SecurityAudit_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Only the server reaches this table; Supabase's public API must not.
ALTER TABLE "SecurityAudit" ENABLE ROW LEVEL SECURITY;
