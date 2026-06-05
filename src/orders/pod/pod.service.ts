import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PodProviderRegistry } from './pod-provider.registry';
import { PICTOREM_CATALOG, PodCatalog } from './catalog/pictorem-catalog';
import { FxRateService } from './fx-rate.service';

const DEFAULT_POD_PROVIDER = 'pictorem';
const POD_ENABLED_KEY = 'orders_pod_enabled';

@Injectable()
export class PodService {
  private readonly logger = new Logger(PodService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly registry: PodProviderRegistry,
    private readonly fx: FxRateService,
  ) {}

  /**
   * Currency in which the POD provider actually invoices (the account's billing
   * currency). Pictorem's getprice returns USD, but invoices are issued in the
   * account currency (CAD for our account), so we convert for display.
   */
  private billingCurrency(): string {
    return this.configService.get<string>('PICTOREM_BILLING_CURRENCY') ?? 'CAD';
  }

  private async isEnabled(): Promise<boolean> {
    const row = await this.prisma.appSetting.findUnique({
      where: { key: POD_ENABLED_KEY },
    });
    if (row) return row.value === 'true';
    return this.configService.get<string>('ORDERS_POD_ENABLED') === 'true';
  }

  private defaultProvider(): string {
    return (
      this.configService.get<string>('ORDERS_DEFAULT_POD_PROVIDER') ??
      DEFAULT_POD_PROVIDER
    );
  }

  async testConnection(): Promise<
    Array<{ provider: string; ok: boolean; apiUrl: string; message: string }>
  > {
    const results = await Promise.all(
      this.registry.list().map(async (name) => {
        const provider = this.registry.get(name);
        const result = await provider.testConnection();
        return { provider: name, ...result };
      }),
    );
    return results;
  }

  listProviders(): string[] {
    return this.registry.list();
  }

  getCatalog(): PodCatalog {
    return PICTOREM_CATALOG;
  }

  async getPodEnabled(): Promise<{
    enabled: boolean;
    source: 'db' | 'env-default';
  }> {
    const row = await this.prisma.appSetting.findUnique({
      where: { key: POD_ENABLED_KEY },
    });
    if (row) return { enabled: row.value === 'true', source: 'db' };
    return {
      enabled: this.configService.get<string>('ORDERS_POD_ENABLED') === 'true',
      source: 'env-default',
    };
  }

  async setPodEnabled(
    enabled: boolean,
    userId?: string,
  ): Promise<{ enabled: boolean }> {
    this.logger.log(
      `POD auto-fulfillment ${enabled ? 'enabled' : 'disabled'} by user=${userId ?? 'system'}`,
    );
    await this.prisma.appSetting.upsert({
      where: { key: POD_ENABLED_KEY },
      create: {
        key: POD_ENABLED_KEY,
        value: String(enabled),
        updatedBy: userId,
      },
      update: { value: String(enabled), updatedBy: userId },
    });
    return { enabled };
  }

  /**
   * Submit a single OrderItem to the configured POD provider.
   * @param force — if true, re-submit even if podOrderId already exists.
   * @param manual — if true, this is an explicit admin action ("Enviar a
   *   Pictorem") and bypasses the global auto-fulfillment toggle. The toggle
   *   only gates the automatic on-ingest path.
   */
  async submitItem(
    orderItemId: string,
    force = false,
    manual = false,
  ): Promise<void> {
    if (!manual && !(await this.isEnabled())) {
      this.logger.debug(`POD disabled — skipping submitItem ${orderItemId}`);
      return;
    }

    const item = await this.prisma.orderItem.findUnique({
      where: { id: orderItemId },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            shippingAddress: true,
            customerEmail: true,
          },
        },
        productVariant: {
          include: { format: { select: { aspectRatio: true } } },
        },
        generation: { select: { resultUrl: true } },
      },
    });

    if (!item) {
      this.logger.error(`submitItem: OrderItem ${orderItemId} not found`);
      return;
    }

    // Idempotency guard
    if (item.podOrderId && !force) {
      this.logger.debug(
        `submitItem: item ${orderItemId} already submitted (podOrderId=${item.podOrderId}), skipping`,
      );
      return;
    }

    // Resolve image URL — prefer the admin-uploaded print image, then the
    // generation result, then the original Shopify line-item image.
    const imageUrl =
      item.printImageUrl ?? item.generation?.resultUrl ?? item.imageUrl;
    if (!imageUrl) {
      this.logger.warn(
        `submitItem: item ${orderItemId} has no imageUrl — skipping (pod_skip)`,
      );
      await this.recordEvent(item.order.id, orderItemId, 'pod_skip', {
        reason: 'no_image_url',
      });
      return;
    }

    // Resolve podConfig
    const rawConfig = item.productVariant?.podConfig;
    if (!rawConfig) {
      this.logger.warn(
        `submitItem: item ${orderItemId} variant has no podConfig — skipping (pod_skip)`,
      );
      await this.recordEvent(item.order.id, orderItemId, 'pod_skip', {
        reason: 'no_pod_config',
      });
      return;
    }

    // Resolve provider: variant.podProvider → env default → 'pictorem'
    const variantPodProvider = (
      item.productVariant as { podProvider?: string | null } | null
    )?.podProvider;
    const providerName = variantPodProvider ?? this.defaultProvider();
    const provider = this.registry.get(providerName);

    const po = `${item.order.orderNumber}-${orderItemId.slice(0, 8)}`;
    const shippingAddress = item.order.shippingAddress as Record<
      string,
      unknown
    > | null;

    try {
      const result = await provider.submitOrder({
        orderItemId,
        orderId: item.order.id,
        imageUrl,
        title: item.title,
        variantTitle: item.variantTitle ?? undefined,
        quantity: item.quantity,
        podConfig: rawConfig as Record<string, unknown>,
        shippingAddress: shippingAddress ?? undefined,
        customerEmail: item.order.customerEmail ?? undefined,
        orderNumber: item.order.orderNumber,
        po,
        aspectRatio: item.productVariant?.format?.aspectRatio ?? undefined,
      });

      await this.prisma.orderItem.update({
        where: { id: orderItemId },
        data: {
          podProvider: result.podProvider,
          podOrderId: result.podOrderId,
          podRawResponse: result.rawResponse as Prisma.InputJsonValue,
          productionStatus: 'in_production',
        },
      });

      await this.recordEvent(item.order.id, orderItemId, 'pod_submit', {
        podProvider: result.podProvider,
        podOrderId: result.podOrderId,
        po,
      });

      this.logger.log(
        `POD submitted: item=${orderItemId} podOrderId=${result.podOrderId} provider=${result.podProvider}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `POD submit failed for item ${orderItemId}: ${message}`,
      );

      await this.recordEvent(item.order.id, orderItemId, 'pod_skip', {
        reason: 'submit_error',
        error: message,
      });
      // Re-throw so BullMQ can retry according to job options
      throw err;
    }
  }

  /**
   * Quote the POD provider's reseller price for an OrderItem without creating
   * an order. Resolves the variant's podConfig the same way submitItem does.
   */
  async getItemPrice(orderItemId: string): Promise<{
    list: number;
    discount: number;
    subtotal: number;
    taxPercentage: number;
    taxAmount: number;
    total: number;
    currency: string;
    preorderCode: string;
    components: Array<{
      code: string;
      label: string;
      list: number;
      discount: number;
      net: number;
    }>;
    billing: {
      currency: string;
      subtotal: number;
      total: number;
      rate: number;
      rateDate: string;
    } | null;
  }> {
    const item = await this.prisma.orderItem.findUnique({
      where: { id: orderItemId },
      include: {
        productVariant: {
          include: { format: { select: { aspectRatio: true } } },
        },
      },
    });

    if (!item) {
      throw new BadRequestException(`OrderItem ${orderItemId} no encontrado`);
    }

    const rawConfig = item.productVariant?.podConfig;
    if (!rawConfig) {
      throw new BadRequestException(
        'Este item no tiene configuración POD; no se puede cotizar en el proveedor',
      );
    }

    const variantPodProvider = (
      item.productVariant as { podProvider?: string | null } | null
    )?.podProvider;
    const providerName = variantPodProvider ?? this.defaultProvider();
    const provider = this.registry.get(providerName);

    const price = await provider.getPrice({
      podConfig: rawConfig as Record<string, unknown>,
      quantity: item.quantity,
      aspectRatio: item.productVariant?.format?.aspectRatio ?? undefined,
    });

    // The provider quotes in USD; convert to the account's billing currency
    // (the currency Pictorem actually invoices in) using live FX rates.
    const billingCurrency = this.billingCurrency();
    const subtotalConv = await this.fx.convert(
      price.subtotal,
      price.currency,
      billingCurrency,
    );
    const totalConv = await this.fx.convert(
      price.total,
      price.currency,
      billingCurrency,
    );

    const billing =
      subtotalConv && totalConv
        ? {
            currency: billingCurrency,
            subtotal: subtotalConv.amount,
            total: totalConv.amount,
            rate: subtotalConv.rate,
            rateDate: subtotalConv.rateDate,
          }
        : null;

    return {
      list: price.list,
      discount: price.discount,
      subtotal: price.subtotal,
      taxPercentage: price.taxPercentage,
      taxAmount: price.taxAmount,
      total: price.total,
      currency: price.currency,
      preorderCode: price.preorderCode,
      components: price.components,
      billing,
    };
  }

  /**
   * Estimate the total production cost for all POD items in an order by summing
   * Pictorem's reseller price for each, then converting to the order's currency.
   * Items without podConfig or that fail to quote are skipped (partial result).
   */
  async estimateOrderProductionCost(orderId: string): Promise<{
    amount: number;
    currency: string;
    itemsPriced: number;
    itemsTotal: number;
    partial: boolean;
    fxUnavailable: boolean;
  }> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        currency: true,
        items: {
          where: { fulfillmentMethod: 'pod' },
          include: {
            productVariant: {
              include: { format: { select: { aspectRatio: true } } },
            },
          },
        },
      },
    });

    if (!order) throw new BadRequestException(`Order ${orderId} no encontrada`);

    const podItems = order.items;
    let totalUsd = 0;
    let itemsPriced = 0;

    for (const item of podItems) {
      const priceUsd = await this.quoteItemUsd(item);
      if (priceUsd != null) {
        totalUsd += priceUsd;
        itemsPriced++;
      }
    }

    const orderCurrency = order.currency.toUpperCase();
    const PICTOREM_NATIVE = 'USD';
    let fxUnavailable = false;
    let amount = totalUsd;

    if (orderCurrency !== PICTOREM_NATIVE) {
      const conv = await this.fx.convert(
        totalUsd,
        PICTOREM_NATIVE,
        orderCurrency,
      );
      if (conv) {
        amount = conv.amount;
      } else {
        fxUnavailable = true;
        // Fall back to USD value; caller surfaces the warning
        amount = totalUsd;
      }
    }

    return {
      amount: Math.round(amount * 100) / 100,
      currency: fxUnavailable ? PICTOREM_NATIVE : orderCurrency,
      itemsPriced,
      itemsTotal: podItems.length,
      partial: itemsPriced < podItems.length,
      fxUnavailable,
    };
  }

  /** Quote a single item's total cost in USD from the POD provider; null if not quotable. */
  private async quoteItemUsd(item: {
    quantity: number;
    podProvider?: string | null;
    productVariant?: {
      podConfig?: unknown;
      podProvider?: string | null;
      format?: { aspectRatio?: string | null } | null;
    } | null;
  }): Promise<number | null> {
    const rawConfig = item.productVariant?.podConfig;
    if (!rawConfig) return null;

    const variantPodProvider = item.productVariant?.podProvider;
    const providerName = variantPodProvider ?? this.defaultProvider();

    try {
      const provider = this.registry.get(providerName);
      const price = await provider.getPrice({
        podConfig: rawConfig as Record<string, unknown>,
        quantity: item.quantity,
        aspectRatio: item.productVariant?.format?.aspectRatio ?? undefined,
      });
      return price.total; // total includes provider taxes — the invoiced amount
    } catch {
      return null;
    }
  }

  /** Sync status and tracking for an OrderItem from its POD provider. */
  async syncItem(orderItemId: string): Promise<void> {
    const item = await this.prisma.orderItem.findUnique({
      where: { id: orderItemId },
      select: {
        id: true,
        orderId: true,
        podOrderId: true,
        podProvider: true,
        productionStatus: true,
        trackingNumber: true,
      },
    });

    if (!item?.podOrderId) {
      this.logger.debug(
        `syncItem: item ${orderItemId} has no podOrderId, nothing to sync`,
      );
      return;
    }

    const providerName = item.podProvider ?? this.defaultProvider();
    const provider = this.registry.get(providerName);

    try {
      const result = await provider.getStatus(item.podOrderId);
      const now = new Date();

      const updates: Prisma.OrderItemUpdateInput = {
        productionStatus: result.status,
        podRawResponse: result.rawResponse as Prisma.InputJsonValue,
      };

      if (result.trackingNumber) {
        updates.trackingNumber = result.trackingNumber;
        updates.trackingCarrier = result.trackingCarrier ?? null;
        if (result.status === 'shipped' && !item.trackingNumber) {
          updates.shippedAt = now;
        }
      }

      if (result.status === 'delivered') {
        updates.deliveredAt = now;
      }

      await this.prisma.orderItem.update({
        where: { id: orderItemId },
        data: updates,
      });

      if (result.status !== item.productionStatus) {
        await this.prisma.orderEvent.create({
          data: {
            orderId: item.orderId,
            orderItemId,
            eventType: 'status_change',
            fromStatus: item.productionStatus,
            toStatus: result.status,
            source: 'pod',
            payload: { podOrderId: item.podOrderId } as Prisma.InputJsonValue,
          },
        });
      }

      if (
        result.trackingNumber &&
        result.trackingNumber !== item.trackingNumber
      ) {
        await this.prisma.orderEvent.create({
          data: {
            orderId: item.orderId,
            orderItemId,
            eventType: 'tracking_added',
            source: 'pod',
            payload: {
              trackingNumber: result.trackingNumber,
              trackingCarrier: result.trackingCarrier,
            } as Prisma.InputJsonValue,
          },
        });
      }

      this.logger.log(
        `POD sync: item=${orderItemId} status=${result.status} tracking=${result.trackingNumber ?? 'none'}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`POD sync failed for item ${orderItemId}: ${message}`);
      throw err;
    }
  }

  private async recordEvent(
    orderId: string,
    orderItemId: string,
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.orderEvent.create({
      data: {
        orderId,
        orderItemId,
        eventType,
        source: 'pod',
        payload: payload as Prisma.InputJsonValue,
      },
    });
  }
}
