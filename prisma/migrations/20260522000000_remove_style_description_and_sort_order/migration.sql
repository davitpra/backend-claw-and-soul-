-- DropIndex
DROP INDEX IF EXISTS "styles_sort_order_idx";

-- AlterTable
ALTER TABLE "styles" DROP COLUMN IF EXISTS "description";
ALTER TABLE "styles" DROP COLUMN IF EXISTS "sort_order";
