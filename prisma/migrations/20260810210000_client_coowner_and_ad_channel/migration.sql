-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "coOwnerId" TEXT;

-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "adChannel" TEXT;

-- CreateIndex
CREATE INDEX "Client_coOwnerId_idx" ON "Client"("coOwnerId");

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_coOwnerId_fkey" FOREIGN KEY ("coOwnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
