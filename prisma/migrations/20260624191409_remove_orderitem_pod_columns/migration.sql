-- El flujo POD (Pictorem) se gestiona ahora fuera de la aplicación.
-- Se eliminan las columnas POD a nivel de OrderItem.
ALTER TABLE "order_items"
  DROP COLUMN "pod_provider",
  DROP COLUMN "pod_order_id",
  DROP COLUMN "pod_raw_response",
  DROP COLUMN "pod_lead_time_days",
  DROP COLUMN "pod_estimated_ready_at";
