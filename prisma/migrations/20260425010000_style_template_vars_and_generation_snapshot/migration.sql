-- Style: art direction description example + parametrizable template vars
ALTER TABLE "styles" ADD COLUMN "description_example" TEXT;
ALTER TABLE "styles" ADD COLUMN "template_vars" JSONB;

-- Generation: snapshot of template config used at generation time
ALTER TABLE "generations" ADD COLUMN "prompt_snapshot" JSONB;
