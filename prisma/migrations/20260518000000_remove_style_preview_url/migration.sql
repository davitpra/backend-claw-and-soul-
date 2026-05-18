-- Remove preview_url column from styles (preview derived from StyleImage.is_primary)
ALTER TABLE "styles" DROP COLUMN IF EXISTS "preview_url";

-- Add index for faster primary image lookups per style
CREATE INDEX IF NOT EXISTS "style_images_style_id_is_primary_idx" ON "style_images"("style_id", "is_primary");
