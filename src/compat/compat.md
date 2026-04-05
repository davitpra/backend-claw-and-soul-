# 🔀 Compat Module

Motor de compatibilidad que alimenta la lógica condicional del frontend. Define qué combinaciones de (estilo, formato, producto) son válidas y expone endpoints para cada paso de los dos flujos de usuario.

## 📁 Files Structure

- `compat/compat.service.ts`: Toda la lógica de negocio — consultas de compatibilidad y CRUD admin.
- `compat/compat.controller.ts`: Endpoints públicos para los dos flujos de selección.
- `compat/admin-compat.controller.ts`: Endpoints admin para gestionar reglas de compatibilidad (role = admin).
- `compat/dto/get-formats-by-product.dto.ts`: Query DTO — `product_id`.
- `compat/dto/get-styles-by-product-format.dto.ts`: Query DTO — `product_id` + `format_id`.
- `compat/dto/get-formats-by-style.dto.ts`: Query DTO — `style_id`.
- `compat/dto/get-products-by-style-format.dto.ts`: Query DTO — `style_id` + `format_id`.
- `compat/dto/check-compat.dto.ts`: Query DTO — `style_id` + `format_id` + `product_id`.
- `compat/dto/create-compat-rule.dto.ts`: Body DTO para crear una regla.
- `compat/dto/update-compat-rule.dto.ts`: Body DTO para actualizar `constraints` o `is_active`.
- `compat/dto/bulk-create-compat-rules.dto.ts`: Body DTO para crear reglas en lote.

## 🚀 Public Endpoints

Todos son `@Public()` — no requieren autenticación.

### Flujo 1: Producto → Formato → Estilo

| Method | Endpoint              | Query Params                    | Retorna                        | Descripción                               |
| :----- | :-------------------- | :------------------------------ | :----------------------------- | :---------------------------------------- |
| `GET`  | `/api/compat/formats` | `?product_id=uuid`              | `Format[]`                     | Formatos disponibles para ese producto.   |
| `GET`  | `/api/compat/styles`  | `?product_id=uuid&format_id=uuid` | `Style[]`                    | Estilos compatibles con producto+formato. |

### Flujo 2: Estilo → Formato → Producto

| Method | Endpoint                       | Query Params                    | Retorna                        | Descripción                               |
| :----- | :----------------------------- | :------------------------------ | :----------------------------- | :---------------------------------------- |
| `GET`  | `/api/compat/formats-by-style` | `?style_id=uuid`                | `Format[]`                     | Formatos disponibles para ese estilo.     |
| `GET`  | `/api/compat/products`         | `?style_id=uuid&format_id=uuid` | `ProductReference[]`           | Productos compatibles con estilo+formato. |

### Ambos flujos

| Method | Endpoint             | Query Params                                     | Retorna                                    | Descripción                                  |
| :----- | :------------------- | :----------------------------------------------- | :----------------------------------------- | :------------------------------------------- |
| `GET`  | `/api/compat/check`  | `?style_id=uuid&format_id=uuid&product_id=uuid`  | `{ compatible: boolean, rule?: CompatRule }` | Valida si una combinación es válida.         |

## 🔐 Admin Endpoints (role = admin)

| Method   | Endpoint                          | Body / Params                                          | Descripción                                        |
| :------- | :-------------------------------- | :----------------------------------------------------- | :------------------------------------------------- |
| `GET`    | `/api/admin/compat`               | `?style_id=uuid&format_id=uuid&product_id=uuid`        | Listar todas las reglas (filtros opcionales). Incluye nombres de style/format/productRef. |
| `POST`   | `/api/admin/compat`               | `{ style_id, format_id, product_ref_id, constraints? }` | Crear una nueva regla de compatibilidad.           |
| `POST`   | `/api/admin/compat/bulk`          | `{ rules: [{ style_id, format_id, product_ref_id }] }` | Crear reglas en lote — omite duplicados. Retorna `{ count: N }`. |
| `PATCH`  | `/api/admin/compat/:compatId`     | `{ constraints?, is_active? }`                         | Actualizar constraints y/o estado activo.          |
| `DELETE` | `/api/admin/compat/:compatId`     | —                                                      | Eliminar una regla (hard delete).                  |

> Todos los endpoints admin requieren JWT válido con role `admin`. Cualquier otro role retorna 403.

## 🛠️ Features

- **Sin autenticación en consultas**: Los endpoints públicos permiten que el frontend filtre opciones antes de que el usuario tenga sesión iniciada.
- **Deduplicación automática**: Las consultas usan `distinct` a nivel de SQL — nunca se retornan formatos o estilos duplicados aunque haya múltiples reglas que los referencien.
- **Solo reglas activas en público**: Los endpoints públicos filtran `isActive=true`. El admin ve todas las reglas.
- **Validación O(1)**: `/compat/check` usa la clave única compuesta `(styleId, formatId, productRefId)` directamente — no hace un `findFirst` con tres filtros.
- **Bulk con skipDuplicates**: `POST /bulk` ignora silenciosamente las filas que violarían el constraint único `@@unique([styleId, formatId, productRefId])`.
- **Tabla subyacente**: `StyleFormatProductCompat` (`style_format_product_compat`) — constraint único en `(style_id, format_id, product_ref_id)`.
