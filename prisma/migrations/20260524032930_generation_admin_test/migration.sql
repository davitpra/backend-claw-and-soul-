-- DropForeignKey
ALTER TABLE "generations" DROP CONSTRAINT "generations_pet_id_fkey";

-- AlterTable
ALTER TABLE "generations" ADD COLUMN     "is_admin_test" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "pet_id" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "generations_style_id_is_admin_test_idx" ON "generations"("style_id", "is_admin_test");

-- AddForeignKey
ALTER TABLE "generations" ADD CONSTRAINT "generations_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "pets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
