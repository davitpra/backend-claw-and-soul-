# ClawAndSoul API — Endpoints

Base URL: `/api`
Swagger UI: `http://localhost:3001/api/docs`

> **Autenticación global**: todos los endpoints requieren JWT por defecto.
> Usar `@Public()` para endpoints abiertos, `@Roles('admin')` para endpoints de admin.

---

## Leyenda de Estado

| Estado | Significado |
|--------|-------------|
| `listo` | Implementado y funcional |
| `parcialmente` | Implementado pero incompleto o con limitaciones |
| `pendiente` | Planificado, no implementado aún |
| `sin implementar` | No existe en el código ni está planificado activamente |

---

## 1. AUTH

| Método | Endpoint | Descripción | Body / Params | Auth | Estado |
|--------|----------|-------------|---------------|------|--------|
| POST | `/auth/register` | Registro de usuario | `{ email, password, full_name }` | Público | `listo` |
| POST | `/auth/login` | Login, devuelve access + refresh en cookies | `{ email, password }` | Público | `listo` |
| POST | `/auth/refresh` | Renueva access token vía cookie | Cookie: `refresh_token` | Público | `listo` |
| POST | `/auth/logout` | Revoca refresh token | Cookie: `refresh_token` | Público | `listo` |
| GET | `/auth/me` | Devuelve el usuario autenticado actual | — | JWT | `listo` |
| GET | `/auth/sessions` | Lista todas las sesiones activas del usuario | — | JWT | `listo` |
| POST | `/auth/sessions/revoke/:tokenId` | Revoca una sesión específica | Param: `tokenId` | JWT | `listo` |
| POST | `/auth/sessions/revoke-all` | Revoca todas las sesiones excepto la actual | Cookie: `refresh_token` | JWT | `listo` |
| POST | `/auth/verify-email` | Verificación de email con token | `{ token }` | Público | `pendiente` |
| POST | `/auth/forgot-password` | Solicita reset de contraseña | `{ email }` | Público | `pendiente` |
| POST | `/auth/reset-password` | Cambia contraseña con token de reset | `{ token, new_password }` | Público | `pendiente` |

---

## 2. USERS

| Método | Endpoint | Descripción | Body / Params | Auth | Estado |
|--------|----------|-------------|---------------|------|--------|
| GET | `/users/me` | Perfil del usuario autenticado | — | JWT | `listo` |
| PATCH | `/users/me` | Actualizar perfil | `{ full_name, email }` | JWT | `listo` |
| PATCH | `/users/me/password` | Cambiar contraseña | `{ current_password, new_password }` | JWT | `pendiente` |

---

## 3. PETS

| Método | Endpoint | Descripción | Body / Params | Auth | Estado |
|--------|----------|-------------|---------------|------|--------|
| POST | `/pets` | Crear mascota | `{ name, species, breed, age, description }` | JWT | `listo` |
| GET | `/pets` | Listar mascotas del usuario autenticado | — | JWT | `listo` |
| GET | `/pets/:id` | Detalle de una mascota | Param: `id` | JWT | `listo` |
| PATCH | `/pets/:id` | Actualizar datos de mascota | `{ name, species, breed, age, description }` | JWT | `listo` |
| DELETE | `/pets/:id` | Soft delete (is_active = false) | Param: `id` | JWT | `listo` |

---

## 4. PET PHOTOS

| Método | Endpoint | Descripción | Body / Params | Auth | Estado |
|--------|----------|-------------|---------------|------|--------|
| POST | `/pets/:id/photos` | Subir foto de mascota | `multipart/form-data: photo (binary), isPrimary?` | JWT | `listo` |
| GET | `/pets/:id/photos` | Listar fotos de una mascota | Param: `id` | JWT | `listo` |
| PATCH | `/pets/:id/photos/:photoId` | Actualizar orden o foto principal | `{ order_index?, is_primary? }` | JWT | `listo` |
| DELETE | `/pets/:id/photos/:photoId` | Eliminar foto | Param: `id, photoId` | JWT | `listo` |

---

## 5. STYLES

| Método | Endpoint | Descripción | Body / Params | Auth | Estado |
|--------|----------|-------------|---------------|------|--------|
| GET | `/styles` | Listar estilos activos | `?category=watercolor&is_premium=false` | Público | `listo` |
| GET | `/styles/categories` | Listar categorías de estilos disponibles | — | Público | `listo` |
| GET | `/styles/category/:category` | Listar estilos de una categoría específica | Param: `category` | Público | `listo` |
| GET | `/styles/:id` | Detalle de estilo | Param: `id` | Público | `listo` |
| GET | `/styles/:id/images` | Imágenes del catálogo del estilo | `?is_primary=true` | Público | `listo` |
| GET | `/styles/:styleId/compat` | Opciones compatibles de un estilo (formatos + productos) | Param: `styleId` | Público | `listo` |

### Admin (role = admin):

| Método | Endpoint | Descripción | Body / Params | Auth | Estado |
|--------|----------|-------------|---------------|------|--------|
| POST | `/admin/styles` | Crear estilo | `{ name, display_name, category, parameters, ... }` | Admin | `listo` |
| PATCH | `/admin/styles/:styleId` | Actualizar estilo | `{ display_name, parameters, is_premium, ... }` | Admin | `listo` |
| DELETE | `/admin/styles/:styleId` | Soft delete estilo | Param: `styleId` | Admin | `listo` |
| POST | `/admin/styles/:styleId/images` | Subir imagen al catálogo del estilo | `multipart/form-data: file (binary), caption?, order_index?` | Admin | `listo` |
| DELETE | `/admin/styles/:styleId/images/:imgId` | Eliminar imagen del catálogo | Param: `styleId, imgId` | Admin | `listo` |

---

## 6. FORMATS

| Método | Endpoint | Descripción | Body / Params | Auth | Estado |
|--------|----------|-------------|---------------|------|--------|
| GET | `/formats` | Listar formatos activos | — | Público | `listo` |
| GET | `/formats/:id` | Detalle de formato | Param: `id` | Público | `listo` |

### Admin:

| Método | Endpoint | Descripción | Body / Params | Auth | Estado |
|--------|----------|-------------|---------------|------|--------|
| POST | `/admin/formats` | Crear formato | `{ name, display_name, aspect_ratio, width, height }` | Admin | `listo` |
| PATCH | `/admin/formats/:formatId` | Actualizar formato | `{ display_name, width, height, is_active }` | Admin | `listo` |
| DELETE | `/admin/formats/:formatId` | Soft delete formato | Param: `formatId` | Admin | `listo` |

---

## 7. PRODUCT REFERENCES

| Método | Endpoint | Descripción | Body / Params | Auth | Estado |
|--------|----------|-------------|---------------|------|--------|
| GET | `/products` | Listar productos activos | — | Público | `listo` |
| GET | `/products/:productId` | Detalle de producto | Param: `productId` | Público | `listo` |

### Admin:

| Método | Endpoint | Descripción | Body / Params | Auth | Estado |
|--------|----------|-------------|---------------|------|--------|
| POST | `/admin/products` | Crear referencia de producto | `{ shopify_product_id, name, display_name }` | Admin | `listo` |
| PATCH | `/admin/products/:productId` | Actualizar producto | `{ display_name, shopify_product_id, is_active }` | Admin | `listo` |
| DELETE | `/admin/products/:productId` | Soft delete producto | Param: `productId` | Admin | `listo` |

---

## 8. ADMIN — SYNC DE PRODUCTOS (Shopify)

| Método | Endpoint | Descripción | Body / Params | Auth | Estado |
|--------|----------|-------------|---------------|------|--------|
| POST | `/admin/products/sync` | Disparar sincronización manual desde Shopify | — | Admin | `listo` |
| GET | `/admin/products/sync/status` | Estado actual de la sincronización | — | Admin | `listo` |
| GET | `/admin/products/sync/history` | Historial de sincronizaciones | `?limit=N` | Admin | `listo` |
| GET | `/admin/products/sync/health` | Estado de salud del servicio de sync | — | Admin | `listo` |

---

## 9. COMPATIBILIDAD

Alimentan la lógica condicional del frontend para ambos flujos de selección.

| Método | Endpoint | Descripción | Body / Params | Auth | Estado |
|--------|----------|-------------|---------------|------|--------|
| GET | `/compat/formats` | Formatos disponibles para un producto | `?product_id=xxx` | Público | `listo` |
| GET | `/compat/styles` | Estilos compatibles con producto + formato | `?product_id=xxx&format_id=yyy` | Público | `listo` |
| GET | `/compat/formats-by-style` | Formatos disponibles para un estilo | `?style_id=xxx` | Público | `listo` |
| GET | `/compat/products` | Productos compatibles con estilo + formato | `?style_id=xxx&format_id=yyy` | Público | `listo` |
| GET | `/compat/check` | Valida una combinación específica | `?style_id=xxx&format_id=yyy&product_id=zzz` | Público | `listo` |

### Admin:

| Método | Endpoint | Descripción | Body / Params | Auth | Estado |
|--------|----------|-------------|---------------|------|--------|
| GET | `/admin/compat` | Listar todas las reglas de compatibilidad | `?style_id=xxx&format_id=yyy&product_id=zzz` | Admin | `listo` |
| POST | `/admin/compat` | Crear regla de compatibilidad | `{ style_id, format_id, product_ref_id, constraints }` | Admin | `listo` |
| POST | `/admin/compat/bulk` | Crear reglas en lote | `{ rules: [{ style_id, format_id, product_ref_id }] }` | Admin | `listo` |
| PATCH | `/admin/compat/:compatId` | Actualizar regla | `{ constraints, is_active }` | Admin | `listo` |
| DELETE | `/admin/compat/:compatId` | Eliminar regla | Param: `compatId` | Admin | `listo` |

---

## 10. GENERATIONS

| Método | Endpoint | Descripción | Body / Params | Auth | Estado |
|--------|----------|-------------|---------------|------|--------|
| POST | `/generations` | Lanzar nueva generación de imagen/video | `{ pet_id, pet_photo_id, style_id, format_id, product_ref_id }` | JWT | `listo` |
| GET | `/generations` | Listar generaciones del usuario | `?status=completed&pet_id=xxx&page=1&limit=20` | JWT | `listo` |
| GET | `/generations/:id` | Detalle completo de una generación | Param: `id` | JWT | `listo` |
| GET | `/generations/:id/status` | Polling de estado (lightweight) | Devuelve `{ status, progress? }` | JWT | `listo` |
| PATCH | `/generations/:id` | Actualizar flags de generación | `{ is_public, is_favorite }` | JWT | `listo` |
| DELETE | `/generations/:id` | Eliminar generación del usuario | Param: `id` | JWT | `listo` |

---

## 11. GALLERY (público)

| Método | Endpoint | Descripción | Body / Params | Auth | Estado |
|--------|----------|-------------|---------------|------|--------|
| GET | `/gallery` | Listar generaciones públicas | `?style_id=xxx&species=cat&page=1&limit=20` | Público | `listo` |
| GET | `/gallery/:genId` | Detalle público de una generación | Param: `genId` | Público | `listo` |

---

## 12. WEBHOOKS

### Internos

| Método | Endpoint | Descripción | Headers | Auth | Estado |
|--------|----------|-------------|---------|------|--------|
| POST | `/webhooks/generation-complete` | Callback del worker cuando termina una generación | `x-webhook-secret` | WebhookSecretGuard | `listo` |

### Shopify (HMAC verificado)

| Método | Endpoint | Descripción | Body | Auth | Estado |
|--------|----------|-------------|------|------|--------|
| POST | `/webhooks/shopify/product/create` | Producto creado en Shopify | Raw Buffer + HMAC header | ShopifyHmacGuard | `listo` |
| POST | `/webhooks/shopify/product/update` | Producto actualizado en Shopify | Raw Buffer + HMAC header | ShopifyHmacGuard | `listo` |
| POST | `/webhooks/shopify/product/delete` | Producto eliminado en Shopify | Raw Buffer + HMAC header | ShopifyHmacGuard | `listo` |
| POST | `/webhooks/shopify/order` | Notificación de nueva orden de Shopify | Raw Buffer + HMAC header | ShopifyHmacGuard | `pendiente` |

---

## Resumen de flujos

### Flujo 1: Producto primero

```
POST /auth/login
GET  /products                                → usuario elige producto
GET  /compat/formats?product_id=X             → formatos disponibles para ese producto
                                              → usuario elige formato
POST /pets + POST /pets/:id/photos            → crea mascota y sube fotos
GET  /compat/styles?product_id=X&format_id=Y  → estilos compatibles
                                              → usuario elige estilo
GET  /compat/check?style_id=Z&format_id=Y&product_id=X  → validación final
POST /generations                             → lanza generación
GET  /generations/:id/status                  → polling hasta completed
GET  /generations/:id                         → resultado final
                                              → redirige a Shopify checkout
```

### Flujo 2: Mascota / Estilo primero

```
POST /auth/login
POST /pets + POST /pets/:id/photos            → crea mascota y sube fotos
GET  /styles                                  → usuario elige estilo
GET  /compat/formats-by-style?style_id=X      → formatos disponibles para ese estilo
                                              → usuario elige formato
GET  /compat/products?style_id=X&format_id=Y  → productos compatibles
                                              → usuario elige producto
GET  /compat/check?style_id=X&format_id=Y&product_id=Z  → validación final
POST /generations                             → lanza generación
GET  /generations/:id/status                  → polling hasta completed
GET  /generations/:id                         → resultado final
                                              → redirige a Shopify checkout
```

---

## Estadísticas

| Categoría | Total |
|-----------|-------|
| Endpoints totales | 62 |
| Públicos | 22 |
| Protegidos JWT | 22 |
| Solo Admin | 15 |
| Webhooks (guards propios) | 4 |
| Listos | 54 |
| Pendientes | 8 |
