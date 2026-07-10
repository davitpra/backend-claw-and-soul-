-- AlterTable
ALTER TABLE "product_references" ADD COLUMN     "is_credit_pack" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "credit_pack_variants" (
    "id" TEXT NOT NULL,
    "product_ref_id" TEXT NOT NULL,
    "shopify_variant_id" TEXT NOT NULL,
    "credit_amount" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_pack_variants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "credit_pack_variants_shopify_variant_id_key" ON "credit_pack_variants"("shopify_variant_id");

-- CreateIndex
CREATE INDEX "credit_pack_variants_product_ref_id_idx" ON "credit_pack_variants"("product_ref_id");

-- CreateIndex
CREATE INDEX "product_references_is_credit_pack_idx" ON "product_references"("is_credit_pack");

-- AddForeignKey
ALTER TABLE "credit_pack_variants" ADD CONSTRAINT "credit_pack_variants_product_ref_id_fkey" FOREIGN KEY ("product_ref_id") REFERENCES "product_references"("id") ON DELETE CASCADE ON UPDATE CASCADE;
