/*
  Warnings:

  - You are about to drop the column `cost_credits` on the `generations` table. All the data in the column will be lost.
  - You are about to drop the column `cost_credits` on the `styles` table. All the data in the column will be lost.
  - You are about to drop the column `shopify_customer_id` on the `users` table. All the data in the column will be lost.
  - You are about to drop the `credit_transactions` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `shopify_orders` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `shopify_products` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `user_credits` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "credit_transactions" DROP CONSTRAINT "credit_transactions_user_id_fkey";

-- DropForeignKey
ALTER TABLE "shopify_orders" DROP CONSTRAINT "shopify_orders_user_id_fkey";

-- DropForeignKey
ALTER TABLE "user_credits" DROP CONSTRAINT "user_credits_user_id_fkey";

-- DropIndex
DROP INDEX "users_shopify_customer_id_idx";

-- DropIndex
DROP INDEX "users_shopify_customer_id_key";

-- AlterTable
ALTER TABLE "generations" DROP COLUMN "cost_credits";

-- AlterTable
ALTER TABLE "styles" DROP COLUMN "cost_credits";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "shopify_customer_id";

-- DropTable
DROP TABLE "credit_transactions";

-- DropTable
DROP TABLE "shopify_orders";

-- DropTable
DROP TABLE "shopify_products";

-- DropTable
DROP TABLE "user_credits";
