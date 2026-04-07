import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { SHOPIFY_SYNC_QUEUE } from '../constants/queues.constants';
import { ProductSyncService } from '../product-sync.service';
import {
  ShopifySyncJobData,
  ShopifyProductPayload,
  ShopifyDeletePayload,
} from '../dto/shopify-product.dto';

@Processor(SHOPIFY_SYNC_QUEUE)
export class ShopifySyncProcessor extends WorkerHost {
  private readonly logger = new Logger(ShopifySyncProcessor.name);

  constructor(private readonly productSyncService: ProductSyncService) {
    super();
  }

  async process(job: Job<ShopifySyncJobData>): Promise<void> {
    this.logger.debug(`Processing job ${job.id} type=${job.data.jobType}`);

    if (job.data.jobType === 'upsert') {
      await this.productSyncService.upsertProduct(
        job.data.payload as ShopifyProductPayload,
      );
    } else if (job.data.jobType === 'delete') {
      const payload = job.data.payload as ShopifyDeletePayload;
      await this.productSyncService.softDeleteProduct(String(payload.id));
    }
  }
}
