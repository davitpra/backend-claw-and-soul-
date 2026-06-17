-- Drop legacy productType column (replaced by template field)
ALTER TABLE "product_references" DROP COLUMN "product_type";
