-- AlterTable
ALTER TABLE "users" ADD COLUMN     "generation_credits" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "credit_transactions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "reference_id" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "credit_transactions_user_id_created_at_idx" ON "credit_transactions"("user_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "credit_transactions_reason_reference_id_key" ON "credit_transactions"("reason", "reference_id");

-- AddForeignKey
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: cada usuario existente recibe el bono de bienvenida de 5 créditos.
-- El saldo y el ledger se llenan juntos para mantener la invariante SUM(ledger) == balance.
UPDATE "users" SET "generation_credits" = 5;
INSERT INTO "credit_transactions" ("id", "user_id", "amount", "reason", "reference_id", "note", "created_at")
SELECT gen_random_uuid()::text, "id", 5, 'signup_bonus', "id", 'backfill', NOW() FROM "users";
