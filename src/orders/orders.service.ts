import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { ShopifyApiService } from '../shopify-sync/shopify-api.service';
import { ShopifyOrderPayload } from './dto/shopify-order.dto';
import { Prisma } from '@prisma/client';
import {
  VALID_TRANSITIONS,
  CANCELLABLE_STATUSES,
  TERMINAL_STATUSES as INACTIVE_STATUSES,
  computeAutoEarlyStatus,
  isEarlyAutoStatus,
} from './production-status.util';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly shopifyApiService: ShopifyApiService,
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

    // Estado de fulfillment "display" (lo que ve el cliente), fiel a Shopify:
    // se deriva de los FulfillmentOrders (in_progress/on_hold/scheduled/...), que
    // el fulfillment_status simple del payload no expone. Best-effort.
    const fulfillmentDisplayStatus =
      await this.shopifyApiService.getFulfillmentDisplayStatus(
        shopifyOrderId,
        payload.fulfillment_status ?? null,
      );

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
        fulfillmentDisplayStatus,
        orderStatusUrl: payload.order_status_url ?? null,
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
        fulfillmentDisplayStatus: fulfillmentDisplayStatus ?? undefined,
        orderStatusUrl: payload.order_status_url ?? undefined,
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

    // El POD se gestiona fuera de la aplicación: el estado inicial se auto-asigna
    // desde pago + generación (pending/generating/art_failed/draft) y, a partir de
    // 'draft', el admin avanza la producción manualmente.

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
    let generationStatus: string | null = null;
    if (generationIdAttr) {
      const gen = await this.prisma.generation.findUnique({
        where: { id: generationIdAttr },
        select: { id: true, status: true },
      });
      if (gen) {
        generationId = gen.id;
        generationStatus = gen.status;
      } else {
        this.logger.warn(
          `generation_id "${generationIdAttr}" not found in DB — skipping link`,
        );
      }
    }

    // Estado inicial: auto-asignado desde pago + generación del arte (solo al crear).
    const initialStatus = computeAutoEarlyStatus(financialStatus, generationStatus);

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

      // Reembolso/cancelación de Shopify ganan siempre (pueden ocurrir tras
      // avanzar la producción). El resto solo se recomputa mientras el item siga
      // en un estado temprano auto-gestionado (no pisa el avance manual del admin).
      if (initialStatus === 'cancelled' || initialStatus === 'refunded') {
        updates.productionStatus = initialStatus;
      } else if (isEarlyAutoStatus(existing.productionStatus)) {
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

  /**
   * Recalcula el fulfillment "display status" de una orden a partir de sus
   * FulfillmentOrders en Shopify y lo persiste. Lo disparan los webhooks
   * `fulfillment_orders/*` y `fulfillments/*`, cuyas transiciones (in_progress,
   * on_hold, scheduled) NO se reflejan en los webhooks `orders/*` — por eso sin
   * esto el badge del cliente quedaba congelado hasta un resync manual.
   */
  async refreshFulfillmentDisplayStatus(
    shopifyOrderId: string,
    topic?: string,
  ): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { shopifyOrderId },
      select: {
        id: true,
        fulfillmentStatus: true,
        fulfillmentDisplayStatus: true,
      },
    });
    if (!order) {
      // El webhook de FulfillmentOrder llegó antes de que la orden se ingestara;
      // orders/create (o un evento posterior) la pondrá al día.
      this.logger.warn(
        `refreshFulfillmentDisplayStatus: order ${shopifyOrderId} aún no existe; skip`,
      );
      return;
    }

    const display = await this.shopifyApiService.getFulfillmentDisplayStatus(
      shopifyOrderId,
      order.fulfillmentStatus,
    );

    if (display === order.fulfillmentDisplayStatus) return; // sin cambios

    await this.prisma.order.update({
      where: { id: order.id },
      data: { fulfillmentDisplayStatus: display },
    });

    await this.prisma.orderEvent.create({
      data: {
        orderId: order.id,
        eventType: 'fulfillment_refresh',
        source: 'webhook',
        fromStatus: order.fulfillmentDisplayStatus,
        toStatus: display,
        payload: { topic: topic ?? null } as Prisma.InputJsonValue,
      },
    });

    this.logger.log(
      `Fulfillment display refresh: order=${shopifyOrderId} ${order.fulfillmentDisplayStatus ?? 'null'} → ${display ?? 'null'} (topic=${topic ?? 'n/a'})`,
    );
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

  /**
   * Cancel one or more items of an order, reflecting the change in Shopify
   * (strict) and Pictorem (best-effort).
   *
   * - Only items in a cancellable state (pending|paid|in_production) are eligible.
   * - Shopify is called FIRST: if it fails, the whole operation aborts and the
   *   DB is left untouched (strict mode). When the cancellation empties the
   *   order it cancels the whole Shopify order; otherwise it refunds the
   *   affected line items.
   * - Pictorem cancellation is best-effort: Pictorem ArtFlow 0.1 has no
   *   cancellation endpoint, so failures are collected as warnings instead of
   *   aborting.
   */
  async cancelOrderItems(
    orderId: string,
    opts: {
      itemIds?: string[];
      reason?: string;
      refund?: boolean;
      restock?: boolean;
      adminUserId?: string;
    },
  ): Promise<{
    cancelledItemIds: string[];
    shopifyAction: 'order_cancel' | 'partial_refund';
    warnings: string[];
  }> {
    const refund = opts.refund ?? true;
    const restock = opts.restock ?? true;

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Order not found');

    // Resolve target items: explicit itemIds (validated), or all cancellable items.
    const targets: typeof order.items = [];
    if (opts.itemIds && opts.itemIds.length > 0) {
      const byId = new Map(order.items.map((i) => [i.id, i]));
      for (const id of opts.itemIds) {
        const item = byId.get(id);
        if (!item)
          throw new NotFoundException(`Order item ${id} not found in order`);
        if (!CANCELLABLE_STATUSES.includes(item.productionStatus)) {
          throw new BadRequestException(
            `Item ${id} is in "${item.productionStatus}" and cannot be cancelled`,
          );
        }
        targets.push(item);
      }
    } else {
      targets.push(
        ...order.items.filter((i) =>
          CANCELLABLE_STATUSES.includes(i.productionStatus),
        ),
      );
    }

    if (targets.length === 0) {
      throw new BadRequestException('No cancellable items in this order');
    }

    const targetIds = new Set(targets.map((i) => i.id));

    // Whole-order cancel when no active item remains outside the target set.
    const remainingActive = order.items.filter(
      (i) =>
        !targetIds.has(i.id) && !INACTIVE_STATUSES.includes(i.productionStatus),
    );
    const cancelsWholeOrder = remainingActive.length === 0;
    const shopifyAction: 'order_cancel' | 'partial_refund' = cancelsWholeOrder
      ? 'order_cancel'
      : 'partial_refund';

    // 1) Shopify FIRST — strict: any failure aborts before touching the DB.
    if (cancelsWholeOrder) {
      await this.shopifyApiService.cancelOrder(order.shopifyOrderId, {
        reason: 'other',
        refund,
        restock,
      });
    } else {
      await this.shopifyApiService.refundLineItems(
        order.shopifyOrderId,
        targets.map((i) => ({
          shopifyLineItemId: i.shopifyLineItemId,
          quantity: i.quantity,
        })),
        { restock },
      );
    }

    // 2) El POD se gestiona fuera de la aplicación; no hay acción automática
    //    de cancelación en el proveedor. Sin advertencias generadas aquí.
    const warnings: string[] = [];

    // 3) DB — atomic: mark items cancelled, set cancelledAt if whole order, audit.
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.orderItem.updateMany({
        where: { id: { in: [...targetIds] } },
        data: { productionStatus: 'cancelled' },
      }),
      ...(cancelsWholeOrder
        ? [
            this.prisma.order.update({
              where: { id: orderId },
              data: { cancelledAt: now },
            }),
          ]
        : []),
      this.prisma.orderEvent.create({
        data: {
          orderId,
          eventType: 'order_cancelled',
          source: 'admin',
          userId: opts.adminUserId ?? null,
          payload: {
            reason: opts.reason ?? null,
            refund,
            restock,
            shopifyAction,
            itemIds: [...targetIds],
            podManualWarnings: warnings,
          } as unknown as Prisma.InputJsonValue,
        },
      }),
    ]);

    this.logger.log(
      `Order ${order.orderNumber} cancel: items=${targetIds.size} action=${shopifyAction} warnings=${warnings.length}`,
    );

    return { cancelledItemIds: [...targetIds], shopifyAction, warnings };
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

    // Subir PRIMERO. Si la subida falla (p. ej. archivo muy grande), la imagen
    // anterior debe permanecer intacta, así que el borrado va después.
    const key = `orders/${orderId}/items/${itemId}/print/${uuidv4()}`;
    const url = await this.storageService.upload(
      key,
      file.buffer,
      file.mimetype,
    );

    // Subida correcta: ahora limpiamos los assets previos (claves distintas).
    const oldKeys = [
      item.printImageStorageKey,
      item.printSourceStorageKey,
    ].filter((k): k is string => Boolean(k) && k !== key);
    for (const oldKey of new Set(oldKeys)) {
      await this.storageService.delete(oldKey).catch(() => null);
    }

    // A manual upload is BOTH the print image (what POD ships) and the source art
    // (the enhancement input). Storing it as the source keeps the original
    // recoverable after an enhancement.
    await this.prisma.orderItem.update({
      where: { id: itemId },
      data: {
        printImageUrl: url,
        printImageStorageKey: key,
        printSourceUrl: url,
        printSourceStorageKey: key,
      },
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
}
