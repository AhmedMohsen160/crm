-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "spendKind" TEXT;

-- AlterTable
ALTER TABLE "CostCenter" ADD COLUMN     "branch" TEXT,
ADD COLUMN     "clientId" TEXT,
ADD COLUMN     "notes" TEXT;

-- AlterTable
ALTER TABLE "JournalLine" ADD COLUMN     "spendKind" TEXT;

-- CreateIndex
CREATE INDEX "CostCenter_active_idx" ON "CostCenter"("active");

