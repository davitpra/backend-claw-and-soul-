import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { ORDERS_QUEUE } from './constants/queues.constants';
import { OrdersService } from './orders.service';
import { OrdersSyncService } from './orders-sync.service';
import { AdminOrdersService } from './admin-orders.service';
import { AdminOrdersController } from './admin-orders.controller';
import { ShopifyOrdersWebhookController } from './shopify-orders-webhook.controller';
import { OrdersIngestProcessor } from './processors/orders-ingest.processor';
import { PodService } from './pod/pod.service';
import { ShopifyHmacGuard } from '../common/guards/shopify-hmac.guard';
import { ShopifySyncModule } from '../shopify-sync/shopify-sync.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: ORDERS_QUEUE }),
    ShopifySyncModule,
  ],
  controllers: [ShopifyOrdersWebhookController, AdminOrdersController],
  providers: [
    OrdersService,
    OrdersSyncService,
    AdminOrdersService,
    OrdersIngestProcessor,
    PodService,
    ShopifyHmacGuard,
  ],
  exports: [OrdersService, AdminOrdersService],
})
export class OrdersModule {}
