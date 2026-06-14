-- CreateTable
CREATE TABLE "product_images" (
    "id" TEXT NOT NULL,
    "product_ref_id" TEXT NOT NULL,
    "image_url" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'scene',
    "alt_image" TEXT,
    "order_index" INTEGER NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_images_product_ref_id_idx" ON "product_images"("product_ref_id");

-- CreateIndex
CREATE INDEX "product_images_product_ref_id_order_index_idx" ON "product_images"("product_ref_id", "order_index");

-- AddForeignKey
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_ref_id_fkey" FOREIGN KEY ("product_ref_id") REFERENCES "product_references"("id") ON DELETE CASCADE ON UPDATE CASCADE;
