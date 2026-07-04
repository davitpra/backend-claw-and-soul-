-- AlterTable
ALTER TABLE "cart_items" ADD COLUMN     "paint_by_numbers_id" TEXT;

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "paint_by_numbers_id" TEXT;

-- CreateTable
CREATE TABLE "paint_by_numbers" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "generation_id" TEXT,
    "pet_id" TEXT,
    "source_image_url" TEXT,
    "source_image_storage_key" TEXT,
    "config" JSONB NOT NULL,
    "outline_svg_url" TEXT,
    "outline_svg_storage_key" TEXT,
    "preview_url" TEXT,
    "preview_storage_key" TEXT,
    "palette_url" TEXT,
    "palette_storage_key" TEXT,
    "color_count" INTEGER,
    "origin" TEXT NOT NULL DEFAULT 'customer',
    "status" TEXT NOT NULL DEFAULT 'saved',
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "paint_by_numbers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "paint_by_numbers_user_id_idx" ON "paint_by_numbers"("user_id");

-- CreateIndex
CREATE INDEX "paint_by_numbers_generation_id_idx" ON "paint_by_numbers"("generation_id");

-- CreateIndex
CREATE INDEX "paint_by_numbers_status_idx" ON "paint_by_numbers"("status");

-- CreateIndex
CREATE INDEX "cart_items_paint_by_numbers_id_idx" ON "cart_items"("paint_by_numbers_id");

-- CreateIndex
CREATE INDEX "order_items_paint_by_numbers_id_idx" ON "order_items"("paint_by_numbers_id");

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_paint_by_numbers_id_fkey" FOREIGN KEY ("paint_by_numbers_id") REFERENCES "paint_by_numbers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paint_by_numbers" ADD CONSTRAINT "paint_by_numbers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paint_by_numbers" ADD CONSTRAINT "paint_by_numbers_generation_id_fkey" FOREIGN KEY ("generation_id") REFERENCES "generations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paint_by_numbers" ADD CONSTRAINT "paint_by_numbers_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "pets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_paint_by_numbers_id_fkey" FOREIGN KEY ("paint_by_numbers_id") REFERENCES "paint_by_numbers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
