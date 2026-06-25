-- Tracking now lives exclusively in Shopify (native fulfillment).
-- Remove the app-side tracking columns from order_items.
ALTER TABLE "order_items" DROP COLUMN "tracking_number";
ALTER TABLE "order_items" DROP COLUMN "tracking_url";
ALTER TABLE "order_items" DROP COLUMN "tracking_carrier";
