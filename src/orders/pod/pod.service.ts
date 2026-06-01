import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PodProviderRegistry } from './pod-provider.registry';
import { PICTOREM_CATALOG, PodCatalog } from './catalog/pictorem-catalog';

const DEFAULT_POD_PROVIDER = 'pictorem';
const POD_ENABLED_KEY = 'orders_pod_enabled';

@Injectable()
export class PodService {
  private readonly logger = new Logger(PodService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly registry: PodProviderRegistry,
  ) {}

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

  async getPodEnabled(): Promise<{ enabled: boolean; source: 'db' | 'env-default' }> {
    const row = await this.prisma.appSetting.findUnique({
      where: { key: POD_ENABLED_KEY },
    });
    if (row) return { enabled: row.value === 'true', source: 'db' };
    return {
      enabled: this.configService.get<string>('ORDERS_POD_ENABLED') === 'true',
      source: 'env-default',
    };
  }

  async setPodEnabled(enabled: boolean, userId?: string): Promise<{ enabled: boolean }> {
    this.logger.log(
      `POD auto-fulfillment ${enabled ? 'enabled' : 'disabled'} by user=${userId ?? 'system'}`,
    );
    await this.prisma.appSetting.upsert({
      where: { key: POD_ENABLED_KEY },
      create: { key: POD_ENABLED_KEY, value: String(enabled), updatedBy: userId },
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
