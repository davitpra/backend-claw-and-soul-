-- Add the new product_type string column (synced from Shopify going forward)
ALTER TABLE "product_references" ADD COLUMN IF NOT EXISTS "product_type" TEXT;

-- Backfill from the existing product_types catalog (only if the table exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'product_types'
  ) THEN
    UPDATE "product_references" pr
    SET "product_type" = pt."name"
    FROM "product_types" pt
    WHERE pr."product_type_id" = pt."id";
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "product_references_product_type_idx" ON "product_references" ("product_type");

-- Drop FK and column, then drop the now-unused catalog table
ALTER TABLE "product_references" DROP CONSTRAINT IF EXISTS "product_references_product_type_id_fkey";
ALTER TABLE "product_references" DROP COLUMN IF EXISTS "product_type_id";

DROP TABLE IF EXISTS "product_types";
