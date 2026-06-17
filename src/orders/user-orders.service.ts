import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  getPaginationParams,
  createPaginatedResult,
} from '../common/utils/pagination.util';

// Endpoints scoped to the authenticated user (storefront account dashboard).
@Injectable()
export class UserOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async listUserOrders(userId: string, page = 1, limit = 20) {
    const { skip, take } = getPaginationParams(page, limit);

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where: { userId },
        skip,
        take,
        orderBy: { shopifyCreatedAt: 'desc' },
        select: {
          id: true,
          orderNumber: true,
          totalAmount: true,
          currency: true,
          financialStatus: true,
          fulfillmentStatus: true,
          shopifyCreatedAt: true,
          items: {
            select: {
              id: true,
              title: true,
              productionStatus: true,
              imageUrl: true,
              generation: { select: { resultUrl: true, thumbnailUrl: true } },
            },
          },
        },
      }),
      this.prisma.order.count({ where: { userId } }),
    ]);

    return createPaginatedResult(
      orders.map((o) => ({
        ...o,
        totalAmount: o.totalAmount.toNumber(),
      })),
      total,
      page,
      limit,
    );
  }

  // Default address is derived from the most recent order's shipping address.
  async getDefaultAddress(userId: string) {
    const order = await this.prisma.order.findFirst({
      where: { userId, shippingAddress: { not: Prisma.AnyNull } },
      orderBy: { shopifyCreatedAt: 'desc' },
      select: { shippingAddress: true },
    });

    return { address: order?.shippingAddress ?? null };
  }

  async getUserOrder(userId: string, id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        orderNumber: true,
        totalAmount: true,
        subtotalAmount: true,
        shippingAmount: true,
        taxAmount: true,
        currency: true,
        financialStatus: true,
        fulfillmentStatus: true,
        shippingAddress: true,
        customerNote: true,
        shopifyCreatedAt: true,
        items: {
          select: {
            id: true,
            title: true,
            productionStatus: true,
            imageUrl: true,
            generation: { select: { resultUrl: true, thumbnailUrl: true } },
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.userId !== userId) {
      throw new ForbiddenException('You do not have access to this order');
    }

    return {
      ...order,
      totalAmount: order.totalAmount.toNumber(),
      subtotalAmount: order.subtotalAmount.toNumber(),
      shippingAmount: order.shippingAmount?.toNumber() ?? null,
      taxAmount: order.taxAmount?.toNumber() ?? null,
    };
  }
}
