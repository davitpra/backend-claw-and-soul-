-- AlterTable
ALTER TABLE "generations" ADD COLUMN     "format_id" TEXT,
ADD COLUMN     "product_ref_id" TEXT;

-- CreateTable
CREATE TABLE "style_images" (
    "id" TEXT NOT NULL,
    "style_id" TEXT NOT NULL,
    "image_url" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "caption" TEXT,
    "order_index" INTEGER NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "style_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "formats" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "aspect_ratio" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "formats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_references" (
    "id" TEXT NOT NULL,
    "shopify_product_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_references_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "style_format_product_compat" (
    "id" TEXT NOT NULL,
    "style_id" TEXT NOT NULL,
    "format_id" TEXT NOT NULL,
    "product_ref_id" TEXT NOT NULL,
    "constraints" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "style_format_product_compat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "style_images_style_id_idx" ON "style_images"("style_id");

-- CreateIndex
CREATE INDEX "style_images_style_id_order_index_idx" ON "style_images"("style_id", "order_index");

-- CreateIndex
CREATE UNIQUE INDEX "formats_name_key" ON "formats"("name");

-- CreateIndex
CREATE INDEX "formats_is_active_idx" ON "formats"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "product_references_shopify_product_id_key" ON "product_references"("shopify_product_id");

-- CreateIndex
CREATE INDEX "product_references_is_active_idx" ON "product_references"("is_active");

-- CreateIndex
CREATE INDEX "style_format_product_compat_style_id_idx" ON "style_format_product_compat"("style_id");

-- CreateIndex
CREATE INDEX "style_format_product_compat_format_id_idx" ON "style_format_product_compat"("format_id");

-- CreateIndex
CREATE UNIQUE INDEX "style_format_product_compat_style_id_format_id_product_ref__key" ON "style_format_product_compat"("style_id", "format_id", "product_ref_id");

-- AddForeignKey
ALTER TABLE "style_images" ADD CONSTRAINT "style_images_style_id_fkey" FOREIGN KEY ("style_id") REFERENCES "styles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "style_format_product_compat" ADD CONSTRAINT "style_format_product_compat_style_id_fkey" FOREIGN KEY ("style_id") REFERENCES "styles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "style_format_product_compat" ADD CONSTRAINT "style_format_product_compat_format_id_fkey" FOREIGN KEY ("format_id") REFERENCES "formats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "style_format_product_compat" ADD CONSTRAINT "style_format_product_compat_product_ref_id_fkey" FOREIGN KEY ("product_ref_id") REFERENCES "product_references"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generations" ADD CONSTRAINT "generations_format_id_fkey" FOREIGN KEY ("format_id") REFERENCES "formats"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generations" ADD CONSTRAINT "generations_product_ref_id_fkey" FOREIGN KEY ("product_ref_id") REFERENCES "product_references"("id") ON DELETE SET NULL ON UPDATE CASCADE;
