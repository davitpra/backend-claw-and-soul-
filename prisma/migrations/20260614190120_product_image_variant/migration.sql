/*
  Warnings:

  - You are about to drop the column `format_id` on the `product_images` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "product_images" DROP CONSTRAINT "product_images_format_id_fkey";

-- DropIndex
DROP INDEX "product_images_product_ref_id_format_id_idx";

-- AlterTable
ALTER TABLE "product_images" DROP COLUMN "format_id",
ADD COLUMN     "product_format_variant_id" TEXT;

-- CreateIndex
CREATE INDEX "product_images_product_ref_id_product_format_variant_id_idx" ON "product_images"("product_ref_id", "product_format_variant_id");

-- AddForeignKey
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_format_variant_id_fkey" FOREIGN KEY ("product_format_variant_id") REFERENCES "product_format_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
