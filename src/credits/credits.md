# 💰 Credits Module

Implements the complete credit management system as defined in the project flowchart (section 4).

## 📁 Files Structure

- `credits/credits.service.ts`: Core logic for credit balance, transactions, and integrity.
- `credits/credits.controller.ts`: API endpoints for balance and history retrieval.

## 🚀 Endpoints

| Method | Endpoint                    | Description                                               |
| :----- | :-------------------------- | :-------------------------------------------------------- |
| `GET`  | `/api/credits/balance`      | Retrieve the authenticated user's current credit balance. |
| `GET`  | `/api/credits/transactions` | Get a paginated history of all credit movements.          |

## 🛠️ Features

- **Transaction Integrity**: Uses **Pessimistic Locking** to prevent race conditions during credit updates.
- **Detailed Tracking**:
  - Real-time balance monitoring.
  - Cumulative tracking of total earned and total spent credits.
- **Transaction Types**: Full support for `EARNED`, `SPENT`, `REFUND`, and `BONUS` types.
- **Fail-Safe Mechanism**: **Automatic refunds** implemented for failed AI generations.
- **History**: Complete audit trail of all user transactions with pagination support.
