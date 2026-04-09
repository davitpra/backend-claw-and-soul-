import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  ConflictException,
  Inject,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { ShopifyApiService } from './shopify-api.service';
import { ProductSyncService } from './product-sync.service';
import { REDIS_CLIENT } from './constants/queues.constants';

const SYNC_LOCK_KEY = 'shopify:sync:lock';
const SYNC_LOCK_TTL_MS = 5 * 60 * 1000; // 5 minutes

@Injectable()
export class SyncService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private readonly shopifyApiService: ShopifyApiService,
    private readonly productSyncService: ProductSyncService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const appPublicUrl = this.configService.get<string>('APP_PUBLIC_URL');
    if (!appPublicUrl) {
      this.logger.warn('APP_PUBLIC_URL not set — skipping Shopify webhook registration');
      return;
    }
    try {
      await this.shopifyApiService.registerWebhooks(appPublicUrl);
    } catch (err) {
      this.logger.error('Failed to register Shopify webhooks on startup', err);
    }
  }

  @Cron('0 */6 * * *')
  async runCronSync(): Promise<void> {
    this.logger.log('Starting scheduled cron sync');
    await this.runFullSync('cron');
  }

  async triggerManualSync(): Promise<{ syncId: string }> {
    const alreadyLocked = await this.acquireMutex();
    if (alreadyLocked) {
      throw new ConflictException('A sync is already in progress');
    }

    const syncLog = await this.prisma.syncLog.create({
      data: { type: 'manual', status: 'running', startedAt: new Date() },
    });

    // Run in background without awaiting — respond immediately with syncId
    this.runFullSync('manual', syncLog.id).catch((err) =>
      this.logger.error(`Manual sync ${syncLog.id} failed unexpectedly`, err),
    );

    return { syncId: syncLog.id };
  }

  async getLastSyncStatus() {
    return this.prisma.syncLog.findFirst({
      orderBy: { startedAt: 'desc' },
    });
  }

  async getSyncHistory(limit = 20) {
    return this.prisma.syncLog.findMany({
      orderBy: { startedAt: 'desc' },
      take: limit,
    });
  }

  async getHealthStatus() {
    const lastSuccessful = await this.prisma.syncLog.findFirst({
      where: { status: 'completed' },
      orderBy: { startedAt: 'desc' },
    });

    const activeProductsDb = await this.prisma.productReference.count({
      where: { isActive: true },
    });

    const webhooksLast24h = await this.prisma.auditLog.count({
      where: {
        action: {
          in: [
            'product_sync_created',
            'product_sync_updated',
            'product_sync_deactivated',
          ],
        },
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    });

    const hoursSinceLastSync = lastSuccessful
      ? (Date.now() - lastSuccessful.startedAt.getTime()) / 3_600_000
      : null;

    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (!lastSuccessful) {
      status = 'unhealthy';
    } else if (hoursSinceLastSync! > 12) {
      status = 'degraded';
    } else {
      status = 'healthy';
    }

    return {
      status,
      lastSuccessfulSync: lastSuccessful?.completedAt ?? null,
      hoursSinceLastSync: hoursSinceLastSync
        ? Math.round(hoursSinceLastSync * 10) / 10
        : null,
      activeProductsDb,
      webhooksLast24h,
    };
  }

  private async runFullSync(type: string, existingSyncId?: string): Promise<void> {
    let syncId = existingSyncId;

    // For cron syncs, acquire mutex and create the sync log here
    if (!existingSyncId) {
      const alreadyLocked = await this.acquireMutex();
      if (alreadyLocked) {
        this.logger.warn('Sync already in progress, skipping cron run');
        return;
      }
      const syncLog = await this.prisma.syncLog.create({
        data: { type, status: 'running', startedAt: new Date() },
      });
      syncId = syncLog.id;
    }

    let productsChecked = 0;
    let productsCreated = 0;
    let productsUpdated = 0;
    let productsDeactivated = 0;
    let variantsSynced = 0;
    let variantsSkipped = 0;
    const errors: string[] = [];

    try {
      const shopifyProducts = await this.shopifyApiService.fetchAllProducts();
      productsChecked = shopifyProducts.length;

      const shopifyIds = new Set<string>();

      for (const product of shopifyProducts) {
        shopifyIds.add(String(product.id));
        try {
          const result = await this.productSyncService.upsertProduct(product);
          if (result.action === 'created') productsCreated++;
          else productsUpdated++;

          const variantResult = await this.productSyncService.syncVariants(
            result.id,
            product.variants ?? [],
            product.handle,
          );
          variantsSynced += variantResult.synced;
          variantsSkipped += variantResult.skipped;
        } catch (err) {
          const msg = `Failed to upsert product ${product.id}: ${(err as Error).message}`;
          this.logger.error(msg);
          errors.push(msg);
        }
      }

      // Detect orphans: active in DB but not present in Shopify
      const activeDbProducts = await this.prisma.productReference.findMany({
        where: { isActive: true },
        select: { shopifyProductId: true },
      });

      for (const { shopifyProductId } of activeDbProducts) {
        if (!shopifyIds.has(shopifyProductId)) {
          try {
            const result = await this.productSyncService.softDeleteProduct(shopifyProductId);
            if (result.action === 'deactivated') productsDeactivated++;
          } catch (err) {
            const msg = `Failed to deactivate product ${shopifyProductId}: ${(err as Error).message}`;
            this.logger.error(msg);
            errors.push(msg);
          }
        }
      }

      await this.prisma.syncLog.update({
        where: { id: syncId },
        data: {
          status: errors.length > 0 ? 'failed' : 'completed',
          completedAt: new Date(),
          productsChecked,
          productsCreated,
          productsUpdated,
          productsDeactivated,
          errors: errors.length > 0 ? errors : undefined,
          metadata: { variantsSynced, variantsSkipped },
        },
      });

      this.logger.log(
        `Sync ${syncId} completed: checked=${productsChecked} created=${productsCreated} ` +
          `updated=${productsUpdated} deactivated=${productsDeactivated} ` +
          `variantsSynced=${variantsSynced} variantsSkipped=${variantsSkipped} errors=${errors.length}`,
      );
    } catch (err) {
      this.logger.error(`Sync ${syncId} failed`, err);
      await this.prisma.syncLog.update({
        where: { id: syncId },
        data: {
          status: 'failed',
          completedAt: new Date(),
          errors: [(err as Error).message],
        },
      });
    } finally {
      await this.releaseMutex();
    }
  }

  private async acquireMutex(): Promise<boolean> {
    const result = await this.redis.set(
      SYNC_LOCK_KEY,
      '1',
      'PX',
      SYNC_LOCK_TTL_MS,
      'NX',
    );
    return result === null; // null means already locked
  }

  private async releaseMutex(): Promise<void> {
    await this.redis.del(SYNC_LOCK_KEY);
  }
}
