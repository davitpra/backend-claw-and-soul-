-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "pod_estimated_ready_at" TIMESTAMP(3),
ADD COLUMN     "pod_lead_time_days" INTEGER;
