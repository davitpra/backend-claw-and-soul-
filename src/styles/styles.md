# 🎨 Styles Module

Manages the available artistic styles for AI generation, including categorization and pricing in credits.

## 📁 Files Structure

- `styles/styles.service.ts`: Logic for retrieving styles, categories, and pricing details.
- `styles/styles.controller.ts`: API endpoints for browsing available styles.

## 🚀 Endpoints

| Method | Endpoint                         | Description                                                     | Auth   |
| :----- | :------------------------------- | :-------------------------------------------------------------- | :----- |
| `GET`  | `/api/styles`                    | List all active artistic styles.                                | Public |
| `GET`  | `/api/styles/categories`         | Retrieve all available style categories.                        | Public |
| `GET`  | `/api/styles/category/:category` | Fetch styles filtered by a specific category.                   | Public |
| `GET`  | `/api/styles/:id`                | Get full details for a specific style (description, cost, etc). | Public |

## 🛠️ Features

- **Public Access**: All endpoints are public, allowing users to browse styles before signing up.
- **Categorization**: Systematic filtering of styles to improve user navigation.
- **Credit Economics**: Each style has an associated cost in credits.
- **Premium Tiers**: Support for "Premium" styles that may have different requirements or costs.
- **Active Status**: Only "active" styles are exposed via the API.
