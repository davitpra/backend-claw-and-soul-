# 🔐 Auth Module

Implements the complete authentication flow as defined in the project flowchart (sections 1.1-1.3).

## 📁 Files Structure

- `auth/auth.service.ts`: Core logic for authentication and token management.
- `auth/auth.controller.ts`: API endpoints exposure.
- `auth/strategies/jwt.strategy.ts`: JWT validation strategy.

## 🚀 Endpoints

| Method | Endpoint             | Description                                                               |
| :----- | :------------------- | :------------------------------------------------------------------------ |
| `POST` | `/api/auth/register` | User registration with automatic credit initialization (10 free credits). |
| `POST` | `/api/auth/login`    | User login returning JWT tokens (Access & Refresh).                       |
| `POST` | `/api/auth/refresh`  | Refresh the access token using a valid refresh token.                     |
| `POST` | `/api/auth/logout`   | Revoke the refresh token and clear session.                               |

## 🛠️ Features

- **Password Hashing**: Secure storage using `bcrypt` (12 rounds).
- **JWT Management**:
  - **Access Tokens**: Short-lived (15 minutes expiry).
  - **Refresh Tokens**: Long-lived (7 days expiry).
- **Credit System**: Automatic initialization of 10 free credits upon successful registration.
- **Token Security**: Refresh token storage in the database for session management and revocation.
