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
import { ShopifyOrderPayload } from './dto/shopify-order.dto';

@ApiTags('shopify-order-webhooks')
@Public()
@UseGuards(ShopifyHmacGuard)
@Controller('webhooks/shopify/order')
export class ShopifyOrdersWebhookController {
  constructor(
    @InjectQueue(ORDERS_QUEUE) private readonly ordersQueue: Queue,
  ) {}

  private async enqueue(req: Request, topic: string) {
    const payload = JSON.parse(
      (req.body as Buffer).toString('utf8'),
    ) as ShopifyOrderPayload;
    const webhookId = req.headers['x-shopify-webhook-id'] as string | undefined;
    const jobId = `order:${payload.id}:${topic}:${webhookId ?? Date.now()}`;

    await this.ordersQueue.add(
      ORDERS_JOB_NAMES.INGEST,
      { payload, topic, webhookId },
      { ...ORDERS_JOB_OPTIONS, jobId },
    );
    return { received: true };
  }

  @Post('create')
  @ApiOperation({ summary: 'Shopify webhook: orders/create' })
  handleCreate(@Req() req: Request) {
    return this.enqueue(req, 'orders/create');
  }

  @Post('paid')
  @ApiOperation({ summary: 'Shopify webhook: orders/paid' })
  handlePaid(@Req() req: Request) {
    return this.enqueue(req, 'orders/paid');
  }

  @Post('updated')
  @ApiOperation({ summary: 'Shopify webhook: orders/updated' })
  handleUpdated(@Req() req: Request) {
    return this.enqueue(req, 'orders/updated');
  }

  @Post('cancelled')
  @ApiOperation({ summary: 'Shopify webhook: orders/cancelled' })
  handleCancelled(@Req() req: Request) {
    return this.enqueue(req, 'orders/cancelled');
  }

  @Post('fulfilled')
  @ApiOperation({ summary: 'Shopify webhook: orders/fulfilled' })
  handleFulfilled(@Req() req: Request) {
    return this.enqueue(req, 'orders/fulfilled');
  }
}
