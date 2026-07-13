-- AlterTable
ALTER TABLE "product_references" ADD COLUMN     "is_accessory" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "product_references_is_accessory_idx" ON "product_references"("is_accessory");
