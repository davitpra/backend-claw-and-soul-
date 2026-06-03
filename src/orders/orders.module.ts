import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { ORDERS_QUEUE } from './constants/queues.constants';
import { OrdersService } from './orders.service';
import { OrdersSyncService } from './orders-sync.service';
import { AdminOrdersService } from './admin-orders.service';
import { AdminOrdersController } from './admin-orders.controller';
import { ShopifyOrdersWebhookController } from './shopify-orders-webhook.controller';
import { OrdersIngestProcessor } from './processors/orders-ingest.processor';
import { PodProcessor } from './processors/pod.processor';
import { PodService } from './pod/pod.service';
import { PodSyncService } from './pod/pod-sync.service';
import { PictoremProvider } from './pod/providers/pictorem.provider';
import { PodProviderRegistry } from './pod/pod-provider.registry';
import { POD_PROVIDERS } from './pod/pod-provider.tokens';
import { ShopifyHmacGuard } from '../common/guards/shopify-hmac.guard';
import { ShopifySyncModule } from '../shopify-sync/shopify-sync.module';
import { GenerationsModule } from '../generations/generations.module';
import { ImageEnhancementService } from './image-enhancement.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: ORDERS_QUEUE }),
    ShopifySyncModule,
    GenerationsModule,
  ],
  controllers: [ShopifyOrdersWebhookController, AdminOrdersController],
  providers: [
    OrdersService,
    OrdersSyncService,
    AdminOrdersService,
    OrdersIngestProcessor,
    PodProcessor,
    PodService,
    PodSyncService,
    PictoremProvider,
    {
      provide: POD_PROVIDERS,
      useFactory: (pictorem: PictoremProvider) => [pictorem],
      inject: [PictoremProvider],
    },
    PodProviderRegistry,
    ShopifyHmacGuard,
    ImageEnhancementService,
  ],
  exports: [OrdersService, AdminOrdersService, PodService],
})
export class OrdersModule {}
