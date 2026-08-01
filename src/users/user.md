# 👥 Users Module

Manages user-related operations: profile retrieval and updates, plus the whole
account lifecycle (suspension, deletion and inactivity clean-up).

## 📁 Files Structure

- `users/users.service.ts`: Business logic for user management and database operations.
- `users/users.controller.ts`: API endpoints for user profile access.
- `users/account-status.service.ts`: **The only writer** of `User.status` / `isActive` /
  `deletedAt`. Every transition revokes live sessions and writes an `AuditLog` row.
- `users/account-lifecycle.service.ts`: Daily cron — deactivates inactive accounts and
  anonymizes accounts deleted more than 30 days ago.

## 🚀 Endpoints

| Method   | Endpoint        | Description                                          |
| :------- | :-------------- | :--------------------------------------------------- |
| `GET`    | `/api/users/me` | Fetch the authenticated user's profile details.      |
| `PATCH`  | `/api/users/me` | Update the authenticated user's profile information. |
| `DELETE` | `/api/users/me` | Delete own account (soft). Requires `confirmEmail`, plus `password` when the account has one. |

Admin-side transitions live in `admin/admin-users.controller.ts`:
`PATCH /api/admin/users/:id/status`, `DELETE /api/admin/users/:id`,
`POST /api/admin/users/:id/restore`.

## 🔄 Account lifecycle

`User.status` is a string enum: `active | banned | inactive | deleted`, and the invariant
`isActive === (status === 'active')` is maintained by `AccountStatusService` alone.

| Status     | How you get there                             | Can the user come back?                        |
| :--------- | :-------------------------------------------- | :--------------------------------------------- |
| `active`   | Default                                       | —                                              |
| `banned`   | Admin suspension (reason required)            | Only an admin can reactivate                   |
| `inactive` | Inactivity cron, or a manual admin deactivation | Yes — logging in reactivates it automatically |
| `deleted`  | Admin deletion or `DELETE /users/me`          | An admin can restore it, until it's anonymized |

Every transition revokes all refresh tokens. Because `JwtStrategy` does not hit the DB,
an access token already issued stays valid for at most 15 minutes — see `auth/auth.md`.

**Deletion is a two-stage process.** Day 0 marks `deletedAt` and cuts off access; 30 days
later `purgeDeletedUsers()` anonymizes the PII (email, name, Google id, password hash,
avatar and pet photos, including their storage objects). Generations, paint-by-numbers,
orders and expenses are deliberately **left untouched**: `OrderItem` rows point at
generations and PBNs, and deleting them would break traceability of paid orders. Orders
carry their own `customerEmail` / `customerName`, which accounting needs.

## ⚙️ Configuration

| Variable                     | Default | Meaning                                                        |
| :--------------------------- | :------ | :------------------------------------------------------------- |
| `ACCOUNT_LIFECYCLE_ENABLED`  | `false` | Master switch for the daily cron. Off unless explicitly `true`. |
| `INACTIVITY_MONTHS`          | `24`    | Months without a login (and without a new session) before an account is deactivated. |

Admins are never deactivated by the inactivity sweep: losing admin access after two quiet
years would be a worse failure than the problem it solves.

## 🛠️ Features

- **Profile Management**: Direct access to user data for the currently authenticated session.
- **Secure Updates**: Allows users to modify their personal information safely.
- **Integration**: Works in conjunction with the Auth module to ensure protected access.
- **Audit trail**: `user.banned`, `user.reactivated`, `user.deactivated`,
  `user.deactivated_inactivity`, `user.soft_deleted`, `user.restored`, `user.anonymized`.
  `AuditLog.userId` is the acting admin (null for the cron); the target is `entityId`.
