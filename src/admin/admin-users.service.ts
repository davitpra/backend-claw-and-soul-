import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  getPaginationParams,
  createPaginatedResult,
} from '../common/utils/pagination.util';
import { AdminOrdersService } from '../orders/admin-orders.service';

@Injectable()
export class AdminUsersService {
  constructor(
    private prisma: PrismaService,
    private adminOrdersService: AdminOrdersService,
  ) {}

  async listUsers(page = 1, limit = 20, search?: string) {
    const { skip, take } = getPaginationParams(page, limit);

    const where = search
      ? {
          OR: [
            { email: { contains: search, mode: 'insensitive' as const } },
            { fullName: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          isActive: true,
          generationCredits: true,
          createdAt: true,
          lastLoginAt: true,
          _count: { select: { pets: true, generations: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return createPaginatedResult(users, total, page, limit);
  }

  async getUserDetail(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true,
        emailVerified: true,
        generationCredits: true,
        createdAt: true,
        lastLoginAt: true,
        pets: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            name: true,
            species: true,
            breed: true,
            isActive: true,
            photos: {
              orderBy: { orderIndex: 'asc' },
              select: {
                id: true,
                photoUrl: true,
                isPrimary: true,
                orderIndex: true,
              },
            },
          },
        },
      },
    });

    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async getUserGenerations(userId: string, page = 1, limit = 24) {
    const { skip, take } = getPaginationParams(page, limit);

    const [generations, total] = await Promise.all([
      this.prisma.generation.findMany({
        where: { userId },
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          status: true,
          type: true,
          resultUrl: true,
          thumbnailUrl: true,
          createdAt: true,
          pet: { select: { id: true, name: true, species: true } },
          style: { select: { id: true, displayName: true } },
        },
      }),
      this.prisma.generation.count({ where: { userId } }),
    ]);

    return createPaginatedResult(generations, total, page, limit);
  }

  async getUserOrders(userId: string, page = 1, limit = 10) {
    return this.adminOrdersService.getUserOrders(userId, page, limit);
  }

  async getUserCreditTransactions(userId: string, page = 1, limit = 20) {
    const { skip, take } = getPaginationParams(page, limit);

    const [transactions, total] = await Promise.all([
      this.prisma.creditTransaction.findMany({
        where: { userId },
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          amount: true,
          reason: true,
          referenceId: true,
          note: true,
          createdAt: true,
        },
      }),
      this.prisma.creditTransaction.count({ where: { userId } }),
    ]);

    return createPaginatedResult(transactions, total, page, limit);
  }
}
