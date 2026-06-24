import { Injectable, Logger, ConflictException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ShopifyApiService } from '../shopify-sync/shopify-api.service';
import { OrdersService } from './orders.service';

const SYNC_LOCK_KEY = 'orders:sync:lock';
const SYNC_LOCK_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Estados de fulfillment "terminales" — no hace falta reconciliarlos.
const TERMINAL_FULFILLMENT = ['fulfilled', 'restocked'];

@Injectable()
export class OrdersSyncService {
  private readonly logger = new Logger(OrdersSyncService.name);
  private syncLocked = false; // in-process mutex for single-instance deployments

  constructor(
    private readonly shopifyApiService: ShopifyApiService,
    private readonly ordersService: OrdersService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async triggerBackfill(sinceIso?: string): Promise<{ syncId: string }> {
    if (this.syncLocked) {
      throw new ConflictException('An order sync is already in progress');
    }

    const days =
      this.configService.get<number>('ORDERS_SYNC_BACKFILL_DAYS') ?? 30;
    const defaultSince = new Date(
      Date.now() - days * 24 * 60 * 60 * 1000,
    ).toISOString();

    const syncLog = await this.prisma.syncLog.create({
      data: {
        type: 'orders_manual',
        status: 'running',
        startedAt: new Date(),
      },
    });

    this.runBackfill(sinceIso ?? defaultSince, syncLog.id).catch((err) =>
      this.logger.error(`Order backfill ${syncLog.id} failed`, err),
    );

    return { syncId: syncLog.id };
  }

  async getLastSyncStatus() {
    return this.prisma.syncLog.findFirst({
      where: { type: { in: ['orders_manual', 'orders_cron'] } },
      orderBy: { startedAt: 'desc' },
    });
  }

  /**
   * Reconciliador del fulfillment display status. Red de seguridad GARANTIZADA:
   * Shopify no dispara webhooks fiables para todos los cambios de FulfillmentOrder
   * (p.ej. holds merchant-managed solo mandan orders/updated, que sufre una carrera
   * por consistencia eventual). Cada N minutos re-derivamos el estado de las órdenes
   * activas desde Shopify, así el badge del cliente se pone al día solo sin resync.
   * Reusa OrdersService.refreshFulfillmentDisplayStatus (que solo escribe si cambió).
   */
  @Cron('*/10 * * * *')
  async reconcileFulfillmentDisplayStatus(): Promise<void> {
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const orders = await this.prisma.order.findMany({
      where: {
        shopifyCreatedAt: { gte: since },
        OR: [
          { fulfillmentDisplayStatus: null },
          { fulfillmentDisplayStatus: { notIn: TERMINAL_FULFILLMENT } },
        ],
      },
      select: { shopifyOrderId: true },
      take: 250,
    });
    if (orders.length === 0) return;

    for (const o of orders) {
      try {
        await this.ordersService.refreshFulfillmentDisplayStatus(
          o.shopifyOrderId,
          'cron_reconcile',
        );
      } catch (err) {
        this.logger.warn(
          `Reconcile FO falló para ${o.shopifyOrderId}: ${(err as Error).message}`,
        );
      }
    }
    this.logger.log(
      `Fulfillment reconcile: revisadas ${orders.length} órdenes activas`,
    );
  }

  private async runBackfill(sinceIso: string, syncId: string): Promise<void> {
    this.syncLocked = true;
    let ordersChecked = 0;
    let ordersIngested = 0;
    const errors: string[] = [];

    try {
      const orders = await this.shopifyApiService.fetchAllOrders(sinceIso);
      ordersChecked = orders.length;

      for (const order of orders) {
        try {
          await this.ordersService.ingestShopifyOrder(
            order,
            undefined,
            'backfill',
          );
          ordersIngested++;
        } catch (err) {
          const msg = `Failed to ingest order ${order.id}: ${(err as Error).message}`;
          this.logger.error(msg);
          errors.push(msg);
        }
      }

      await this.prisma.syncLog.update({
        where: { id: syncId },
        data: {
          status: errors.length > 0 ? 'failed' : 'completed',
          completedAt: new Date(),
          productsChecked: ordersChecked,
          productsCreated: ordersIngested,
          errors: errors.length > 0 ? errors : undefined,
          metadata: { since: sinceIso },
        },
      });

      this.logger.log(
        `Order backfill ${syncId} done: checked=${ordersChecked} ingested=${ordersIngested} errors=${errors.length}`,
      );
    } catch (err) {
      this.logger.error(`Order backfill ${syncId} failed`, err);
      await this.prisma.syncLog.update({
        where: { id: syncId },
        data: {
          status: 'failed',
          completedAt: new Date(),
          errors: [(err as Error).message],
        },
      });
    } finally {
      this.syncLocked = false;
    }
  }
}
