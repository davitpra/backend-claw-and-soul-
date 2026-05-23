-- Add per-VLM system prompt and max_tokens to VisionConfig.
-- Both nullable; the service falls back to hardcoded defaults when null.

ALTER TABLE "vision_configs"
  ADD COLUMN "system_prompt" TEXT,
  ADD COLUMN "max_tokens" INTEGER;
