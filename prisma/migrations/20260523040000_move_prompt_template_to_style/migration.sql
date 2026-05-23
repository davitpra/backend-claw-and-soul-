-- Move prompt_template and template_vars from vision_configs to styles.
-- VisionConfig now describes only "how to call the VLM" (model, temperature, system prompt, max tokens).
-- Style now owns "what to ask the VLM" (prompt template with placeholders, extra vars).

-- Step 1: Add columns to styles (nullable first to allow backfill before NOT NULL constraint).
ALTER TABLE "styles" ADD COLUMN "prompt_template" TEXT;
ALTER TABLE "styles" ADD COLUMN "template_vars"   JSONB;

-- Step 2: Backfill from the linked vision_config.
UPDATE "styles" s
SET "prompt_template" = vc."prompt_template",
    "template_vars"   = vc."template_vars"
FROM "vision_configs" vc
WHERE s."vision_config_id" = vc."id";

-- Step 3: Default for styles without a vision_config_id (empty string; app enforces template at create time).
UPDATE "styles" SET "prompt_template" = '' WHERE "prompt_template" IS NULL;

-- Step 4: Enforce NOT NULL on prompt_template.
ALTER TABLE "styles" ALTER COLUMN "prompt_template" SET NOT NULL;

-- Step 5: Drop old columns from vision_configs.
ALTER TABLE "vision_configs" DROP COLUMN "prompt_template";
ALTER TABLE "vision_configs" DROP COLUMN "template_vars";
