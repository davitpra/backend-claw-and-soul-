-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "order_status_url" TEXT;

-- Backfill desde el payload de Shopify ya persistido (la URL de estado del pedido
-- siempre estuvo dentro de raw_payload, solo que no se modelaba como columna).
UPDATE "orders"
SET "order_status_url" = "raw_payload"->>'order_status_url'
WHERE "order_status_url" IS NULL
  AND "raw_payload"->>'order_status_url' IS NOT NULL;
