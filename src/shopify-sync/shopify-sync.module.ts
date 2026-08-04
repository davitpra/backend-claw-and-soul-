import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import Redis, { type RedisOptions } from 'ioredis';

import { SHOPIFY_SYNC_QUEUE, REDIS_CLIENT } from './constants/queues.constants';
import { ProductSyncService } from './product-sync.service';
import { SyncService } from './sync.service';
import { ShopifyApiService } from './shopify-api.service';
import { ShopifyHmacGuard } from '../common/guards/shopify-hmac.guard';
import { ShopifySyncProcessor } from './processors/shopify-sync.processor';
import { ShopifyWebhooksController } from './shopify-webhooks.controller';
import { AdminSyncController } from './admin-sync.controller';

@Module({
  imports: [BullModule.registerQueue({ name: SHOPIFY_SYNC_QUEUE })],
  controllers: [ShopifyWebhooksController, AdminSyncController],
  exports: [ShopifyApiService, ProductSyncService],
  providers: [
    ProductSyncService,
    SyncService,
    ShopifyApiService,
    ShopifyHmacGuard,
    ShopifySyncProcessor,
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Redis(config.getOrThrow<RedisOptions>('redis')),
    },
  ],
})
export class ShopifySyncModule {}
