-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "full_name" TEXT,
    "role" TEXT NOT NULL DEFAULT 'user',
    "shopify_customer_id" TEXT,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "user_credits" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "total_earned" INTEGER NOT NULL DEFAULT 0,
    "total_spent" INTEGER NOT NULL DEFAULT 0,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_credits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "credit_transactions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "balance_after" INTEGER NOT NULL,
    "description" TEXT,
    "reference_type" TEXT,
    "reference_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "credit_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "pets" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "species" TEXT NOT NULL,
    "breed" TEXT,
    "age" INTEGER,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "pet_photos" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pet_id" TEXT NOT NULL,
    "photo_url" TEXT NOT NULL,
    "photo_storage_key" TEXT NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pet_photos_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "pets" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "styles" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "preview_url" TEXT,
    "cost_credits" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_premium" BOOLEAN NOT NULL DEFAULT false,
    "parameters" JSONB,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "generations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "pet_id" TEXT NOT NULL,
    "pet_photo_id" TEXT,
    "style_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "prompt" TEXT NOT NULL,
    "negative_prompt" TEXT,
    "result_url" TEXT,
    "result_storage_key" TEXT,
    "thumbnail_url" TEXT,
    "provider" TEXT NOT NULL,
    "cost_credits" INTEGER NOT NULL,
    "processing_time_seconds" INTEGER,
    "error_message" TEXT,
    "metadata" JSONB,
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "is_favorite" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" DATETIME,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "generations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "generations_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "pets" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "generations_pet_photo_id_fkey" FOREIGN KEY ("pet_photo_id") REFERENCES "pet_photos" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "generations_style_id_fkey" FOREIGN KEY ("style_id") REFERENCES "styles" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "shopify_orders" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT,
    "shopify_order_id" TEXT NOT NULL,
    "order_number" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "total_price" DECIMAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "financial_status" TEXT,
    "fulfillment_status" TEXT,
    "line_items" JSONB NOT NULL,
    "customer_info" JSONB,
    "credits_awarded" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shopify_created_at" DATETIME,
    "shopify_updated_at" DATETIME,
    CONSTRAINT "shopify_orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "shopify_products" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopify_product_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "vendor" TEXT,
    "product_type" TEXT,
    "price" DECIMAL,
    "compare_at_price" DECIMAL,
    "images" JSONB,
    "variants" JSONB,
    "tags" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "credits_reward" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shopify_created_at" DATETIME,
    "shopify_updated_at" DATETIME
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "details" JSONB,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" DATETIME NOT NULL,
    "is_revoked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_shopify_customer_id_key" ON "users"("shopify_customer_id");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_shopify_customer_id_idx" ON "users"("shopify_customer_id");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE UNIQUE INDEX "user_credits_user_id_key" ON "user_credits"("user_id");

-- CreateIndex
CREATE INDEX "user_credits_user_id_idx" ON "user_credits"("user_id");

-- CreateIndex
CREATE INDEX "credit_transactions_user_id_idx" ON "credit_transactions"("user_id");

-- CreateIndex
CREATE INDEX "credit_transactions_created_at_idx" ON "credit_transactions"("created_at");

-- CreateIndex
CREATE INDEX "pets_user_id_idx" ON "pets"("user_id");

-- CreateIndex
CREATE INDEX "pets_species_idx" ON "pets"("species");

-- CreateIndex
CREATE INDEX "pets_user_id_is_active_idx" ON "pets"("user_id", "is_active");

-- CreateIndex
CREATE INDEX "pet_photos_pet_id_idx" ON "pet_photos"("pet_id");

-- CreateIndex
CREATE INDEX "pet_photos_pet_id_is_primary_idx" ON "pet_photos"("pet_id", "is_primary");

-- CreateIndex
CREATE INDEX "pet_photos_pet_id_order_index_idx" ON "pet_photos"("pet_id", "order_index");

-- CreateIndex
CREATE UNIQUE INDEX "styles_name_key" ON "styles"("name");

-- CreateIndex
CREATE INDEX "styles_category_idx" ON "styles"("category");

-- CreateIndex
CREATE INDEX "styles_is_active_idx" ON "styles"("is_active");

-- CreateIndex
CREATE INDEX "styles_sort_order_idx" ON "styles"("sort_order");

-- CreateIndex
CREATE INDEX "styles_category_is_active_idx" ON "styles"("category", "is_active");

-- CreateIndex
CREATE INDEX "generations_user_id_idx" ON "generations"("user_id");

-- CreateIndex
CREATE INDEX "generations_pet_id_idx" ON "generations"("pet_id");

-- CreateIndex
CREATE INDEX "generations_pet_photo_id_idx" ON "generations"("pet_photo_id");

-- CreateIndex
CREATE INDEX "generations_status_idx" ON "generations"("status");

-- CreateIndex
CREATE INDEX "generations_type_idx" ON "generations"("type");

-- CreateIndex
CREATE INDEX "generations_user_id_status_idx" ON "generations"("user_id", "status");

-- CreateIndex
CREATE INDEX "generations_user_id_type_idx" ON "generations"("user_id", "type");

-- CreateIndex
CREATE INDEX "generations_created_at_idx" ON "generations"("created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "shopify_orders_shopify_order_id_key" ON "shopify_orders"("shopify_order_id");

-- CreateIndex
CREATE INDEX "shopify_orders_user_id_idx" ON "shopify_orders"("user_id");

-- CreateIndex
CREATE INDEX "shopify_orders_shopify_order_id_idx" ON "shopify_orders"("shopify_order_id");

-- CreateIndex
CREATE INDEX "shopify_orders_email_idx" ON "shopify_orders"("email");

-- CreateIndex
CREATE INDEX "shopify_orders_created_at_idx" ON "shopify_orders"("created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "shopify_products_shopify_product_id_key" ON "shopify_products"("shopify_product_id");

-- CreateIndex
CREATE INDEX "shopify_products_shopify_product_id_idx" ON "shopify_products"("shopify_product_id");

-- CreateIndex
CREATE INDEX "shopify_products_is_active_idx" ON "shopify_products"("is_active");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_token_idx" ON "refresh_tokens"("token");

-- CreateIndex
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens"("expires_at");
