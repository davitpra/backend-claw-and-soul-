# Pets Module

Manages comprehensive pet profiles, including species categorization and photo galleries.

## Files Structure

- `pets/pets.service.ts`: Business logic for pet management, ownership validation, and photo handling.
- `pets/pets.controller.ts`: API endpoints for CRUD operations on pets.
- `pets/dto/create-pet.dto.ts`: DTO for creating a pet (`name`, `species`, `breed?`, `age?`, `description?`).
- `pets/dto/update-pet.dto.ts`: DTO for updating a pet (same fields, all optional).

## Endpoints

| Method   | Endpoint                        | Description                                                     | Auth |
| :------- | :------------------------------ | :-------------------------------------------------------------- | :--- |
| `POST`   | `/api/pets`                     | Create a new pet profile.                                       | JWT  |
| `GET`    | `/api/pets`                     | List all pets belonging to the authenticated user.              | JWT  |
| `GET`    | `/api/pets/:id`                 | Retrieve detailed information for a specific pet.               | JWT  |
| `PATCH`  | `/api/pets/:id`                 | Update an existing pet's information.                           | JWT  |
| `DELETE` | `/api/pets/:id`                 | Soft delete a pet profile (`isActive = false`).                 | JWT  |
| `POST`   | `/api/pets/:id/photos`          | Upload a photo for a pet (`multipart/form-data`, field: `photo`). Query: `?isPrimary=true`. | JWT  |
| `GET`    | `/api/pets/:id/photos`          | List all photos of a pet, ordered by `orderIndex`.              | JWT  |
| `PATCH`  | `/api/pets/:id/photos/:photoId` | Update a photo's `order_index` and/or `is_primary`.             | JWT  |
| `DELETE` | `/api/pets/:id/photos/:photoId` | Delete a pet photo (also removes from S3).                      | JWT  |

## DTOs

### CreatePetDto / UpdatePetDto

| Field         | Type     | Required | Constraints                                  |
| :------------ | :------- | :------- | :------------------------------------------- |
| `name`        | `string` | Yes      | Max 100 chars                                |
| `species`     | `string` | Yes      | `dog`, `cat`, `bird`, `rabbit`, `other`      |
| `breed`       | `string` | No       | Max 100 chars                                |
| `age`         | `number` | No       | Integer                                      |
| `description` | `string` | No       | Max 500 chars                                |

### PATCH `/api/pets/:id/photos/:photoId` — Body

| Field         | Type      | Required |
| :------------ | :-------- | :------- |
| `order_index` | `number`  | No       |
| `is_primary`  | `boolean` | No       |

> Si `is_primary: true`, se desactiva el flag en todas las demás fotos de la mascota automáticamente.

## Features

- **Ownership Validation**: Users can only access or modify their own pet data.
- **Photo Management**: Upload multiple photos per pet via S3. Supports primary photo flag and display order.
- **Species Support**: `dog`, `cat`, `bird`, `rabbit`, `other`.
- **Soft Deletion**: Sets `isActive = false` instead of deleting the record.
