-- Add the new product_type string column (synced from Shopify going forward)
ALTER TABLE "product_references" ADD COLUMN "product_type" TEXT;

-- Backfill from the existing product_types catalog so current rows keep a value
-- until the next Shopify sync overwrites it from shopify_product.product_type.
UPDATE "product_references" pr
SET "product_type" = pt."name"
FROM "product_types" pt
WHERE pr."product_type_id" = pt."id";

CREATE INDEX "product_references_product_type_idx" ON "product_references" ("product_type");

-- Drop FK and column, then drop the now-unused catalog table
ALTER TABLE "product_references" DROP CONSTRAINT IF EXISTS "product_references_product_type_id_fkey";
ALTER TABLE "product_references" DROP COLUMN IF EXISTS "product_type_id";

DROP TABLE IF EXISTS "product_types";
