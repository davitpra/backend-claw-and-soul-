# Auth Module

Implements the complete authentication flow with JWT tokens stored in httpOnly cookies.

## Files Structure

- `auth/auth.service.ts`: Core logic for authentication, token management, and session control.
- `auth/auth.controller.ts`: API endpoints exposure.
- `auth/auth-cleanup.service.ts`: Scheduled cleanup of expired/revoked tokens.
- `auth/strategies/jwt.strategy.ts`: JWT validation strategy (reads token from httpOnly cookie).
- `auth/dto/`: DTOs for register, login, and refresh token.

## Endpoints

| Method | Endpoint                        | Auth Required | Description                                          |
| :----- | :------------------------------ | :------------ | :--------------------------------------------------- |
| `POST` | `/api/auth/register`            | No            | User registration. Returns user data + sets cookies. |
| `POST` | `/api/auth/login`               | No            | User login. Returns user data + sets cookies.        |
| `POST` | `/api/auth/refresh`             | No            | Refresh access token from httpOnly cookie.           |
| `POST` | `/api/auth/logout`              | No            | Revoke refresh token and clear cookies.              |
| `GET`  | `/api/auth/me`                  | Yes           | Get current authenticated user from JWT payload.    |
| `GET`  | `/api/auth/sessions`            | Yes           | List all active sessions for current user.           |
| `POST` | `/api/auth/sessions/revoke/:id` | Yes           | Revoke a specific session by token ID.               |
| `POST` | `/api/auth/sessions/revoke-all` | Yes           | Revoke all sessions except the current one.          |

## Features

- **Password Hashing**: Secure storage using `bcrypt` (12 rounds).
- **JWT via httpOnly Cookies**: Tokens are never exposed in response bodies.
  - **Access Token**: 15 minutes expiry (`accessToken` cookie).
  - **Refresh Token**: 7 days expiry (`refreshToken` cookie).
- **Token Rotation**: On each refresh, the old refresh token is revoked and a new one is issued.
- **Token Reuse Detection**: If a revoked token is used again, all tokens for that user are immediately revoked (security measure).
- **Session Limiting**: Max 5 active refresh tokens per user; oldest are revoked when exceeded.
- **Automatic Cleanup**: Expired and revoked tokens are deleted from the DB on each login/register.
- **No Credit System**: All generations are free and unlimited. Registration does not initialize credits.
