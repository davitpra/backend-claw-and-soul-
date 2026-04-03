# 🎨 Styles Module

Manages the available artistic styles for AI generation, including categorization and pricing in credits.

## 📁 Files Structure

- `styles/styles.service.ts`: Logic for retrieving styles, categories, and pricing details.
- `styles/styles.controller.ts`: API endpoints for browsing available styles.

## 🚀 Endpoints

| Method | Endpoint                         | Query Params                          | Description                                      | Auth   |
| :----- | :------------------------------- | :------------------------------------ | :----------------------------------------------- | :----- |
| `GET`  | `/api/styles`                    | `?category=string&is_premium=boolean` | List all active styles (filterable).             | Public |
| `GET`  | `/api/styles/categories`         | —                                     | Retrieve all available style categories.         | Public |
| `GET`  | `/api/styles/category/:category` | —                                     | Fetch styles filtered by a specific category.    | Public |
| `GET`  | `/api/styles/:id`                | —                                     | Get full details for a style (includes images).  | Public |
| `GET`  | `/api/styles/:id/images`         | `?is_primary=boolean`                 | List images for a style (filterable by primary). | Public |

## 🛠️ Features

- **Public Access**: All endpoints are public, allowing users to browse styles before signing up.
- **Categorization**: Systematic filtering of styles to improve user navigation.
- **Premium Tiers**: Support for "Premium" styles; filterable via `?is_premium=true|false`.
- **Active Status**: Only "active" styles are exposed via the API.
- **Image Catalog**: Dedicated endpoint to retrieve only the images of a style, with optional `?is_primary=true|false` filter to get the primary/thumbnail image.
