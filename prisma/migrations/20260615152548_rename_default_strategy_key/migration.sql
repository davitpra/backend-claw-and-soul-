-- Rename the "default" pipeline strategy to "style-driven-prompt"

-- Migrate existing rows
UPDATE "styles" SET "strategy_key" = 'style-driven-prompt' WHERE "strategy_key" = 'default';

-- Change column default
ALTER TABLE "styles" ALTER COLUMN "strategy_key" SET DEFAULT 'style-driven-prompt';
