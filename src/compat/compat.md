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

## 📐 El campo `constraints`

`constraints` es un `Json?` opcional en cada fila de `StyleFormatProductCompat`. Su propósito es almacenar **overrides y reglas que dependen de la combinación específica (style, format, product)** — es decir, cosas que no se pueden expresar en `Style.parameters`, `Format.width/height` ni `ProductReference` por separado, porque cambian según el cruce de los tres ejes.

> **Estado actual**: el campo se persiste, se expone en `/api/compat/check` y en `/api/styles/:styleId/compat`, pero **la pipeline de generación todavía no lo lee**. Antes de cablear cualquier override hay que decidir su forma exacta y añadir el merge correspondiente en `generations.service.ts` (donde hoy se toman `width/height` directo del DTO del cliente).

### Forma esperada (propuesta)

```jsonc
{
  // --- Pipeline IA ---
  "maxPets": 1,                       // cuántas mascotas puede contener la generación
  "outputWidth": 2048,                // override de Format.width para esta combinación
  "outputHeight": 2048,               // override de Format.height
  "upscale": 2,                       // factor de upscaling adicional
  "falModelOverride": "fal-ai/flux-pro",
  "promptSuffix": ", centered composition, white background",
  "negativePromptAdditions": "text, watermark, low quality",
  "inferenceSteps": 50,
  "guidanceScale": 7.5,
  "variantCount": 4,                  // cuántas variantes generar para que el usuario elija

  // --- Composición / encuadre ---
  "cropMode": "subject-centered",     // subject-centered | full-body | head-only
  "backgroundType": "transparent",    // transparent | solid | scene
  "safeZoneMm": { "top": 5, "bottom": 5, "left": 3, "right": 3 },

  // --- Producto físico (impresión) ---
  "dpi": 300,                         // 300 para imprenta, 72 para digital
  "colorProfile": "CMYK",             // CMYK para impresión, sRGB para pantalla
  "bleedMm": 3,

  // --- Reglas de negocio por combinación ---
  "isPremiumOverride": true,          // combo premium aunque el style no lo sea
  "minPetPhotos": 2,                  // requiere mínimo N fotos del pet
  "allowedSpecies": ["dog"],          // restringe especies para este combo
  "maxProcessingSeconds": 60          // timeout específico
}
```

Todas las claves son opcionales. Solo se persiste lo que aplica a esa combinación.

### Casos de uso

**🎨 Pipeline de generación IA**

| Constraint            | Por qué vive aquí (no en Style/Format)                                                                       |
| :-------------------- | :----------------------------------------------------------------------------------------------------------- |
| `maxPets`             | Un mismo estilo "Renaissance portrait" admite 1 mascota en taza pero hasta 3 en póster — depende del producto. |
| `outputWidth/Height`  | `Format` define dimensiones por defecto, pero un canvas grande puede requerir resolución mayor que un sticker. |
| `falModelOverride`    | El modelo del style puede no servir para un formato vertical extremo o para un producto que necesita transparencia. |
| `promptSuffix`        | "white background, centered" tiene sentido en taza pero rompe la composición en póster grande.                 |
| `variantCount`        | En digital genero 4 variantes (barato), en canvas solo 1 (compromiso de impresión).                          |

**🖼️ Composición y encuadre**

- `cropMode`: una taza necesita el sujeto centrado y completo; un poster panorámico admite plano americano.
- `backgroundType`: stickers y t-shirts requieren fondo transparente; un cuadro lo necesita escenificado.
- `safeZoneMm`: el área "viva" de impresión cambia según el producto físico.

**🖨️ Especificaciones del producto físico**

- `dpi`, `colorProfile`, `bleedMm`: solo aplican si el producto es físico. Una taza imprime CMYK 300 dpi con 3mm de sangrado; un download digital es sRGB 72 dpi sin sangrado.
- Estos valores no van en `ProductReference` porque pueden variar también por formato (un mismo producto en formato A4 vs A3 cambia bleed).

**📋 Reglas de negocio por combinación**

- `isPremiumOverride`: vendes un estilo gratuito, pero su variante en canvas grande es premium.
- `minPetPhotos`: estilos hiperrealistas en formatos grandes pueden exigir 2-3 ángulos del pet para mejor calidad.
- `allowedSpecies`: ciertos estilos solo funcionan con perros (p. ej. "knight in shining armor"). Aunque podría ir en `Style`, si la restricción depende también del formato/producto debe estar aquí.
- `maxProcessingSeconds`: combinaciones premium pueden permitirse pipelines más lentos.

### Cuándo NO usar `constraints`

Si una regla depende de **un solo eje**, debe vivir en su entidad correspondiente, no aquí:

- Características generales del estilo → `Style.parameters` o `Style.templateVars`.
- Dimensiones por defecto del formato → `Format.width/height`.
- Metadata del producto → `ProductReference`.
- Configuración global del proveedor IA → variables de entorno o `Style.falModel`.

`constraints` es exclusivamente para overrides que solo tienen sentido **en el cruce de los tres ejes**. Si la misma regla aplica a todos los productos de un estilo, ponla en `Style`. Si aplica a todos los estilos de un formato, ponla en `Format`.

## 🛠️ Features

- **Sin autenticación en consultas**: Los endpoints públicos permiten que el frontend filtre opciones antes de que el usuario tenga sesión iniciada.
- **Deduplicación automática**: Las consultas usan `distinct` a nivel de SQL — nunca se retornan formatos o estilos duplicados aunque haya múltiples reglas que los referencien.
- **Solo reglas activas en público**: Los endpoints públicos filtran `isActive=true`. El admin ve todas las reglas.
- **Validación O(1)**: `/compat/check` usa la clave única compuesta `(styleId, formatId, productRefId)` directamente — no hace un `findFirst` con tres filtros.
- **Bulk con skipDuplicates**: `POST /bulk` ignora silenciosamente las filas que violarían el constraint único `@@unique([styleId, formatId, productRefId])`.
- **Tabla subyacente**: `StyleFormatProductCompat` (`style_format_product_compat`) — constraint único en `(style_id, format_id, product_ref_id)`.
