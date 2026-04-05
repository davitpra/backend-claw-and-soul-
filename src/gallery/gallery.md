# Gallery Module

Public gallery of completed AI generations. No authentication required — exposes only generations marked as `isPublic: true` with `status: 'completed'`.

## Files Structure

- `gallery/gallery.service.ts`: Query logic — filters public completed generations, handles pagination and species/style filtering.
- `gallery/gallery.controller.ts`: Public API endpoints for listing and retrieving gallery items.
- `gallery/gallery.module.ts`: Module registration (relies on global `PrismaModule`).

## Endpoints

All endpoints are **public** (no JWT required).

| Method | Endpoint             | Query Params                                  | Description                                  |
| :----- | :------------------- | :-------------------------------------------- | :------------------------------------------- |
| `GET`  | `/api/gallery`       | `?style_id=uuid&species=cat&page=1&limit=20`  | List public completed generations (paginated). |
| `GET`  | `/api/gallery/:genId`| —                                             | Get detail of a single public generation.    |

## Query Parameters — GET `/api/gallery`

| Param      | Type   | Required | Description                                                  |
| :--------- | :----- | :------- | :----------------------------------------------------------- |
| `style_id` | UUID   | No       | Filter by style.                                             |
| `species`  | string | No       | Filter by pet species: `dog`, `cat`, `bird`, `rabbit`, `other`. |
| `page`     | int    | No       | Page number (default: 1).                                    |
| `limit`    | int    | No       | Items per page (default: 20, max: 100).                      |

## Response Shape

### Paginated list (`GET /api/gallery`)

```json
{
  "data": [
    {
      "id": "uuid",
      "type": "image",
      "status": "completed",
      "resultUrl": "https://...",
      "thumbnailUrl": "https://...",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "completedAt": "2024-01-01T00:00:10.000Z",
      "pet": { "name": "Luna", "species": "cat", "breed": "Siamese" },
      "style": { "id": "uuid", "name": "Watercolor", "category": "artistic" }
    }
  ],
  "meta": {
    "total": 120,
    "page": 1,
    "limit": 20,
    "totalPages": 6
  }
}
```

### Single detail (`GET /api/gallery/:genId`)

Same shape as a single item in `data` above. Returns `404` if the generation does not exist, is not public, or is not completed.

## Features

- **Fully Public**: Both endpoints use `@Public()` — no token needed.
- **Strict Visibility Filter**: Only `isPublic: true` + `status: 'completed'` records are ever returned.
- **Filtering**: Supports narrowing results by `styleId` (direct field) and `species` (via Prisma relation filter on `pet`).
- **Pagination**: Uses the shared `getPaginationParams` / `createPaginatedResult` utilities (page/limit, max 100 per page).
- **Minimal Relations**: Response includes only non-sensitive pet fields (`name`, `species`, `breed`) and style metadata (`id`, `name`, `category`).
- **404 on private/missing**: `findOnePublic` throws `NotFoundException` for any generation that is missing, private, or not yet completed — callers cannot distinguish between the cases.
