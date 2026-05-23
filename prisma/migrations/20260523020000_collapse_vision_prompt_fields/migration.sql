-- Collapse instructionTemplate + promptTemplate + descriptionExample into a single prompt_template.
-- The instructionTemplate already holds the full structure with placeholders;
-- we substitute {{resolvedTemplate}}, {{descriptionExample}}, and {{exampleLine}} with their
-- actual stored values, then rename instruction_template → prompt_template and drop the others.

-- Step 1: Substitute the three composite placeholders
UPDATE "vision_configs"
SET "instruction_template" =
  REPLACE(
    REPLACE(
      REPLACE(
        "instruction_template",
        '{{resolvedTemplate}}', COALESCE("prompt_template", '')
      ),
      '{{descriptionExample}}', COALESCE("description_example", '')
    ),
    '{{exampleLine}}',
    CASE
      WHEN "description_example" IS NOT NULL AND "description_example" <> ''
        THEN E'La descripción debe seguir este estilo: "' || "description_example" || E'".'
      ELSE 'Describe el rostro del animal con detalle visual (color de pelo, ojos, rasgos distintivos).'
    END
  );

-- Step 2: Drop old prompt_template, rename instruction_template to prompt_template
ALTER TABLE "vision_configs" DROP COLUMN "prompt_template";
ALTER TABLE "vision_configs" RENAME COLUMN "instruction_template" TO "prompt_template";
ALTER TABLE "vision_configs" DROP COLUMN "description_example";
