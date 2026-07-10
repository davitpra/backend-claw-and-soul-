import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { ORDERS_QUEUE } from './constants/queues.constants';
import { OrdersService } from './orders.service';
import { OrdersSyncService } from './orders-sync.service';
import { AdminOrdersService } from './admin-orders.service';
import { AdminOrdersController } from './admin-orders.controller';
import { UserOrdersService } from './user-orders.service';
import { OrdersController } from './orders.controller';
import { ShopifyOrdersWebhookController } from './shopify-orders-webhook.controller';
import { ShopifyFulfillmentOrderWebhookController } from './shopify-fulfillment-webhook.controller';
import { OrdersIngestProcessor } from './processors/orders-ingest.processor';
import { ShopifyHmacGuard } from '../common/guards/shopify-hmac.guard';
import { ShopifySyncModule } from '../shopify-sync/shopify-sync.module';
import { GenerationsModule } from '../generations/generations.module';
import { PaintByNumbersModule } from '../paint-by-numbers/paint-by-numbers.module';
import { ImageEnhancementService } from './image-enhancement.service';
import { ExpensesModule } from '../expenses/expenses.module';
import { CreditsModule } from '../credits/credits.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: ORDERS_QUEUE }),
    ShopifySyncModule,
    GenerationsModule,
    PaintByNumbersModule,
    ExpensesModule,
    CreditsModule,
  ],
  controllers: [
    ShopifyOrdersWebhookController,
    ShopifyFulfillmentOrderWebhookController,
    AdminOrdersController,
    OrdersController,
  ],
  providers: [
    OrdersService,
    OrdersSyncService,
    AdminOrdersService,
    UserOrdersService,
    OrdersIngestProcessor,
    ShopifyHmacGuard,
    ImageEnhancementService,
  ],
  exports: [OrdersService, AdminOrdersService],
})
export class OrdersModule {}
