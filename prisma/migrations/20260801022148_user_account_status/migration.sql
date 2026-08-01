-- AlterTable
ALTER TABLE "users" ADD COLUMN     "anonymized_at" TIMESTAMP(3),
ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'active',
ADD COLUMN     "status_changed_at" TIMESTAMP(3),
ADD COLUMN     "status_changed_by" TEXT,
ADD COLUMN     "status_reason" TEXT;

-- Backfill: mantiene el invariante isActive === (status === 'active') sobre las
-- filas existentes. El DEFAULT 'active' solo cubre las nuevas.
UPDATE "users" SET "status" = CASE WHEN "is_active" THEN 'active' ELSE 'inactive' END;

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE INDEX "users_deleted_at_idx" ON "users"("deleted_at");
