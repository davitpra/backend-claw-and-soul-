-- Refactor pipeline: drop visionEnabled, add routerModel
ALTER TABLE "styles" DROP COLUMN "vision_enabled";
ALTER TABLE "styles" ADD COLUMN "router_model" TEXT;
