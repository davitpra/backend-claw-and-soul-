# 🎨 Styles Module

Manages the available artistic styles for AI generation, including categorization, image catalog, and admin management.

## 📁 Files Structure

- `styles/styles.service.ts`: All business logic — read and write operations for styles and their images.
- `styles/styles.controller.ts`: Public API endpoints for browsing available styles.
- `styles/admin-styles.controller.ts`: Admin-only endpoints for managing styles and images (role = admin).
- `styles/dto/create-style.dto.ts`: DTO for creating a new style.
- `styles/dto/update-style.dto.ts`: DTO for partial updates (extends CreateStyleDto via PartialType).

## 🚀 Public Endpoints

| Method | Endpoint                         | Query Params                          | Description                                      | Auth   |
| :----- | :------------------------------- | :------------------------------------ | :----------------------------------------------- | :----- |
| `GET`  | `/api/styles`                    | `?category=string&is_premium=boolean` | List all active styles (filterable).             | Public |
| `GET`  | `/api/styles/categories`         | —                                     | Retrieve all available style categories.         | Public |
| `GET`  | `/api/styles/category/:category` | —                                     | Fetch styles filtered by a specific category.    | Public |
| `GET`  | `/api/styles/:id`                | —                                     | Get full details for a style (includes images).  | Public |
| `GET`  | `/api/styles/:id/images`         | `?is_primary=boolean`                 | List images for a style (filterable by primary). | Public |

## 🔐 Admin Endpoints (role = admin)

| Method   | Endpoint                                    | Body / Params                                       | Description                        |
| :------- | :------------------------------------------ | :-------------------------------------------------- | :--------------------------------- |
| `POST`   | `/api/admin/styles`                         | `{ name, display_name, category, parameters, ... }` | Create a new style.                |
| `PATCH`  | `/api/admin/styles/:styleId`                | `{ display_name, parameters, is_premium, ... }`     | Partially update a style.          |
| `DELETE` | `/api/admin/styles/:styleId`                | —                                                   | Soft delete (sets `isActive=false`). |
| `POST`   | `/api/admin/styles/:styleId/images`         | `multipart/form-data: file, caption?, order_index?` | Upload an image to the catalog.    |
| `DELETE` | `/api/admin/styles/:styleId/images/:imgId`  | —                                                   | Delete an image from the catalog.  |

> All admin endpoints require a valid JWT with role `admin`. Any other role returns 403.

## 🛠️ Features

- **Public Access**: Read endpoints are public — users can browse styles before signing up.
- **Categorization**: Filter by category via query param or dedicated route.
- **Premium Tiers**: Styles can be flagged as premium; filterable via `?is_premium=true|false`.
- **Active Status**: Only `isActive=true` styles appear in public endpoints. Soft delete sets `isActive=false`.
- **Image Catalog**: Each style has an ordered image collection. Primary images filterable via `?is_primary=true`.
- **Cloudinary Storage**: Style images are uploaded to Cloudinary; `storageKey` is the Cloudinary public_id used for deletion.
