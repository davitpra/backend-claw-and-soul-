-- Drop the unused `provider` column from image_gen_configs.
-- The pipeline only consumes `model` and `parameters`; provider was never read.

ALTER TABLE "image_gen_configs" DROP COLUMN "provider";
