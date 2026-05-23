-- ============================================
-- Step 1: Create new config tables
-- ============================================

CREATE TABLE "vision_configs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "vision_model" TEXT,
    "vision_temperature" DOUBLE PRECISION,
    "prompt_template" TEXT,
    "description_example" TEXT,
    "template_vars" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "vision_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vision_configs_name_key" ON "vision_configs"("name");
CREATE INDEX "vision_configs_is_active_idx" ON "vision_configs"("is_active");

CREATE TABLE "image_gen_configs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'fal',
    "model" TEXT,
    "parameters" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "image_gen_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "image_gen_configs_name_key" ON "image_gen_configs"("name");
CREATE INDEX "image_gen_configs_is_active_idx" ON "image_gen_configs"("is_active");

-- ============================================
-- Step 2: Add FK columns to styles (additive)
-- ============================================

ALTER TABLE "styles" ADD COLUMN "vision_config_id" TEXT;
ALTER TABLE "styles" ADD COLUMN "image_gen_config_id" TEXT;

CREATE INDEX "styles_vision_config_id_idx" ON "styles"("vision_config_id");
CREATE INDEX "styles_image_gen_config_id_idx" ON "styles"("image_gen_config_id");

ALTER TABLE "styles" ADD CONSTRAINT "styles_vision_config_id_fkey"
  FOREIGN KEY ("vision_config_id") REFERENCES "vision_configs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "styles" ADD CONSTRAINT "styles_image_gen_config_id_fkey"
  FOREIGN KEY ("image_gen_config_id") REFERENCES "image_gen_configs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================
-- Step 3: Missing schema changes from old migrations
-- (tables/columns that existed in prod but weren't tracked)
-- ============================================

-- product_references: add fulfillment_method and style_id if not present
ALTER TABLE "product_references"
  ADD COLUMN IF NOT EXISTS "fulfillment_method" TEXT NOT NULL DEFAULT 'in_house',
  ADD COLUMN IF NOT EXISTS "style_id" TEXT;

CREATE INDEX IF NOT EXISTS "product_references_style_id_idx" ON "product_references"("style_id");

ALTER TABLE "product_references" DROP CONSTRAINT IF EXISTS "product_references_style_id_fkey";
ALTER TABLE "product_references"
  ADD CONSTRAINT "product_references_style_id_fkey"
  FOREIGN KEY ("style_id") REFERENCES "styles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- product_format_variants: add constraints column, fix unique index
ALTER TABLE "product_format_variants"
  ADD COLUMN IF NOT EXISTS "constraints" JSONB;

DROP INDEX IF EXISTS "product_format_variants_product_ref_id_format_id_key";
CREATE UNIQUE INDEX IF NOT EXISTS "product_format_variants_product_ref_id_shopify_variant_id_key"
  ON "product_format_variants"("product_ref_id", "shopify_variant_id");

-- Drop legacy compat table if it still exists
DROP TABLE IF EXISTS "style_format_product_compat";

-- orders tables (may already exist if DB was migrated outside prisma migrate)
CREATE TABLE IF NOT EXISTS "orders" (
    "id" TEXT NOT NULL,
    "shopify_order_id" TEXT NOT NULL,
    "shopify_order_gid" TEXT,
    "order_number" TEXT NOT NULL,
    "user_id" TEXT,
    "customer_email" TEXT,
    "customer_name" TEXT,
    "customer_phone" TEXT,
    "financial_status" TEXT,
    "fulfillment_status" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "subtotal_amount" DECIMAL(10,2) NOT NULL,
    "shipping_amount" DECIMAL(10,2),
    "tax_amount" DECIMAL(10,2),
    "total_amount" DECIMAL(10,2) NOT NULL,
    "shipping_address" JSONB,
    "billing_address" JSONB,
    "customer_note" TEXT,
    "shopify_created_at" TIMESTAMP(3) NOT NULL,
    "shopify_updated_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "raw_payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "orders_shopify_order_id_key" ON "orders"("shopify_order_id");
CREATE INDEX IF NOT EXISTS "orders_user_id_idx" ON "orders"("user_id");
CREATE INDEX IF NOT EXISTS "orders_customer_email_idx" ON "orders"("customer_email");
CREATE INDEX IF NOT EXISTS "orders_shopify_created_at_idx" ON "orders"("shopify_created_at" DESC);
CREATE INDEX IF NOT EXISTS "orders_financial_status_idx" ON "orders"("financial_status");

ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_user_id_fkey";
ALTER TABLE "orders"
  ADD CONSTRAINT "orders_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "order_items" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "shopify_line_item_id" TEXT NOT NULL,
    "shopify_variant_id" TEXT,
    "shopify_product_id" TEXT,
    "product_ref_id" TEXT,
    "product_format_variant_id" TEXT,
    "generation_id" TEXT,
    "title" TEXT NOT NULL,
    "variant_title" TEXT,
    "sku" TEXT,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(10,2) NOT NULL,
    "total_price" DECIMAL(10,2) NOT NULL,
    "image_url" TEXT,
    "style" TEXT,
    "size" TEXT,
    "fulfillment_method" TEXT NOT NULL DEFAULT 'in_house',
    "production_status" TEXT NOT NULL DEFAULT 'paid',
    "tracking_number" TEXT,
    "tracking_url" TEXT,
    "tracking_carrier" TEXT,
    "pod_provider" TEXT,
    "pod_order_id" TEXT,
    "pod_raw_response" JSONB,
    "notes" TEXT,
    "shipped_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "order_items_order_id_shopify_line_item_id_key"
  ON "order_items"("order_id", "shopify_line_item_id");
CREATE INDEX IF NOT EXISTS "order_items_generation_id_idx" ON "order_items"("generation_id");
CREATE INDEX IF NOT EXISTS "order_items_production_status_idx" ON "order_items"("production_status");
CREATE INDEX IF NOT EXISTS "order_items_fulfillment_method_idx" ON "order_items"("fulfillment_method");
CREATE INDEX IF NOT EXISTS "order_items_product_ref_id_idx" ON "order_items"("product_ref_id");

ALTER TABLE "order_items" DROP CONSTRAINT IF EXISTS "order_items_order_id_fkey";
ALTER TABLE "order_items"
  ADD CONSTRAINT "order_items_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_items" DROP CONSTRAINT IF EXISTS "order_items_product_ref_id_fkey";
ALTER TABLE "order_items"
  ADD CONSTRAINT "order_items_product_ref_id_fkey"
  FOREIGN KEY ("product_ref_id") REFERENCES "product_references"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "order_items" DROP CONSTRAINT IF EXISTS "order_items_product_format_variant_id_fkey";
ALTER TABLE "order_items"
  ADD CONSTRAINT "order_items_product_format_variant_id_fkey"
  FOREIGN KEY ("product_format_variant_id") REFERENCES "product_format_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "order_items" DROP CONSTRAINT IF EXISTS "order_items_generation_id_fkey";
ALTER TABLE "order_items"
  ADD CONSTRAINT "order_items_generation_id_fkey"
  FOREIGN KEY ("generation_id") REFERENCES "generations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "order_events" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "order_item_id" TEXT,
    "event_type" TEXT NOT NULL,
    "from_status" TEXT,
    "to_status" TEXT,
    "payload" JSONB,
    "user_id" TEXT,
    "source" TEXT NOT NULL DEFAULT 'system',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "order_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "order_events_order_id_created_at_idx" ON "order_events"("order_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "order_events_order_item_id_idx" ON "order_events"("order_item_id");

ALTER TABLE "order_events" DROP CONSTRAINT IF EXISTS "order_events_order_id_fkey";
ALTER TABLE "order_events"
  ADD CONSTRAINT "order_events_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_events" DROP CONSTRAINT IF EXISTS "order_events_order_item_id_fkey";
ALTER TABLE "order_events"
  ADD CONSTRAINT "order_events_order_item_id_fkey"
  FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================
-- Step 4: Backfill (no-op if styles table is empty;
-- on existing prod DBs this deduplicates legacy columns
-- into config rows and links them back via FK)
-- ============================================

DO $$
BEGIN
  -- VisionConfig backfill
  WITH distinct_vision AS (
    INSERT INTO vision_configs (id, name, vision_model, vision_temperature,
        prompt_template, description_example, template_vars,
        is_active, created_at, updated_at)
    SELECT
      gen_random_uuid()::text,
      'migrated_v_' || substr(md5(
        COALESCE(vision_model, '') || '|' ||
        COALESCE(vision_temperature::text, '') || '|' ||
        COALESCE(prompt_template, '') || '|' ||
        COALESCE(description_example, '') || '|' ||
        COALESCE(template_vars::text, '')
      ), 1, 12),
      vision_model, vision_temperature, prompt_template,
      description_example, template_vars,
      true, NOW(), NOW()
    FROM (
      SELECT DISTINCT vision_model, vision_temperature,
        prompt_template, description_example, template_vars
      FROM styles
      WHERE vision_config_id IS NULL
        AND (vision_model IS NOT NULL OR prompt_template IS NOT NULL
             OR description_example IS NOT NULL OR template_vars IS NOT NULL
             OR vision_temperature IS NOT NULL)
    ) t
    RETURNING id, vision_model, vision_temperature,
              prompt_template, description_example, template_vars
  )
  UPDATE styles s
  SET vision_config_id = vc.id
  FROM distinct_vision vc
  WHERE s.vision_config_id IS NULL
    AND s.vision_model            IS NOT DISTINCT FROM vc.vision_model
    AND s.vision_temperature      IS NOT DISTINCT FROM vc.vision_temperature
    AND s.prompt_template         IS NOT DISTINCT FROM vc.prompt_template
    AND s.description_example     IS NOT DISTINCT FROM vc.description_example
    AND s.template_vars           IS NOT DISTINCT FROM vc.template_vars;

  -- ImageGenConfig backfill
  WITH distinct_image_gen AS (
    INSERT INTO image_gen_configs (id, name, provider, model, parameters,
        is_active, created_at, updated_at)
    SELECT
      gen_random_uuid()::text,
      'migrated_g_' || substr(md5(
        COALESCE(fal_model, '') || '|' ||
        COALESCE(parameters::text, '')
      ), 1, 12),
      'fal',
      fal_model,
      parameters,
      true, NOW(), NOW()
    FROM (
      SELECT DISTINCT fal_model, parameters
      FROM styles
      WHERE image_gen_config_id IS NULL
        AND (fal_model IS NOT NULL OR parameters IS NOT NULL)
    ) t
    RETURNING id, model, parameters
  )
  UPDATE styles s
  SET image_gen_config_id = igc.id
  FROM distinct_image_gen igc
  WHERE s.image_gen_config_id IS NULL
    AND s.fal_model    IS NOT DISTINCT FROM igc.model
    AND s.parameters   IS NOT DISTINCT FROM igc.parameters;
END $$;

-- ============================================
-- Step 5: Drop legacy columns from styles
-- ============================================

ALTER TABLE "styles"
  DROP COLUMN IF EXISTS "fal_model",
  DROP COLUMN IF EXISTS "parameters",
  DROP COLUMN IF EXISTS "prompt_template",
  DROP COLUMN IF EXISTS "vision_model",
  DROP COLUMN IF EXISTS "vision_temperature",
  DROP COLUMN IF EXISTS "description_example",
  DROP COLUMN IF EXISTS "template_vars";
