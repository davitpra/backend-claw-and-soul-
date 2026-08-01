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
import {
  PaintByNumbersService,
  PbnUploadFiles,
} from '../paint-by-numbers/paint-by-numbers.service';
import { ShopifyOrderPayload } from './dto/shopify-order.dto';
import { Prisma } from '@prisma/client';
import { CreditsService } from '../credits/credits.service';
import {
  VALID_TRANSITIONS,
  CANCELLABLE_STATUSES,
  CLAWBACK_STATUSES,
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
    private readonly pbnService: PaintByNumbersService,
    private readonly creditsService: CreditsService,
  ) {}

  // Créditos de generación otorgados por cada unidad comprada en una orden pagada.
  private static readonly CREDITS_PER_UNIT = 3;

  // Los productos Digital (descarga gratuita; "PBN" es el alias legacy) no
  // otorgan ni revierten el order_bonus: son gratis, y otorgarlo permitiría
  // farmear créditos comprándolos a $0.
  private static isDigitalTemplate(
    template: string | null | undefined,
  ): boolean {
    const t = template?.trim();
    return t === 'Digital' || t === 'PBN';
  }

  async ingestShopifyOrder(
    payload: ShopifyOrderPayload,
    webhookId?: string,
    topic?: string,
  ): Promise<void> {
    const shopifyOrderId = String(payload.id);

    // Resolve userId: priority 0 = _user_id from an authenticated checkout,
    // priority 1 = linked generation/PBN, priority 2 = email match.
    let userId: string | null = null;

    // Prioridad 0: user_id adjuntado por el checkout autenticado (property de
    // línea "_user_id"; el prefijo "_" hace que Shopify lo oculte al cliente).
    // Las properties son client-controlled, así que validamos: el usuario debe
    // existir y, si la orden trae email, debe coincidir con el de ese usuario o
    // no coincidir con ninguna cuenta (evita reclamar la orden ajena).
    const userIdAttrs = payload.line_items
      .flatMap((li) => li.properties)
      .filter((p) => p.name === '_user_id')
      .map((p) => p.value);
    if (userIdAttrs.length > 0) {
      const claimed = await this.prisma.user.findUnique({
        where: { id: userIdAttrs[0] },
        select: { id: true, email: true },
      });
      if (claimed) {
        const orderEmail = payload.email?.toLowerCase();
        if (!orderEmail || orderEmail === claimed.email.toLowerCase()) {
          userId = claimed.id;
        } else {
          const conflict = await this.prisma.user.findFirst({
            where: { email: { equals: payload.email!, mode: 'insensitive' } },
            select: { id: true },
          });
          if (conflict) {
            this.logger.warn(
              `Order ${payload.name}: _user_id ${claimed.id} conflicts with email-matched user ${conflict.id}; ignoring _user_id.`,
            );
          } else {
            // El email del checkout no matchea ninguna cuenta → confiamos en _user_id.
            userId = claimed.id;
          }
        }
      }
    }

    // Try to get it from any line item that has a generation_id attribute
    const genIds = payload.line_items
      .flatMap((li) => li.properties)
      .filter((p) => p.name === 'generation_id')
      .map((p) => p.value);

    if (!userId && genIds.length > 0) {
      const gen = await this.prisma.generation.findFirst({
        where: { id: { in: genIds } },
        select: { userId: true },
      });
      if (gen) userId = gen.userId;
    }

    // Priority 1b: from a linked Paint-by-Numbers (PBN products carry no generation).
    if (!userId) {
      const pbnIds = payload.line_items
        .flatMap((li) => li.properties)
        .filter((p) => p.name === 'paint_by_numbers_id')
        .map((p) => p.value);
      if (pbnIds.length > 0) {
        const pbn = await this.prisma.paintByNumbers.findFirst({
          where: { id: { in: pbnIds } },
          select: { userId: true },
        });
        if (pbn) userId = pbn.userId;
      }
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

    // Bono de créditos por compra cuando la orden está pagada. Se decide por el
    // estado del payload (no por el topic del webhook) para cubrir
    // orders/create-ya-pagada, orders/paid y orders/updated por igual.
    if (payload.financial_status === 'paid' && order.userId) {
      await this.grantOrderCredits({
        id: order.id,
        userId: order.userId,
        orderNumber: payload.name,
      });
    }

    // Clawback de créditos por reembolso/cancelación. Se decide por línea desde
    // el payload (no por productionStatus, que colapsa parciales a 'refunded'):
    // orden muerta → todas las líneas; parcial → solo las de refunds[]. El
    // reverseCreditsForItems es idempotente por (reason, OrderItem.id).
    const wholeOrderDead =
      payload.cancelled_at != null ||
      payload.financial_status === 'refunded' ||
      payload.financial_status === 'voided';
    const deadShopifyLineIds = wholeOrderDead
      ? payload.line_items.map((li) => String(li.id))
      : [
          ...new Set(
            (payload.refunds ?? []).flatMap((r) =>
              (r.refund_line_items ?? []).map((rl) => String(rl.line_item_id)),
            ),
          ),
        ];
    if (deadShopifyLineIds.length > 0) {
      const deadItems = await this.prisma.orderItem.findMany({
        where: {
          orderId: order.id,
          shopifyLineItemId: { in: deadShopifyLineIds },
        },
        select: { id: true },
      });
      await this.reverseCreditsForItems(
        order.id,
        deadItems.map((i) => i.id),
      );
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

  /**
   * Otorga los créditos de una orden pagada, separando líneas de "credit pack"
   * (creditAmount * qty, reason 'pack_purchase') de las líneas regulares
   * (+3/unidad, reason 'order_bonus'). Las líneas Digital/PBN (producto
   * gratuito) se excluyen de ambos grants. Se computa desde los OrderItems ya
   * persistidos, así que ingestShopifyOrder y linkUserToOrder usan idéntica
   * lógica. Ambos grants son idempotentes por (reason, order.id) — webhooks
   * repetidos son no-op. Best-effort: un fallo no rompe la ingesta ni el link.
   */
  private async grantOrderCredits(order: {
    id: string;
    userId: string;
    orderNumber: string | null;
  }): Promise<void> {
    const items = await this.prisma.orderItem.findMany({
      where: { orderId: order.id },
      select: {
        shopifyVariantId: true,
        quantity: true,
        productRef: { select: { template: true } },
      },
    });
    if (items.length === 0) return;

    const variantIds = items
      .map((it) => it.shopifyVariantId)
      .filter((id): id is string => id !== null);
    const packVariants =
      variantIds.length > 0
        ? await this.prisma.creditPackVariant.findMany({
            where: { shopifyVariantId: { in: variantIds } },
            select: { shopifyVariantId: true, creditAmount: true },
          })
        : [];
    const packByVariant = new Map(
      packVariants.map((pv) => [pv.shopifyVariantId, pv.creditAmount]),
    );

    let packCredits = 0;
    let regularUnits = 0;
    for (const it of items) {
      const perUnit =
        it.shopifyVariantId != null
          ? packByVariant.get(it.shopifyVariantId)
          : undefined;
      if (perUnit != null) {
        packCredits += perUnit * it.quantity;
      } else if (!OrdersService.isDigitalTemplate(it.productRef?.template)) {
        regularUnits += it.quantity;
      }
    }

    const label = order.orderNumber ?? order.id;
    if (regularUnits > 0) {
      await this.creditsService
        .grant(
          order.userId,
          regularUnits * OrdersService.CREDITS_PER_UNIT,
          'order_bonus',
          order.id,
          `Order ${label}`,
        )
        .catch((err: Error) =>
          this.logger.warn(
            `Failed to grant order bonus for ${order.id}: ${err.message}`,
          ),
        );
    }
    if (packCredits > 0) {
      await this.creditsService
        .grant(
          order.userId,
          packCredits,
          'pack_purchase',
          order.id,
          `Credit pack — order ${label}`,
        )
        .catch((err: Error) =>
          this.logger.warn(
            `Failed to grant pack credits for ${order.id}: ${err.message}`,
          ),
        );
    }
  }

  /**
   * Revierte los créditos de las líneas reembolsadas/canceladas — espejo exacto
   * de `grantOrderCredits`: líneas de credit pack revierten `creditAmount * qty`
   * (reason `pack_purchase_reversal`) y líneas regulares `3/unidad` (reason
   * `order_bonus_reversal`). Las líneas Digital/PBN se saltan, igual que en el
   * grant: nunca recibieron bono, no hay nada que revertir. Idempotente por
   * línea (reason, OrderItem.id): un webhook/cancelación repetidos son no-op.
   *
   * No-op si la orden nunca recibió el grant correspondiente (guest sin vincular,
   * orden nunca pagada): el `userId` sale de la fila del grant original, no de
   * `order.userId`. El saldo puede quedar < 0 si el bono ya se gastó. Best-effort:
   * un fallo se registra pero no rompe la ingesta ni la cancelación.
   */
  private async reverseCreditsForItems(
    orderId: string,
    itemIds: string[],
  ): Promise<void> {
    if (itemIds.length === 0) return;

    // Grants originales por orden. Sin ellos no hay nada que revertir.
    const [bonusGrant, packGrant] = await Promise.all([
      this.prisma.creditTransaction.findUnique({
        where: {
          reason_referenceId: { reason: 'order_bonus', referenceId: orderId },
        },
        select: { userId: true },
      }),
      this.prisma.creditTransaction.findUnique({
        where: {
          reason_referenceId: { reason: 'pack_purchase', referenceId: orderId },
        },
        select: { userId: true },
      }),
    ]);
    if (!bonusGrant && !packGrant) return;

    const [items, order] = await Promise.all([
      this.prisma.orderItem.findMany({
        where: { id: { in: itemIds }, orderId },
        select: {
          id: true,
          shopifyVariantId: true,
          quantity: true,
          productRef: { select: { template: true } },
        },
      }),
      this.prisma.order.findUnique({
        where: { id: orderId },
        select: { orderNumber: true },
      }),
    ]);
    if (items.length === 0) return;

    const variantIds = items
      .map((it) => it.shopifyVariantId)
      .filter((id): id is string => id !== null);
    const packVariants =
      variantIds.length > 0
        ? await this.prisma.creditPackVariant.findMany({
            where: { shopifyVariantId: { in: variantIds } },
            select: { shopifyVariantId: true, creditAmount: true },
          })
        : [];
    const packByVariant = new Map(
      packVariants.map((pv) => [pv.shopifyVariantId, pv.creditAmount]),
    );

    const label = order?.orderNumber ?? orderId;
    for (const it of items) {
      const perUnit =
        it.shopifyVariantId != null
          ? packByVariant.get(it.shopifyVariantId)
          : undefined;
      if (perUnit != null) {
        // Línea de credit pack. Si el mapping se borró tras el grant, la línea
        // caería en la rama regular (3/unidad) — rareza aceptada.
        if (!packGrant) continue;
        await this.creditsService
          .revoke(
            packGrant.userId,
            perUnit * it.quantity,
            'pack_purchase_reversal',
            it.id,
            `Refund/cancel credit pack — order ${label}`,
          )
          .catch((err: Error) =>
            this.logger.warn(
              `Failed to reverse pack credits for item ${it.id}: ${err.message}`,
            ),
          );
      } else {
        if (!bonusGrant) continue;
        // Digital/PBN nunca sumó al order_bonus: no revertir lo no otorgado.
        if (OrdersService.isDigitalTemplate(it.productRef?.template)) continue;
        await this.creditsService
          .revoke(
            bonusGrant.userId,
            it.quantity * OrdersService.CREDITS_PER_UNIT,
            'order_bonus_reversal',
            it.id,
            `Refund/cancel — order ${label}`,
          )
          .catch((err: Error) =>
            this.logger.warn(
              `Failed to reverse order bonus for item ${it.id}: ${err.message}`,
            ),
          );
      }
    }
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
    const paintByNumbersIdAttr = attrs['paint_by_numbers_id'] ?? null;
    const imageUrl = attrs['image_url'] ?? null;
    const style = attrs['Style'] ?? attrs['style'] ?? null;
    const size = attrs['Size'] ?? attrs['size'] ?? null;

    // Resolve DB references
    let productRefId: string | null = null;
    let productFormatVariantId: string | null = null;
    let fulfillmentMethod = 'in_house';
    let isCreditPack = false;
    let isAccessory = false;

    if (shopifyProductId) {
      const ref = await this.prisma.productReference.findUnique({
        where: { shopifyProductId },
        select: {
          id: true,
          fulfillmentMethod: true,
          isCreditPack: true,
          isAccessory: true,
        },
      });
      if (ref) {
        productRefId = ref.id;
        fulfillmentMethod = ref.fulfillmentMethod;
        isCreditPack = ref.isCreditPack;
        isAccessory = ref.isAccessory;
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

    // Validate paintByNumbersId
    let paintByNumbersId: string | null = null;
    let pbnPreviewUrl: string | null = null;
    if (paintByNumbersIdAttr) {
      const pbn = await this.prisma.paintByNumbers.findUnique({
        where: { id: paintByNumbersIdAttr },
        select: { id: true, previewUrl: true },
      });
      if (pbn) {
        paintByNumbersId = pbn.id;
        pbnPreviewUrl = pbn.previewUrl;
      } else {
        this.logger.warn(
          `paint_by_numbers_id "${paintByNumbersIdAttr}" not found in DB — skipping link`,
        );
      }
    }

    // PBN lines don't carry image_url (avoid leaking the Cloudinary URL as a
    // Shopify property); derive the item thumbnail from the linked PBN preview.
    const effectiveImageUrl = imageUrl ?? pbnPreviewUrl;

    // Estado inicial: auto-asignado desde pago + generación del arte (solo al crear).
    // Los credit packs son digitales: no entran a la cola de producción, así que
    // arrancan en 'delivered' salvo que la orden esté cancelada/reembolsada.
    let initialStatus = computeAutoEarlyStatus(
      financialStatus,
      generationStatus,
      isAccessory,
    );
    if (
      isCreditPack &&
      initialStatus !== 'cancelled' &&
      initialStatus !== 'refunded'
    ) {
      initialStatus = 'delivered';
    }

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
        imageUrl: effectiveImageUrl ?? undefined,
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
        paintByNumbers: paintByNumbersId
          ? { connect: { id: paintByNumbersId } }
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
          paintByNumbersId,
          title: lineItem.title,
          variantTitle: lineItem.variant_title ?? null,
          sku: lineItem.sku ?? null,
          quantity: lineItem.quantity,
          unitPrice: new Prisma.Decimal(lineItem.price),
          totalPrice: new Prisma.Decimal(lineItem.price).mul(lineItem.quantity),
          imageUrl: effectiveImageUrl,
          style,
          size,
          fulfillmentMethod,
          productionStatus: initialStatus,
        },
      });
    }

    // Mark the linked PBN as purchased (best-effort, non-blocking).
    if (paintByNumbersId) {
      await this.prisma.paintByNumbers
        .update({
          where: { id: paintByNumbersId },
          data: { status: 'ordered' },
        })
        .catch((err) => {
          this.logger.warn(
            `Failed to mark PBN ${paintByNumbersId} as ordered: ${(err as Error).message}`,
          );
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

    // Al mover un item a cancelled/refunded/restocked se revierten sus créditos.
    if (CLAWBACK_STATUSES.includes(toStatus)) {
      await this.reverseCreditsForItems(orderId, [itemId]);
    }
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

    // Clawback de créditos de las líneas canceladas (best-effort, fuera de la
    // transacción como el grant). El webhook eco de Shopify reintenta las mismas
    // líneas → idempotente por (reason, OrderItem.id).
    await this.reverseCreditsForItems(orderId, [...targetIds]);

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

    // Guest checkout vinculado tardíamente: si la orden ya estaba pagada, el
    // webhook no pudo otorgar créditos (userId era null). Los otorgamos ahora;
    // la unique (reason, order.id) evita doble-grant si el webhook llega luego.
    if (order.financialStatus === 'paid') {
      await this.grantOrderCredits({
        id: order.id,
        userId,
        orderNumber: order.orderNumber,
      });

      // Si algún item ya fue cancelado/reembolsado (p. ej. cancelación admin
      // antes del link), revertimos su parte ahora que la orden tiene usuario.
      const deadItems = await this.prisma.orderItem.findMany({
        where: {
          orderId: order.id,
          productionStatus: { in: CLAWBACK_STATUSES },
        },
        select: { id: true },
      });
      await this.reverseCreditsForItems(
        order.id,
        deadItems.map((i) => i.id),
      );
    }
  }

  async linkGenerationToItem(
    orderId: string,
    itemId: string,
    generationId: string,
    adminUserId?: string,
  ): Promise<void> {
    const [order, item, gen] = await Promise.all([
      this.prisma.order.findUnique({
        where: { id: orderId },
        select: { userId: true },
      }),
      this.prisma.orderItem.findFirst({ where: { id: itemId, orderId } }),
      this.prisma.generation.findUnique({ where: { id: generationId } }),
    ]);
    if (!order) throw new NotFoundException('Order not found');
    if (!item) throw new NotFoundException('Order item not found');
    if (!gen) throw new NotFoundException('Generation not found');
    // Si el pedido tiene cliente, la generación debe pertenecerle.
    if (order.userId && gen.userId !== order.userId) {
      throw new BadRequestException(
        'La generación no pertenece al cliente del pedido',
      );
    }

    const previousGenerationId = item.generationId;
    await this.prisma.orderItem.update({
      where: { id: itemId },
      data: { generationId },
    });

    await this.prisma.orderEvent.create({
      data: {
        orderId,
        orderItemId: itemId,
        eventType: 'manual_link_generation',
        source: 'admin',
        userId: adminUserId ?? null,
        payload: {
          generationId,
          previousGenerationId,
        } as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async unlinkGenerationFromItem(
    orderId: string,
    itemId: string,
    adminUserId?: string,
  ): Promise<void> {
    const item = await this.prisma.orderItem.findFirst({
      where: { id: itemId, orderId },
    });
    if (!item) throw new NotFoundException('Order item not found');

    await this.prisma.orderItem.update({
      where: { id: itemId },
      data: { generationId: null },
    });

    await this.prisma.orderEvent.create({
      data: {
        orderId,
        orderItemId: itemId,
        eventType: 'generation_unlinked',
        source: 'admin',
        userId: adminUserId ?? null,
        payload: {
          previousGenerationId: item.generationId,
        } as unknown as Prisma.InputJsonValue,
      },
    });
  }

  /**
   * Admin: persist a Paint-by-Numbers rendered in the order studio and attach
   * it to the order item. Reuses PaintByNumbersService.create (origin 'admin').
   * The PBN is owned by the order's customer when the order is linked to a user
   * (so it shows in their /user/pbn); otherwise by the admin.
   */
  async attachPbnToItem(
    orderId: string,
    itemId: string,
    adminUserId: string,
    files: PbnUploadFiles,
    config: string,
  ): Promise<{ id: string }> {
    const item = await this.prisma.orderItem.findFirst({
      where: { id: itemId, orderId },
      include: { order: { select: { userId: true } } },
    });
    if (!item) throw new NotFoundException('Order item not found');

    const ownerId = item.order.userId ?? adminUserId;
    // create() validates the generation belongs to ownerId, so only forward it
    // when the order is linked to the customer that owns that generation.
    const generationId =
      item.order.userId && item.generationId ? item.generationId : undefined;

    const pbn = await this.pbnService.create(ownerId, 'admin', files, {
      config,
      generationId,
    });

    await this.prisma.orderItem.update({
      where: { id: itemId },
      data: { paintByNumbersId: pbn.id },
    });

    await this.prisma.orderEvent.create({
      data: {
        orderId,
        orderItemId: itemId,
        eventType: 'pbn_attached',
        source: 'admin',
        userId: adminUserId,
        payload: {
          paintByNumbersId: pbn.id,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    return { id: pbn.id };
  }

  async replaceItemGenerationImage(
    orderId: string,
    itemId: string,
    file: Express.Multer.File,
    adminUserId?: string,
  ): Promise<{ resultUrl: string; thumbnailUrl: string }> {
    const item = await this.prisma.orderItem.findFirst({
      where: { id: itemId, orderId },
      include: { generation: true },
    });
    if (!item) throw new NotFoundException('Order item not found');
    if (!item.generationId || !item.generation) {
      throw new BadRequestException(
        'Este item no tiene una generación vinculada. Vincula una generación ' +
          'antes de reemplazar su imagen.',
      );
    }

    // Subir PRIMERO con una clave única (fuerza cache-bust del CDN). Si la
    // subida falla, la imagen anterior permanece intacta.
    const key = `generations/${item.generationId}/admin-replace/${uuidv4()}`;
    const url = await this.storageService.upload(
      key,
      file.buffer,
      file.mimetype,
    );

    // Subida correcta: limpiamos el asset previo si la clave difiere.
    const oldKey = item.generation.resultStorageKey;
    if (oldKey && oldKey !== key) {
      await this.storageService.delete(oldKey).catch(() => null);
    }

    await this.prisma.generation.update({
      where: { id: item.generationId },
      data: { resultUrl: url, thumbnailUrl: url, resultStorageKey: key },
    });

    await this.prisma.orderEvent.create({
      data: {
        orderId,
        orderItemId: itemId,
        eventType: 'generation_image_replaced',
        source: 'admin',
        userId: adminUserId ?? null,
        payload: {
          generationId: item.generationId,
          resultUrl: url,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    return { resultUrl: url, thumbnailUrl: url };
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
