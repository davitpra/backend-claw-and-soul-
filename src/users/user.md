# 👥 Users Module

Manages user-related operations, including profile retrieval and updates.

## 📁 Files Structure

- `users/users.service.ts`: Business logic for user management and database operations.
- `users/users.controller.ts`: API endpoints for user profile access.

## 🚀 Endpoints

| Method  | Endpoint        | Description                                          |
| :------ | :-------------- | :--------------------------------------------------- |
| `GET`   | `/api/users/me` | Fetch the authenticated user's profile details.      |
| `PATCH` | `/api/users/me` | Update the authenticated user's profile information. |

## 🛠️ Features

- **Profile Management**: Direct access to user data for the currently authenticated session.
- **Secure Updates**: Allows users to modify their personal information safely.
- **Integration**: Works in conjunction with the Auth module to ensure protected access.
