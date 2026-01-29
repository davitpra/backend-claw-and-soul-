import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async register(registerDto: RegisterDto) {
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
      // Create user (no credit initialization - all generations are free)
      const user = await this.prisma.user.create({
        data: {
          email: registerDto.email,
          passwordHash: hashedPassword,
          fullName: registerDto.fullName,
        },
      });

      this.logger.log(`New user registered: ${user.email}`);

      // Generate tokens
      const tokens = await this.generateTokens(user.id, user.email, user.role);

      return {
        user: this.sanitizeUser(user),
        ...tokens,
      };
    } catch (error) {
      this.logger.error('Registration failed', error.stack);
      throw error;
    }
  }

  async login(loginDto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: loginDto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is disabled');
    }

    // Update last login
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    this.logger.log(`User logged in: ${user.email}`);

    const tokens = await this.generateTokens(user.id, user.email, user.role);

    return {
      user: this.sanitizeUser(user),
      ...tokens,
    };
  }

  async refreshToken(refreshToken: string) {
    try {
      const payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
      });

      // Check if refresh token exists and is not revoked
      const storedToken = await this.prisma.refreshToken.findUnique({
        where: { token: refreshToken },
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

      // TOKEN ROTATION: Revoke the old refresh token
      await this.prisma.refreshToken.update({
        where: { id: storedToken.id },
        data: { isRevoked: true },
      });

      this.logger.log(
        `Rotating refresh token for user ${payload.sub}. Old token revoked.`,
      );

      // Generate new tokens (including a new refresh token)
      const tokens = await this.generateTokens(
        payload.sub,
        payload.email,
        payload.role,
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
    try {
      await this.prisma.refreshToken.update({
        where: { token: refreshToken },
        data: { isRevoked: true },
      });
      return { message: 'Logged out successfully' };
    } catch (error) {
      // Token might not exist, but that's okay
      return { message: 'Logged out successfully' };
    }
  }

  /**
   * Get all active sessions for a user
   */
  async getActiveSessions(userId: string) {
    const sessions = await this.prisma.refreshToken.findMany({
      where: {
        userId,
        isRevoked: false,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        createdAt: true,
        expiresAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      sessions: sessions.map((session) => ({
        id: session.id,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
      })),
      total: sessions.length,
    };
  }

  /**
   * Revoke a specific session by token ID
   */
  async revokeSession(userId: string, tokenId: string) {
    try {
      // Ensure the token belongs to the user
      const token = await this.prisma.refreshToken.findFirst({
        where: {
          id: tokenId,
          userId,
        },
      });

      if (!token) {
        throw new UnauthorizedException('Session not found');
      }

      await this.prisma.refreshToken.update({
        where: { id: tokenId },
        data: { isRevoked: true },
      });

      this.logger.log(`Session ${tokenId} revoked for user ${userId}`);

      return { message: 'Session revoked successfully' };
    } catch (error) {
      throw new UnauthorizedException('Failed to revoke session');
    }
  }

  /**
   * Revoke all sessions except the current one
   */
  async revokeAllOtherSessions(userId: string, currentToken?: string) {
    try {
      const result = await this.prisma.refreshToken.updateMany({
        where: {
          userId,
          isRevoked: false,
          ...(currentToken && { token: { not: currentToken } }),
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
    } catch (error) {
      throw new UnauthorizedException('Failed to revoke sessions');
    }
  }

  private async generateTokens(userId: string, email: string, role: string) {
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

    // Store refresh token in database
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    await this.prisma.refreshToken.create({
      data: {
        userId,
        token: refreshToken,
        expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken,
    };
  }

  private sanitizeUser(user: any) {
    const { passwordHash, ...result } = user;
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
   * Clean up expired and revoked tokens for a user
   * Helps keep the database clean and improves performance
   */
  private async cleanupExpiredTokens(userId: string): Promise<void> {
    try {
      const now = new Date();

      const result = await this.prisma.refreshToken.deleteMany({
        where: {
          userId,
          OR: [
            { isRevoked: true },
            { expiresAt: { lt: now } },
          ],
        },
      });

      if (result.count > 0) {
        this.logger.log(
          `Cleaned up ${result.count} expired/revoked tokens for user ${userId}`,
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
