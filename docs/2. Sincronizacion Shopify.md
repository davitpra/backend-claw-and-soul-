# ClawAndSoul — Estrategia de Sincronización con Shopify

## Contexto

La tabla `product_references` actúa como un espejo ligero de los productos de Shopify. No almacena precios, variantes ni inventario — solo la información mínima necesaria para que la matriz de compatibilidad (`style_format_product_compat`) funcione internamente. Shopify sigue siendo la fuente de verdad para todo lo comercial.

---

## Arquitectura de 3 Capas

La sincronización opera en tres capas complementarias que garantizan consistencia:

| Capa | Mecanismo           | Frecuencia   | Propósito                                           |
| ---- | ------------------- | ------------ | --------------------------------------------------- |
| 1    | Webhooks de Shopify | Tiempo real  | Canal principal, reacciona a cambios inmediatamente |
| 2    | Cron job            | Cada 6 horas | Reconciliación, captura webhooks perdidos           |
| 3    | Sync manual (admin) | Bajo demanda | Setup inicial y recuperación ante incidentes        |

Las tres capas comparten la misma lógica de upsert para mantener consistencia.

---

## Capa 1 — Webhooks de Shopify (Tiempo Real)

### Topics registrados

| Shopify Topic     | Endpoint                                | Acción                            |
| ----------------- | --------------------------------------- | --------------------------------- |
| `products/create` | `POST /webhooks/shopify/product/create` | Upsert en `product_references`    |
| `products/update` | `POST /webhooks/shopify/product/update` | Upsert en `product_references`    |
| `products/delete` | `POST /webhooks/shopify/product/delete` | Soft delete (`is_active = false`) |

### Registro de webhooks

Los webhooks se registran programáticamente al iniciar la aplicación usando la Shopify Admin API:

```
POST https://{shop}.myshopify.com/admin/api/2024-01/webhooks.json

{
  "webhook": {
    "topic": "products/create",
    "address": "https://api.clawandsoul.com/webhooks/shopify/product/create",
    "format": "json"
  }
}
```

Repetir para `products/update` y `products/delete`.

### Verificación de autenticidad (HMAC)

Cada webhook de Shopify incluye el header `X-Shopify-Hmac-SHA256`. Antes de procesar cualquier payload, se debe verificar:

```
1. Leer el body crudo del request (raw buffer, no parseado)
2. Calcular HMAC-SHA256 del body usando el Shopify Webhook Secret como clave
3. Comparar el hash calculado con el valor del header X-Shopify-Hmac-SHA256
4. Si no coinciden → rechazar con 401
5. Si coinciden → procesar el webhook
```

### Idempotencia

Shopify puede enviar el mismo webhook más de una vez. El handler debe ser idempotente:

```
1. Usar shopify_product_id como clave única
2. Upsert (INSERT ... ON CONFLICT UPDATE) en lugar de INSERT
3. El campo updated_at se actualiza siempre, lo que permite detectar duplicados en logs
```

### Respuesta rápida

Shopify espera una respuesta 2xx en máximo 5 segundos. Si el handler tarda más, Shopify reintenta (hasta 19 veces en 48 horas). Para evitar timeouts:

```
1. Recibir el webhook
2. Verificar HMAC
3. Responder 200 inmediatamente
4. Encolar el procesamiento en BullMQ (queue: 'shopify-sync')
5. El worker procesa el upsert de forma asíncrona
```

### Manejo de errores

```
- Webhook recibido pero HMAC inválido → 401, registrar en audit_logs como 'webhook_rejected'
- Webhook válido pero error en upsert → El job de BullMQ reintenta 3 veces con backoff exponencial
- Después de 3 reintentos fallidos → Marcar como 'sync_failed' en audit_logs, el cron lo reconciliará
```

---

## Capa 2 — Cron Job (Reconciliación)

### Schedule

```
Cron: 0 */6 * * * (cada 6 horas: 00:00, 06:00, 12:00, 18:00)
NestJS: @Cron('0 */6 * * *') en SyncService
```

### Flujo de reconciliación

```
1. Consultar Shopify Admin API: GET /admin/api/2024-01/products.json
   - Paginar con cursor-based pagination (limit=250 por página)
   - Traer todos los productos activos

2. Para cada producto de Shopify:
   a. Buscar en product_references por shopify_product_id
   b. Si existe → comparar campos (name, display_name, description)
      - Si hay diferencias → actualizar
      - Si no hay diferencias → skip
   c. Si no existe → insertar nuevo registro

3. Detectar productos eliminados en Shopify:
   a. Obtener todos los shopify_product_id activos de product_references
   b. Comparar contra los IDs obtenidos de Shopify
   c. Los que están en DB pero no en Shopify → soft delete (is_active = false)

4. Registrar resultado del sync:
   - total_products_checked
   - products_created
   - products_updated
   - products_deactivated
   - errors (si hubo)
   - sync_duration_seconds
```

### Rate Limits de Shopify Admin API

```
- Shopify permite 2 requests/segundo en el plan básico (bucket de 40)
- Para la paginación: esperar 500ms entre cada request
- Si se recibe 429 (Too Many Requests): respetar el header Retry-After
```

### Almacenamiento del estado del sync

El resultado de cada sync se guarda para monitoreo. Opciones:

```
Opción A: Tabla sync_logs (recomendada)

  id              varchar PK
  type            varchar NN     -- 'cron' | 'manual' | 'webhook'
  status          varchar NN     -- 'running' | 'completed' | 'failed'
  started_at      timestamp NN
  completed_at    timestamp
  products_checked    int
  products_created    int
  products_updated    int
  products_deactivated int
  errors              json
  metadata            json

Opción B: Reutilizar audit_logs con action = 'product_sync' y detalles en JSON
```

---

## Capa 3 — Sync Manual (Admin)

### Endpoints

| Método | Endpoint                       | Descripción                                   |
| ------ | ------------------------------ | --------------------------------------------- |
| `POST` | `/admin/products/sync`         | Dispara la misma lógica del cron bajo demanda |
| `GET`  | `/admin/products/sync/status`  | Estado del último sync                        |
| `GET`  | `/admin/products/sync/history` | Historial de syncs recientes                  |

### Cuándo usarlo

```
- Setup inicial: poblar product_references por primera vez
- Después de cambios masivos en Shopify (agregar muchos productos nuevos)
- Si se detecta inconsistencia entre Shopify y la DB
- Después de un downtime donde se pudieron perder webhooks
- Después de restaurar un backup de la DB
```

### Protecciones

```
- Solo accesible para role = 'admin'
- Mutex: no permitir dos syncs simultáneos (usar Redis lock)
- Timeout máximo: 5 minutos (cortar si se excede y registrar error)
- El endpoint responde inmediatamente con el ID del sync, el proceso corre en background
```

---

## Lógica de Upsert (compartida por las 3 capas)

### Mapeo de campos

```
Shopify Product              →    product_references
─────────────────────────────────────────────────────
product.id                   →    shopify_product_id
product.handle               →    name
product.title                →    display_name
product.body_html (stripped) →    description
product.status === 'active'  →    is_active
```

### Pseudocódigo del upsert

```
function upsertProduct(shopifyProduct):

  existing = db.findOne({ shopify_product_id: shopifyProduct.id })

  data = {
    shopify_product_id: shopifyProduct.id,
    name: shopifyProduct.handle,
    display_name: shopifyProduct.title,
    description: stripHtml(shopifyProduct.body_html),
    is_active: shopifyProduct.status === 'active',
    updated_at: now()
  }

  if existing:
    db.update(existing.id, data)
    audit('product_sync_updated', 'product_reference', existing.id)
    return { action: 'updated', id: existing.id }
  else:
    data.id = generateUUID()
    data.created_at = now()
    db.insert(data)
    audit('product_sync_created', 'product_reference', data.id)
    return { action: 'created', id: data.id }
```

### Pseudocódigo del soft delete

```
function softDeleteProduct(shopifyProductId):

  existing = db.findOne({ shopify_product_id: shopifyProductId })

  if existing and existing.is_active:
    db.update(existing.id, { is_active: false, updated_at: now() })
    audit('product_sync_deactivated', 'product_reference', existing.id)

    // Desactivar compatibilidades huérfanas
    db.updateMany(
      'style_format_product_compat',
      { product_ref_id: existing.id },
      { is_active: false }
    )

    return { action: 'deactivated', id: existing.id }
```

---

## Impacto en la Matriz de Compatibilidad

### Producto nuevo sincronizado

```
1. El producto se inserta en product_references
2. NO se crean reglas de compatibilidad automáticamente
3. Un admin debe configurar manualmente en qué combinaciones estilo+formato
   es compatible el nuevo producto
4. Hasta que no tenga reglas de compatibilidad, el producto no aparece
   en ningún flujo de usuario
```

### Producto eliminado/desactivado

```
1. Se hace soft delete en product_references (is_active = false)
2. Se desactivan TODAS las reglas de compatibilidad que referencian ese producto
3. El producto deja de aparecer en los flujos de usuario inmediatamente
4. Las generaciones existentes que referencian ese producto NO se afectan
   (mantienen su historial intacto)
5. Si el producto se reactiva en Shopify, un webhook de update
   lo reactiva en product_references, PERO las reglas de compatibilidad
   deben reactivarse manualmente por el admin
```

---

## Monitoreo y Alertas

### Métricas a trackear

```
- Tiempo desde el último sync exitoso (alerta si > 12 horas)
- Webhooks recibidos vs procesados (alerta si ratio < 95%)
- Webhooks rechazados por HMAC inválido (alerta si > 0, posible ataque)
- Diferencia de conteo: productos en Shopify vs product_references activos
  (alerta si difieren después de un sync)
- Latencia promedio de procesamiento de webhooks
```

### Health check

```
GET /admin/products/sync/health

Respuesta:
{
  "status": "healthy" | "degraded" | "unhealthy",
  "last_successful_sync": "2026-04-05T12:00:00Z",
  "hours_since_last_sync": 2.5,
  "active_products_db": 15,
  "webhooks_last_24h": {
    "received": 8,
    "processed": 8,
    "failed": 0
  }
}
```

---

## Orden de Implementación Recomendado

```
1. Lógica de upsert compartida (ProductSyncService)
2. Sync manual (POST /admin/products/sync) — permite poblar la DB inicialmente
3. Webhooks de Shopify — canal principal de sincronización
4. Cron job de reconciliación — red de seguridad
5. Endpoints de monitoreo (status, history, health)
6. Alertas y logging
```
