-- Add instruction_template column to vision_configs
-- Allows each VisionConfig to define its own VLM instruction wrapper using
-- {{petName}}, {{petSpecies}}, {{petBreed}}, {{resolvedTemplate}},
-- {{descriptionExample}}, and {{exampleLine}} placeholders.

-- 1. Add nullable column
ALTER TABLE "vision_configs" ADD COLUMN "instruction_template" TEXT;

-- 2. Backfill existing rows with the current hardcoded instruction text
UPDATE "vision_configs"
SET "instruction_template" = E'Escribe únicamente el prompt final en inglés. Sustituye [description] con una descripción detallada solo del rostro del animal en la imagen (ignora completamente la pose o el cuerpo). Usa el nombre "{{petName}}" donde dice [Name].\n\n{{exampleLine}}\n\nPrompt base:\n{{resolvedTemplate}}'
WHERE "instruction_template" IS NULL;

-- 3. Make column NOT NULL
ALTER TABLE "vision_configs" ALTER COLUMN "instruction_template" SET NOT NULL;
