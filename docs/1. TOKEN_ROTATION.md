# Refresh Token Rotation

This document explains the Refresh Token Rotation security feature implemented in the authentication system.

## 🔐 What is Token Rotation?

Token Rotation is a security practice where:
1. Each time a refresh token is used, it's immediately invalidated
2. A new refresh token is generated and returned
3. The old token can never be used again

## 🎯 Security Benefits

### 1. Prevents Replay Attacks
If an attacker steals a refresh token, they can only use it once. After that, it becomes invalid.

### 2. Detects Token Theft
If a token is used twice, we know something is wrong:
- The legitimate user used it → Got new token
- Attacker tries to use the old token → **DETECTED!**

### 3. Automatic Response to Threats
When token reuse is detected, the system:
- Revokes ALL tokens for that user
- Forces re-authentication
- Logs the security event

## 🔄 How It Works

```
User makes request with refresh token (Token A)
        ↓
Backend validates Token A
        ↓
Backend revokes Token A (sets isRevoked = true)
        ↓
Backend generates new tokens (Token B + new access token)
        ↓
Returns new tokens to user
        ↓
Token A is now permanently invalid
```

## 🚨 Token Reuse Detection

If someone tries to use an already-revoked token:

```
Attacker tries to use Token A (already used)
        ↓
Backend finds Token A is revoked
        ↓
🚨 SECURITY ALERT: Token reuse detected!
        ↓
Revoke ALL tokens for this user
        ↓
User must log in again
```

## 📊 Token Lifecycle

```
Login/Register
    ↓
Token Created (Active)
    ↓
Token Used for Refresh → New Token Created → Old Token Revoked
    ↓
Token Expires (7 days) or User Logs Out
    ↓
Token Deleted (Cleanup job)
```

## 🧹 Automatic Cleanup

The system automatically cleans up old tokens:

### Daily Cleanup (3 AM)
- Deletes expired tokens
- Deletes revoked tokens older than 30 days

### Per-User Limits
- Maximum 5 active sessions per user
- When limit exceeded, oldest sessions are revoked

### Manual Cleanup
```typescript
// In auth-cleanup.service.ts
await authCleanupService.manualCleanup();
```

## 💻 Implementation Details

### Backend Code

```typescript
// auth.service.ts - refreshToken method
async refreshToken(refreshToken: string) {
  // 1. Validate token
  const storedToken = await this.prisma.refreshToken.findUnique({
    where: { token: refreshToken },
  });

  // 2. Check for reuse (SECURITY)
  if (storedToken.isRevoked) {
    // Token reuse detected!
    await this.revokeAllUserTokens(storedToken.userId);
    throw new UnauthorizedException('Invalid refresh token');
  }

  // 3. Revoke old token
  await this.prisma.refreshToken.update({
    where: { id: storedToken.id },
    data: { isRevoked: true },
  });

  // 4. Generate new tokens
  const newTokens = await this.generateTokens(
    payload.sub,
    payload.email,
    payload.role
  );

  return newTokens;
}
```

## 📱 User Session Management

Users can view and manage their active sessions:

### View Active Sessions
```
GET /api/auth/sessions
```

Returns list of active sessions with:
- Session ID
- Creation date
- Expiration date

### Revoke Specific Session
```
POST /api/auth/sessions/revoke/:tokenId
```

### Revoke All Other Sessions
```
POST /api/auth/sessions/revoke-all
```

This is useful when:
- User suspects unauthorized access
- User wants to log out from all other devices
- User lost a device

## 🔍 Monitoring & Logging

The system logs important events:

```typescript
// Token rotation
logger.log(`Rotating refresh token for user ${userId}. Old token revoked.`);

// Token reuse detection
logger.warn(`Token reuse detected for user ${userId}. Revoking all tokens.`);

// Cleanup
logger.log(`Cleaned up ${count} expired tokens`);

// Session limits
logger.log(`Revoked ${count} oldest tokens for user ${userId} (limit: 5)`);
```

## ⚙️ Configuration

### Token Lifetimes
```env
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
```

### Session Limits
```typescript
// In auth.service.ts - generateTokens method
await this.limitActiveTokens(userId, 5); // Max 5 active sessions
```

### Cleanup Schedule
```typescript
// In auth-cleanup.service.ts
@Cron(CronExpression.EVERY_DAY_AT_3AM)
async cleanupExpiredTokens() { ... }
```

## 🧪 Testing Token Rotation

### Test Basic Rotation
```bash
# 1. Login
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password"}' \
  -c cookies.txt

# 2. Refresh token (first time - should work)
curl -X POST http://localhost:3001/api/auth/refresh \
  -b cookies.txt \
  -c cookies2.txt

# 3. Try to refresh with old token (should fail)
curl -X POST http://localhost:3001/api/auth/refresh \
  -b cookies.txt
# Expected: 401 Unauthorized + all tokens revoked
```

### Test Session Management
```bash
# View active sessions
curl http://localhost:3001/api/auth/sessions \
  -b cookies.txt

# Revoke all other sessions
curl -X POST http://localhost:3001/api/auth/sessions/revoke-all \
  -b cookies.txt
```

## 📈 Best Practices

1. **Monitor Logs**: Watch for token reuse warnings
2. **Educate Users**: Teach users about session management
3. **Set Limits**: Don't allow unlimited sessions per user
4. **Regular Cleanup**: Keep the token database clean
5. **Audit Trail**: Log all token-related security events

## 🔗 Related Documentation

- [Token Lifecycle](./TOKEN_LIFECYCLE.md)
- [Security Best Practices](./SECURITY.md)
- [API Documentation](./API.md)
