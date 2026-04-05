# Formats Module

Manages the catalog of output formats (aspect ratios and resolutions) available for AI generation. Used in combination with styles and products via the compat module.

## Files Structure

- `formats/formats.service.ts`: CRUD logic and soft delete for formats.
- `formats/formats.controller.ts`: Public endpoints for listing formats.
- `formats/admin-formats.controller.ts`: Admin-only endpoints for managing formats.
- `formats/formats.module.ts`: Module definition.
- `formats/dto/create-format.dto.ts`: DTO for format creation.
- `formats/dto/update-format.dto.ts`: DTO for format updates.

## Endpoints

### Public (`/api/formats`)

| Method | Endpoint          | Auth Required | Description                        |
| :----- | :---------------- | :------------ | :--------------------------------- |
| `GET`  | `/api/formats`    | No            | Get all active formats.            |
| `GET`  | `/api/formats/:id`| No            | Get a single format by ID.         |

### Admin (`/api/admin/formats`)

| Method   | Endpoint                      | Auth Required | Description                                     |
| :------- | :---------------------------- | :------------ | :---------------------------------------------- |
| `POST`   | `/api/admin/formats`          | Admin         | Create a new format.                            |
| `PATCH`  | `/api/admin/formats/:formatId`| Admin         | Update displayName, dimensions, or isActive.    |
| `DELETE` | `/api/admin/formats/:formatId`| Admin         | Soft delete a format (sets `isActive = false`). |

## Format Fields

| Field         | Type    | Description                                  |
| :------------ | :------ | :------------------------------------------- |
| `name`        | string  | Internal identifier (e.g. `square_1x1`).     |
| `displayName` | string  | Human-readable label (e.g. `Square 1:1`).   |
| `aspectRatio` | string  | Ratio string (e.g. `1:1`, `16:9`).          |
| `width`       | int     | Output width in pixels.                      |
| `height`      | int     | Output height in pixels.                     |
| `isActive`    | boolean | Only active formats are returned publicly.   |

## Features

- **Soft Delete**: Formats are never hard-deleted. `DELETE` sets `isActive = false`, hiding them from public endpoints while preserving existing generation references.
- **Admin Guard**: All write operations require `admin` role via `RolesGuard` + `@Roles('admin')`.
- **Public Read**: `GET` endpoints use `@Public()` — no authentication needed.
- **Ordered by name**: All list queries return formats sorted alphabetically by `name`.
