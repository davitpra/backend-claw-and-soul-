-- AlterTable
ALTER TABLE "product_references" ADD COLUMN     "art_kind" TEXT;

-- Los productos con template "PBN" eran en realidad la descarga digital del
-- coloreable: pasan al formato "Digital" con contenido "pbn". Los Canvas/Poster
-- existentes son una mezcla de coloreables y arte terminado, así que su
-- art_kind queda NULL y se asigna producto a producto desde el admin.
UPDATE "product_references" SET "template" = 'Digital', "art_kind" = 'pbn' WHERE "template" = 'PBN';
