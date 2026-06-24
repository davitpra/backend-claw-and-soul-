import { Controller, Post, Req, UseGuards } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { ShopifyHmacGuard } from '../common/guards/shopify-hmac.guard';
import {
  ORDERS_QUEUE,
  ORDERS_JOB_NAMES,
  ORDERS_JOB_OPTIONS,
} from './constants/queues.constants';

// fulfillment_orders/* envía el FulfillmentOrder (a veces bajo `fulfillment_order`),
// fulfillments/* envía el Fulfillment; en ambos el order_id identifica la orden.
interface FulfillmentWebhookPayload {
  id?: number;
  order_id?: number;
  fulfillment_order?: { id?: number; order_id?: number };
}

/**
 * Encola un refresh del fulfillment display status de la orden afectada. No
 * reingesta la orden: solo re-deriva el estado desde los FulfillmentOrders.
 */
async function enqueueRefresh(
  queue: Queue,
  req: Request,
  topic: string,
): Promise<{ received: boolean }> {
  const payload = JSON.parse(
    (req.body as Buffer).toString('utf8'),
  ) as FulfillmentWebhookPayload;
  const orderId =
    payload.fulfillment_order?.order_id ?? payload.order_id ?? null;
  const webhookId = req.headers['x-shopify-webhook-id'] as string | undefined;

  if (orderId != null) {
    const safeTopic = topic.replace(/\//g, '-');
    const jobId = `refresh-${orderId}-${safeTopic}-${webhookId ?? Date.now()}`;
    await queue.add(
      ORDERS_JOB_NAMES.REFRESH_FULFILLMENT,
      { shopifyOrderId: String(orderId), topic },
      { ...ORDERS_JOB_OPTIONS, jobId },
    );
  }
  return { received: true };
}

@ApiTags('shopify-fulfillment-webhooks')
@Public()
@UseGuards(ShopifyHmacGuard)
@Controller('webhooks/shopify/fulfillment_order')
export class ShopifyFulfillmentOrderWebhookController {
  constructor(@InjectQueue(ORDERS_QUEUE) private readonly ordersQueue: Queue) {}

  @Post('placed_on_hold')
  @ApiOperation({
    summary: 'Shopify webhook: fulfillment_orders/placed_on_hold',
  })
  placedOnHold(@Req() req: Request) {
    return enqueueRefresh(
      this.ordersQueue,
      req,
      'fulfillment_orders/placed_on_hold',
    );
  }

  @Post('hold_released')
  @ApiOperation({
    summary: 'Shopify webhook: fulfillment_orders/hold_released',
  })
  holdReleased(@Req() req: Request) {
    return enqueueRefresh(
      this.ordersQueue,
      req,
      'fulfillment_orders/hold_released',
    );
  }

  @Post('fulfillment_request_submitted')
  @ApiOperation({
    summary:
      'Shopify webhook: fulfillment_orders/fulfillment_request_submitted',
  })
  requestSubmitted(@Req() req: Request) {
    return enqueueRefresh(
      this.ordersQueue,
      req,
      'fulfillment_orders/fulfillment_request_submitted',
    );
  }

  @Post('order_routing_complete')
  @ApiOperation({
    summary: 'Shopify webhook: fulfillment_orders/order_routing_complete',
  })
  routingComplete(@Req() req: Request) {
    return enqueueRefresh(
      this.ordersQueue,
      req,
      'fulfillment_orders/order_routing_complete',
    );
  }

  @Post('scheduled_fulfillment_order_ready')
  @ApiOperation({
    summary:
      'Shopify webhook: fulfillment_orders/scheduled_fulfillment_order_ready',
  })
  scheduledReady(@Req() req: Request) {
    return enqueueRefresh(
      this.ordersQueue,
      req,
      'fulfillment_orders/scheduled_fulfillment_order_ready',
    );
  }
}
