-- CreateIndex
CREATE INDEX "expenses_category_created_at_idx" ON "expenses"("category", "created_at" DESC);

-- CreateIndex
CREATE INDEX "order_events_created_at_idx" ON "order_events"("created_at" DESC);

-- CreateIndex
CREATE INDEX "order_items_created_at_idx" ON "order_items"("created_at" DESC);

-- CreateIndex
CREATE INDEX "order_items_shipped_at_idx" ON "order_items"("shipped_at" DESC);

-- CreateIndex
CREATE INDEX "order_items_delivered_at_idx" ON "order_items"("delivered_at" DESC);

-- CreateIndex
CREATE INDEX "users_created_at_idx" ON "users"("created_at" DESC);
