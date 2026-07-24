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

// `select` compartido para los items que ve el cliente: título, imagen propia,
// generación de IA y —como último fallback— la imagen primaria del estilo del
// producto (mismo patrón que el admin). No exponemos más estructura del catálogo.
const THUMB_ITEM_SELECT = {
  id: true,
  title: true,
  imageUrl: true,
  // `shopifyHandle` + `shopifyVariantId` dejan que el storefront resuelva la
  // imagen live de Shopify para ítems sin arte propio (p. ej. accesorios sin
  // estilo ni generación), igual que hace el admin.
  shopifyVariantId: true,
  generation: { select: { resultUrl: true, thumbnailUrl: true } },
  productRef: {
    select: {
      shopifyHandle: true,
      style: {
        select: {
          images: {
            orderBy: [
              { isPrimary: 'desc' as const },
              { orderIndex: 'asc' as const },
            ],
            take: 1,
            select: { imageUrl: true },
          },
        },
      },
    },
  },
} satisfies Prisma.OrderItemSelect;

type ThumbItemRow = Prisma.OrderItemGetPayload<{
  select: typeof THUMB_ITEM_SELECT;
}>;

// Aplana `productImageUrl` (imagen del estilo) y `shopifyHandle` a campos planos
// y descarta la estructura `productRef` anidada antes de devolverla al cliente.
function toThumbItem(item: ThumbItemRow) {
  const { productRef, ...rest } = item;
  return {
    ...rest,
    shopifyHandle: productRef?.shopifyHandle ?? null,
    productImageUrl: productRef?.style?.images?.[0]?.imageUrl ?? null,
  };
}

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
          fulfillmentDisplayStatus: true,
          orderStatusUrl: true,
          shopifyCreatedAt: true,
          items: { select: THUMB_ITEM_SELECT },
        },
      }),
      this.prisma.order.count({ where: { userId } }),
    ]);

    return createPaginatedResult(
      orders.map((o) => ({
        ...o,
        totalAmount: o.totalAmount.toNumber(),
        items: o.items.map(toThumbItem),
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
        fulfillmentDisplayStatus: true,
        orderStatusUrl: true,
        shippingAddress: true,
        customerNote: true,
        shopifyCreatedAt: true,
        items: { select: THUMB_ITEM_SELECT },
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
      items: order.items.map(toThumbItem),
    };
  }
}
