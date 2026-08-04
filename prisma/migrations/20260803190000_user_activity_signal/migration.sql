-- AlterTable
ALTER TABLE "users" ADD COLUMN "last_seen_at" TIMESTAMP(3);

-- Siembra inicial: la mejor señal de vida que se puede reconstruir hoy es el
-- máximo entre el último login y la sesión más reciente que siga viva. No es
-- historia completa —`refresh_tokens` solo retiene ~7 días— pero evita que la
-- columna arranque entera a NULL y hunda los buckets de recencia el primer día.
UPDATE "users" u
SET "last_seen_at" = GREATEST(
  COALESCE(u."last_login_at", TIMESTAMP 'epoch'),
  COALESCE(
    (SELECT MAX(rt."last_used_at") FROM "refresh_tokens" rt WHERE rt."user_id" = u."id"),
    TIMESTAMP 'epoch'
  )
)
WHERE u."last_login_at" IS NOT NULL
   OR EXISTS (SELECT 1 FROM "refresh_tokens" rt WHERE rt."user_id" = u."id");

-- CreateIndex
CREATE INDEX "users_last_seen_at_idx" ON "users"("last_seen_at" DESC);

-- CreateIndex
CREATE INDEX "users_last_login_at_idx" ON "users"("last_login_at" DESC);

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_last_used_at_idx" ON "refresh_tokens"("user_id", "last_used_at" DESC);

-- CreateIndex
CREATE INDEX "orders_user_id_shopify_created_at_idx" ON "orders"("user_id", "shopify_created_at" DESC);
