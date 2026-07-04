-- AlterTable
ALTER TABLE "product_references" ADD COLUMN     "is_paint_by_numbers" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "product_references_is_paint_by_numbers_idx" ON "product_references"("is_paint_by_numbers");
