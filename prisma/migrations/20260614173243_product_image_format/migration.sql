-- AlterTable
ALTER TABLE "product_images" ADD COLUMN     "format_id" TEXT;

-- CreateIndex
CREATE INDEX "product_images_product_ref_id_format_id_idx" ON "product_images"("product_ref_id", "format_id");

-- AddForeignKey
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_format_id_fkey" FOREIGN KEY ("format_id") REFERENCES "formats"("id") ON DELETE SET NULL ON UPDATE CASCADE;
