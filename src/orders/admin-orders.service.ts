import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  getPaginationParams,
  createPaginatedResult,
} from '../common/utils/pagination.util';
import { resolveOrderBy, SortDirection } from '../common/utils/sorting.util';
import { ExpensesService } from '../expenses/expenses.service';
import { PRODUCTION_QUEUE_STATUSES } from './production-status.util';

type OrderOrderBy =
  | Prisma.OrderOrderByWithRelationInput
  | Prisma.OrderOrderByWithRelationInput[];

/**
 * Columnas por las que la tabla de pedidos del admin puede ordenar. Las claves
 * son las que viaja el param `sort`; deben coincidir con los `sortKey` de
 * `admin/orders/page.tsx` en el front.
 *
 * `nulls: 'last'` en las columnas nullable evita que Postgres suba los NULL al
 * frente al ordenar DESC. "Producción" no está: ese estado lo deriva el front de
 * los items del pedido (con un valor `mixed` propio), no es un campo.
 */
const ORDER_BY_FIELDS: Record<string, (dir: SortDirection) => OrderOrderBy> = {
  orderNumber: (dir) => ({ orderNumber: dir }),
  // La celda muestra `customerName || customerEmail`, así que el email hace de
  // segundo criterio para los pedidos de invitados (sin nombre).
  customer: (dir) => [
    { customerName: { sort: dir, nulls: 'last' } },
    { customerEmail: { sort: dir, nulls: 'last' } },
  ],
  items: (dir) => ({ items: { _count: dir } }),
  total: (dir) => ({ totalAmount: dir }),
  payment: (dir) => ({ financialStatus: { sort: dir, nulls: 'last' } }),
  shopify: (dir) => [
    { fulfillmentDisplayStatus: { sort: dir, nulls: 'last' } },
    { fulfillmentStatus: { sort: dir, nulls: 'last' } },
  ],
  date: (dir) => ({ shopifyCreatedAt: dir }),
};

const DEFAULT_ORDER_BY: OrderOrderBy = { shopifyCreatedAt: 'desc' };

@Injectable()
export class AdminOrdersService {
  private readonly logger = new Logger(AdminOrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly expensesService: ExpensesService,
  ) {}

  async listOrders(
    page = 1,
    limit = 20,
    opts: {
      status?: string;
      method?: string;
      fulfillmentStatus?: string;
      dateFrom?: string;
      dateTo?: string;
      q?: string;
      sort?: string;
      order?: string;
    } = {},
  ) {
    const { skip, take } = getPaginationParams(page, limit);

    const where: Record<string, unknown> = {};

    if (opts.q) {
      where.OR = [
        { orderNumber: { contains: opts.q, mode: 'insensitive' } },
        { customerEmail: { contains: opts.q, mode: 'insensitive' } },
        { customerName: { contains: opts.q, mode: 'insensitive' } },
      ];
    }

    if (opts.dateFrom || opts.dateTo) {
      where.shopifyCreatedAt = {
        ...(opts.dateFrom ? { gte: new Date(opts.dateFrom) } : {}),
        ...(opts.dateTo ? { lte: new Date(opts.dateTo) } : {}),
      };
    }

    if (opts.status) {
      where.items = { some: { productionStatus: opts.status } };
    }

    if (opts.method) {
      where.items = { some: { fulfillmentMethod: opts.method } };
    }

    if (opts.fulfillmentStatus) {
      // Shopify guarda `fulfillment_status` como null cuando no hay fulfillment;
      // en la UI eso se presenta como "unfulfilled".
      where.fulfillmentStatus =
        opts.fulfillmentStatus === 'unfulfilled'
          ? null
          : opts.fulfillmentStatus;
    }

    const orderBy = resolveOrderBy(
      ORDER_BY_FIELDS,
      DEFAULT_ORDER_BY,
      opts.sort,
      opts.order,
    );

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        skip,
        take,
        orderBy,
        select: {
          id: true,
          orderNumber: true,
          customerEmail: true,
          customerName: true,
          userId: true,
          totalAmount: true,
          currency: true,
          financialStatus: true,
          fulfillmentStatus: true,
          fulfillmentDisplayStatus: true,
          shopifyCreatedAt: true,
          items: {
            select: {
              id: true,
              title: true,
              productionStatus: true,
              fulfillmentMethod: true,
              imageUrl: true,
              generation: { select: { resultUrl: true } },
            },
          },
        },
      }),
      this.prisma.order.count({ where }),
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

  /**
   * Cola de producción ("estudio de impresión"): órdenes activas (con >=1 print
   * sin terminar) ordenadas FIFO (lo más viejo esperando primero). El frontend
   * agrupa por etapa; aquí solo se devuelve la lista plana acotada.
   */
  async listProductionQueue(opts: { method?: string; q?: string } = {}) {
    const where: Record<string, unknown> = {
      items: {
        some: {
          productionStatus: { in: PRODUCTION_QUEUE_STATUSES },
          ...(opts.method ? { fulfillmentMethod: opts.method } : {}),
        },
      },
    };

    if (opts.q) {
      where.OR = [
        { orderNumber: { contains: opts.q, mode: 'insensitive' } },
        { customerEmail: { contains: opts.q, mode: 'insensitive' } },
        { customerName: { contains: opts.q, mode: 'insensitive' } },
      ];
    }

    const orders = await this.prisma.order.findMany({
      where,
      orderBy: { shopifyCreatedAt: 'asc' },
      take: 200,
      select: {
        id: true,
        orderNumber: true,
        customerName: true,
        customerEmail: true,
        userId: true,
        shopifyCreatedAt: true,
        financialStatus: true,
        fulfillmentStatus: true,
        fulfillmentDisplayStatus: true,
        currency: true,
        totalAmount: true,
        items: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            title: true,
            productionStatus: true,
            fulfillmentMethod: true,
            imageUrl: true,
            generation: {
              select: { resultUrl: true, thumbnailUrl: true },
            },
          },
        },
      },
    });

    return orders.map((o) => ({ ...o, totalAmount: o.totalAmount.toNumber() }));
  }

  async getOrderDetail(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, email: true, fullName: true } },
        items: {
          include: {
            productRef: {
              select: {
                id: true,
                name: true,
                displayName: true,
                fulfillmentMethod: true,
                shopifyHandle: true,
                style: {
                  select: {
                    images: {
                      orderBy: [{ isPrimary: 'desc' }, { orderIndex: 'asc' }],
                      take: 1,
                      select: { imageUrl: true },
                    },
                  },
                },
              },
            },
            productVariant: {
              select: {
                id: true,
                shopifyVariantId: true,
                shopifyVariantTitle: true,
              },
            },
            generation: {
              select: {
                id: true,
                resultUrl: true,
                thumbnailUrl: true,
                pet: { select: { id: true, name: true, species: true } },
                style: { select: { id: true, displayName: true } },
              },
            },
            paintByNumbers: {
              select: { id: true, outlineSvgUrl: true, previewUrl: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        events: {
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
      },
    });

    if (!order) return null;

    if (order.productionCost !== null) {
      this.expensesService
        .recordProductionCost({
          orderId: order.id,
          userId: order.userId ?? undefined,
          amount: order.productionCost.toNumber(),
          currency: order.currency,
        })
        .catch((err) => {
          this.logger.warn(
            `Auto-seed production cost expense for order ${id}: ${(err as Error).message}`,
          );
        });
    }

    return {
      ...order,
      subtotalAmount: order.subtotalAmount.toNumber(),
      shippingAmount: order.shippingAmount?.toNumber() ?? null,
      taxAmount: order.taxAmount?.toNumber() ?? null,
      totalAmount: order.totalAmount.toNumber(),
      productionCost: order.productionCost?.toNumber() ?? null,
      items: order.items.map((item) => ({
        ...item,
        unitPrice: item.unitPrice.toNumber(),
        totalPrice: item.totalPrice.toNumber(),
      })),
    };
  }

  async updateProductionCost(
    id: string,
    value: number | null,
  ): Promise<{ productionCost: number | null }> {
    const order = await this.prisma.order.update({
      where: { id },
      data: { productionCost: value ?? null },
      select: { productionCost: true, userId: true, currency: true },
    });

    if (value !== null) {
      this.expensesService
        .recordProductionCost({
          orderId: id,
          userId: order.userId ?? undefined,
          amount: value,
          currency: order.currency,
        })
        .catch((err) => {
          this.logger.warn(
            `Failed to record production cost for order ${id}: ${(err as Error).message}`,
          );
        });
    }

    return { productionCost: order.productionCost?.toNumber() ?? null };
  }

  async getStats(period: '7d' | '30d' | '90d' = '30d') {
    const days = { '7d': 7, '30d': 30, '90d': 90 }[period];
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [total, periodTotal, revenue, byProductionStatus] = await Promise.all(
      [
        this.prisma.order.count(),
        this.prisma.order.count({
          where: { shopifyCreatedAt: { gte: since } },
        }),
        this.prisma.order.aggregate({
          _sum: { totalAmount: true },
          where: {
            shopifyCreatedAt: { gte: since },
            financialStatus: 'paid',
          },
        }),
        this.prisma.orderItem.groupBy({
          by: ['productionStatus'],
          _count: { _all: true },
        }),
      ],
    );

    return {
      total,
      period: periodTotal,
      revenue: revenue._sum.totalAmount?.toNumber() ?? 0,
      byProductionStatus: Object.fromEntries(
        byProductionStatus.map((r) => [r.productionStatus, r._count._all]),
      ),
    };
  }

  async getUserOrders(userId: string, page = 1, limit = 10) {
    const { skip, take } = getPaginationParams(page, limit);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    const emailFilter = user?.email
      ? { customerEmail: { equals: user.email, mode: 'insensitive' as const } }
      : {};

    const where = {
      OR: [{ userId }, emailFilter],
    };

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        skip,
        take,
        orderBy: { shopifyCreatedAt: 'desc' },
        select: {
          id: true,
          orderNumber: true,
          totalAmount: true,
          currency: true,
          financialStatus: true,
          shopifyCreatedAt: true,
          items: {
            select: {
              id: true,
              title: true,
              productionStatus: true,
              imageUrl: true,
              // Para la miniatura de producto de la ficha de usuario: el id de
              // variante cruza con la imagen live de Shopify y la imagen del
              // estilo sirve de fallback de catálogo.
              shopifyVariantId: true,
              productRef: {
                select: {
                  shopifyHandle: true,
                  style: {
                    select: {
                      images: {
                        orderBy: [{ isPrimary: 'desc' }, { orderIndex: 'asc' }],
                        take: 1,
                        select: { imageUrl: true },
                      },
                    },
                  },
                },
              },
              generation: { select: { resultUrl: true } },
            },
          },
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    return createPaginatedResult(
      orders.map((o) => ({ ...o, totalAmount: o.totalAmount.toNumber() })),
      total,
      page,
      limit,
    );
  }
}
