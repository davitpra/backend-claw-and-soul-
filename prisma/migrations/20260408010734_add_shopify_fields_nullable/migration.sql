-- AlterTable
ALTER TABLE "formats" ADD COLUMN     "shopify_variant_option" TEXT;

-- AlterTable
ALTER TABLE "product_references" ADD COLUMN     "shopify_handle" TEXT;

-- CreateTable
CREATE TABLE "product_format_variants" (
    "id" TEXT NOT NULL,
    "product_ref_id" TEXT NOT NULL,
    "format_id" TEXT NOT NULL,
    "shopify_variant_id" TEXT NOT NULL,
    "shopify_variant_title" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_format_variants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_format_variants_shopify_variant_id_idx" ON "product_format_variants"("shopify_variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_format_variants_product_ref_id_format_id_key" ON "product_format_variants"("product_ref_id", "format_id");

-- AddForeignKey
ALTER TABLE "product_format_variants" ADD CONSTRAINT "product_format_variants_product_ref_id_fkey" FOREIGN KEY ("product_ref_id") REFERENCES "product_references"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_format_variants" ADD CONSTRAINT "product_format_variants_format_id_fkey" FOREIGN KEY ("format_id") REFERENCES "formats"("id") ON DELETE CASCADE ON UPDATE CASCADE;
