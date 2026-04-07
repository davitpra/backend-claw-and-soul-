import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

import { SHOPIFY_SYNC_QUEUE, REDIS_CLIENT } from './constants/queues.constants';
import { ProductSyncService } from './product-sync.service';
import { SyncService } from './sync.service';
import { ShopifyApiService } from './shopify-api.service';
import { ShopifyHmacGuard } from './guards/shopify-hmac.guard';
import { ShopifySyncProcessor } from './processors/shopify-sync.processor';
import { ShopifyWebhooksController } from './shopify-webhooks.controller';
import { AdminSyncController } from './admin-sync.controller';

@Module({
  imports: [BullModule.registerQueue({ name: SHOPIFY_SYNC_QUEUE })],
  controllers: [ShopifyWebhooksController, AdminSyncController],
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
        new Redis({
          host: config.get<string>('redis.host') ?? 'localhost',
          port: config.get<number>('redis.port') ?? 6379,
          password: config.get<string>('redis.password') || undefined,
          db: config.get<number>('redis.db') ?? 0,
        }),
    },
  ],
})
export class ShopifySyncModule {}
