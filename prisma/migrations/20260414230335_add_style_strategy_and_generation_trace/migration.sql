-- AlterTable
ALTER TABLE "generations" ADD COLUMN     "fal_request_id" TEXT,
ADD COLUMN     "final_prompt" TEXT,
ADD COLUMN     "vision_analysis" JSONB;

-- AlterTable
ALTER TABLE "styles" ADD COLUMN     "fal_model" TEXT,
ADD COLUMN     "prompt_template" TEXT,
ADD COLUMN     "strategy_key" TEXT NOT NULL DEFAULT 'default',
ADD COLUMN     "vision_enabled" BOOLEAN NOT NULL DEFAULT true;
