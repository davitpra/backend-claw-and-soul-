# ClawAndSoul API — Endpoints

Base URL: `/api/v1`

---

## 1. AUTH

| Método | Endpoint                | Descripción                      | Body / Params                    |
| ------ | ----------------------- | -------------------------------- | -------------------------------- |
| POST   | `/auth/register`        | Registro de usuario              | `{ email, password, full_name }` |
| POST   | `/auth/login`           | Login, devuelve access + refresh | `{ email, password }`            |
| POST   | `/auth/refresh`         | Renueva access token             | `{ refresh_token }`              |
| POST   | `/auth/logout`          | Revoca refresh token             | `{ refresh_token }`              |
| POST   | `/auth/verify-email`    | Verificación de email            | `{ token }`                      |
| POST   | `/auth/forgot-password` | Solicita reset de password       | `{ email }`                      |
| POST   | `/auth/reset-password`  | Cambia password con token        | `{ token, new_password }`        |

---

## 2. USERS

| Método | Endpoint             | Descripción                    | Body / Params                        |
| ------ | -------------------- | ------------------------------ | ------------------------------------ |
| GET    | `/users/me`          | Perfil del usuario autenticado | —                                    |
| PATCH  | `/users/me`          | Actualizar perfil              | `{ full_name, email }`               |
| PATCH  | `/users/me/password` | Cambiar contraseña             | `{ current_password, new_password }` |

---

## 3. PETS

| Método | Endpoint       | Descripción                     | Body / Params                                |
| ------ | -------------- | ------------------------------- | -------------------------------------------- |
| POST   | `/pets`        | Crear mascota                   | `{ name, species, breed, age, description }` |
| GET    | `/pets`        | Listar mascotas del usuario     | —                                            |
| GET    | `/pets/:petId` | Detalle de una mascota          | —                                            |
| PATCH  | `/pets/:petId` | Actualizar mascota              | `{ name, species, breed, age, description }` |
| DELETE | `/pets/:petId` | Soft delete (is_active = false) | —                                            |

---

## 4. PET PHOTOS

| Método | Endpoint                       | Descripción                    | Body / Params                  |
| ------ | ------------------------------ | ------------------------------ | ------------------------------ |
| POST   | `/pets/:petId/photos`          | Subir foto(s) de mascota       | `multipart/form-data: files[]` |
| GET    | `/pets/:petId/photos`          | Listar fotos de una mascota    | —                              |
| PATCH  | `/pets/:petId/photos/:photoId` | Actualizar (order, is_primary) | `{ order_index, is_primary }`  |
| DELETE | `/pets/:petId/photos/:photoId` | Eliminar foto                  | —                              |

---

## 5. STYLES

| Método | Endpoint                  | Descripción                          | Body / Params                           |
| ------ | ------------------------- | ------------------------------------ | --------------------------------------- |
| GET    | `/styles`                 | Listar estilos activos               | `?category=watercolor&is_premium=false` |
| GET    | `/styles/:styleId`        | Detalle de estilo con imágenes       | —                                       |
| GET    | `/styles/:styleId/images` | Mini-catálogo de imágenes del estilo | —                                       |

### Admin (role = admin):

| Método | Endpoint                               | Descripción                  | Body / Params                                       |
| ------ | -------------------------------------- | ---------------------------- | --------------------------------------------------- |
| POST   | `/admin/styles`                        | Crear estilo                 | `{ name, display_name, category, parameters, ... }` |
| PATCH  | `/admin/styles/:styleId`               | Actualizar estilo            | `{ display_name, parameters, is_premium, ... }`     |
| DELETE | `/admin/styles/:styleId`               | Soft delete estilo           | —                                                   |
| POST   | `/admin/styles/:styleId/images`        | Subir imagen al catálogo     | `multipart/form-data: file, caption, order_index`   |
| DELETE | `/admin/styles/:styleId/images/:imgId` | Eliminar imagen del catálogo | —                                                   |

---

## 6. FORMATS

| Método | Endpoint             | Descripción             | Body / Params |
| ------ | -------------------- | ----------------------- | ------------- |
| GET    | `/formats`           | Listar formatos activos | —             |
| GET    | `/formats/:formatId` | Detalle de formato      | —             |

### Admin:

| Método | Endpoint                   | Descripción         | Body / Params                                         |
| ------ | -------------------------- | ------------------- | ----------------------------------------------------- |
| POST   | `/admin/formats`           | Crear formato       | `{ name, display_name, aspect_ratio, width, height }` |
| PATCH  | `/admin/formats/:formatId` | Actualizar formato  | `{ display_name, width, height, is_active }`          |
| DELETE | `/admin/formats/:formatId` | Soft delete formato | —                                                     |

---

## 7. PRODUCT REFERENCES

| Método | Endpoint               | Descripción              | Body / Params |
| ------ | ---------------------- | ------------------------ | ------------- |
| GET    | `/products`            | Listar productos activos | —             |
| GET    | `/products/:productId` | Detalle de producto      | —             |

### Admin:

| Método | Endpoint                     | Descripción                  | Body / Params                                     |
| ------ | ---------------------------- | ---------------------------- | ------------------------------------------------- |
| POST   | `/admin/products`            | Crear referencia de producto | `{ shopify_product_id, name, display_name }`      |
| PATCH  | `/admin/products/:productId` | Actualizar producto          | `{ display_name, shopify_product_id, is_active }` |
| DELETE | `/admin/products/:productId` | Soft delete producto         | —                                                 |

---

## 8. COMPATIBILIDAD (el motor de ambos flujos)

Estos endpoints alimentan la lógica condicional del frontend.

| Método | Endpoint                   | Descripción                                  | Usado en             |
| ------ | -------------------------- | -------------------------------------------- | -------------------- |
| GET    | `/compat/formats`          | Formatos disponibles para un producto        | Flujo 1 (producto →) |
|        |                            | `?product_id=xxx`                            |                      |
| GET    | `/compat/styles`           | Estilos compatibles con producto + formato   | Flujo 1 (producto →) |
|        |                            | `?product_id=xxx&format_id=yyy`              |                      |
| GET    | `/compat/formats-by-style` | Formatos disponibles para un estilo          | Flujo 2 (estilo →)   |
|        |                            | `?style_id=xxx`                              |                      |
| GET    | `/compat/products`         | Productos compatibles con estilo + formato   | Flujo 2 (estilo →)   |
|        |                            | `?style_id=xxx&format_id=yyy`                |                      |
| GET    | `/compat/check`            | Valida una combinación específica            | Ambos flujos         |
|        |                            | `?style_id=xxx&format_id=yyy&product_id=zzz` |                      |

### Admin:

| Método | Endpoint                  | Descripción                       | Body / Params                                          |
| ------ | ------------------------- | --------------------------------- | ------------------------------------------------------ |
| GET    | `/admin/compat`           | Listar todas las compatibilidades | `?style_id=xxx&format_id=yyy&product_id=zzz`           |
| POST   | `/admin/compat`           | Crear regla de compatibilidad     | `{ style_id, format_id, product_ref_id, constraints }` |
| PATCH  | `/admin/compat/:compatId` | Actualizar regla                  | `{ constraints, is_active }`                           |
| DELETE | `/admin/compat/:compatId` | Eliminar regla                    | —                                                      |
| POST   | `/admin/compat/bulk`      | Crear reglas en lote              | `{ rules: [{ style_id, format_id, product_ref_id }] }` |

---

## 9. GENERATIONS

| Método | Endpoint                     | Descripción                     | Body / Params                                                   |
| ------ | ---------------------------- | ------------------------------- | --------------------------------------------------------------- |
| POST   | `/generations`               | Lanzar generación               | `{ pet_id, pet_photo_id, style_id, format_id, product_ref_id }` |
| GET    | `/generations`               | Listar generaciones del usuario | `?status=completed&pet_id=xxx&page=1&limit=20`                  |
| GET    | `/generations/:genId`        | Detalle de generación           | —                                                               |
| GET    | `/generations/:genId/status` | Polling de estado (lightweight) | Devuelve solo `{ status, progress? }`                           |
| PATCH  | `/generations/:genId`        | Actualizar flags                | `{ is_public, is_favorite }`                                    |

---

## 10. GALLERY (público)

| Método | Endpoint          | Descripción                       | Body / Params                               |
| ------ | ----------------- | --------------------------------- | ------------------------------------------- |
| GET    | `/gallery`        | Generaciones públicas             | `?style_id=xxx&species=cat&page=1&limit=20` |
| GET    | `/gallery/:genId` | Detalle público de una generación | —                                           |

---

## 11. WEBHOOKS (internos)

| Método | Endpoint                        | Descripción                      | Origen          |
| ------ | ------------------------------- | -------------------------------- | --------------- |
| POST   | `/webhooks/generation-complete` | Callback cuando BullMQ termina   | Worker interno  |
| POST   | `/webhooks/shopify/order`       | Notificación de orden de Shopify | Shopify webhook |

---

## Resumen de flujos

### Flujo 1: Producto primero

```
POST /auth/login
GET  /products                              → usuario elige producto
GET  /compat/formats?product_id=X           → formatos disponibles para ese producto
                                            → usuario elige formato
POST /pets + POST /pets/:id/photos          → crea mascota y sube fotos
GET  /compat/styles?product_id=X&format_id=Y → estilos compatibles
                                            → usuario elige estilo
POST /generations                           → lanza generación
GET  /generations/:id/status                → polling hasta completed
GET  /generations/:id                       → resultado final
                                            → redirige a Shopify checkout
```

### Flujo 2: Mascota primero

```
POST /auth/login
POST /pets + POST /pets/:id/photos          → crea mascota y sube fotos
GET  /styles                                → usuario elige estilo
GET  /compat/formats-by-style?style_id=X    → formatos disponibles para ese estilo
                                            → usuario elige formato
GET  /compat/products?style_id=X&format_id=Y → productos compatibles
                                            → usuario elige producto
POST /generations                           → lanza generación
GET  /generations/:id/status                → polling hasta completed
GET  /generations/:id                       → resultado final
                                            → redirige a Shopify checkout
```
