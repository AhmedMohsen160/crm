-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "commercialRegFileId" TEXT,
ADD COLUMN     "commercialRegNo" TEXT,
ADD COLUMN     "repName" TEXT,
ADD COLUMN     "repPhone" TEXT,
ADD COLUMN     "taxCardFileId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Company_commercialRegFileId_key" ON "Company"("commercialRegFileId");

-- CreateIndex
CREATE UNIQUE INDEX "Company_taxCardFileId_key" ON "Company"("taxCardFileId");

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_commercialRegFileId_fkey" FOREIGN KEY ("commercialRegFileId") REFERENCES "StoredFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_taxCardFileId_fkey" FOREIGN KEY ("taxCardFileId") REFERENCES "StoredFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

