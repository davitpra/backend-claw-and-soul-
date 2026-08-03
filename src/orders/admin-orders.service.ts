import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  getPaginationParams,
  createPaginatedResult,
} from '../common/utils/pagination.util';
import { resolveOrderBy, SortDirection } from '../common/utils/sorting.util';
import { BASE_CURRENCY, ExpensesService } from '../expenses/expenses.service';
import { FxRateService } from '../fx/fx-rate.service';
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

/**
 * El mapeo variante→créditos solo sirve para calcular el `creditAmount` de la
 * línea; se quita del `productRef` antes de exponerlo en la respuesta.
 */
function stripCreditPackVariants<T extends { creditPackVariants: unknown }>(
  ref: T,
): Omit<T, 'creditPackVariants'> {
  const { creditPackVariants: _omitted, ...rest } = ref;
  return rest;
}

@Injectable()
export class AdminOrdersService {
  private readonly logger = new Logger(AdminOrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly expensesService: ExpensesService,
    private readonly fxRate: FxRateService,
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
                // Ejes de producto: el admin los usa para distinguir arte de
                // accesorios y packs de créditos (OrderItem no tiene el tipo).
                template: true,
                artKind: true,
                isAccessory: true,
                isCreditPack: true,
                creditPackVariants: {
                  select: { shopifyVariantId: true, creditAmount: true },
                },
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
      items: order.items.map((item) => {
        // Créditos por unidad de la línea: se cruza la variante comprada contra
        // el mapeo del pack (misma regla que `grantOrderCredits`). Las variantes
        // del pack son detalle interno, así que no viajan en la respuesta.
        const creditAmount =
          item.productRef?.creditPackVariants.find(
            (v) => v.shopifyVariantId === item.shopifyVariantId,
          )?.creditAmount ?? null;
        return {
          ...item,
          productRef: item.productRef
            ? stripCreditPackVariants(item.productRef)
            : null,
          creditAmount,
          unitPrice: item.unitPrice.toNumber(),
          totalPrice: item.totalPrice.toNumber(),
        };
      }),
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

  /**
   * Pedidos atribuibles a un usuario: los suyos más los que hizo como invitado
   * con el mismo email (`userId` es nullable). Cualquier lectura o agregación
   * por usuario debe partir de aquí o dejará fuera los de invitado.
   */
  private async userOrdersWhere(
    userId: string,
  ): Promise<Prisma.OrderWhereInput> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    const emailFilter = user?.email
      ? { customerEmail: { equals: user.email, mode: 'insensitive' as const } }
      : {};

    return { OR: [{ userId }, emailFilter] };
  }

  async getUserOrders(userId: string, page = 1, limit = 10) {
    const { skip, take } = getPaginationParams(page, limit);

    const where = await this.userOrdersWhere(userId);

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

  /**
   * Lo facturado por un cliente, en la moneda base. Cuentan solo los pedidos
   * `paid`, el mismo criterio que la métrica global de ingresos, para que el
   * número de la ficha cuadre con el del dashboard.
   *
   * Cada pedido guarda su propia moneda, así que un `_sum` plano mezclaría
   * divisas: se agrupa por moneda y se convierte cubo a cubo.
   */
  /**
   * Dirección de envío del usuario: la del pedido más reciente que traiga una.
   * Es el único dato de ubicación fiable que hay — declarado por la propia
   * persona — y solo existe si ha comprado alguna vez.
   *
   * Entran también los pedidos de invitado con su email, así que una cuenta con
   * `userId` sin enlazar sigue teniendo dirección.
   */
  async getUserShippingAddress(userId: string) {
    const order = await this.prisma.order.findFirst({
      where: {
        ...(await this.userOrdersWhere(userId)),
        shippingAddress: { not: Prisma.AnyNull },
      },
      orderBy: { shopifyCreatedAt: 'desc' },
      select: {
        shippingAddress: true,
        customerPhone: true,
        orderNumber: true,
        shopifyCreatedAt: true,
      },
    });

    if (!order) return null;

    return {
      address: order.shippingAddress,
      phone: order.customerPhone,
      // De qué pedido salió: la dirección envejece, y sin la fecha no se sabe
      // si sigue siendo la buena.
      sourceOrderNumber: order.orderNumber,
      sourceOrderDate: order.shopifyCreatedAt,
    };
  }

  async getUserRevenue(userId: string) {
    const where: Prisma.OrderWhereInput = {
      ...(await this.userOrdersWhere(userId)),
      financialStatus: 'paid',
    };

    const groups = await this.prisma.order.groupBy({
      by: ['currency'],
      where,
      _sum: { totalAmount: true },
      _count: { _all: true },
    });

    let total = 0;
    let orderCount = 0;
    const unconvertedCurrencies: string[] = [];

    for (const group of groups) {
      const amount = group._sum.totalAmount?.toNumber() ?? 0;
      orderCount += group._count._all;

      if (group.currency === BASE_CURRENCY) {
        total += amount;
        continue;
      }

      const converted = await this.fxRate.convert(
        amount,
        group.currency,
        BASE_CURRENCY,
      );

      if (converted) {
        total += converted.amount;
      } else {
        // Sin tipo de cambio se suma el importe crudo (igual que hace
        // `ExpensesService.customerSummary`) y se declara la moneda: mejor un
        // total con la salvedad a la vista que un hueco silencioso.
        total += amount;
        unconvertedCurrencies.push(group.currency);
      }
    }

    return {
      baseCurrency: BASE_CURRENCY,
      total,
      orderCount,
      unconvertedCurrencies,
    };
  }
}
