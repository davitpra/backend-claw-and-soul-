import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { ShopifyOrderPayload } from './dto/shopify-order.dto';
import { Prisma } from '@prisma/client';
import {
  ORDERS_QUEUE,
  ORDERS_JOB_NAMES,
  ORDERS_JOB_OPTIONS,
} from './constants/queues.constants';

const VALID_TRANSITIONS: Record<string, string[]> = {
  paid: ['in_production', 'cancelled', 'refunded'],
  in_production: ['shipped', 'cancelled', 'refunded'],
  shipped: ['delivered', 'refunded'],
  delivered: ['refunded'],
  cancelled: [],
  refunded: [],
};

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    @InjectQueue(ORDERS_QUEUE) private readonly ordersQueue: Queue,
  ) {}

  async ingestShopifyOrder(
    payload: ShopifyOrderPayload,
    webhookId?: string,
    topic?: string,
  ): Promise<void> {
    const shopifyOrderId = String(payload.id);

    // Resolve userId: priority 1 = from a linked generation, priority 2 = email match
    let userId: string | null = null;

    // Try to get it from any line item that has a generation_id attribute
    const genIds = payload.line_items
      .flatMap((li) => li.properties)
      .filter((p) => p.name === 'generation_id')
      .map((p) => p.value);

    if (genIds.length > 0) {
      const gen = await this.prisma.generation.findFirst({
        where: { id: { in: genIds } },
        select: { userId: true },
      });
      if (gen) userId = gen.userId;
    }

    if (!userId && payload.email) {
      const user = await this.prisma.user.findFirst({
        where: { email: { equals: payload.email, mode: 'insensitive' } },
        select: { id: true },
      });
      if (user) userId = user.id;
    }

    const shippingTotal = payload.total_shipping_price_set?.shop_money?.amount;

    // Upsert the Order row
    const order = await this.prisma.order.upsert({
      where: { shopifyOrderId },
      create: {
        shopifyOrderId,
        shopifyOrderGid: payload.admin_graphql_api_id ?? null,
        orderNumber: payload.name,
        userId,
        customerEmail: payload.email ?? null,
        customerName: payload.customer
          ? `${payload.customer.first_name ?? ''} ${payload.customer.last_name ?? ''}`.trim() ||
            null
          : null,
        customerPhone: payload.phone ?? payload.customer?.phone ?? null,
        financialStatus: payload.financial_status ?? null,
        fulfillmentStatus: payload.fulfillment_status ?? null,
        currency: payload.currency,
        subtotalAmount: new Prisma.Decimal(payload.subtotal_price),
        shippingAmount: shippingTotal
          ? new Prisma.Decimal(shippingTotal)
          : null,
        taxAmount: new Prisma.Decimal(payload.total_tax),
        totalAmount: new Prisma.Decimal(payload.total_price),
        shippingAddress:
          (payload.shipping_address as Prisma.InputJsonValue) ??
          Prisma.JsonNull,
        billingAddress:
          (payload.billing_address as Prisma.InputJsonValue) ?? Prisma.JsonNull,
        customerNote: payload.note ?? null,
        shopifyCreatedAt: new Date(payload.created_at),
        shopifyUpdatedAt: new Date(payload.updated_at),
        cancelledAt: payload.cancelled_at
          ? new Date(payload.cancelled_at)
          : null,
        rawPayload: payload as unknown as Prisma.InputJsonValue,
      },
      update: {
        shopifyOrderGid: payload.admin_graphql_api_id ?? undefined,
        userId: userId ?? undefined,
        customerEmail: payload.email ?? undefined,
        financialStatus: payload.financial_status ?? undefined,
        fulfillmentStatus: payload.fulfillment_status ?? undefined,
        subtotalAmount: new Prisma.Decimal(payload.subtotal_price),
        shippingAmount: shippingTotal
          ? new Prisma.Decimal(shippingTotal)
          : undefined,
        taxAmount: new Prisma.Decimal(payload.total_tax),
        totalAmount: new Prisma.Decimal(payload.total_price),
        shippingAddress:
          (payload.shipping_address as Prisma.InputJsonValue) ?? undefined,
        billingAddress:
          (payload.billing_address as Prisma.InputJsonValue) ?? undefined,
        shopifyUpdatedAt: new Date(payload.updated_at),
        cancelledAt: payload.cancelled_at
          ? new Date(payload.cancelled_at)
          : undefined,
        rawPayload: payload as unknown as Prisma.InputJsonValue,
      },
    });

    // Ingest each line item
    for (const lineItem of payload.line_items) {
      await this.ingestLineItem(order.id, lineItem, payload.financial_status);
    }

    // Record webhook event
    await this.prisma.orderEvent.create({
      data: {
        orderId: order.id,
        eventType: 'webhook_received',
        source: 'webhook',
        payload: { topic, webhookId, shopifyOrderId } as Prisma.InputJsonValue,
      },
    });

    // Auto-submit POD items for paid orders
    if (payload.financial_status === 'paid') {
      await this.enqueuePodItems(order.id);
    }

    this.logger.log(
      `Ingested order ${payload.name} (${shopifyOrderId}) → DB id ${order.id}`,
    );
  }

  private async ingestLineItem(
    orderId: string,
    lineItem: ShopifyOrderPayload['line_items'][0],
    financialStatus: string | undefined,
  ): Promise<void> {
    const shopifyLineItemId = String(lineItem.id);
    const shopifyVariantId = lineItem.variant_id
      ? String(lineItem.variant_id)
      : null;
    const shopifyProductId = lineItem.product_id
      ? String(lineItem.product_id)
      : null;

    // Extract cart attributes
    const attrs = Object.fromEntries(
      lineItem.properties.map((p) => [p.name, p.value]),
    );
    const generationIdAttr = attrs['generation_id'] ?? null;
    const imageUrl = attrs['image_url'] ?? null;
    const style = attrs['Style'] ?? attrs['style'] ?? null;
    const size = attrs['Size'] ?? attrs['size'] ?? null;

    // Resolve DB references
    let productRefId: string | null = null;
    let productFormatVariantId: string | null = null;
    let fulfillmentMethod = 'in_house';

    if (shopifyProductId) {
      const ref = await this.prisma.productReference.findUnique({
        where: { shopifyProductId },
        select: { id: true, fulfillmentMethod: true },
      });
      if (ref) {
        productRefId = ref.id;
        fulfillmentMethod = ref.fulfillmentMethod;
      } else {
        this.logger.warn(
          `shopifyProductId "${shopifyProductId}" not found in ProductReference — defaulting fulfillmentMethod to "in_house"`,
        );
      }
    }

    if (shopifyVariantId) {
      const variant = await this.prisma.productFormatVariant.findFirst({
        where: { shopifyVariantId },
        select: { id: true },
      });
      if (variant) productFormatVariantId = variant.id;
    }

    // Validate generationId ownership
    let generationId: string | null = null;
    if (generationIdAttr) {
      const gen = await this.prisma.generation.findUnique({
        where: { id: generationIdAttr },
        select: { id: true },
      });
      if (gen) {
        generationId = gen.id;
      } else {
        this.logger.warn(
          `generation_id "${generationIdAttr}" not found in DB — skipping link`,
        );
      }
    }

    // Initial production status from financial status (only set on create)
    const initialStatus = this.financialToProductionStatus(financialStatus);

    const existing = await this.prisma.orderItem.findUnique({
      where: { orderId_shopifyLineItemId: { orderId, shopifyLineItemId } },
      select: { id: true, productionStatus: true },
    });

    if (existing) {
      // On update: only change financial-derived status if still at initial state
      const updates: Prisma.OrderItemUpdateInput = {
        title: lineItem.title,
        variantTitle: lineItem.variant_title ?? undefined,
        sku: lineItem.sku ?? undefined,
        quantity: lineItem.quantity,
        unitPrice: new Prisma.Decimal(lineItem.price),
        totalPrice: new Prisma.Decimal(lineItem.price).mul(lineItem.quantity),
        imageUrl: imageUrl ?? undefined,
        style: style ?? undefined,
        size: size ?? undefined,
        productRef: productRefId
          ? { connect: { id: productRefId } }
          : undefined,
        productVariant: productFormatVariantId
          ? { connect: { id: productFormatVariantId } }
          : undefined,
        generation: generationId
          ? { connect: { id: generationId } }
          : undefined,
      };

      // Only move to terminal status if current status is still the initial one
      if (
        (initialStatus === 'cancelled' || initialStatus === 'refunded') &&
        existing.productionStatus === 'paid'
      ) {
        updates.productionStatus = initialStatus;
      }

      await this.prisma.orderItem.update({
        where: { id: existing.id },
        data: updates,
      });
    } else {
      await this.prisma.orderItem.create({
        data: {
          orderId,
          shopifyLineItemId,
          shopifyVariantId,
          shopifyProductId,
          productRefId,
          productFormatVariantId,
          generationId,
          title: lineItem.title,
          variantTitle: lineItem.variant_title ?? null,
          sku: lineItem.sku ?? null,
          quantity: lineItem.quantity,
          unitPrice: new Prisma.Decimal(lineItem.price),
          totalPrice: new Prisma.Decimal(lineItem.price).mul(lineItem.quantity),
          imageUrl,
          style,
          size,
          fulfillmentMethod,
          productionStatus: initialStatus,
        },
      });
    }
  }

  private financialToProductionStatus(financialStatus?: string): string {
    switch (financialStatus) {
      case 'refunded':
      case 'partially_refunded':
        return 'refunded';
      case 'voided':
        return 'cancelled';
      default:
        return 'paid';
    }
  }

  async transitionItemStatus(
    orderId: string,
    itemId: string,
    toStatus: string,
    notes?: string,
    adminUserId?: string,
  ): Promise<void> {
    const item = await this.prisma.orderItem.findFirst({
      where: { id: itemId, orderId },
    });
    if (!item) throw new NotFoundException('Order item not found');

    const allowed = VALID_TRANSITIONS[item.productionStatus] ?? [];
    if (!allowed.includes(toStatus)) {
      throw new BadRequestException(
        `Cannot transition from "${item.productionStatus}" to "${toStatus}"`,
      );
    }

    const now = new Date();
    await this.prisma.orderItem.update({
      where: { id: itemId },
      data: {
        productionStatus: toStatus,
        notes: notes ?? item.notes,
        shippedAt: toStatus === 'shipped' ? now : item.shippedAt,
        deliveredAt: toStatus === 'delivered' ? now : item.deliveredAt,
      },
    });

    await this.prisma.orderEvent.create({
      data: {
        orderId,
        orderItemId: itemId,
        eventType: 'status_change',
        fromStatus: item.productionStatus,
        toStatus,
        source: 'admin',
        userId: adminUserId ?? null,
        payload: notes ? ({ notes } as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    });
  }

  async updateItemTracking(
    orderId: string,
    itemId: string,
    tracking: {
      trackingNumber: string;
      trackingUrl?: string;
      trackingCarrier?: string;
    },
    adminUserId?: string,
  ): Promise<void> {
    const item = await this.prisma.orderItem.findFirst({
      where: { id: itemId, orderId },
    });
    if (!item) throw new NotFoundException('Order item not found');

    const shouldShip = item.productionStatus === 'in_production';
    const now = new Date();

    await this.prisma.orderItem.update({
      where: { id: itemId },
      data: {
        trackingNumber: tracking.trackingNumber,
        trackingUrl: tracking.trackingUrl ?? null,
        trackingCarrier: tracking.trackingCarrier ?? null,
        productionStatus: shouldShip ? 'shipped' : item.productionStatus,
        shippedAt: shouldShip ? now : item.shippedAt,
      },
    });

    await this.prisma.orderEvent.create({
      data: {
        orderId,
        orderItemId: itemId,
        eventType: 'tracking_added',
        fromStatus: shouldShip ? 'in_production' : undefined,
        toStatus: shouldShip ? 'shipped' : undefined,
        source: 'admin',
        userId: adminUserId ?? null,
        payload: tracking as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async updateItemFulfillmentMethod(
    orderId: string,
    itemId: string,
    fulfillmentMethod: 'in_house' | 'pod',
    adminUserId?: string,
  ): Promise<void> {
    const item = await this.prisma.orderItem.findFirst({
      where: { id: itemId, orderId },
    });
    if (!item) throw new NotFoundException('Order item not found');

    await this.prisma.orderItem.update({
      where: { id: itemId },
      data: { fulfillmentMethod },
    });

    await this.prisma.orderEvent.create({
      data: {
        orderId,
        orderItemId: itemId,
        eventType: 'manual_resync',
        source: 'admin',
        userId: adminUserId ?? null,
        payload: {
          field: 'fulfillmentMethod',
          from: item.fulfillmentMethod,
          to: fulfillmentMethod,
        } as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async linkUserToOrder(orderId: string, userId: string): Promise<void> {
    const [order, user] = await Promise.all([
      this.prisma.order.findUnique({ where: { id: orderId } }),
      this.prisma.user.findUnique({ where: { id: userId } }),
    ]);
    if (!order) throw new NotFoundException('Order not found');
    if (!user) throw new NotFoundException('User not found');

    await this.prisma.order.update({
      where: { id: orderId },
      data: { userId },
    });
    await this.prisma.orderEvent.create({
      data: {
        orderId,
        eventType: 'manual_link_user',
        source: 'admin',
        payload: { userId } as Prisma.InputJsonValue,
      },
    });
  }

  async linkGenerationToItem(
    orderId: string,
    itemId: string,
    generationId: string,
  ): Promise<void> {
    const [item, gen] = await Promise.all([
      this.prisma.orderItem.findFirst({ where: { id: itemId, orderId } }),
      this.prisma.generation.findUnique({ where: { id: generationId } }),
    ]);
    if (!item) throw new NotFoundException('Order item not found');
    if (!gen) throw new NotFoundException('Generation not found');

    await this.prisma.orderItem.update({
      where: { id: itemId },
      data: { generationId },
    });
  }

  async updateItemPrintImage(
    orderId: string,
    itemId: string,
    file: Express.Multer.File,
    adminUserId?: string,
  ): Promise<{ printImageUrl: string }> {
    const item = await this.prisma.orderItem.findFirst({
      where: { id: itemId, orderId },
    });
    if (!item) throw new NotFoundException('Order item not found');

    if (item.printImageStorageKey) {
      await this.storageService
        .delete(item.printImageStorageKey)
        .catch(() => null);
    }

    const key = `orders/${orderId}/items/${itemId}/print/${uuidv4()}`;
    const url = await this.storageService.upload(
      key,
      file.buffer,
      file.mimetype,
    );

    await this.prisma.orderItem.update({
      where: { id: itemId },
      data: { printImageUrl: url, printImageStorageKey: key },
    });

    await this.prisma.orderEvent.create({
      data: {
        orderId,
        orderItemId: itemId,
        eventType: 'print_image_uploaded',
        source: 'admin',
        userId: adminUserId ?? null,
        payload: { printImageUrl: url } as unknown as Prisma.InputJsonValue,
      },
    });

    return { printImageUrl: url };
  }

  /** Enqueue POD_SUBMIT for all pod items in an order that haven't been submitted yet. */
  async enqueuePodItems(orderId: string): Promise<void> {
    const items = await this.prisma.orderItem.findMany({
      where: {
        orderId,
        fulfillmentMethod: 'pod',
        podOrderId: null,
      },
      select: { id: true },
    });

    for (const item of items) {
      await this.ordersQueue.add(
        ORDERS_JOB_NAMES.POD_SUBMIT,
        { orderItemId: item.id },
        ORDERS_JOB_OPTIONS,
      );
      this.logger.log(`Enqueued POD_SUBMIT for item ${item.id}`);
    }
  }
}
