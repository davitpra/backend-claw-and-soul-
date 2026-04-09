# Shopify Sync Module

Implements a 3-layer synchronization strategy that keeps `product_references` and `product_format_variants` in sync with the Shopify product catalog. Shopify remains the source of truth for all commercial data; this module mirrors the fields needed for the compatibility matrix (`style_format_product_compat`) and for variant-to-format resolution (`product_format_variants`).

## Architecture

| Layer | Mechanism            | Frequency    | Purpose                                              |
| :---- | :------------------- | :----------- | :--------------------------------------------------- |
| 1     | Shopify Webhooks     | Real-time    | Primary channel — reacts to changes immediately      |
| 2     | Cron job             | Every 6h     | Reconciliation — catches missed webhooks             |
| 3     | Manual sync (admin)  | On demand    | Initial setup and incident recovery                  |

All three layers share the same upsert and variant sync logic via `ProductSyncService`.

## Files Structure

- `shopify-sync/product-sync.service.ts`: Shared upsert, variant sync, and soft-delete logic used by all three layers.
- `shopify-sync/shopify-api.service.ts`: HTTP client for Shopify Admin API — paginated product fetching and webhook registration.
- `shopify-sync/sync.service.ts`: Cron job, manual sync orchestration, Redis mutex, and monitoring endpoints.
- `shopify-sync/shopify-webhooks.controller.ts`: Real-time webhook receivers for `products/create`, `products/update`, `products/delete`.
- `shopify-sync/admin-sync.controller.ts`: Admin endpoints to trigger and monitor syncs.
- `shopify-sync/shopify-sync.module.ts`: Module definition.
- `shopify-sync/guards/shopify-hmac.guard.ts`: Verifies `X-Shopify-Hmac-SHA256` header using `HMAC-SHA256` + `crypto.timingSafeEqual`.
- `shopify-sync/processors/shopify-sync.processor.ts`: BullMQ `WorkerHost` that processes upsert/delete jobs from the `shopify-sync` queue.
- `shopify-sync/constants/queues.constants.ts`: Queue name, job name constants, and default job options (3 retries, exponential backoff).
- `shopify-sync/dto/shopify-product.dto.ts`: TypeScript interfaces for Shopify REST product payloads.
- `shopify-sync/dto/sync-status.dto.ts`: Response DTOs for sync status, history, and health endpoints.

## Endpoints

### Webhooks (`/api/webhooks/shopify/product`)

No authentication (JWT bypassed via `@Public()`), protected by HMAC verification.

| Method | Endpoint                                        | Description                                                         |
| :----- | :---------------------------------------------- | :------------------------------------------------------------------ |
| `POST` | `/api/webhooks/shopify/product/create`          | Shopify `products/create` — enqueues upsert + variant sync job      |
| `POST` | `/api/webhooks/shopify/product/update`          | Shopify `products/update` — enqueues upsert + variant sync job      |
| `POST` | `/api/webhooks/shopify/product/delete`          | Shopify `products/delete` — enqueues delete job                     |

**Webhook processing flow (upsert jobs):**
1. Verify HMAC — reject `401` if invalid
2. Respond `200` immediately
3. Enqueue job to `shopify-sync` queue with full product payload
4. Worker: upsert product in `product_references` → sync variants in `product_format_variants`

### Admin (`/api/admin/products/sync`)

All endpoints require `admin` role.

| Method | Endpoint                               | Description                                          |
| :----- | :------------------------------------- | :--------------------------------------------------- |
| `POST` | `/api/admin/products/sync`             | Trigger a manual full sync. Responds immediately with `syncId`; runs in background. |
| `GET`  | `/api/admin/products/sync/status`      | Get the most recent sync record.                     |
| `GET`  | `/api/admin/products/sync/history`     | Get recent sync history (default: last 20).          |
| `GET`  | `/api/admin/products/sync/health`      | Health check: status, hours since last sync, active product count, webhook activity. |

## Field Mapping

### Shopify → product_references

| Shopify field         | DB field            | Notes                                     |
| :-------------------- | :------------------ | :---------------------------------------- |
| `product.id`          | `shopifyProductId`  | Stored as string                          |
| `product.handle`      | `shopifyHandle`     | URL slug — added in Phase 2               |
| `product.handle`      | `name`              | URL slug (kept for backwards compat)      |
| `product.title`       | `displayName`       | Human-readable label                      |
| `product.body_html`   | `description`       | HTML tags stripped before storing         |
| `product.status`      | `isActive`          | `true` only when status is `'active'`     |

### Shopify variants → product_format_variants

| Shopify field           | DB field               | Notes                                                        |
| :---------------------- | :--------------------- | :----------------------------------------------------------- |
| `variant.id`            | `shopifyVariantId`     | Stored as string                                             |
| `variant.title`         | `shopifyVariantTitle`  | Full variant title (e.g. `"8x10"`)                           |
| `variant.option1`       | — (lookup key)         | Matched against `formats.shopify_variant_option` to find the Format |
| *(derived)*             | `formatId`             | ID of the matched `Format` record                            |
| *(derived)*             | `productRefId`         | ID of the parent `ProductReference`                          |

**Variant matching logic** (`syncVariants()`):
1. For each variant, extract `option1` (Size, e.g. `"8x10"`)
2. Look up `Format` where `shopifyVariantOption === option1`
3. If found → upsert into `product_format_variants` (unique key: `productRefId + formatId`)
4. If not found → log warning and continue (sync is non-blocking)
5. After processing all variants, deactivate (`isActive = false`) any `product_format_variants` rows whose `shopifyVariantId` is no longer present in the incoming payload

## Features

- **HMAC Verification**: Every webhook is verified with `HMAC-SHA256(rawBody, SHOPIFY_WEBHOOK_SECRET)` before processing. Invalid requests are rejected with `401` and logged. Uses `crypto.timingSafeEqual` to prevent timing attacks. The raw body is captured via a route-scoped `express.raw()` middleware in `main.ts`.
- **Async Processing**: Webhook handlers respond `200` immediately and enqueue a BullMQ job (`shopify-sync` queue). The worker processes the upsert/delete asynchronously with 3 retries and exponential backoff.
- **Idempotent Upsert**: Uses `findUnique` by `shopifyProductId` then `update` or `create`. Safe to call multiple times with the same payload.
- **Idempotent Variant Sync**: Uses Prisma `upsert` with unique key `(productRefId, formatId)`. Running the same webhook twice produces the same result.
- **Soft Delete + Cascade**: Deactivating a product sets `isActive = false` on `product_references` and also deactivates all related rows in `style_format_product_compat` and `product_format_variants` within a single `$transaction`.
- **Variant Deactivation**: After each sync, variants that existed in the DB but are absent from the current Shopify payload are automatically soft-deleted (`isActive = false`) in `product_format_variants`.
- **Cron Reconciliation**: `@Cron('0 */6 * * *')` fetches all Shopify products, upserts each one + syncs its variants, then soft-deletes any `product_references` no longer present in Shopify.
- **Redis Mutex**: Prevents concurrent syncs using an atomic Redis `SET NX PX` lock (`shopify:sync:lock`, 5-minute TTL). The `triggerManualSync` endpoint throws `409 Conflict` if a sync is already running.
- **Webhook Auto-Registration**: On app startup (`OnApplicationBootstrap`), the three webhook topics (`products/create`, `products/update`, `products/delete`) are registered on Shopify via Admin API. Registration is idempotent — a `422` response (already exists) is silently ignored.
- **Sync Logging**: Every sync run is recorded in `sync_logs` with counters (`productsChecked`, `productsCreated`, `productsUpdated`, `productsDeactivated`) and error details. Variant stats (`variantsSynced`, `variantsSkipped`) are stored in the `metadata` JSON field.
- **Audit Trail**: Every upsert and soft-delete writes an entry to `audit_logs` with action `product_sync_created`, `product_sync_updated`, or `product_sync_deactivated`.

## Required Environment Variables

| Variable                  | Description                                                          |
| :------------------------ | :------------------------------------------------------------------- |
| `SHOPIFY_ADMIN_API_URL`   | Base URL for Shopify Admin API (e.g. `https://store.myshopify.com/admin/api/2024-01`) |
| `SHOPIFY_ADMIN_API_TOKEN` | Admin API access token (`shpat_...`)                                 |
| `SHOPIFY_WEBHOOK_SECRET`  | Secret used to verify incoming webhook HMAC signatures               |
| `APP_PUBLIC_URL`          | Public base URL of this API (e.g. `https://api.clawandsoul.com`) — used when registering webhook addresses on Shopify |

## Compatibility Matrix Impact

- **New product synced**: inserted into `product_references` with no compat rules. An admin must manually configure which style+format combinations are valid for the new product.
- **Product deactivated**: soft-deleted in `product_references`; all related `style_format_product_compat` and `product_format_variants` rows set to `isActive = false`. Existing `generations` referencing the product are not affected.
- **Product reactivated**: a Shopify `products/update` webhook sets `isActive = true` in `product_references`, but compat rules must be reactivated manually by an admin.
- **Variant without configured format**: logged as a warning (`Variant 'XxY' of product 'Name' has no configured format`). The sync continues without blocking. To fix, add the missing `shopifyVariantOption` value to the corresponding `Format` record.
