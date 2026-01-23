import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  getPaginationParams,
  createPaginatedResult,
} from '../common/utils/pagination.util';

interface CreditTransactionData {
  type: string;
  description?: string;
  referenceType?: string;
  referenceId?: string;
}

@Injectable()
export class CreditsService {
  private readonly logger = new Logger(CreditsService.name);

  constructor(private prisma: PrismaService) {}

  async getBalance(userId: string) {
    const userCredit = await this.prisma.userCredits.findUnique({
      where: { userId },
    });

    if (!userCredit) {
      throw new BadRequestException('User credits not found');
    }

    return userCredit;
  }

  async hasEnoughCredits(userId: string, amount: number): Promise<boolean> {
    const userCredit = await this.getBalance(userId);
    return userCredit.balance >= amount;
  }

  async spendCredits(
    userId: string,
    amount: number,
    transactionData: CreditTransactionData,
  ) {
    return this.prisma.$transaction(async (tx) => {
      // Get current balance with pessimistic write lock
      const userCredit = await tx.userCredits.findUnique({
        where: { userId },
      });

      if (!userCredit || userCredit.balance < amount) {
        throw new BadRequestException('Insufficient credits');
      }

      // Update balance
      const updatedCredit = await tx.userCredits.update({
        where: { userId },
        data: {
          balance: userCredit.balance - amount,
          totalSpent: userCredit.totalSpent + amount,
        },
      });

      // Create transaction record
      await tx.creditTransaction.create({
        data: {
          userId,
          type: 'spent',
          amount: -amount,
          balanceAfter: updatedCredit.balance,
          description: transactionData.description,
          referenceType: transactionData.referenceType,
          referenceId: transactionData.referenceId,
        },
      });

      this.logger.log(`User ${userId} spent ${amount} credits`);

      return updatedCredit;
    });
  }

  async addCredits(
    userId: string,
    amount: number,
    transactionData: CreditTransactionData,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const userCredit = await tx.userCredits.findUnique({
        where: { userId },
      });

      if (!userCredit) {
        throw new BadRequestException('User credits not found');
      }

      // Update balance
      const updatedCredit = await tx.userCredits.update({
        where: { userId },
        data: {
          balance: userCredit.balance + amount,
          totalEarned: userCredit.totalEarned + amount,
        },
      });

      // Create transaction record
      await tx.creditTransaction.create({
        data: {
          userId,
          type: transactionData.type || 'earned',
          amount,
          balanceAfter: updatedCredit.balance,
          description: transactionData.description,
          referenceType: transactionData.referenceType,
          referenceId: transactionData.referenceId,
        },
      });

      this.logger.log(`User ${userId} earned ${amount} credits`);

      return updatedCredit;
    });
  }

  async refundCredits(
    userId: string,
    amount: number,
    referenceId: string,
    description: string,
  ) {
    return this.addCredits(userId, amount, {
      type: 'refund',
      description: description || 'Credit refund',
      referenceType: 'generation',
      referenceId,
    });
  }

  async getTransactions(userId: string, page: number = 1, limit: number = 20) {
    const { skip, take } = getPaginationParams(page, limit);

    const [transactions, total] = await Promise.all([
      this.prisma.creditTransaction.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.creditTransaction.count({ where: { userId } }),
    ]);

    return createPaginatedResult(transactions, total, page, limit);
  }
}
