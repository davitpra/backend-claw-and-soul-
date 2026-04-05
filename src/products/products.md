# Products Module

Manages the internal catalog of `ProductReference` entities — lightweight records that link a Shopify product ID to a name and display label. Used in combination with styles and formats via the compat module to validate generation options.

## Files Structure

- `products/products.service.ts`: CRUD logic and soft delete for products.
- `products/products.controller.ts`: Public endpoints for listing products.
- `products/admin-products.controller.ts`: Admin-only endpoints for managing products.
- `products/products.module.ts`: Module definition.
- `products/dto/create-product.dto.ts`: DTO for product creation.
- `products/dto/update-product.dto.ts`: DTO for product updates (extends `CreateProductDto` via `PartialType`).

## Endpoints

### Public (`/api/products`)

| Method | Endpoint               | Auth Required | Description                     |
| :----- | :--------------------- | :------------ | :------------------------------ |
| `GET`  | `/api/products`        | No            | Get all active products.        |
| `GET`  | `/api/products/:productId` | No        | Get a single product by ID.     |

### Admin (`/api/admin/products`)

| Method   | Endpoint                         | Auth Required | Description                                       |
| :------- | :------------------------------- | :------------ | :------------------------------------------------ |
| `POST`   | `/api/admin/products`            | Admin         | Create a new product reference.                   |
| `PATCH`  | `/api/admin/products/:productId` | Admin         | Update any product field, including `isActive`.   |
| `DELETE` | `/api/admin/products/:productId` | Admin         | Soft delete a product (sets `isActive = false`).  |

## Product Fields

| Field             | Type    | Required | Description                                               |
| :---------------- | :------ | :------- | :-------------------------------------------------------- |
| `shopifyProductId`| string  | Yes      | Unique Shopify GID (e.g. `gid://shopify/Product/123`).    |
| `name`            | string  | Yes      | Internal identifier (e.g. `pet_portrait_canvas`).         |
| `displayName`     | string  | Yes      | Human-readable label (e.g. `Pet Portrait Canvas`).       |
| `description`     | string  | No       | Optional description of the product.                     |
| `isActive`        | boolean | —        | Only active products are returned publicly. Default: true.|

## Features

- **Shopify Link**: Each product stores a `shopifyProductId` (Shopify GID). This field is unique — creating or updating with a duplicate ID returns `409 Conflict`.
- **Soft Delete**: `DELETE` sets `isActive = false` instead of removing the record, preserving compat rules that reference the product.
- **Admin Guard**: All write operations require `admin` role via `RolesGuard` + `@Roles('admin')`.
- **Public Read**: `GET` endpoints use `@Public()` — no authentication needed.
- **Ordered by name**: List query returns products sorted alphabetically by `name`.
