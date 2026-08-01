import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { CreditsService } from '../credits/credits.service';
import { AccountStatusService } from '../users/account-status.service';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import type { User } from '@prisma/client';
import type { JwtPayload } from './strategies/jwt.strategy';

export interface DeviceInfo {
  userAgent?: string;
  ipAddress?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  // Créditos de generación gratis otorgados al registrarse.
  private static readonly SIGNUP_BONUS_CREDITS = 5;

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private creditsService: CreditsService,
    private accountStatus: AccountStatusService,
  ) {}

  /**
   * Traduce el estado de la cuenta a lo que puede hacer un login.
   *
   * `inactive` (baja automática por inactividad) se reactiva sola: volver a
   * entrar ya es prueba de que la cuenta sigue en uso, y sin proveedor de email
   * no hay forma de pedir una confirmación aparte. `banned` y `deleted` nunca se
   * reactivan solos.
   *
   * Devuelve la fila vigente: al reactivar, la que acaba de escribirse.
   */
  private async assertCanLogIn(user: User): Promise<User> {
    switch (user.status) {
      case 'active':
        return user;
      case 'inactive':
        return this.accountStatus.reactivateOnLogin(user.id);
      case 'banned':
        throw new UnauthorizedException('Account suspended');
      default:
        // `deleted`: se responde igual que con credenciales incorrectas para no
        // revelar que la cuenta existió.
        throw new UnauthorizedException('Invalid credentials');
    }
  }

  async register(registerDto: RegisterDto, deviceInfo?: DeviceInfo) {
    // Check if user exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: registerDto.email },
    });

    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(registerDto.password, 12);

    try {
      // Crear usuario y otorgar el bono de bienvenida en la misma transacción:
      // el crédito entra por el ledger (idempotente vía unique signup_bonus+userId).
      const user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            email: registerDto.email,
            passwordHash: hashedPassword,
            fullName: registerDto.fullName,
          },
        });
        await this.creditsService.grant(
          created.id,
          AuthService.SIGNUP_BONUS_CREDITS,
          'signup_bonus',
          created.id,
          'signup',
          tx,
        );
        return created;
      });

      this.logger.log(`New user registered: ${user.email}`);

      // Generate tokens
      const tokens = await this.generateTokens(
        user.id,
        user.email,
        user.role,
        deviceInfo,
      );

      return {
        user: this.sanitizeUser(user),
        ...tokens,
      };
    } catch (error) {
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error('Registration failed', stack);
      throw error;
    }
  }

  async login(loginDto: LoginDto, deviceInfo?: DeviceInfo) {
    let user = await this.prisma.user.findUnique({
      where: { email: loginDto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Users created via Google have no password set
    if (!user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    user = await this.assertCanLogIn(user);

    // Update last login
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    this.logger.log(`User logged in: ${user.email}`);

    // Replace any existing active session for the SAME device so a browser that
    // re-logs in keeps a single active session (avoids "same device appearing
    // as multiple devices" in the active-sessions list).
    if (deviceInfo?.userAgent) {
      const replaced = await this.prisma.refreshToken.updateMany({
        where: {
          userId: user.id,
          isRevoked: false,
          userAgent: deviceInfo.userAgent,
        },
        data: { isRevoked: true },
      });
      if (replaced.count > 0) {
        this.logger.log(
          `Revoked ${replaced.count} previous session(s) for the same device of user ${user.id}`,
        );
      }
    }

    const tokens = await this.generateTokens(
      user.id,
      user.email,
      user.role,
      deviceInfo,
    );

    return {
      user: this.sanitizeUser(user),
      ...tokens,
    };
  }

  async loginWithGoogle(idToken: string, deviceInfo?: DeviceInfo) {
    const clientId = this.configService.get<string>('google.clientId');

    if (!clientId) {
      this.logger.error('GOOGLE_CLIENT_ID is not configured');
      throw new UnauthorizedException('Google sign-in is not available');
    }

    // Verify the ID token signature, audience and expiration with Google
    let payload: import('google-auth-library').TokenPayload | undefined;
    try {
      const client = new OAuth2Client(clientId);
      const ticket = await client.verifyIdToken({
        idToken,
        audience: clientId,
      });
      payload = ticket.getPayload();
    } catch (error) {
      this.logger.warn('Google ID token verification failed', error as Error);
      throw new UnauthorizedException('Invalid Google token');
    }

    if (!payload?.email || !payload.email_verified) {
      throw new UnauthorizedException('Google account email is not verified');
    }

    const email = payload.email;
    const googleId = payload.sub;

    // Find-or-create / link by email
    let user = await this.prisma.user.findUnique({ where: { email } });

    if (user) {
      // El estado se comprueba ANTES de tocar nada: una cuenta suspendida o dada
      // de baja no debe pasar siquiera por el backfill de perfil.
      user = await this.assertCanLogIn(user);

      // Link the Google identity to the existing account and backfill profile
      // fields that are still empty.
      const data: { googleId?: string; fullName?: string; avatarUrl?: string } =
        {};
      if (!user.googleId) data.googleId = googleId;
      if (!user.fullName && payload.name) data.fullName = payload.name;
      if (!user.avatarUrl && payload.picture) data.avatarUrl = payload.picture;

      if (Object.keys(data).length > 0) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data,
        });
      }
    } else {
      // Nuevo usuario vía Google: crear y otorgar el bono en la misma transacción.
      user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            email,
            googleId,
            fullName: payload.name,
            avatarUrl: payload.picture,
            emailVerified: true,
          },
        });
        await this.creditsService.grant(
          created.id,
          AuthService.SIGNUP_BONUS_CREDITS,
          'signup_bonus',
          created.id,
          'signup',
          tx,
        );
        return created;
      });
      this.logger.log(`New user registered via Google: ${user.email}`);
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    this.logger.log(`User logged in via Google: ${user.email}`);

    // Keep a single active session per device, mirroring login()
    if (deviceInfo?.userAgent) {
      await this.prisma.refreshToken.updateMany({
        where: {
          userId: user.id,
          isRevoked: false,
          userAgent: deviceInfo.userAgent,
        },
        data: { isRevoked: true },
      });
    }

    const tokens = await this.generateTokens(
      user.id,
      user.email,
      user.role,
      deviceInfo,
    );

    return {
      user: this.sanitizeUser(user),
      ...tokens,
    };
  }

  async refreshToken(refreshToken: string) {
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(
        refreshToken,
        {
          secret: this.configService.get<string>('jwt.refreshSecret'),
        },
      );

      // Check if refresh token exists and is not revoked
      const storedToken = await this.prisma.refreshToken.findUnique({
        where: { token: this.hashToken(refreshToken) },
      });

      if (!storedToken || storedToken.isRevoked) {
        // SECURITY: Token reuse detected - possible attack
        // Revoke all tokens for this user as a security measure
        if (storedToken) {
          this.logger.warn(
            `Token reuse detected for user ${storedToken.userId}. Revoking all tokens.`,
          );
          await this.revokeAllUserTokens(storedToken.userId);
        }
        throw new UnauthorizedException('Invalid refresh token');
      }

      if (new Date() > storedToken.expiresAt) {
        throw new UnauthorizedException('Refresh token expired');
      }

      // El estado de la cuenta vive en la base, no en el JWT: sin esta lectura,
      // una cuenta suspendida seguiría renovando su sesión durante los 7 días de
      // vida del refresh token. Aquí sí se relee (una vez cada 15 min), a
      // diferencia de JwtStrategy, que no puede permitirse una query por request.
      const owner = await this.prisma.user.findUnique({
        where: { id: storedToken.userId },
        select: { status: true },
      });

      if (!owner || owner.status !== 'active') {
        await this.revokeAllUserTokens(storedToken.userId);
        throw new UnauthorizedException('Account is not active');
      }

      // TOKEN ROTATION (atomic): revoke the old token with an isRevoked:false
      // guard so two concurrent refreshes using the same cookie cannot both
      // proceed and create duplicate active rows for one device. Only the
      // refresh that actually flips the row (count === 1) is allowed to mint a
      // new token; the loser aborts.
      const revoked = await this.prisma.refreshToken.updateMany({
        where: { id: storedToken.id, isRevoked: false },
        data: { isRevoked: true },
      });

      if (revoked.count === 0) {
        // Lost the race: another concurrent refresh already rotated this token.
        throw new UnauthorizedException('Invalid refresh token');
      }

      this.logger.log(
        `Rotating refresh token for user ${payload.sub}. Old token revoked.`,
      );

      // Generate new tokens (including a new refresh token), inheriting the
      // rotated token's device identity so the session keeps its label.
      const tokens = await this.generateTokens(
        payload.sub,
        payload.email,
        payload.role,
        {
          userAgent: storedToken.userAgent ?? undefined,
          ipAddress: storedToken.ipAddress ?? undefined,
        },
      );

      return tokens;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      this.logger.error('Error refreshing token:', error);
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async logout(refreshToken: string) {
    // updateMany (not update) so a missing/stale token does not throw; the
    // count tells us whether the cookie actually matched an active session.
    const result = await this.prisma.refreshToken.updateMany({
      where: { token: this.hashToken(refreshToken) },
      data: { isRevoked: true },
    });

    if (result.count === 0) {
      this.logger.warn(
        'Logout called with a refresh token that matched no session (stale cookie?).',
      );
    }

    return { message: 'Logged out successfully' };
  }

  /**
   * Get all active sessions for a user
   */
  async getActiveSessions(userId: string, currentToken?: string) {
    const hashedCurrent = currentToken
      ? this.hashToken(currentToken)
      : undefined;

    const sessions = await this.prisma.refreshToken.findMany({
      where: {
        userId,
        isRevoked: false,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        token: true,
        createdAt: true,
        expiresAt: true,
        lastUsedAt: true,
        userAgent: true,
        ipAddress: true,
      },
      orderBy: { lastUsedAt: 'desc' },
    });

    return {
      sessions: sessions.map((session) => ({
        id: session.id,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
        lastUsedAt: session.lastUsedAt,
        userAgent: session.userAgent,
        ipAddress: session.ipAddress,
        isCurrent: hashedCurrent ? session.token === hashedCurrent : false,
      })),
      total: sessions.length,
    };
  }

  /**
   * Revoke a specific session by token ID
   */
  async revokeSession(userId: string, tokenId: string) {
    // Ensure the token belongs to the user (outside try/catch so the 404
    // is not swallowed by the generic catch below)
    const token = await this.prisma.refreshToken.findFirst({
      where: { id: tokenId, userId },
    });

    if (!token) {
      throw new UnauthorizedException('Session not found');
    }

    try {
      await this.prisma.refreshToken.update({
        where: { id: tokenId },
        data: { isRevoked: true },
      });
    } catch (error) {
      this.logger.error(`Failed to revoke session ${tokenId}:`, error);
      throw new UnauthorizedException('Failed to revoke session');
    }

    this.logger.log(`Session ${tokenId} revoked for user ${userId}`);
    return { message: 'Session revoked successfully' };
  }

  /**
   * Revoke all sessions except the current one
   */
  async revokeAllOtherSessions(userId: string, currentToken?: string) {
    try {
      const hashedCurrent = currentToken
        ? this.hashToken(currentToken)
        : undefined;
      const result = await this.prisma.refreshToken.updateMany({
        where: {
          userId,
          isRevoked: false,
          ...(hashedCurrent && { token: { not: hashedCurrent } }),
        },
        data: { isRevoked: true },
      });

      this.logger.log(
        `Revoked ${result.count} other sessions for user ${userId}`,
      );

      return {
        message: 'All other sessions revoked successfully',
        count: result.count,
      };
    } catch {
      throw new UnauthorizedException('Failed to revoke sessions');
    }
  }

  private async generateTokens(
    userId: string,
    email: string,
    role: string,
    deviceInfo?: DeviceInfo,
  ) {
    const payload = { sub: userId, email, role };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('jwt.accessSecret'),
        expiresIn: this.configService.get<string>('jwt.accessExpiresIn'),
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
        expiresIn: this.configService.get<string>('jwt.refreshExpiresIn'),
      }),
    ]);

    // Clean up old/expired tokens for this user before creating a new one
    await this.cleanupExpiredTokens(userId);

    // Limit active refresh tokens per user (security measure)
    await this.limitActiveTokens(userId, 5); // Max 5 active sessions

    // Store hashed refresh token in database (Fix 1: never store raw tokens)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    await this.prisma.refreshToken.create({
      data: {
        userId,
        token: this.hashToken(refreshToken),
        expiresAt,
        userAgent: deviceInfo?.userAgent,
        ipAddress: deviceInfo?.ipAddress,
      },
    });

    return {
      accessToken,
      refreshToken,
    };
  }

  /** SHA-256 hash of a token before DB storage/lookup */
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private sanitizeUser(user: User): Omit<User, 'passwordHash'> {
    const { passwordHash, ...result } = user;
    void passwordHash;
    return result;
  }

  /**
   * Revoke all refresh tokens for a user
   * Used when token reuse is detected (security measure)
   */
  private async revokeAllUserTokens(userId: string): Promise<void> {
    try {
      await this.prisma.refreshToken.updateMany({
        where: {
          userId,
          isRevoked: false,
        },
        data: {
          isRevoked: true,
        },
      });

      this.logger.warn(
        `All refresh tokens revoked for user ${userId} due to security concern`,
      );
    } catch (error) {
      this.logger.error('Error revoking user tokens:', error);
    }
  }

  /**
   * Clean up only date-expired tokens for a user.
   *
   * Fix 3: Revoked tokens are intentionally NOT deleted here. They must remain
   * in the DB long enough for the reuse-detection logic in refreshToken() to
   * fire (i.e., return isRevoked=true → revoke all sessions). The daily cron
   * job in AuthCleanupService removes revoked tokens after 30 days.
   */
  private async cleanupExpiredTokens(userId: string): Promise<void> {
    try {
      const result = await this.prisma.refreshToken.deleteMany({
        where: {
          userId,
          expiresAt: { lt: new Date() },
        },
      });

      if (result.count > 0) {
        this.logger.log(
          `Cleaned up ${result.count} expired tokens for user ${userId}`,
        );
      }
    } catch (error) {
      this.logger.error('Error cleaning up tokens:', error);
    }
  }

  /**
   * Limit the number of active refresh tokens per user
   * If limit is exceeded, revoke the oldest tokens
   */
  private async limitActiveTokens(
    userId: string,
    maxTokens: number,
  ): Promise<void> {
    try {
      const activeTokens = await this.prisma.refreshToken.findMany({
        where: {
          userId,
          isRevoked: false,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: 'desc' },
      });

      // If we have too many active tokens, revoke the oldest ones
      if (activeTokens.length >= maxTokens) {
        const tokensToRevoke = activeTokens.slice(maxTokens - 1);

        await this.prisma.refreshToken.updateMany({
          where: {
            id: { in: tokensToRevoke.map((t) => t.id) },
          },
          data: { isRevoked: true },
        });

        this.logger.log(
          `Revoked ${tokensToRevoke.length} oldest tokens for user ${userId} (limit: ${maxTokens})`,
        );
      }
    } catch (error) {
      this.logger.error('Error limiting active tokens:', error);
    }
  }
}
