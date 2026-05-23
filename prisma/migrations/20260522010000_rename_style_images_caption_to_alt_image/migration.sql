-- AlterTable: rename caption → alt_image in style_images
ALTER TABLE "style_images" RENAME COLUMN "caption" TO "alt_image";
