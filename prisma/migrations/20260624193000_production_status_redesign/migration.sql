-- Rediseño de `production_status` (columna "Producción").
-- 1) Nuevo default coherente con el vocabulario ampliado.
-- 2) Backfill de los items existentes en 'paid' al nuevo vocabulario, replicando
--    `computeAutoEarlyStatus(financial_status, generation.status)`.

-- Default: 'paid' deja de existir como valor; el baseline pagado-con-arte es 'draft'.
ALTER TABLE "order_items" ALTER COLUMN "production_status" SET DEFAULT 'draft';

-- (a) Pago no completado -> 'pending' (gana sobre el estado de la generación).
UPDATE "order_items" AS oi
SET "production_status" = 'pending'
FROM "orders" AS o
WHERE oi."order_id" = o."id"
  AND oi."production_status" = 'paid'
  AND o."financial_status" IN ('pending', 'authorized', 'partially_paid');

-- (b) Pagado + generación fallida -> 'art_failed'.
UPDATE "order_items" AS oi
SET "production_status" = 'art_failed'
FROM "generations" AS g
WHERE oi."generation_id" = g."id"
  AND oi."production_status" = 'paid'
  AND g."status" = 'failed';

-- (c) Pagado + generación en curso -> 'generating'.
UPDATE "order_items" AS oi
SET "production_status" = 'generating'
FROM "generations" AS g
WHERE oi."generation_id" = g."id"
  AND oi."production_status" = 'paid'
  AND g."status" IN ('pending', 'processing');

-- (d) Resto de los 'paid' (generación completada o sin generación) -> 'draft'.
UPDATE "order_items"
SET "production_status" = 'draft'
WHERE "production_status" = 'paid';
