import { Injectable, Logger, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ShopifyApiService } from '../shopify-sync/shopify-api.service';
import { OrdersService } from './orders.service';

const SYNC_LOCK_KEY = 'orders:sync:lock';
const SYNC_LOCK_TTL_MS = 10 * 60 * 1000; // 10 minutes

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
