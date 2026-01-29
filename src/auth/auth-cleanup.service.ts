import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Service for cleaning up expired and revoked refresh tokens
 * Runs daily to keep the database clean
 */
@Injectable()
export class AuthCleanupService {
  private readonly logger = new Logger(AuthCleanupService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Clean up expired and revoked tokens daily at 3 AM
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupExpiredTokens() {
    this.logger.log('Starting daily token cleanup...');

    try {
      const now = new Date();

      // Delete expired tokens
      const expiredResult = await this.prisma.refreshToken.deleteMany({
        where: {
          expiresAt: { lt: now },
        },
      });

      // Delete revoked tokens older than 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const revokedResult = await this.prisma.refreshToken.deleteMany({
        where: {
          isRevoked: true,
          createdAt: { lt: thirtyDaysAgo },
        },
      });

      this.logger.log(
        `Token cleanup complete: ${expiredResult.count} expired tokens, ${revokedResult.count} old revoked tokens removed`,
      );
    } catch (error) {
      this.logger.error('Error during token cleanup:', error);
    }
  }

  /**
   * Manual cleanup method for testing or administrative use
   */
  async manualCleanup() {
    this.logger.log('Manual token cleanup initiated');
    await this.cleanupExpiredTokens();
  }
}
