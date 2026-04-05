# Style-Compat Module

Read-only query layer that exposes, for a given style, which formats and products are compatible with it. Consumes the `StyleFormatProductCompat` table managed by the `compat` module.

## Files Structure

- `style-compat/style-compat.service.ts`: Query logic to resolve compatible formats and products for a style.
- `style-compat/style-compat.controller.ts`: Public endpoint mounted under `/api/styles`.
- `style-compat/style-compat.module.ts`: Module definition.

## Endpoints

| Method | Endpoint                       | Auth Required | Description                                          |
| :----- | :----------------------------- | :------------ | :--------------------------------------------------- |
| `GET`  | `/api/styles/:styleId/compat`  | No            | Get compatible formats and products for a style.     |

## Response Shape

```json
{
  "styleId": "uuid",
  "formats": [ ...Format ],
  "productReferences": [ ...ProductReference ],
  "compatMatrix": [
    {
      "id": "uuid",
      "formatId": "uuid",
      "productRefId": "uuid",
      "constraints": { ... }
    }
  ]
}
```

- **`formats`**: Deduplicated list of all active formats linked to this style.
- **`productReferences`**: Deduplicated list of all active product references linked to this style.
- **`compatMatrix`**: Raw compat entries — each row represents a valid (style, format, product) triplet, with optional `constraints` metadata.

## How It Works

1. Validates the style exists; throws `404` if not.
2. Queries `StyleFormatProductCompat` filtered by `styleId` and `isActive: true`, including related `format` and `productRef`.
3. Deduplicates formats and products using in-memory Maps.
4. Returns deduplicated lists alongside the full compat matrix for the frontend to build selection UI.

## Features

- **Read-Only**: No write operations. Compat rules are managed exclusively via the `compat` module.
- **Public**: Uses `@Public()` — no authentication required.
- **Deduplication**: Formats and products may appear in multiple compat rows; the response deduplicates them for easy consumption.
- **Ordered**: Compat matrix is ordered by `formatId` then `productRefId` for consistent results.
