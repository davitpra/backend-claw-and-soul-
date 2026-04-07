import { Controller, Post, Req, UseGuards } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { ShopifyHmacGuard } from './guards/shopify-hmac.guard';
import {
  SHOPIFY_SYNC_QUEUE,
  SHOPIFY_SYNC_JOB_NAMES,
  SHOPIFY_JOB_OPTIONS,
} from './constants/queues.constants';
import {
  ShopifyProductPayload,
  ShopifyDeletePayload,
} from './dto/shopify-product.dto';

@ApiTags('shopify-webhooks')
@Public()
@UseGuards(ShopifyHmacGuard)
@Controller('webhooks/shopify/product')
export class ShopifyWebhooksController {
  constructor(
    @InjectQueue(SHOPIFY_SYNC_QUEUE) private readonly syncQueue: Queue,
  ) {}

  @Post('create')
  @ApiOperation({ summary: 'Shopify webhook: products/create' })
  async handleCreate(@Req() req: Request) {
    const payload: ShopifyProductPayload = JSON.parse(
      (req.body as Buffer).toString('utf8'),
    );
    await this.syncQueue.add(
      SHOPIFY_SYNC_JOB_NAMES.UPSERT,
      { jobType: 'upsert', payload },
      SHOPIFY_JOB_OPTIONS,
    );
    return { received: true };
  }

  @Post('update')
  @ApiOperation({ summary: 'Shopify webhook: products/update' })
  async handleUpdate(@Req() req: Request) {
    const payload: ShopifyProductPayload = JSON.parse(
      (req.body as Buffer).toString('utf8'),
    );
    await this.syncQueue.add(
      SHOPIFY_SYNC_JOB_NAMES.UPSERT,
      { jobType: 'upsert', payload },
      SHOPIFY_JOB_OPTIONS,
    );
    return { received: true };
  }

  @Post('delete')
  @ApiOperation({ summary: 'Shopify webhook: products/delete' })
  async handleDelete(@Req() req: Request) {
    const payload: ShopifyDeletePayload = JSON.parse(
      (req.body as Buffer).toString('utf8'),
    );
    await this.syncQueue.add(
      SHOPIFY_SYNC_JOB_NAMES.DELETE,
      { jobType: 'delete', payload },
      SHOPIFY_JOB_OPTIONS,
    );
    return { received: true };
  }
}
