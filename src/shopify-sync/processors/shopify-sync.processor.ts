import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { SHOPIFY_SYNC_QUEUE } from '../constants/queues.constants';
import { ProductSyncService } from '../product-sync.service';
import { ShopifyApiService } from '../shopify-api.service';
import {
  ShopifySyncJobData,
  ShopifyProductPayload,
  ShopifyDeletePayload,
} from '../dto/shopify-product.dto';

@Processor(SHOPIFY_SYNC_QUEUE)
export class ShopifySyncProcessor extends WorkerHost {
  private readonly logger = new Logger(ShopifySyncProcessor.name);

  constructor(
    private readonly productSyncService: ProductSyncService,
    private readonly shopifyApiService: ShopifyApiService,
  ) {
    super();
  }

  async process(job: Job<ShopifySyncJobData>): Promise<void> {
    this.logger.debug(`Processing job ${job.id} type=${job.data.jobType}`);

    if (job.data.jobType === 'upsert') {
      const payload = job.data.payload as ShopifyProductPayload;
      // El payload del webhook no trae metafields: hay que pedir custom.art_kind
      // aparte. Best-effort — si falla devuelve undefined y la columna no se toca.
      const artKind = await this.shopifyApiService.fetchProductArtKind(
        String(payload.id),
      );
      const result = await this.productSyncService.upsertProduct(
        payload,
        artKind,
      );
      await this.productSyncService.syncVariants(
        result.id,
        payload.variants ?? [],
        payload.handle,
      );
    } else if (job.data.jobType === 'delete') {
      const payload = job.data.payload as ShopifyDeletePayload;
      await this.productSyncService.softDeleteProduct(String(payload.id));
    }
  }
}
