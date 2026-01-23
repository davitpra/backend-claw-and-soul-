# 🐾 Pets Module

Manages comprehensive pet profiles, including species categorization and photo galleries.

## 📁 Files Structure

- `pets/pets.service.ts`: Business logic for pet management, ownership validation, and photo handling.
- `pets/pets.controller.ts`: API endpoints for CRUD operations on pets.

## 🚀 Endpoints

| Method   | Endpoint        | Description                                                     |
| :------- | :-------------- | :-------------------------------------------------------------- |
| `POST`   | `/api/pets`     | Create a new pet profile.                                       |
| `GET`    | `/api/pets`     | List all pets belonging to the authenticated user.              |
| `GET`    | `/api/pets/:id` | Retrieve detailed information for a specific pet.               |
| `PATCH`  | `/api/pets/:id` | Update an existing pet's information.                           |
| `DELETE` | `/api/pets/:id` | Soft delete a pet profile (removes from view but keeps record). |

## 🛠️ Features

- **Ownership Validation**: Ensures users can only access or modify their own pet data.
- **Photo Management**:
  - Upload and manage multiple photos per pet.
  - Set primary photos and define display order.
- **Species Support**: Categorization for various species (`Dog`, `Cat`, `Bird`, `Rabbit`, `Other`).
- **Data Integrity**: **Soft deletion** mechanism to prevent accidental permanent data loss.
- **Scalability**: Designed to handle multiple pets per user seamlessly.
